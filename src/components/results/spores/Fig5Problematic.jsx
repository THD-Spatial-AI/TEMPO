// Figure 5 of Lombardi et al. (2020) (Supplement S2 at 5 % / 20 %): minimising potentially problematic
// technologies. Four panels of utilisation (x) against regional concentration or minimum line CF (y).
import { useMemo } from 'react';
import PaperFigure, { EChartsPanel } from './PaperFigure';
import { toCsv } from '../../../services/sporesAnalysis';
import { fig5Point, sporeFamily, table1Rows } from '../../../services/sporesFigures';

export const PLUS = 'path://M0.42,0H0.58V0.42H1V0.58H0.58V1H0.42V0.58H0V0.42H0.42Z';
export const CROSS = 'path://M0.12,0L0.5,0.38L0.88,0L1,0.12L0.62,0.5L1,0.88L0.88,1L0.5,0.62L0.12,1L0,0.88L0.38,0.5L0,0.12Z';

const PANELS = [
  { id: 'A', x: 'pvUtil', y: 'pvShare', xName: 'PV potential utilisation', yName: 'Max PV concentration in a region' },
  { id: 'B', x: 'windUtil', y: 'windShare', xName: 'Wind potential utilisation', yName: 'Max wind concentration in a region' },
  { id: 'C', x: 'p2gUtil', y: 'methShare', xName: 'Power-to-gas (turbines) potential utilisation', yName: 'Max methanation concentration in a region' },
  { id: 'D', x: 'transUtil', y: 'minCF', xName: 'Transmission potential utilisation', yName: 'Min transmission capacity factor' },
];

