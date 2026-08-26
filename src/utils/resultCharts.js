/**
 * Shared ECharts option builders for a run's results — the single source used by
 * BOTH the Results view and the Export preview/PNG, so the charts are identical.
 *
 * Each builder is pure: it takes the run data plus a small opts bag
 * ({ colorFn, isVisible }) and returns an ECharts option (or null if no data).
 */
import { autoScale, scaledFmt, axisNameStyle, fmtEnergy, fmtNum, parseLTC } from './resultFormat';
import { aggregateResult } from './resultExports';

const SHOW_ALL = () => true;
const GEN_PARENTS = new Set(['supply', 'supply_plus', 'conversion', 'conversion_plus', 'storage']);

// Default generation-tech test from a result's tech_metadata (name fallback).
export function makeIsGenTech(techMeta = {}) {
  return (tech) => {
    if (!tech || tech.includes(':')) return false;
    const parent = (techMeta[tech]?.parent || '').toLowerCase();
    if (parent && parent !== 'nan') return GEN_PARENTS.has(parent);
    return !/transmission|demand|unmet|import|export|\blink\b|ac_|dc_|hvdc/i.test(tech);
  };
}

// Minimal derived data the charts need, from a raw result contract.
export function deriveForCharts(result) {
  const { capByTech, genByTech } = aggregateResult(result);
  const timestamps = (result?.timestamps || []).map((t) => {
    const d = new Date(t);
    return isNaN(d) ? t : d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  });
  return { capByTech, genByTech, timestamps };
}

