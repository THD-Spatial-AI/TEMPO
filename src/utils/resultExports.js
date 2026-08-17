/**
 * Turn a run's frozen result contract into downloadable artifacts — data (CSV/JSON)
 * and chart images (headless ECharts → PNG). Used by the Export section's Results mode.
 *
 * Everything here works from the stored `result` object alone; nothing needs to be
 * on-screen. Chart PNGs are rendered into a detached, off-screen ECharts instance.
 */
import * as echarts from 'echarts';
import { techColor } from './resultFormat';

// ── CSV helpers ─────────────────────────────────────────────────────────────
const esc = (s) => {
  const t = String(s ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCSV = (rows) => rows.map(r => r.map(esc).join(',')).join('\n');

// loc::tech  or  loc::tech:dest  → { loc, tech }
const splitLT = (key) => {
  const parts = String(key).split('::');
  return { loc: parts[0], tech: (parts[1] || '').split(':')[0] };
};

const RENEWABLE_KW = ['solar', 'wind', 'hydro', 'biomass', 'biogas', 'geo', 'geothermal', 'pv', 'csp', 'tidal', 'wave'];
const isRenewableTech = (t) => {
  const n = String(t).toLowerCase();
  return RENEWABLE_KW.some(r => n.includes(r));
};

// ── Per-tech / per-location aggregation from the contract ───────────────────
export function aggregateResult(result) {
  const capByTech = {}, genByTech = {};
  Object.entries(result?.capacities || {}).forEach(([k, v]) => {
    const val = Number(v) || 0; if (val <= 0) return;
    const { tech } = splitLT(k);
    if (tech.includes(':')) return; // skip transmission link atoms
    capByTech[tech] = (capByTech[tech] || 0) + val;
  });
  Object.entries(result?.generation || {}).forEach(([k, v]) => {
    const val = Number(v) || 0; if (val <= 0) return;
    const { tech } = splitLT(k);
    genByTech[tech] = (genByTech[tech] || 0) + val;
  });
  const costByTech = result?.costs_by_tech || {};
  const totalCap = Object.values(capByTech).reduce((s, v) => s + v, 0);
  const totalGen = Object.values(genByTech).reduce((s, v) => s + v, 0);
  const totalCost = Object.values(costByTech).reduce((s, v) => s + v, 0);
  const renGen = Object.entries(genByTech).filter(([t]) => isRenewableTech(t)).reduce((s, [, v]) => s + v, 0);
  return {
    capByTech, genByTech, costByTech, totalCap, totalGen, totalCost,
    renewableShare: totalGen > 0 ? renGen / totalGen : 0,
    lcoe: totalGen > 0 ? totalCost / totalGen : 0,
  };
}

// Per-location technology mix (capacity-based, generation techs only), sorted desc.
// { loc: [{ tech, value }] } — used by the tech-mix pie map export.
export function techMixByLocFromResult(result) {
  const acc = {};
  Object.entries(result?.capacities || {}).forEach(([k, v]) => {
    const val = Number(v) || 0; if (val <= 0) return;
    const { loc, tech } = splitLT(k);
    if (tech.includes(':')) return; // skip transmission link atoms
    (acc[loc] || (acc[loc] = {}))[tech] = (acc[loc][tech] || 0) + val;
  });
  const out = {};
  Object.entries(acc).forEach(([loc, techs]) => {
    out[loc] = Object.entries(techs).map(([tech, value]) => ({ tech, value })).sort((a, b) => b.value - a.value);
  });
  return out;
}

// ── Data artifacts (CSV / JSON) — keyed by filename ─────────────────────────
export function buildResultDataFiles(result) {
  const files = {};
  const agg = aggregateResult(result);

  // Summary KPIs
  files['summary_kpis.csv'] = toCSV([
    ['metric', 'value'],
    ['objective', result?.objective ?? ''],
    ['termination_condition', result?.termination_condition ?? ''],
    ['total_capacity_MW', agg.totalCap.toFixed(3)],
    ['total_generation_MWh', agg.totalGen.toFixed(3)],
    ['system_cost', agg.totalCost.toFixed(3)],
    ['renewable_share_pct', (agg.renewableShare * 100).toFixed(2)],
    ['lcoe', agg.lcoe.toFixed(4)],
    ['unmet_demand_total_MWh', result?.unmet_demand_total ?? ''],
  ]);

  // Capacities (loc::tech)
  const capRows = [['location', 'technology', 'capacity_MW']];
  Object.entries(result?.capacities || {}).forEach(([k, v]) => {
    const val = Number(v) || 0; if (val <= 0) return;
    const { loc, tech } = splitLT(k);
    capRows.push([loc, tech, val.toFixed(3)]);
  });
  files['capacities.csv'] = toCSV(capRows);

  // Generation (loc::tech)
  const genRows = [['location', 'technology', 'generation_MWh']];
  Object.entries(result?.generation || {}).forEach(([k, v]) => {
    const val = Number(v) || 0; if (val <= 0) return;
    const { loc, tech } = splitLT(k);
    genRows.push([loc, tech, val.toFixed(3)]);
  });
  files['generation.csv'] = toCSV(genRows);

  // Costs by tech + by location
  files['costs_by_tech.csv'] = toCSV([['technology', 'cost'], ...Object.entries(result?.costs_by_tech || {}).map(([t, v]) => [t, Number(v).toFixed(3)])]);
  const clRows = [['location', 'technology', 'cost']];
  Object.entries(result?.costs_by_location || {}).forEach(([loc, techs]) => {
    Object.entries(techs || {}).forEach(([t, v]) => clRows.push([loc, t, Number(v).toFixed(3)]));
  });
  files['costs_by_location.csv'] = toCSV(clRows);

  // Demand & unmet per commune
  const demand = result?.demand_by_location || {};
  const unmet = result?.unmet_demand_by_location || {};
  if (Object.keys(demand).length) {
    const rows = [['commune', 'demand_MWh', 'unmet_MWh', 'demand_met_pct']];
    Object.keys(demand).forEach(loc => {
      const d = Number(demand[loc]) || 0;
      const u = Number(unmet[loc]) || 0;
      rows.push([loc, d.toFixed(3), u.toFixed(3), d > 0 ? ((d - u) / d * 100).toFixed(2) : '']);
    });
    files['demand_unmet_by_commune.csv'] = toCSV(rows);
  }

  // Dispatch timeseries (timestamp × tech)
  const dispatch = result?.dispatch || {};
  const ts = result?.timestamps || [];
  const techs = Object.keys(dispatch);
  if (techs.length && ts.length) {
    const rows = [['timestamp', ...techs]];
    ts.forEach((t, i) => rows.push([t, ...techs.map(tk => {
      const v = dispatch[tk]?.[i]; return v == null ? '' : Number(v).toFixed(3);
    })]));
    files['dispatch.csv'] = toCSV(rows);
  }

  // Full contract
  files['result.json'] = JSON.stringify(result, null, 2);
  return files;
}

// ── Chart options (ECharts) built from the contract ─────────────────────────
export function buildResultChartOptions(result) {
  const agg = aggregateResult(result);
  const opts = {};

  const capEntries = Object.entries(agg.capByTech).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (capEntries.length) {
    opts['capacity_by_tech'] = {
      backgroundColor: '#ffffff', animation: false,
      title: { text: 'Installed Capacity by Technology', left: 'center', textStyle: { fontSize: 15 } },
      grid: { left: 80, right: 30, top: 50, bottom: 60 },
      xAxis: { type: 'category', data: capEntries.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { rotate: 35, fontSize: 10 } },
      yAxis: { type: 'value', name: 'MW' },
      series: [{ type: 'bar', data: capEntries.map(([t, v]) => ({ value: +v.toFixed(2), itemStyle: { color: techColor(t) } })) }],
    };
  }

  const genEntries = Object.entries(agg.genByTech).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (genEntries.length) {
    opts['generation_mix'] = {
      backgroundColor: '#ffffff', animation: false,
      title: { text: 'Generation Mix', left: 'center', textStyle: { fontSize: 15 } },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie', radius: ['38%', '68%'], center: ['50%', '52%'],
        data: genEntries.map(([t, v]) => ({ name: t.replace(/_/g, ' '), value: +v.toFixed(2), itemStyle: { color: techColor(t) } })),
        label: { fontSize: 10 },
      }],
    };
  }

  const costEntries = Object.entries(agg.costByTech).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (costEntries.length) {
    opts['costs_by_tech'] = {
      backgroundColor: '#ffffff', animation: false,
      title: { text: 'System Cost by Technology', left: 'center', textStyle: { fontSize: 15 } },
      grid: { left: 90, right: 30, top: 50, bottom: 60 },
      xAxis: { type: 'category', data: costEntries.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { rotate: 35, fontSize: 10 } },
      yAxis: { type: 'value', name: 'cost' },
      series: [{ type: 'bar', data: costEntries.map(([t, v]) => ({ value: +Number(v).toFixed(2), itemStyle: { color: techColor(t) } })) }],
    };
  }
  return opts;
}

// ── Headless render one ECharts option → PNG data URL ───────────────────────
export function renderChartPng(option, { width = 960, height = 560, pixelRatio = 2 } = {}) {
  return new Promise((resolve) => {
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;left:-99999px;top:0;width:${width}px;height:${height}px`;
    document.body.appendChild(div);
    const chart = echarts.init(div, null, { renderer: 'canvas', width, height });
    chart.setOption({ ...option, animation: false });
    // Let ECharts complete layout + a paint pass before snapshotting; a single rAF
    // is sometimes too early for pies/legends, so give it a short settle window.
    setTimeout(() => {
      let url = '';
      try {
        chart.resize({ width, height });
        url = chart.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#ffffff' });
      } catch { /* ignore */ }
      chart.dispose(); div.remove();
      resolve(url);
    }, 60);
  });
}

// data URL "data:image/png;base64,XXXX" → base64 payload for JSZip
export const dataUrlToBase64 = (url) => (url && url.includes(',') ? url.split(',')[1] : '');
