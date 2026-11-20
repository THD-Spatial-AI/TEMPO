// Figure 2 of Lombardi et al. (2020): utilisation of the capacity expansion potential per technology
// group, one panel per cost relaxation. Grey violin (KDE), red jittered strip, black diamond = cost
// optimum, cyan diamond = a minimisation family's SPORE (bioenergy in the paper; selectable).
import { useMemo, useState } from 'react';
import PaperFigure, { EChartsPanel } from './PaperFigure';
import { groupUtilisation, toCsv } from '../../../services/sporesAnalysis';
import { kde, jitter, familyMinimum } from '../../../services/sporesFigures';

const LETTERS = 'ABCDEFGHI';

export default function Fig2Utilisation({ ensembles, metrics }) {
  const labels = metrics.groups.map(g => g.label);
  const families = metrics.problematic || [];
  const [famSel, setFamSel] = useState(null);
  const famId = famSel ?? (families.find(f => f.id === 'bioenergy') || families[0])?.id ?? '';
  const fam = families.find(f => f.id === famId) || null;
  const famName = fam ? fam.label : '';
  const panels = useMemo(() => [...ensembles].sort((a, b) => a.slack - b.slack).map(e => {
    const util = e.spores.map(s => groupUtilisation(s, e.meta, metrics));
    const bio = famId ? familyMinimum(e.spores, e.meta, metrics, famId) : null;
    return {
      slack: e.slack, util, n: e.spores.length - 1, ids: e.spores.map(s => s.spore_id),
      bio: bio ? { id: bio.spore_id, util: groupUtilisation(bio, e.meta, metrics) } : null,
      kdes: labels.map(l => kde(util.slice(1).map(u => u[l]))),
    };
  }), [ensembles, metrics, labels, famId]);

  const option = useMemo(() => {
    const n = panels.length;
    const w = (100 - 8) / n;
    const grids = panels.map((_, i) => ({
      left: `${4 + i * w}%`, width: `${w - 2}%`, top: 50, bottom: 150, containLabel: false,
    }));
    const series = [];
    panels.forEach((p, gi) => {
      const ax = { xAxisIndex: gi, yAxisIndex: gi };
      series.push({
        type: 'custom', name: 'density', ...ax, silent: true, z: 1,
        data: p.kdes.map((_, i) => [i]),
        renderItem: (params, api) => {
          const k = p.kdes[api.value(0)];
          if (!k) return null;
          const max = Math.max(...k.map(q => q.d));
          const half = (api.coord([0.4, 0])[0] - api.coord([0, 0])[0]);
          const cx = api.value(0);
          const pts = [
            ...k.map(q => api.coord([cx, q.y])).map((c, j) => [c[0] + half * k[j].d / max, c[1]]),
            ...[...k].reverse().map(q => { const c = api.coord([cx, q.y]); return [c[0] - half * q.d / max, c[1]]; }),
          ];
          return { type: 'polygon', shape: { points: pts }, style: { fill: '#b8b8b8', opacity: 0.85 } };
        },
      });
      series.push({
        type: 'scatter', name: 'SPORES', ...ax, symbolSize: 4, z: 2,
        itemStyle: { color: 'rgba(178,34,34,0.35)' },
        data: labels.flatMap((l, i) => p.util.slice(1).map((u, j) => (u[l] == null ? null
          : [i + 0.12 * jitter(j, i + 1), u[l], p.ids[j + 1]])).filter(Boolean)),
      });
      series.push({
        type: 'scatter', name: 'Cost-optimal solution', ...ax, symbol: 'diamond', symbolSize: 9, z: 4,
        itemStyle: { color: '#000' }, data: labels.map((l, i) => [i + 0.2, p.util[0][l]]),
      });
      if (p.bio) series.push({
        type: 'scatter', name: famName, ...ax, symbol: 'diamond', symbolSize: 9, z: 4,
        itemStyle: { color: '#3fd4d4', borderColor: '#000', borderWidth: 0.6 }, data: labels.map((l, i) => [i - 0.2, p.bio.util[l]]),
      });
    });
    return {
      backgroundColor: 'transparent', animation: false,
      textStyle: { fontFamily: 'Arial, sans-serif' },
      legend: { top: 0, data: [...(famName ? [famName] : []), 'Cost-optimal solution'], textStyle: { fontSize: 10 }, itemWidth: 10 },
      title: panels.map((p, i) => ({
        text: p.slack != null ? `${LETTERS[i]}  ${p.slack}% cost relaxation` : `${LETTERS[i]}  SPORES`, left: `${4 + i * w + (w - 2) / 2}%`, top: 28, textAlign: 'center',
        textStyle: { fontSize: 11, fontWeight: 'normal' },
      })),
      tooltip: { trigger: 'item', formatter: (q) => (q.seriesName === 'density' ? '' : `${labels[Math.round(q.value[0])]}<br/>${q.seriesName}${q.value[2] ? ` · SPORE ${q.value[2]}` : ''}: ${(q.value[1] * 100).toFixed(1)}%`) },
      grid: grids,
      xAxis: panels.map((_, i) => ({
        gridIndex: i, type: 'value', min: -0.5, max: labels.length - 0.5, interval: 1,
        splitLine: { show: false }, axisTick: { show: true, customValues: labels.map((_, k) => k) },
        axisLabel: { rotate: 90, fontSize: 9, customValues: labels.map((_, k) => k), formatter: (v) => labels[v] ?? '' },
      })),
      yAxis: panels.map((_, i) => ({
        gridIndex: i, type: 'value', min: 0, max: 1, interval: 0.5,
        name: i === 0 ? (metrics.relative ? 'Capacity / largest in any SPORE' : 'Utilisation of capacity expansion potential') : '', nameLocation: 'middle', nameGap: 32,
        nameTextStyle: { fontSize: 10 }, splitLine: { show: false },
        axisLabel: { show: i === 0, fontSize: 9, formatter: (v) => v.toFixed(1) }, axisLine: { show: true },
      })),
      series,
    };
  }, [panels, labels, famName, metrics.relative]);

  const csv = () => ({
    name: 'figure2_utilisation.csv',
    text: toCsv(panels.flatMap(p => p.util.map((u, j) => ({
      slack: p.slack, spore_id: p.ids[j],
      highlight: j === 0 ? 'cost-optimal' : (p.ids[j] === p.bio?.id ? famName : ''),
      ...u,
    }))), ['slack', 'spore_id', 'highlight', ...labels]),
  });

  return (
    <PaperFigure label="Figure 2" title="Utilisation of capacity expansion potential across SPORES" file="figure2_utilisation" csv={csv}
      controls={families.length > 1 && (
        <select value={famId} onChange={e => setFamSel(e.target.value)} className="text-xs border border-black/15 rounded px-2 py-0.5">
          {families.map(f => <option key={f.id} value={f.id}>Highlight: {f.label}</option>)}
        </select>
      )}
      caption={`${metrics.relative
        ? 'Capacity of each technology group (new capacity, nationally) divided by its largest value in any SPORE: the result carries no expansion potentials, so this is not the paper’s potential-based utilisation.'
        : 'Utilisation = deployed new capacity / expansion potential, nationally.'} ${panels.map(p => `${p.n} SPORES${p.slack != null ? ` at ${p.slack}%` : ''}`).join(', ')}${metrics.auto ? '' : ' (the paper’s 178 count 12 duplicate runs)'}. Red: one dot per SPORE, horizontal jitter seeded (no meaning). Grey: Gaussian kernel density (Scott's bandwidth, as seaborn), evaluated on 0–1, width scaled to each group's maximum. Black diamond: cost optimum.${fam ? ` Coloured diamond: the SPORE of the "${fam.label}" family with the lowest utilisation of ${fam.group || 'its target'}${panels.map(p => (p.bio ? ` (${p.slack != null ? `${p.slack}%: ` : ''}SPORE ${p.bio.id})` : '')).join('')}.` : ''}${metrics.auto ? ` Groups by technology type: ${metrics.groups.map(g => `${g.label} (${g.techs.join(', ')})`).join('; ')}.` : ' Gas turbines stand for the power-to-gas chain (44 GW potential); battery over 100 GW (inferred from the paper).'}`}>
      <EChartsPanel option={option} style={{ height: 480 }} />
    </PaperFigure>
  );
}
