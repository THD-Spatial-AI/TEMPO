// Figure 1 of Lombardi et al. (2020): the cost-optimal solution (SPORE 0) against the capacity
// expansion potentials. (A) PV / wind per region, (B) use of each line's expansion potential,
// (C, D) national capacity of the smaller and larger technologies.
import { useMemo } from 'react';
import PaperFigure, { EChartsPanel, FigText } from './PaperFigure';
import SporesMarkerMap, { Arrow } from './SporesMarkerMap';
import { fig1Data, pickUnit, niceNumber } from '../../../services/sporesFigures';
import { toCsv } from '../../../services/sporesAnalysis';

export const PV_COLOR = '#f0c020';
export const WIND_COLOR = '#1060f0';
const HATCH = { symbol: 'rect', symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 7], rotation: -Math.PI / 4, color: 'rgba(255,255,255,0.7)' };

/**
 * Two bars per region (PV, wind) at the region's node; `back` drawn light behind `front`.
 * `info(r)` gives the hover tooltip ({ title, rows }); the scale goes in the map legend.
 */
export function RegionBars({ project, regions, values, scale, hover, active, info }) {
  const bw = 6, px = (v) => Math.max(0, v * scale);
  return (
    <g>
      {regions.map(r => {
        const p = project(r);
        const v = values[r];
        if (!p || !v || !(Math.max(v.pv.front, v.pv.back ?? 0, v.wind.front, v.wind.back ?? 0) > 0)) return null;
        const bars = [[PV_COLOR, v.pv, -bw - 1], [WIND_COLOR, v.wind, 1]];
        const top = Math.max(px(v.pv.back ?? v.pv.front), px(v.wind.back ?? v.wind.front), 6);
        const on = active === `region-${r}`;
        return (
          <g key={r} {...(hover && info ? hover(`region-${r}`, info(r)) : {})}>
            {/* hover target and highlight: the box around the pair */}
            <rect x={p[0] - bw - 4} y={p[1] - top - 3} width={2 * bw + 8} height={top + 6}
              fill={on ? '#fff' : '#000'} fillOpacity={on ? 0.75 : 0} stroke={on ? '#333' : 'none'} strokeWidth={0.8} />
            {bars.map(([c, b, dx], k) => (
              <g key={k}>
                {b.back != null && <rect x={p[0] + dx} y={p[1] - px(b.back)} width={bw} height={px(b.back)} fill={c} opacity={0.35} />}
                <rect x={p[0] + dx} y={p[1] - px(b.front)} width={bw} height={px(b.front)} fill={c} />
              </g>
            ))}
            <line x1={p[0] - bw - 3} x2={p[0] + bw + 3} y1={p[1]} y2={p[1]} stroke="#333" strokeWidth={0.8} />
          </g>
        );
      })}
    </g>
  );
}


const utilColor = (u) => {
  const t = Math.max(0, Math.min(1, u));
  const g = [150, 150, 150], o = [240, 160, 32];
  return `rgb(${g.map((c, k) => Math.round(c + (o[k] - c) * t)).join(',')})`;
};