// Horizontal bar: capacity by technology
export function buildCapBarOption(derivedData, { colorFn, isVisible = SHOW_ALL } = {}) {
  if (!derivedData?.capByTech) return null;
  const sorted = Object.entries(derivedData.capByTech).filter(([t]) => isVisible(t)).sort(([, a], [, b]) => b - a);
  if (!sorted.length) return null;
  const { div, unit } = autoScale(sorted[0][1], 'MW');
  const fmt = scaledFmt(div);
  return {
    backgroundColor: 'transparent',
    grid: { left: 140, right: 60, top: 16, bottom: 16 },
    xAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: sorted.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
    series: [{
      type: 'bar', barMaxWidth: 28,
      data: sorted.map(([tech, v]) => ({ value: v, itemStyle: { color: colorFn(tech), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', formatter: p => fmt(p.value), fontSize: 9, color: '#64748b' },
    }],
    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmt(p[0].value)} ${unit}</b>` },
  };
}

// Donut: generation mix
export function buildGenDonutOption(derivedData, { colorFn, isVisible = SHOW_ALL } = {}) {
  if (!derivedData?.genByTech) return null;
  const data = Object.entries(derivedData.genByTech)
    .filter(([t, v]) => v > 0 && isVisible(t))
    .sort(([, a], [, b]) => b - a)
    .map(([tech, v]) => ({ name: tech.replace(/_/g, ' '), value: Math.round(v), itemStyle: { color: colorFn(tech) } }));
  if (!data.length) return null;
  return {
    backgroundColor: 'transparent',
    legend: { bottom: 4, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
    series: [{
      type: 'pie', radius: ['44%', '72%'], center: ['50%', '42%'],
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold', formatter: p => p.name + '\n' + fmtEnergy(p.value, 0) } },
      data,
    }],
    tooltip: { trigger: 'item', formatter: p => `${p.name}<br/><b>${fmtEnergy(p.value, 2)}</b> (${p.percent}%)` },
  };
}

// Horizontal bar: cost by technology
export function buildCostsTechOption(result, { colorFn, isVisible = SHOW_ALL } = {}) {
  if (!result?.costs_by_tech) return null;
  const sorted = Object.entries(result.costs_by_tech).filter(([t, v]) => v > 0 && isVisible(t)).sort(([, a], [, b]) => b - a);
  if (!sorted.length) return null;
  const { div, unit } = autoScale(sorted[0][1], '€');
  const fmt = scaledFmt(div);
  return {
    backgroundColor: 'transparent',
    grid: { left: 140, right: 60, top: 16, bottom: 16 },
    xAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: sorted.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
    series: [{
      type: 'bar', barMaxWidth: 28,
      data: sorted.map(([tech, v]) => ({ value: v, itemStyle: { color: colorFn(tech), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', formatter: p => fmt(p.value), fontSize: 9, color: '#64748b' },
    }],
    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmt(p[0].value)} ${unit}</b>` },
  };
}

// Stacked area: dispatch timeseries (+ demand overlay)
export function buildDispatchOption(result, derivedData, { colorFn, isVisible = SHOW_ALL } = {}) {
  if (!result?.dispatch || !derivedData?.timestamps?.length) return null;
  const techs = Object.keys(result.dispatch).filter(t => isVisible(t));
  if (!techs.length) return null;
  const allVals = techs.flatMap(t => result.dispatch[t]);
  const maxVal = Math.max(1, ...allVals);
  const { div, unit } = autoScale(maxVal, 'MW');
  const fmt = scaledFmt(div);
  const series = techs.map(tech => ({
    name: tech.replace(/_/g, ' '), type: 'line', stack: 'gen',
    areaStyle: { opacity: 0.75 }, smooth: false, symbol: 'none', lineStyle: { width: 0 },
    itemStyle: { color: colorFn(tech) }, data: result.dispatch[tech], emphasis: { focus: 'series' },
  }));
  if (result.demand_timeseries) {
    series.push({
      name: 'Demand', type: 'line', smooth: false, symbol: 'none',
      lineStyle: { color: '#D32F2F', width: 2, type: 'dashed' }, itemStyle: { color: '#D32F2F' },
      data: result.demand_timeseries, z: 10,
    });
  }
  const labels = derivedData.timestamps;
  const step = Math.max(1, Math.ceil(labels.length / 24));
  return {
    backgroundColor: 'transparent',
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
    grid: { left: 64, right: 20, top: 20, bottom: 72 },
    xAxis: {
      type: 'category', data: labels, boundaryGap: false,
      axisLabel: { fontSize: 9, color: '#64748b', rotate: 35, formatter: (_, i) => (i % step === 0 ? labels[i] : '') },
      splitLine: { show: false }, axisTick: { show: false },
    },
    yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 32, height: 18 }],
    series,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'cross' },
      formatter: params => {
        const rows = params.map(p => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}: <b>${fmt(+p.value)} ${unit}</b>`).join('<br/>');
        return `<div style="font-size:11px">${params[0]?.name}<br/>${rows}</div>`;
      },
    },
  };
}

// Grouped bar: capacity per location per tech (top-N for large models)
export function buildCapLocOption(result, derivedData, { colorFn, isVisible = SHOW_ALL, isGenTech = () => true, isLargeModel = false, locLimit = 20 } = {}) {
  if (!derivedData?.capByTech) return null;
  const capEntries = Object.entries(result?.capacities || {})
    .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
    .filter(e => e.value > 0 && isGenTech(e.tech) && isVisible(e.tech));
  if (!capEntries.length) return null;
  const allLocs = [...new Set(capEntries.map(e => e.loc))];
  const totalCapByLoc = Object.fromEntries(allLocs.map(l => [l, capEntries.filter(e => e.loc === l).reduce((s, e) => s + e.value, 0)]));
  const locs = allLocs.sort((a, b) => totalCapByLoc[b] - totalCapByLoc[a]).slice(0, isLargeModel ? locLimit : allLocs.length);
  const truncated = isLargeModel && allLocs.length > locLimit;
  const techs = [...new Set(capEntries.map(e => e.tech))];
  const byLocTech = {};
  capEntries.forEach(({ loc, tech, value }) => { byLocTech[`${loc}::${tech}`] = value; });
  const maxCap = Math.max(1, ...locs.map(l => totalCapByLoc[l] || 0));
  const { div, unit } = autoScale(maxCap, 'MW');
  const fmt = scaledFmt(div);
  const series = techs.map(tech => ({
    name: tech.replace(/_/g, ' '), type: 'bar', barMaxWidth: 22,
    data: locs.map(l => byLocTech[`${l}::${tech}`] || 0), itemStyle: { color: colorFn(tech) },
  }));
  return {
    backgroundColor: 'transparent',
    title: truncated ? { text: `Top ${locLimit} locations by capacity  (${allLocs.length} total)`, textStyle: { fontSize: 9, color: '#94a3b8', fontWeight: 'normal' }, top: 4, left: 4 } : undefined,
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
    grid: { left: 60, right: 20, top: truncated ? 34 : 16, bottom: 56 },
    xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 4 ? 30 : 0 }, axisTick: { show: false } },
    yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, series,
  };
}

// Stacked bar: cost per location per tech (top-N for large models)
export function buildCostsLocOption(result, { colorFn, isVisible = SHOW_ALL, isGenTech = () => true, isLargeModel = false, locLimit = 20 } = {}) {
  if (!result?.costs_by_location) return null;
  const allLocs = Object.keys(result.costs_by_location);
  const totalCostByLoc = Object.fromEntries(allLocs.map(l => [l, Object.values(result.costs_by_location[l]).reduce((s, v) => s + (Number(v) || 0), 0)]));
  const locs = allLocs.sort((a, b) => totalCostByLoc[b] - totalCostByLoc[a]).slice(0, isLargeModel ? locLimit : allLocs.length);
  const truncated = isLargeModel && allLocs.length > locLimit;
  const techSet = [...new Set(locs.flatMap(l => Object.keys(result.costs_by_location[l])))].filter(t => isGenTech(t) && isVisible(t));
  if (!techSet.length) return null;
  const maxCost = Math.max(1, ...locs.map(l => totalCostByLoc[l] || 0));
  const { div, unit } = autoScale(maxCost, '€');
  const fmt = scaledFmt(div);
  const series = techSet.map(tech => ({
    name: tech.replace(/_/g, ' '), type: 'bar', stack: 'total',
    data: locs.map(l => Math.max(0, result.costs_by_location[l]?.[tech] || 0)),
    itemStyle: { color: colorFn(tech) }, emphasis: { focus: 'series' },
  }));
  return {
    backgroundColor: 'transparent',
    title: truncated ? { text: `Top ${locLimit} locations by cost  (${allLocs.length} total)`, textStyle: { fontSize: 9, color: '#94a3b8', fontWeight: 'normal' }, top: 4, left: 4 } : undefined,
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
    grid: { left: 60, right: 20, top: truncated ? 34 : 16, bottom: 56 },
    xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 4 ? 30 : 0 }, axisTick: { show: false } },
    yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  };
}

// Sankey: Tech → Carrier → Total Demand
export function buildSankeyOption(result, { isGenTech = () => true } = {}) {
  if (!result?.generation) return null;
  const genEntries = Object.entries(result.generation || {}).map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 })).filter(e => e.value > 0 && isGenTech(e.tech));
  if (!genEntries.length) return null;
  const nodeSet = new Set();
  const linkMap = {};
  genEntries.forEach(({ tech, carrier, value }) => {
    const tNode = `⚡ ${tech.replace(/_/g, ' ')}`;
    const cNode = `🔋 ${(carrier || 'electricity').replace(/_/g, ' ')}`;
    nodeSet.add(tNode); nodeSet.add(cNode);
    linkMap[`${tNode}→${cNode}`] = (linkMap[`${tNode}→${cNode}`] || 0) + value;
  });
  nodeSet.add('📊 Total Demand');
  [...new Set(genEntries.map(e => `🔋 ${(e.carrier || 'electricity').replace(/_/g, ' ')}`))].forEach(cNode => {
    const carrierTotal = genEntries.filter(e => `🔋 ${(e.carrier || 'electricity').replace(/_/g, ' ')}` === cNode).reduce((s, e) => s + e.value, 0);
    linkMap[`${cNode}→📊 Total Demand`] = (linkMap[`${cNode}→📊 Total Demand`] || 0) + carrierTotal;
  });
  const nodes = [...nodeSet].map(n => ({ name: n }));
  const links = Object.entries(linkMap).filter(([, v]) => v > 0).map(([key, value]) => { const [source, target] = key.split('→'); return { source, target, value: Math.round(value) }; });
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: p => p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}<br/><b>${fmtEnergy(p.data.value, 2)}</b>` : `<b>${p.name}</b>` },
    series: [{ type: 'sankey', left: 60, right: 80, top: 20, bottom: 20, nodeAlign: 'left', layoutIterations: 32, emphasis: { focus: 'adjacency' }, label: { fontSize: 9, color: '#374151' }, lineStyle: { color: 'gradient', opacity: 0.5 }, data: nodes, links }],
  };
}

