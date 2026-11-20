// Figure 6 of Lombardi et al. (2020) (Supplement S3, S7, S8): SPORES across sensitivity scenarios.
// One panel per case of the batch; x transmission, y renewable utilisation, colour storage (or P2G).
// `cases`: [{ case, meta, spores, rows }] at one cost relaxation.
import { useMemo, useState } from 'react';
import PaperFigure, { EChartsPanel } from './PaperFigure';
import { toCsv } from '../../../services/sporesAnalysis';
import { fig6Point, table1Rows } from '../../../services/sporesFigures';
import { PLUS, CROSS } from './Fig5Problematic';

const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
// Paper layout: A alone on the left, B–I in two columns (col, row)
const SLOTS = [[0, 1], [1, 0], [2, 0], [1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]];
const WORST = 'Worst weather year (1989)';

export default function Fig6Sensitivity({ cases, metrics, slack, slackSelect }) {
  const hasStorage = (metrics.storageGroups || []).length > 0, hasP2G = (metrics.p2gGroups || []).length > 0;
  const [colourSel, setColour] = useState(null);
  const colour = colourSel ?? (hasStorage ? 'storage' : 'p2g');
  const panels = useMemo(() => {
    const order = metrics.caseOrder || [];
    return [...cases]
    .sort((a, b) => (order.indexOf(a.case) + 1 || 99) - (order.indexOf(b.case) + 1 || 99))
      .map(c => ({ case: c.case, rows: c.rows, pts: c.spores.map(s => ({ id: s.spore_id, ...fig6Point(s, c.meta, metrics) })) }));
  }, [cases, metrics]);
  const ref = panels.find(p => p.case === 'Reference') || null;
  const refHighOver = useMemo(() => (ref ? table1Rows(ref.rows).rows.find(r => r.names.includes('high overcapacity'))?.row.spore_id : null), [ref]);

  const option = useMemo(() => {
    const single = panels.length === 1;
    const rows = single ? 1 : 4, cols = single ? 1 : 3;
    const W = 100 / cols, H = 100 / rows;
    const slot = (i) => (single ? [0, 0] : SLOTS[i] || [i % 3, Math.floor(i / 3)]);
    // Paper ranges for the Italy model; data ranges otherwise
    const ax = metrics.fig6Axes || { x: [0, 1], y: null, color: [0, 1] };
    const series = [], colourSeries = [];
    const xy = (p) => [p.x, p.y, p[colour], p.id];
    panels.forEach((P, gi) => {
      const idx = { xAxisIndex: gi, yAxisIndex: gi };
      if (P !== ref && ref) series.push({ type: 'scatter', name: 'Reference case (b–i)', ...idx, symbolSize: 6, z: 1,
        itemStyle: { color: 'transparent', borderColor: '#bbb', borderWidth: 0.8 }, data: ref.pts.slice(1).map(xy) });
      colourSeries.push(series.length);
      series.push({ type: 'scatter', name: 'Plotted case (a–i)', ...idx, symbolSize: 6, z: 2, itemStyle: { opacity: 0.75 },
        data: P.pts.slice(1).map(xy) });
      series.push({ type: 'scatter', name: 'Cost-optimal solution', ...idx, symbol: PLUS, symbolSize: 10, z: 5,
        itemStyle: { color: '#e31a1c' }, data: P.pts.slice(0, 1).map(xy) });
      if (P.case === WORST && refHighOver != null) series.push({ type: 'scatter', name: 'High overcapacity (i)', ...idx,
        symbol: CROSS, symbolSize: 9, z: 5, itemStyle: { color: '#000' }, data: ref.pts.filter(p => p.id === refHighOver).map(xy) });
    });
    return {
      backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Arial, sans-serif' },
      legend: { bottom: 0, textStyle: { fontSize: 10 }, itemWidth: 10,
        data: ['Cost-optimal solution', 'Plotted case (a–i)', ...(panels.length > 1 ? ['Reference case (b–i)'] : []), ...(panels.some(p => p.case === WORST) ? ['High overcapacity (i)'] : [])] },
      visualMap: { type: 'continuous', min: ax.color[0], max: ax.color[1], dimension: 2, seriesIndex: colourSeries,
        inRange: { color: VIRIDIS }, orient: 'vertical', left: single ? 'right' : 10, bottom: single ? 60 : '12%', itemHeight: 120,
        text: [ax.color[1].toFixed(2), ax.color[0].toFixed(2)], textStyle: { fontSize: 9 }, calculable: false },
      title: panels.map((P, i) => {
        const [c, r] = slot(i);
        return { text: `${'ABCDEFGHI'[i]}   ${P.case}`, left: `${c * W + 2}%`, top: `${r * H + 1}%`, textStyle: { fontSize: 11 } };
      }),
      tooltip: { trigger: 'item', formatter: (q) => `${q.seriesName} · SPORE ${q.value[3]}<br/>transmission ${(q.value[0] * 100).toFixed(1)}% · renewables ${(q.value[1] * 100).toFixed(1)}%<br/>${colour === 'p2g' ? 'P2G' : 'storage'} ${q.value[2] == null ? '–' : (q.value[2] * 100).toFixed(1)}%` },
      grid: panels.map((_, i) => {
        const [c, r] = slot(i);
        return single ? { left: 70, right: 120, top: 40, bottom: 80 }
          : { left: `${c * W + 7}%`, width: `${W - 10}%`, top: `${r * H + 4}%`, height: `${H - 10}%` };
      }),
      xAxis: panels.map((_, i) => ({ gridIndex: i, type: 'value', min: ax.x[0], max: ax.x[1], interval: 0.2, splitLine: { show: false },
        name: 'Transmission capacity utilisation', nameLocation: 'middle', nameGap: 20, nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 8 } })),
      yAxis: panels.map((_, i) => ({ gridIndex: i, type: 'value', ...(ax.y ? { min: ax.y[0], max: ax.y[1], interval: 0.05 } : { scale: true }), splitLine: { show: false },
        name: 'Renewable capacity utilisation', nameLocation: 'middle', nameGap: 30, nameTextStyle: { fontSize: 9 },
        axisLabel: { fontSize: 8, formatter: (v) => v.toFixed(2) } })),
      series,
    };
  }, [panels, ref, refHighOver, colour, metrics]);

  const csv = () => ({
    name: `figure6_sensitivity_${slack}pct.csv`,
    text: toCsv(panels.flatMap(P => P.pts.map(p => ({ case: P.case, spore_id: p.id, transmission: p.x, renewables: p.y, storage: p.storage, p2g: p.p2g }))),
      ['case', 'spore_id', 'transmission', 'renewables', 'storage', 'p2g']),
  });
  const label = metrics.auto ? 'Figure 6' : colour === 'p2g' ? 'Figure S3' : (slack === 10 ? 'Figure 6' : 'Figure S7/S8');
  const relax = slack != null ? ` (${slack}% cost relaxation)` : '';
  const what = metrics.relative ? 'capacity / its largest value in any SPORE (the result has no expansion potentials)' : 'utilisation of the pooled expansion potential';

  return (
    <PaperFigure label={label} title={`Solutions across ${panels.length > 1 ? 'scenarios' : 'the ensemble'}${relax}`} file={`figure6_sensitivity${slack != null ? `_${slack}pct` : ''}_${colour}`} csv={csv}
      controls={<>
        {slackSelect}
        {hasStorage && hasP2G && <select value={colour} onChange={e => setColour(e.target.value)} className="text-xs border border-black/15 rounded px-2 py-0.5">
          <option value="storage">Colour: electricity storage</option>
          <option value="p2g">Colour: power-to-gas (S3)</option>
        </select>}
      </>}
      caption={metrics.auto
        ? `x: ${what} of transmission, y: of ${metrics.renewableGroups.join(' + ')}, colour: of ${(colour === 'p2g' ? metrics.p2gGroups : metrics.storageGroups).join(' + ')} (viridis). Red +: the case's cost optimum.${panels.length > 1 ? ' Hollow grey: the reference SPORES.' : ''} One panel per case of the batch (${panels.map(p => p.case).join(', ')}).`
        : `Utilisation of the pooled expansion potential: x international + inter-zonal transmission, y onshore + offshore wind + PV, colour ${colour === 'p2g' ? 'gas turbines (power-to-gas)' : 'battery + pumped hydro (battery over 100 GW, inferred)'} on viridis 0–0.70. Red +: the case's cost optimum.${panels.length > 1 ? ' Hollow grey: the reference SPORES.' : ''} ${panels.length < 9 ? `Only the case${panels.length === 1 ? '' : 's'} in this batch ${panels.length === 1 ? 'is' : 'are'} shown (${panels.map(p => p.case).join(', ')}); the paper has nine.` : ''}${panels.some(p => p.case === WORST) ? ` ×: the reference high-overcapacity SPORE (${refHighOver ?? '–'}).` : ''}`}>
      <EChartsPanel option={option} style={{ height: panels.length === 1 ? 420 : 1100 }} />
    </PaperFigure>
  );
}