export default function Fig1Potentials({ spore, meta, metrics }) {
  const d = useMemo(() => fig1Data(spore, meta, metrics), [spore, meta, metrics]);
  const regions = useMemo(() => metrics.regions || [], [metrics]);
  const maxBar = Math.max(0, ...regions.flatMap(r => [d.pv[r].potential, d.wind[r].potential, d.pv[r].cap, d.wind[r].cap]));
  const u = pickUnit(Math.max(maxBar, ...[...d.small, ...d.large].map(b => b.potential)));
  const scale = maxBar > 0 ? 55 / (maxBar / u.div) : 1;              // px per display unit, tallest bar 55 px
  const tick = niceNumber(maxBar / u.div / 2);
  const regionValues = useMemo(() => Object.fromEntries(regions.map(r => [r, {
    pv: { front: d.pv[r].cap / u.div, back: d.pv[r].potential / u.div },
    wind: { front: d.wind[r].cap / u.div, back: d.wind[r].potential / u.div },
  }])), [d, regions, u.div]);
  const mapped = regions.filter(r => metrics.coordinates?.[r]).length >= 2;
  const showA = mapped && (metrics.pvTechs?.length || metrics.windTechs?.length) && maxBar > 0;
  const lines = d.lines.filter(l => metrics.coordinates?.[l.a] && metrics.coordinates?.[l.b]);
  const showB = mapped && lines.length > 0;
  const rel = metrics.relative;

  const smallOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Arial, sans-serif' },
    tooltip: { trigger: 'item', formatter: (q) => { const b = d.small[q.dataIndex]; return `${b.label}: ${(b.cap / u.div).toFixed(2)} ${u.label} (potential ${(b.potential / u.div).toFixed(2)} ${u.label})${b.scope ? ' · scope for increase' : ' · no scope'}`; } },
    grid: { left: 50, right: 10, top: 20, bottom: 90 },
    xAxis: { type: 'category', data: d.small.map(b => b.label), axisLabel: { rotate: 40, fontSize: 9 } },
    yAxis: { type: 'value', name: `Capacity (${u.label})`, nameLocation: 'middle', nameGap: 32, nameTextStyle: { fontSize: 10 }, splitLine: { show: false }, axisLabel: { fontSize: 9 } },
    series: [{
      type: 'bar', barWidth: '90%',
      data: d.small.map(b => ({ value: b.cap / u.div, itemStyle: { color: b.color, decal: HATCH } })),
      label: { show: true, position: 'top', fontSize: 11, formatter: (q) => (d.small[q.dataIndex].scope ? '↥' : '⤒') },
    }],
  }), [d, u]);

  const largeOption = useMemo(() => ({
    backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Arial, sans-serif' },
    tooltip: { trigger: 'item', formatter: (q) => { const b = d.large[q.dataIndex]; return `${b.label}: ${(b.cap / u.div).toFixed(1)} ${u.label} of ${(b.potential / u.div).toFixed(1)} ${u.label} ${rel ? 'ensemble maximum' : 'potential'}`; } },
    legend: { top: 0, right: 0, data: [rel ? 'Largest in any SPORE' : 'Potential capacity', 'Cost optimal capacity'], textStyle: { fontSize: 9 }, itemWidth: 10 },
    grid: { left: 50, right: 10, top: 30, bottom: 70 },
    xAxis: { type: 'category', data: d.large.map(b => b.label), axisLabel: { rotate: 40, fontSize: 9 } },
    yAxis: { type: 'value', name: `Capacity (${u.label})`, nameLocation: 'middle', nameGap: 34, nameTextStyle: { fontSize: 10 }, splitLine: { show: false }, axisLabel: { fontSize: 9 } },
    series: [
      { name: rel ? 'Largest in any SPORE' : 'Potential capacity', type: 'bar', barWidth: '70%', barGap: '-100%', itemStyle: { color: '#999', opacity: 0.4 },
        data: d.large.map(b => ({ value: b.potential / u.div, itemStyle: { color: b.color, opacity: 0.4 } })) },
      { name: 'Cost optimal capacity', type: 'bar', barWidth: '70%', itemStyle: { color: '#333', decal: HATCH },
        data: d.large.map(b => ({ value: b.cap / u.div, itemStyle: { color: b.color, decal: HATCH } })) },
    ],
  }), [d, u, rel]);

  const csv = () => ({
    name: 'figure1_cost_optimum_potentials.csv',
    text: toCsv([
      ...regions.flatMap(r => [
        { panel: 'A', item: `${r} PV`, capacity: d.pv[r].cap / u.div, potential: d.pv[r].potential / u.div },
        { panel: 'A', item: `${r} wind`, capacity: d.wind[r].cap / u.div, potential: d.wind[r].potential / u.div },
      ]),
      ...d.lines.map(l => ({ panel: 'B', item: l.key, capacity: l.expansion / u.div, potential: l.potential / u.div, utilisation: l.utilisation })),
      ...d.small.map(b => ({ panel: 'C', item: b.label, capacity: b.cap / u.div, potential: b.potential / u.div, scope: b.scope })),
      ...d.large.map(b => ({ panel: 'D', item: b.label, capacity: b.cap / u.div, potential: b.potential / u.div })),
    ].map(r => ({ ...r, unit: u.label })), ['panel', 'item', 'capacity', 'potential', 'unit', 'utilisation', 'scope']),
  });

  const total = (k) => d.large.find(b => b.label === k)?.cap / u.div;
  const name = (n) => (metrics.regionNames?.[n] && metrics.regionNames[n] !== n ? `${metrics.regionNames[n]} (${n})` : n);
  const fmt = (v) => `${(v / u.div).toFixed(2)} ${u.label}`;
  const pct = (a, b) => (b > 0 ? `${(100 * a / b).toFixed(0)}%` : '–');
  const natPV = regions.reduce((s, r) => s + d.pv[r].cap, 0);
  const natWind = regions.reduce((s, r) => s + d.wind[r].cap, 0);
  const regionInfo = (r) => ({
    title: name(r),
    rows: [
      ['PV cost-optimal', fmt(d.pv[r].cap)], ['PV potential', fmt(d.pv[r].potential)], ['PV potential used', pct(d.pv[r].cap, d.pv[r].potential)],
      ['Share of national PV', pct(d.pv[r].cap, natPV)],
      ['Wind cost-optimal', fmt(d.wind[r].cap)], ['Wind potential', fmt(d.wind[r].potential)], ['Wind potential used', pct(d.wind[r].cap, d.wind[r].potential)],
      ['Share of national wind', pct(d.wind[r].cap, natWind)],
    ],
  });
  const lineInfo = (l, color) => ({
    title: `${name(l.a)} – ${name(l.b)}`, color,
    rows: [
      ['Existing capacity', fmt(l.cap - l.expansion)], ['New capacity', fmt(l.expansion)], ['Expansion potential', fmt(l.potential)],
      ['Potential used', pct(l.expansion, l.potential)],
      ['Capacity factor', l.cf == null ? '–' : `${(100 * l.cf).toFixed(1)}%`],
      [`Energy into ${l.a}`, `${(l.into[l.a] / 1e6).toFixed(2)} TWh`], [`Energy into ${l.b}`, `${(l.into[l.b] / 1e6).toFixed(2)} TWh`],
    ],
  });

  const caption = metrics.auto
    ? `SPORE 0. Capacity = existing + new, technologies grouped by type. ${rel
      ? 'The result carries no expansion potentials, so the light bars are the largest capacity of the group in any SPORE (not a potential).'
      : 'Potential = existing + expansion potential (energy_cap_max in the result).'} ${showA ? '(A) PV and wind per location: light = potential, solid = cost-optimal. ' : ''}${showB ? '(B) New capacity of each line as a share of its expansion potential (grey 0 % → orange 100 %). ' : ''}(C) Technologies without expansion: ⤒ no scope / ↥ scope for capacity increase. (D) Expandable technologies. ${mapped ? 'Maps: the model\'s locations on a muted basemap; hover a bar pair or a line for its numbers.' : 'No map: the model\'s locations have no coordinates.'}`
    : `SPORE 0. Capacity = existing + new; potential = existing + expansion potential (energy_cap_max; biogas 4 GW system-wide; battery 100 GW, inferred from the paper — the model allows 300 GW). (A) PV (rooftop + farm) and wind (onshore + offshore) per region: light = potential, solid = cost-optimal. (B) New capacity of each line as a share of its expansion potential (grey 0 % → orange 100 %). (C) ⤒ no scope / ↥ scope for capacity increase; methanation and electrolysis in GW of methane / hydrogen output. Maps: region nodes of the published model on a muted basemap (no region shapes); hover a bar pair or a line for its numbers. This run: rooftop PV ${total('Rooftop PV')?.toFixed(1)} GW, onshore wind ${total('Onshore wind')?.toFixed(1)} GW, offshore ${total('Offshore wind')?.toFixed(1)} GW, gas turbines ${(d.small.find(b => b.label === 'Gas turbine')?.cap / u.div).toFixed(1)} GW (paper, hourly: +144.5 PV, +59.6 onshore, +17.6 offshore, 11.7 turbines).`;

  return (
    <PaperFigure label="Figure 1" title="Cost-optimal model results compared with capacity expansion potentials" file="figure1_cost_optimum_potentials" csv={csv}
      caption={caption}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {showA && (
          <div>
            <FigText className="text-xs font-bold">A</FigText>
            <SporesMarkerMap coords={metrics.coordinates} height={330} legendTitle={`Capacity (${u.label})`} legend={[
              { pair: PV_COLOR, label: `PV (light: ${rel ? 'ensemble max' : 'potential'})` },
              { pair: WIND_COLOR, label: `Wind (light: ${rel ? 'ensemble max' : 'potential'})` },
              { scale: tick * scale, label: `${tick} ${u.label}` },
            ]} overlay={(project, { hover, active }) => (
              <RegionBars project={project} regions={regions} values={regionValues} scale={scale}
                hover={hover} active={active} info={regionInfo} />
            )} />
          </div>
        )}
        {showB && (
          <div>
            <FigText className="text-xs font-bold">B</FigText>
            <SporesMarkerMap coords={metrics.coordinates} height={330} legendTitle="Transmission expansion" legend={[
              { gradient: [utilColor(0), utilColor(0.5), utilColor(1)], from: '0%', to: '100%', label: 'potential used' },
              { line: '#666', width: 2, arrow: true, label: 'line (hover for numbers)' },
            ]} overlay={(project, { hover, active }) => lines.map(l => {
              const a = project(l.a), b = project(l.b);
              if (!a || !b) return null;
              const c = utilColor(l.utilisation);
              return (
                <Arrow key={l.key} a={a} b={b} color={c} width={2} active={active === l.key} hover={hover(l.key, lineInfo(l, c))}>
                  <text x={(a[0] + b[0]) / 2 + 4} y={(a[1] + b[1]) / 2 - 3} fontSize={9} fill={c} fontWeight="bold">{`${Math.round(l.utilisation * 100)}%`}</text>
                </Arrow>
              );
            })} />
          </div>
        )}
        {d.small.length > 0 && (
          <div>
            <FigText className="text-xs font-bold">C</FigText>
            <EChartsPanel option={smallOption} style={{ height: 320 }} />
          </div>
        )}
        {d.large.length > 0 && (
          <div>
            <FigText className="text-xs font-bold">D</FigText>
            <EChartsPanel option={largeOption} style={{ height: 320 }} />
          </div>
        )}
      </div>
    </PaperFigure>
  );
}