// Capacity-factor: heatmap (small models) or ranked bar (large models)
export function buildCfOption(result, derivedData, { colorFn, isVisible = SHOW_ALL, isGenTech = () => true, isLargeModel = false } = {}) {
  if (!derivedData?.capByTech || !result?.generation) return null;
  const capEntries = Object.entries(result?.capacities || {}).map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 })).filter(e => e.value > 0 && isGenTech(e.tech) && isVisible(e.tech));
  const genEntries = Object.entries(result.generation || {}).map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 })).filter(e => e.value > 0 && isGenTech(e.tech) && isVisible(e.tech));
  const hrs = (result?.timestamps?.length) || 8760;
  if (isLargeModel) {
    const techCap = {}, techGen = {};
    capEntries.forEach(({ tech, value }) => { techCap[tech] = (techCap[tech] || 0) + value; });
    genEntries.forEach(({ tech, value }) => { techGen[tech] = (techGen[tech] || 0) + value; });
    const data = Object.keys(techCap).map(tech => ({ tech, cf: techCap[tech] > 0 ? Math.min(100, (techGen[tech] || 0) / (techCap[tech] * hrs) * 100) : 0 })).filter(d => d.cf > 0).sort((a, b) => b.cf - a.cf);
    if (!data.length) return null;
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 80, top: 16, bottom: 16 },
      xAxis: { type: 'value', max: 100, ...axisNameStyle('%'), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => v }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: data.map(d => d.tech.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
      series: [{ type: 'bar', barMaxWidth: 28, data: data.map(d => ({ value: +d.cf.toFixed(1), itemStyle: { color: colorFn(d.tech), borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', formatter: p => p.value.toFixed(1) + '%', fontSize: 9, color: '#64748b' } }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>Avg CF: ${p[0].value}%</b>` },
    };
  }
  const locs = [...new Set(capEntries.map(e => e.loc))].sort();
  const techs = [...new Set(capEntries.map(e => e.tech))].sort();
  const data = [];
  techs.forEach((tech, ti) => locs.forEach((loc, li) => {
    const cap = capEntries.find(e => e.loc === loc && e.tech === tech)?.value || 0;
    const gen = genEntries.find(e => e.loc === loc && e.tech === tech)?.value || 0;
    const cf = cap > 0 ? Math.min(100, (gen / (cap * hrs)) * 100) : null;
    if (cf != null) data.push([li, ti, +cf.toFixed(1)]);
  }));
  if (!data.length) return null;
  return {
    backgroundColor: 'transparent',
    grid: { left: 100, right: 60, top: 20, bottom: 60 },
    xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 4 ? 30 : 0 }, axisTick: { show: false } },
    yAxis: { type: 'category', data: techs.map(t => t.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
    visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', right: 0, bottom: 0, text: ['100%', '0%'], textStyle: { fontSize: 9, color: '#64748b' }, inRange: { color: ['#f9fafb', '#d1d5db', '#6b7280', '#1f2937', '#030712'] } },
    series: [{ type: 'heatmap', data, label: { show: true, fontSize: 9, color: '#fff', formatter: p => p.value[2] > 0 ? p.value[2] + '%' : '' } }],
    tooltip: { trigger: 'item', formatter: p => `${locs[p.data[0]]} × ${techs[p.data[1]].replace(/_/g, ' ')}<br/><b>CF: ${p.data[2]}%</b>` },
  };
}

// Horizontal bar: cost per MWh by technology
export function buildCostPerMwhOption(result, derivedData, { colorFn, isVisible = SHOW_ALL } = {}) {
  if (!result?.costs_by_tech || !derivedData?.genByTech) return null;
  const data = Object.entries(result.costs_by_tech).filter(([t, cost]) => cost > 0 && isVisible(t)).map(([tech, cost]) => {
    const gen = derivedData.genByTech[tech] || 0;
    return { tech, costPerMwh: gen > 0 ? cost / gen : 0 };
  }).filter(d => d.costPerMwh > 0).sort((a, b) => b.costPerMwh - a.costPerMwh);
  if (!data.length) return null;
  return {
    backgroundColor: 'transparent',
    grid: { left: 140, right: 60, top: 16, bottom: 16 },
    xAxis: { type: 'value', ...axisNameStyle('€/MWh'), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmtNum(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: data.map(d => d.tech.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
    series: [{ type: 'bar', barMaxWidth: 28, data: data.map(d => ({ value: +d.costPerMwh.toFixed(2), itemStyle: { color: colorFn(d.tech), borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', formatter: p => p.value.toFixed(1), fontSize: 9, color: '#64748b' } }],
    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${p[0].value.toFixed(2)} €/MWh</b>` },
  };
}

// Catalogue of exportable charts (id → { label, build }) — mirrors the Results view
export const RESULT_CHARTS = [
  { id: 'capacity_by_tech',     label: 'Installed Capacity by Technology', build: (r, d, o) => buildCapBarOption(d, o) },
  { id: 'capacity_by_location', label: 'Capacity by Location & Technology', build: (r, d, o) => buildCapLocOption(r, d, o) },
  { id: 'generation_mix',       label: 'Generation Mix',                    build: (r, d, o) => buildGenDonutOption(d, o) },
  { id: 'energy_flow_sankey',   label: 'Energy Flow (Sankey)',              build: (r, d, o) => buildSankeyOption(r, o) },
  { id: 'capacity_factor',      label: 'Capacity Factor',                   build: (r, d, o) => buildCfOption(r, d, o) },
  { id: 'costs_by_tech',        label: 'System Cost by Technology',         build: (r, d, o) => buildCostsTechOption(r, o) },
  { id: 'costs_by_location',    label: 'Cost by Location & Technology',     build: (r, d, o) => buildCostsLocOption(r, o) },
  { id: 'cost_per_mwh',         label: 'Cost per MWh by Technology',        build: (r, d, o) => buildCostPerMwhOption(r, d, o) },
  { id: 'dispatch',             label: 'Dispatch',                          build: (r, d, o) => buildDispatchOption(r, d, o) },
];

// Build every available chart option for a result → { id: { label, option } }
export function buildAllResultCharts(result, { colorFn }) {
  const d = deriveForCharts(result);
  const isGenTech = makeIsGenTech(result?.tech_metadata || {});
  const locCount = new Set(Object.keys(result?.capacities || {}).map(k => k.split('::')[0])).size;
  const opts = { colorFn, isGenTech, isLargeModel: locCount > 50, locLimit: 20 };
  const out = {};
  for (const c of RESULT_CHARTS) {
    const option = c.build(result, d, opts);
    if (option) out[c.id] = { label: c.label, option };
  }
  return out;
}