export default function Fig5Problematic({ spores, meta, metrics, rows, slack }) {
  const points = useMemo(() => spores.map((s, i) => ({
    id: s.spore_id, family: sporeFamily(s, metrics)?.id ?? null, ...fig5Point(s, meta, metrics, rows[i]),
  })), [spores, meta, metrics, rows]);
  const lowWind = useMemo(() => table1Rows(rows).rows.find(r => r.names.includes('low wind concentration'))?.row.spore_id, [rows]);

  // Panels the model has data for (all four for the Italy model)
  const panels = useMemo(() => PANELS.filter(P => points.some(p => p[P.x] != null && p[P.y] != null)), [points]);
  const ax = metrics.fig5Axes;
  const families = useMemo(() => metrics.problematic || [], [metrics]);
  const nRows = Math.ceil(panels.length / 2);
  const height = 60 + nRows * 290;

  const option = useMemo(() => {
    const H = 100 / nRows;
    const pos = panels.map((_, i) => [i % 2 ? 56 : 8, Math.floor(i / 2) * H + H * 0.1]); // left %, top %
    const series = [];
    panels.forEach((P, gi) => {
      const pt = (p) => [p[P.x], p[P.y], p.id];
      const idx = { xAxisIndex: gi, yAxisIndex: gi };
      series.push({ type: 'scatter', name: 'Other SPORES', ...idx, symbolSize: 6, itemStyle: { color: 'rgba(170,170,170,0.45)' },
        data: points.filter(p => p.id !== 0 && !p.family).map(pt) });
      families.forEach(f => series.push({
        type: 'scatter', name: f.label, ...idx, symbolSize: 6, itemStyle: { color: f.color, opacity: 0.75 },
        data: points.filter(p => p.family === f.id).map(pt),
      }));
      series.push({ type: 'scatter', name: 'Cost-optimal solution', ...idx, symbol: PLUS, symbolSize: 10, z: 5,
        itemStyle: { color: '#e31a1c' }, data: points.filter(p => p.id === 0).map(pt) });
      if (lowWind != null) series.push({ type: 'scatter', name: 'Low wind concentration', ...idx, symbol: CROSS, symbolSize: 8, z: 5,
        itemStyle: { color: '#000' }, data: points.filter(p => p.id === lowWind).map(pt) });
    });
    return {
      backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Arial, sans-serif' },
      legend: { orient: 'vertical', right: 0, top: 40, textStyle: { fontSize: 10 }, itemWidth: 10,
        data: ['Cost-optimal solution', ...families.map(f => f.label), ...(lowWind != null ? ['Low wind concentration'] : [])] },
      title: panels.map((P, i) => ({ text: 'ABCD'[i], left: `${pos[i][0] - 6}%`, top: `${Math.max(0, pos[i][1] - H * 0.08)}%`, textStyle: { fontSize: 12 } })),
      tooltip: { trigger: 'item', formatter: (q) => `SPORE ${q.value[2]} · ${q.seriesName}<br/>x ${q.value[0]?.toFixed(3)} · y ${q.value[1]?.toFixed(3)}` },
      grid: pos.map(([l, t]) => ({ left: `${l}%`, top: `${t}%`, width: '30%', height: `${H * 0.68}%` })),
      xAxis: panels.map((P, i) => ({ gridIndex: i, type: 'value', min: ax ? ax.x[0] : 0, max: ax ? ax.x[1] : 1, interval: 0.2, name: P.xName,
        nameLocation: 'middle', nameGap: 22, nameTextStyle: { fontSize: 9 }, splitLine: { show: false }, axisLabel: { fontSize: 8 } })),
      yAxis: panels.map((P, i) => ({ gridIndex: i, type: 'value', ...(ax ? { min: ax[P.id][0], max: ax[P.id][1] } : { scale: true }), name: P.yName,
        nameLocation: 'middle', nameGap: 30, nameTextStyle: { fontSize: 9 }, splitLine: { show: false },
        axisLabel: { fontSize: 8, formatter: (v) => v.toFixed(2) } })),
      series,
    };
  }, [points, panels, ax, families, lowWind, nRows]);

  const outside = ax ? panels.reduce((n, P) => n + points.filter(p => p[P.y] != null
    && (p[P.y] < ax[P.id][0] || p[P.y] > ax[P.id][1])).length, 0) : 0;
  if (!panels.length) return null;
  const relax = slack != null ? ` (${slack}% cost relaxation)` : '';
  const csv = () => ({
    name: `figure5_problematic${slack != null ? `_${slack}pct` : ''}.csv`,
    text: toCsv(points.map(p => ({ ...p, family: p.id === 0 ? 'cost-optimal' : p.family || '', low_wind: p.id === lowWind ? 1 : '' })),
      ['id', 'family', 'low_wind', 'pvUtil', 'pvShare', 'windUtil', 'windShare', 'p2gUtil', 'methShare', 'transUtil', 'minCF']),
  });

  return (
    <PaperFigure label={metrics.auto || slack === 10 ? 'Figure 5' : 'Figure S2'} title={`Impact of minimising technologies${relax}`}
      file={`figure5_problematic${slack != null ? `_${slack}pct` : ''}`} csv={csv}
      caption={metrics.auto
        ? `All ${points.length - 1} SPORES on each panel; coloured: the SPORES of each minimisation family (one per minimised target; ${families.length ? families.length : 'none in this run'}). y: the largest share of national capacity (existing + new) in one location (PV, wind, methanation), or the lowest line capacity factor. x: ${metrics.relative ? 'capacity / its largest value in any SPORE (the result has no expansion potentials)' : 'utilisation of the expansion potential'}, pooled over the technologies of the type. Red +: cost optimum.${lowWind != null ? ` ×: the low-wind-concentration SPORE of Table 1 (SPORE ${lowWind}).` : ''} Panels without data in this model are left out.`
        : `All ${points.length - 1} SPORES on each panel; coloured: the SPORES of the four minimisation families (3-run and 17-run families together). y: the largest share of national capacity (existing + new) in one region (A: PV; B: onshore + offshore wind; C: methanation, as the paper's caption uses it for the zone-level turbines), or the lowest inter-zonal line capacity factor (D). x: utilisation of the expansion potential (B: onshore + offshore pooled; C: gas turbines; D: international + inter-zonal lines pooled). Red +: cost optimum. ×: the low-wind-concentration SPORE of Table 1 (SPORE ${lowWind ?? '–'}). Axis ranges as in the paper${outside ? `; ${outside} point(s) fall outside them` : ''}.`}>
      <EChartsPanel option={option} style={{ height }} />
    </PaperFigure>
  );
}
