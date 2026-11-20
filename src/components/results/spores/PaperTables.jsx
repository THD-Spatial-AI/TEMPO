// Tables 1, S1 and 2 of Lombardi et al. (2020) across the cost relaxations of one case.
// `ensembles`: [{ slack (%), meta, spores, rows (sporeMetrics) }], any order.
import { useMemo } from 'react';
import PaperFigure from './PaperFigure';
import { tableS1, table1Rows, utilisationRanges } from '../../../services/sporesFigures';
import { toCsv } from '../../../services/sporesAnalysis';

const TABLE2 = [
  ['Bioenergy', 'Bioenergy'], ['Offshore wind', 'Offshore wind'], ['Batteries', 'Battery'], ['P2G (turbines)', 'Gas turbines'],
];
const th = 'py-1.5 px-2 text-left text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest';
const td = 'py-1.5 px-2 tabular-nums';
const f1 = (x) => (x == null ? '–' : x.toFixed(1));
const pct = (x) => (x == null ? '–' : (100 * x).toFixed(1));
const range = (r) => {
  if (!r) return '–';
  const [a, b] = r.map(pct);
  return a === b ? a : `${a}–${b}`;
};
const Best = ({ on }) => (on ? <sup className="text-electric-600 font-semibold">a</sup> : null);

