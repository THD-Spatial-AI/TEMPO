// SporesPaperPanel — the analyses of Lombardi et al. (2020) for one SPORES ensemble:
// expansion-potential utilisation per technology group (Fig 2), best-ranking SPORES
// (Table 1) and per-SPORE metrics, with CSV export for the paper's tables.
// Shown for Lombardi-2020 SPORES results (result.spores_meta).
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { FiDownload, FiAward } from 'react-icons/fi';
import {
  resolveMetrics, groupUtilisation, sporeMetrics, bestRanking, toCsv,
} from '../../services/sporesAnalysis';

const ZERO = 1e-3;

function quantiles(vals) {
  const s = vals.filter(v => v != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const q = (p) => { const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  return [s[0], q(0.25), q(0.5), q(0.75), s[s.length - 1]];
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(1)}%`);

export default function SporesPaperPanel({ result }) {
  const meta = result?.spores_meta;
  const sd = result?.spores_data;
  const metrics = useMemo(() => (meta ? resolveMetrics(meta) : null), [meta]);
  const util = useMemo(() => (metrics ? sd.map(s => groupUtilisation(s, meta, metrics)) : []), [sd, meta, metrics]);
  const rows = useMemo(() => (metrics?.zones ? sd.map(s => sporeMetrics(s, meta, metrics, sd[0])) : []), [sd, meta, metrics]);
  const ranking = useMemo(() => (rows.length ? bestRanking(rows) : null), [rows]);
  if (!meta || !sd?.length) return null;

  const labels = (metrics.groups || []).map(g => g.label);
  const unit = metrics.units || { power: 1, powerLabel: 'model units', energy: 1, energyLabel: 'model units' };
  const alternatives = util.slice(1);

  const boxOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    grid: { top: 10, right: 20, bottom: 30, left: 170 },
    xAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: v => `${v * 100}%` } },
    yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11 } },
    series: [
      { name: 'SPORES', type: 'boxplot', data: labels.map(l => quantiles(alternatives.map(u => u[l])) || [0, 0, 0, 0, 0]),
        itemStyle: { color: '#99f6e4', borderColor: '#0f766e' } },
      { name: 'Cost-optimal', type: 'scatter', symbol: 'diamond', symbolSize: 10,
        data: labels.map((l, i) => [util[0][l] ?? 0, i]), itemStyle: { color: '#f59e0b' } },
    ],
  };

  const utilCsv = () => download('spores_utilisation.csv', toCsv(
    sd.map((s, i) => ({ spore_id: s.spore_id, stage: s.stage, target: s.target, cost: s.cost, ...util[i] })),
    ['spore_id', 'stage', 'target', 'cost', ...labels]));
  const metricsCsv = () => download('spores_metrics.csv', toCsv(rows,
    ['spore_id', 'stage', 'target', 'cost', 'maxWindShare', 'maxWindRegion', 'minLineCF', 'transmissionExpansion', 'overcapacity', 'curtailment']));

  const best = ranking && [
    ['Cost-optimal', rows[0]],
    ['Low wind concentration', ranking.lowWindConcentration],
    ['High transmission use', ranking.highTransmissionUse],
    ['High overcapacity', ranking.highOvercapacity],
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-5">
      <div className="flex items-center gap-2">
        <FiAward size={14} className="text-teal-600" />
        <h3 className="text-sm font-semibold text-slate-700">Paper analysis — Lombardi et al. (2020)</h3>
        <span className="text-xs text-slate-400">
          {sd.length - 1}/{meta.planned} SPORES · {((meta.plan?.slack ?? 0) * 100).toFixed(0)}% cost relaxation
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600">Utilisation of capacity expansion potential (Fig 2)</p>
          <button onClick={utilCsv} className="flex items-center gap-1 text-xs text-electric-600 hover:underline"><FiDownload size={12} /> CSV</button>
        </div>
        <ReactECharts option={boxOption} style={{ height: 40 + labels.length * 34 }} />
        <table className="w-full text-xs mt-1">
          <thead><tr className="text-slate-500 text-left"><th className="py-1">Group</th><th>Cost-optimal</th><th>Median</th><th>SPORES avoiding it</th></tr></thead>
          <tbody>
            {labels.map(l => {
              const vals = alternatives.map(u => u[l]).filter(v => v != null);
              const q = quantiles(vals);
              const zero = vals.length ? vals.filter(v => v < ZERO).length / vals.length : null;
              return (
                <tr key={l} className="border-t border-slate-100">
                  <td className="py-1 font-medium text-slate-700">{l}</td>
                  <td>{pct(util[0][l])}</td><td>{pct(q?.[2])}</td>
                  <td className={zero === 0 ? 'text-teal-700 font-semibold' : ''}>{zero == null ? '–' : `${(zero * 100).toFixed(0)}%`}{zero === 0 ? ' · never avoided' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ranking && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">
              Best-ranking SPORES (Table 1) — {ranking.subset.length} with lower wind concentration than optimal and all inter-zonal lines ≥ 30% CF
            </p>
            <button onClick={metricsCsv} className="flex items-center gap-1 text-xs text-electric-600 hover:underline"><FiDownload size={12} /> CSV (all SPORES)</button>
          </div>
          <table className="w-full text-xs mt-1">
            <thead><tr className="text-slate-500 text-left">
              <th className="py-1">SPORE</th><th>Max regional wind share</th><th>Min inter-zonal line CF</th>
              <th>Transmission expansion ({unit.powerLabel})</th><th>Overcapacity ({unit.powerLabel})</th><th>Curtailment ({unit.energyLabel})</th>
            </tr></thead>
            <tbody>
              {best.map(([name, r]) => (
                <tr key={name} className="border-t border-slate-100">
                  <td className="py-1"><span className="font-medium text-slate-700">{name}</span>{r ? <span className="text-slate-400"> · #{r.spore_id}{r.target ? ` (${[].concat(r.target).join('+')})` : ''}</span> : ''}</td>
                  {r ? (
                    <>
                      <td>{pct(r.maxWindShare)}{r.maxWindRegion ? ` (${r.maxWindRegion.toUpperCase()})` : ''}</td>
                      <td>{pct(r.minLineCF)}</td>
                      <td>{(r.transmissionExpansion / unit.power).toFixed(2)}</td>
                      <td>{(r.overcapacity / unit.power).toFixed(2)}</td>
                      <td>{(r.curtailment / unit.energy).toFixed(1)}</td>
                    </>
                  ) : <td colSpan={5} className="text-slate-400 italic">no SPORE in the subset</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
