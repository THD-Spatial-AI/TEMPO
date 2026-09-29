// SporesEnsembleComparison — compares the SPORES ensembles of one Scenario Studio
// batch, as Lombardi et al. (2020) do across runs:
//   • must-have / costly to replace / real choice across cost relaxations (Fig 2)
//   • sensitivity clusters: renewable vs transmission utilisation per SPORE (Fig 6)
import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { FiDownload, FiGitMerge } from 'react-icons/fi';
import {
  resolveMetrics, groupUtilisation, aggregateUtilisation, classifyTechs, parseRunLabel, toCsv,
} from '../../services/sporesAnalysis';

const RENEWABLES = ['Onshore wind', 'Offshore wind', 'PV'];
const TRANSMISSION = ['International transmission', 'Inter-zone transmission'];
const CLASS_CHIP = {
  'must-have': 'bg-teal-100 text-teal-800',
  'costly to replace': 'bg-amber-100 text-amber-800',
  'real choice': 'bg-slate-100 text-slate-600',
};
const PALETTE = ['#64748b', '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function SporesEnsembleComparison({ completedJobs }) {
  const runs = useMemo(() => (completedJobs || [])
    .filter(j => j.result?.spores_meta && j.result?.spores_data?.length)
    .map(j => {
      const lbl = parseRunLabel(j.variantLabel);
      const slack = Math.round((j.result.spores_meta.plan?.slack ?? (lbl.slack ?? 0) / 100) * 100);
      return { job: j, batchId: j.batchId || j.id, case: lbl.case, slack };
    }), [completedJobs]);

  const batches = useMemo(() => [...new Set(runs.map(r => r.batchId))], [runs]);
  const [batchId, setBatchId] = useState(null);
  const activeBatch = batchId && batches.includes(batchId) ? batchId : batches[batches.length - 1];
  const inBatch = useMemo(() => runs.filter(r => r.batchId === activeBatch), [runs, activeBatch]);
  const cases = useMemo(() => [...new Set(inBatch.map(r => r.case))], [inBatch]);
  const slacks = useMemo(() => [...new Set(inBatch.map(r => r.slack))].sort((a, b) => a - b), [inBatch]);
  const [caseSel, setCaseSel] = useState('Reference');
  const [slackSel, setSlackSel] = useState(10);
  const activeCase = cases.includes(caseSel) ? caseSel : cases[0];
  const activeSlack = slacks.includes(slackSel) ? slackSel : slacks[0];

  const metrics = useMemo(() => (inBatch.length ? resolveMetrics(inBatch[0].job.result.spores_meta) : null), [inBatch]);

  const classification = useMemo(() => {
    if (!metrics) return [];
    const ens = inBatch.filter(r => r.case === activeCase).map(r => ({
      slack: r.slack,
      utilisation: r.job.result.spores_data.slice(1).map(s => groupUtilisation(s, r.job.result.spores_meta, metrics)),
    }));
    return classifyTechs(ens);
  }, [inBatch, activeCase, metrics]);

  const hasFig6 = metrics?.groups?.some(g => RENEWABLES.includes(g.label));
  const scatter = useMemo(() => {
    if (!hasFig6) return null;
    const series = inBatch.filter(r => r.slack === activeSlack).map((r, i) => ({
      name: r.case, type: 'scatter', symbolSize: r.case === 'Reference' ? 7 : 6,
      itemStyle: { color: r.case === 'Reference' ? '#cbd5e1' : PALETTE[(i % (PALETTE.length - 1)) + 1],
                   borderColor: r.case === 'Reference' ? '#64748b' : undefined, borderWidth: r.case === 'Reference' ? 1 : 0 },
      data: r.job.result.spores_data.map(s => [
        aggregateUtilisation(s, r.job.result.spores_meta, metrics, RENEWABLES),
        aggregateUtilisation(s, r.job.result.spores_meta, metrics, TRANSMISSION),
        s.spore_id,
      ]),
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: p => `${p.seriesName} · SPORE ${p.value[2]}<br/>renewables ${(p.value[0] * 100).toFixed(1)}% · transmission ${(p.value[1] * 100).toFixed(1)}%` },
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10 } },
      grid: { top: 20, right: 20, bottom: 60, left: 60 },
      xAxis: { type: 'value', name: 'Renewable capacity potential utilisation', nameLocation: 'middle', nameGap: 28, axisLabel: { formatter: v => `${Math.round(v * 100)}%` }, scale: true },
      yAxis: { type: 'value', name: 'Transmission utilisation', nameLocation: 'middle', nameGap: 42, axisLabel: { formatter: v => `${Math.round(v * 100)}%` }, scale: true },
      series,
    };
  }, [inBatch, activeSlack, metrics, hasFig6]);

  if (!inBatch.length) return null;

  const classCsv = () => download('spores_classification.csv', toCsv(
    classification.map(c => ({
      tech: c.tech, class: c.class,
      ...Object.fromEntries(slacks.flatMap(s => [[`zero_share_${s}`, c.zeroShare[s / 100]], [`median_${s}`, c.median[s / 100]]])),
    })),
    ['tech', 'class', ...slacks.flatMap(s => [`zero_share_${s}`, `median_${s}`])]));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <FiGitMerge size={14} className="text-teal-600" />
        <h3 className="text-sm font-semibold text-slate-700">SPORES ensembles</h3>
        <span className="text-xs text-slate-400">{inBatch.length} ensemble{inBatch.length === 1 ? '' : 's'} · {cases.length} case{cases.length === 1 ? '' : 's'} · relaxations {slacks.map(s => `${s}%`).join('/')}</span>
        {batches.length > 1 && (
          <select value={activeBatch} onChange={e => setBatchId(e.target.value)} className="ml-auto text-xs border border-slate-200 rounded px-2 py-1">
            {batches.map((b, i) => <option key={b} value={b}>Batch {i + 1}</option>)}
          </select>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-slate-600">Must-haves and real choices across relaxations (Fig 2)</p>
          {cases.length > 1 && (
            <select value={activeCase} onChange={e => setCaseSel(e.target.value)} className="text-xs border border-slate-200 rounded px-2 py-0.5">
              {cases.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
          <button onClick={classCsv} className="ml-auto flex items-center gap-1 text-xs text-electric-600 hover:underline"><FiDownload size={12} /> CSV</button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1">Technology</th>
              {slacks.map(s => <th key={s}>{s}%: avoided in / median</th>)}
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            {classification.map(c => (
              <tr key={c.tech} className="border-t border-slate-100">
                <td className="py-1 font-medium text-slate-700">{c.tech}</td>
                {slacks.map(s => {
                  const z = c.zeroShare[s / 100], m = c.median[s / 100];
                  return <td key={s}>{z == null ? '–' : `${(z * 100).toFixed(0)}%`} / {m == null ? '–' : `${(m * 100).toFixed(0)}%`}</td>;
                })}
                <td><span className={`px-2 py-0.5 rounded font-medium ${CLASS_CHIP[c.class]}`}>{c.class}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-400 mt-1">
          Must-have: never fully avoided at any relaxation. Real choice: fully avoided already at the lowest relaxation. Costly to replace: avoidable only at higher relaxations.
        </p>
      </div>

      {scatter && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-slate-600">Sensitivity clusters (Fig 6)</p>
            <select value={activeSlack} onChange={e => setSlackSel(Number(e.target.value))} className="text-xs border border-slate-200 rounded px-2 py-0.5">
              {slacks.map(s => <option key={s} value={s}>{s}% relaxation</option>)}
            </select>
          </div>
          <ReactECharts option={scatter} style={{ height: 360 }} />
        </div>
      )}
    </div>
  );
}