export default function PaperTables({ ensembles, metrics }) {
  // Table 2 columns: the paper's four for Italy; otherwise the groups of the minimisation families,
  // or every group when the run has none
  const table2 = useMemo(() => {
    if (!metrics.auto) return TABLE2;
    const fam = [...new Set((metrics.problematic || []).map(f => f.group).filter(Boolean))];
    return (fam.length ? fam : metrics.groups.map(g => g.label)).map(g => [g, g]);
  }, [metrics]);
  const gw = metrics.units?.power || 1;
  const bySlack = useMemo(() => [...ensembles].sort((a, b) => b.slack - a.slack).map(e => {
    const t1 = table1Rows(e.rows);
    const ids = new Set(t1.subset.map(r => r.spore_id));
    return {
      slack: e.slack, t1, s1: tableS1(e.rows),
      // no subset (no wind or no lines in the model): the range over all SPOREs
      t2: utilisationRanges(e.spores.filter(s => (ids.size ? ids.has(s.spore_id) : s.spore_id !== 0)), e.meta, metrics, table2.map(([, g]) => g)),
    };
  }), [ensembles, metrics, table2]);
  const optimum = ensembles[0]?.rows.find(r => r.spore_id === 0);

  const t1Csv = () => ({
    name: 'table1_best_ranking_spores.csv',
    text: toCsv([
      ...bySlack.flatMap(e => e.t1.rows.map(r => ({
        slack: e.slack, name: r.names.join('/'), spore_id: r.row.spore_id, stage: r.row.stage, target: r.row.target,
        overcapacity_GW: r.row.overcapacity / gw, max_wind_share: r.row.maxWindShare, max_wind_region: r.row.maxWindRegion,
        min_interzonal_cf: r.row.minLineCF, best_on: r.best,
      }))),
      optimum && { slack: '', name: 'cost-optimal solution', spore_id: 0, overcapacity_GW: 0, max_wind_share: optimum.maxWindShare,
                   max_wind_region: optimum.maxWindRegion, min_interzonal_cf: optimum.minLineCF },
    ].filter(Boolean), ['slack', 'name', 'spore_id', 'stage', 'target', 'overcapacity_GW', 'max_wind_share', 'max_wind_region', 'min_interzonal_cf', 'best_on']),
  });
  const s1Csv = () => ({
    name: 'tableS1_subset_counts.csv',
    text: toCsv(bySlack.map(e => ({ slack: e.slack, ...e.s1, spores: ensembles.find(x => x.slack === e.slack).spores.length - 1 })),
      ['slack', 'markedlyLower', 'lower', 'cf', 'both', 'spores']),
  });
  const t2Csv = () => ({
    name: 'table2_problematic_ranges.csv',
    text: toCsv(bySlack.map(e => Object.fromEntries([['slack', e.slack], ['subset', e.t1.subset.length],
      ...table2.flatMap(([l, g]) => [[`${l} min`, e.t2[g]?.[0]], [`${l} max`, e.t2[g]?.[1]]])])),
    ['slack', 'subset', ...table2.flatMap(([l]) => [`${l} min`, `${l} max`])]),
  });

  const subsetSizes = bySlack.map(e => `${e.t1.subset.length} (${e.slack}%)`).join(', ');

  // Table 1 / S1 rank on regional wind concentration and line CF: models without wind or lines can't
  const ranked = ensembles.some(e => e.rows.some(r => r.spore_id !== 0 && r.maxWindShare != null && r.minLineCF != null));
  const slackLabel = (sl) => (sl != null ? `${sl}%` : '–');
  const t2Caption = metrics.auto
    ? `Range (min–max) of ${metrics.relative ? 'capacity / its largest value in any SPORE' : 'the utilisation of the capacity expansion potential'} (%) ${ranked ? 'within the Table 1 subset' : 'over all SPORES (no Table 1 subset: the model has no wind or no lines)'}, per technology type.`
    : 'Range (min–max) of the utilisation of the capacity expansion potential (%) within the Table 1 subset. P2G (turbines): synthetic-methane gas turbine capacity, sized on electricity output as the result contract does, over the 44 GW potential. Batteries over a 100 GW potential (inferred from the paper’s Fig 1D and Fig 2; the model allows 300 GW).';

  return (
    <div className="space-y-4">
      {ranked && (<>
      <PaperFigure label="Table 1" title="Best-ranking SPORES" file="table1_best_ranking_spores" noImage csv={t1Csv}
        caption={`Best-ranking SPORES within the subset of ${subsetSizes} SPORES with a regional concentration of wind deployment at least 20% below the cost-optimal solution and every inter-zonal line at a capacity factor of 30% or more. Overcapacity: renewable and storage discharge capacity (incl. synthetic-methane gas turbines) above the cost-optimal solution. Wind share: onshore + offshore, existing + new, in one region. Line CF: energy delivered in the dominant direction over capacity × hours. Numbers are TEMPO's SPORE ids. a: best value on that metric.`}>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-black/10">
            <th className={th}>Accepted cost relaxation</th><th className={th}>SPORE name and number</th>
            <th className={th}>Overcapacity (GW)</th><th className={th}>Maximum wind capacity share in a region (%)</th>
            <th className={th}>Minimum inter-zonal transmission capacity factor (%)</th>
          </tr></thead>
          <tbody>
            {bySlack.map(e => e.t1.rows.map((r, i) => (
              <tr key={`${e.slack}-${i}`} className={i === 0 ? 'border-t border-black/15' : ''}>
                <td className={td}>{i === 0 ? slackLabel(e.slack) : ''}</td>
                <td className={td}>{r.names.join('/ ')} ({r.row.spore_id})</td>
                <td className={td}>{f1(r.row.overcapacity / gw)}<Best on={r.best.includes('overcapacity')} /></td>
                <td className={td}>{pct(r.row.maxWindShare)}<Best on={r.best.includes('maxWindShare')} /></td>
                <td className={td}>{pct(r.row.minLineCF)}<Best on={r.best.includes('minLineCF')} /></td>
              </tr>
            )))}
            {optimum && (
              <tr className="border-t border-black/15">
                <td className={td} /><td className={td}>cost-optimal solution</td>
                <td className={td}>0</td><td className={td}>{pct(optimum.maxWindShare)}</td><td className={td}>{pct(optimum.minLineCF)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </PaperFigure>

      <PaperFigure label="Table S1" title="SPORES meeting the selection criteria" file="tableS1_subset_counts" noImage csv={s1Csv}
        caption="Number of SPORES (cost optimum excluded, duplicates counted once) whose maximum regional wind share is at least 20% lower than the cost optimum's, lower at all, whose minimum inter-zonal line CF is at least 30%, and both of the first and third (the Table 1 subset). The paper's header says %, its values are counts.">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-black/10">
            <th className={th}>Cost relaxation</th><th className={th}>Wind concentration markedly (≥ 20%) lower</th>
            <th className={th}>Wind concentration lower</th><th className={th}>Min line CF ≥ 30%</th><th className={th}>Both</th>
          </tr></thead>
          <tbody>
            {bySlack.map(e => (
              <tr key={e.slack} className="border-t border-black/10">
                <td className={td}>{slackLabel(e.slack)}</td><td className={td}>{e.s1.markedlyLower}</td><td className={td}>{e.s1.lower}</td>
                <td className={td}>{e.s1.cf}</td><td className={td}>{e.s1.both}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PaperFigure>
      </>)}

      <PaperFigure label="Table 2" title="Potentially problematic technologies in the subset" file="table2_problematic_ranges" noImage csv={t2Csv}
        caption={t2Caption}>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-black/10">
            <th className={th}>Cost relaxation</th>{table2.map(([l]) => <th key={l} className={th}>{l}</th>)}
          </tr></thead>
          <tbody>
            {bySlack.map(e => (
              <tr key={e.slack} className="border-t border-black/10">
                <td className={td}>{slackLabel(e.slack)}</td>{table2.map(([l, g]) => <td key={l} className={td}>{range(e.t2[g])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </PaperFigure>
    </div>
  );
}
