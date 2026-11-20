// SporesEnsembleComparison — compares the SPORES ensembles of one Scenario Studio
// batch (or the imported contracts), as Lombardi et al. (2020) do across runs:
//   • must-have / costly to replace / real choice across cost relaxations (Fig 2 reading)
//   • Fig 2, Tables 1 / S1 / 2 across relaxations, Fig 6 across cases (any model: sporesAutoMetrics)
import { useMemo, useState } from 'react';
import { FiDownload, FiGitMerge } from '../ui/icons';
import {
  groupUtilisation, classifyTechs, parseRunLabel, toCsv, sporeMetrics,
} from '../../services/sporesAnalysis';
import SelectField from '../ui/SelectField';
import { figureMetrics } from '../../services/sporesAutoMetrics';
import Fig2Utilisation from './spores/Fig2Utilisation';
import PaperTables from './spores/PaperTables';
import Fig6Sensitivity from './spores/Fig6Sensitivity';

const CLASS_CHIP = {
  'must-have': 'bg-teal-100 text-teal-800',
  'costly to replace': 'bg-amber-100 text-amber-800',
  'real choice': 'bg-slate-100 text-slate-600',
};

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function SporesEnsembleComparison({ completedJobs, initialBatchId = null }) {
  const runs = useMemo(() => (completedJobs || [])
    .filter(j => j.result?.spores_data?.length > 1)
    .map(j => {
      const lbl = parseRunLabel(j.variantLabel);
      const frac = j.result.spores_meta?.plan?.slack ?? j.result.spores_data.find(s => s.slack != null)?.slack ?? (lbl.slack != null ? lbl.slack / 100 : null);
      const slack = frac != null ? Math.round(frac * 100) : null;
      return { job: j, batchId: j.batchId || j.id, case: lbl.case, slack };
    }), [completedJobs]);

  const batches = useMemo(() => [...new Set(runs.map(r => r.batchId))], [runs]);
  const [batchId, setBatchId] = useState(initialBatchId);
  const activeBatch = batchId && batches.includes(batchId) ? batchId : batches[batches.length - 1];
  const inBatch = useMemo(() => runs.filter(r => r.batchId === activeBatch), [runs, activeBatch]);
  const cases = useMemo(() => [...new Set(inBatch.map(r => r.case))], [inBatch]);
  const slacks = useMemo(() => [...new Set(inBatch.map(r => r.slack))].sort((a, b) => a - b), [inBatch]);
  const [caseSel, setCaseSel] = useState('Reference');
  const [slackSel, setSlackSel] = useState(10);
  const activeCase = cases.includes(caseSel) ? caseSel : cases[0];
  const activeSlack = slacks.includes(slackSel) ? slackSel : slacks[0];

  const metrics = useMemo(() => (inBatch.length ? figureMetrics(inBatch[0].job.result) : null), [inBatch]);

  const classification = useMemo(() => {
    if (!metrics) return [];
    const ens = inBatch.filter(r => r.case === activeCase).map(r => ({
      slack: r.slack,
      utilisation: r.job.result.spores_data.slice(1).map(s => groupUtilisation(s, r.job.result.spores_meta || {}, metrics)),
    }));
    return classifyTechs(ens);
  }, [inBatch, activeCase, metrics]);

  // Lombardi-2020 results: one ensemble per (case, relaxation) with its per-SPORE metrics
  const paper = !!metrics;
  const ensembles = useMemo(() => (paper ? inBatch.map(r => {
    const { spores_meta: meta = {}, spores_data: spores } = r.job.result;
    return { case: r.case, slack: r.slack, meta, spores, rows: spores.map(s => sporeMetrics(s, meta, metrics, spores[0])) };
  }) : []), [inBatch, metrics, paper]);
  const ofCase = ensembles.filter(e => e.case === activeCase);
  const atSlack = ensembles.filter(e => e.slack === activeSlack);

  if (!inBatch.length) return null;

  const classCsv = () => download('spores_classification.csv', toCsv(
    classification.map(c => ({
      tech: c.tech, class: c.class,
      ...Object.fromEntries(slacks.flatMap(s => [[`zero_share_${s}`, c.zeroShare[s]], [`median_${s}`, c.median[s]]])),
    })),
    ['tech', 'class', ...slacks.flatMap(s => [`zero_share_${s}`, `median_${s}`])]));

  return (
    <div className="bg-white rounded-xl border border-black/15 p-4 mb-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <FiGitMerge size={14} className="text-teal-600" />
        <h3 className="text-sm font-semibold text-slate-700">SPORES ensembles</h3>
        <span className="text-xs text-slate-400">{inBatch.length} ensemble{inBatch.length === 1 ? '' : 's'} · {cases.length} case{cases.length === 1 ? '' : 's'} · relaxations {slacks.map(s => (s != null ? `${s}%` : '–')).join('/')}</span>
        {batches.length > 1 && (
          <SelectField value={activeBatch} onChange={e => setBatchId(e.target.value)} className="ml-auto text-xs border border-black/15 rounded px-2 py-1">
            {batches.map((b, i) => <option key={b} value={b}>Batch {i + 1}</option>)}
          </SelectField>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-slate-600">Must-haves and real choices across relaxations</p>
          {cases.length > 1 && (
            <SelectField value={activeCase} onChange={e => setCaseSel(e.target.value)} className="text-xs border border-black/15 rounded px-2 py-0.5">
              {cases.map(c => <option key={c}>{c}</option>)}
            </SelectField>
          )}
          <button onClick={classCsv} className="ml-auto flex items-center gap-1 text-xs text-electric-600 hover:underline"><FiDownload size={12} /> CSV</button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1 font-bold uppercase tracking-widest">Technology</th>
              {slacks.map(s => <th key={s}>{s != null ? `${s}%` : 'SPORES'}: avoided in / median</th>)}
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            {classification.map(c => (
              <tr key={c.tech} className="border-t border-black/10">
                <td className="py-1 font-medium text-slate-700">{c.tech}</td>
                {slacks.map(s => {
                  const z = c.zeroShare[s], m = c.median[s];
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

      {paper && ofCase.length > 0 && (
        <>
          <Fig2Utilisation ensembles={ofCase} metrics={metrics} />
          <PaperTables ensembles={ofCase} metrics={metrics} />
        </>
      )}
      {paper && atSlack.length > 0 && (
        <Fig6Sensitivity cases={atSlack} metrics={metrics} slack={activeSlack}
          slackSelect={slacks.length > 1 && (
            <SelectField value={activeSlack} onChange={e => setSlackSel(Number(e.target.value))} className="text-xs border border-black/15 rounded px-2 py-0.5">
              {slacks.map(s => <option key={s} value={s}>{s}% relaxation</option>)}
            </SelectField>
          )} />
      )}
    </div>
  );
}
