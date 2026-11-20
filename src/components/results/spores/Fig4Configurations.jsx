// Figure 4 of Lombardi et al. (2020): three system configurations (cost optimum, low wind
// concentration, high overcapacity). Per row: PV / wind production per region; curtailment per zone
// with electricity flows; hydrogen / methane production per zone with methane flows; national capacity.
// Columns whose inputs a model doesn't have (no coordinates, no PV / wind, no hydrogen / methane) are left out.
import { useMemo, useState } from 'react';
import PaperFigure, { EChartsPanel, FigText, SvgPanel } from './PaperFigure';
import SporesMarkerMap, { Arrow, LegendSvg } from './SporesMarkerMap';
import { RegionBars, PV_COLOR, WIND_COLOR } from './Fig1Potentials';
import { fig4Data, table1Rows, pickUnit, niceNumber, techList } from '../../../services/sporesFigures';
import { toCsv } from '../../../services/sporesAnalysis';
import SelectField from '../../ui/SelectField';

const MAP_H = 270;
// Curtailment fill, light pink → dark purple (the paper's sequential scale)
const CURT = [[236, 213, 216], [196, 140, 170], [75, 46, 79]];
const curtColor = (t) => {
  const x = Math.max(0, Math.min(1, t)) * 2, i = Math.min(1, Math.floor(x)), f = x - i;
  return `rgb(${CURT[i].map((c, k) => Math.round(c + (CURT[i + 1][k] - c) * f)).join(',')})`;
};
const H2_COLOR = '#a52a2a', CH4_COLOR = '#d4a0a0', GAS_FLOW = '#e8742a';

const fmtE = (v, E) => `${(v / E.div).toFixed(2)} ${E.label}`;

/** Net annual flow per line as one arrow; hovering shows both directions (and capacity / CF if given). */
function FlowArrows({ project, lines, color, max, hover, active, name, P, E, prefix, dashed = () => false }) {
  return lines.filter(l => Math.abs(l.net) > 0).map(l => {
    const from = l.net >= 0 ? l.a : l.b, to = l.net >= 0 ? l.b : l.a;
    const a = project(from), b = project(to);
    if (!a || !b) return null;
    const id = `${prefix}-${l.key}`;
    const rows = [
      ['Net flow', `${fmtE(Math.abs(l.net), E)} to ${to}`],
      [`Into ${l.a}`, fmtE(l.into[l.a], E)], [`Into ${l.b}`, fmtE(l.into[l.b], E)],
      ...(l.cap > 0 && P ? [['Capacity', `${(l.cap / P.div).toFixed(2)} ${P.label}`]] : []),
      ...(l.cf != null ? [['Capacity factor', `${(100 * l.cf).toFixed(1)}%`]] : []),
      ...(dashed(l) ? [['Link', 'liquefied gas transport']] : []),
    ];
    return (
      <Arrow key={l.key} a={a} b={b} color={color} heads="end" width={1 + 4 * Math.abs(l.net) / (max || 1)}
        active={active === id} hover={hover(id, { title: `${name(from)} → ${name(to)}`, color, rows })}>
        {dashed(l) && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fff" strokeWidth={1.2} strokeDasharray="3 3" />}
        <text x={(a[0] + b[0]) / 2 + 3} y={(a[1] + b[1]) / 2 - 2} fontSize={8} fill="#222">{(Math.abs(l.net) / E.div).toFixed(1)}</text>
      </Arrow>
    );
  });
}

export default function Fig4Configurations({ spores, meta, metrics, rows, slack }) {
  // Rows: the cost optimum and two SPOREs of Table 1; without Table 1 (no wind / lines), the first
  // and the last SPORE. Rows 2 and 3 can be changed.
  const picks = useMemo(() => {
    const t = table1Rows(rows).rows;
    const by = (n) => t.find(r => r.names.includes(n))?.row.spore_id ?? null;
    const low = by('low wind concentration'), high = by('high overcapacity');
    return low != null || high != null
      ? { ids: [0, low, high], names: ['Cost-optimal solution', 'Low wind concentration', 'High overcapacity'] }
      : { ids: [0, spores[1]?.spore_id ?? null, spores[spores.length - 1]?.spore_id ?? null], names: ['Cost-optimal solution', 'SPORE', 'SPORE'] };
  }, [rows, spores]);
  const [sel, setSel] = useState([null, null, null]);
  const ids = picks.ids.map((p, i) => sel[i] ?? p);
  const rowNames = picks.names.map((n, i) => (sel[i] != null && i > 0 ? `SPORE ${sel[i]}` : n));

  const data = useMemo(() => ids.map(id => {
    const s = spores.find(x => x.spore_id === id);
    return s ? fig4Data(s, meta, metrics) : null;
  }), [ids, spores, meta, metrics]);
  const valid = data.filter(Boolean);
  const zoneVals = (k) => valid.flatMap(d => Object.values(d.zones).map(z => z[k]));
  const prodMax = Math.max(0, ...valid.flatMap(d => Object.values(d.regions).flatMap(v => [v.pv, v.wind])));
  const curtMax = Math.max(1e-9, ...zoneVals('curtailment'));
  const curtMin = Math.min(...zoneVals('curtailment'));
  const flowMax = Math.max(1e-9, ...valid.flatMap(d => d.lines.map(l => Math.abs(l.net))));
  const gasMax = Math.max(1e-9, ...valid.flatMap(d => d.gasLines.map(l => Math.abs(l.net))));
  const zMax = Math.max(1e-9, ...zoneVals('hydrogen'), ...zoneVals('methane'));
  const stackMax = Math.max(0, ...valid.map(d => d.stack.reduce((a, s) => a + s.cap, 0)));
  const E = pickUnit(Math.max(prodMax, curtMax, flowMax, gasMax, zMax), 'energy');
  const P = pickUnit(stackMax);
  const prodScale = prodMax > 0 ? 55 / (prodMax / E.div) : 1;
  const prodTick = niceNumber(prodMax / E.div / 2);
  const stackTick = niceNumber(stackMax / P.div / 4); // same y scale in every row

  const coords = metrics.coordinates || {};
  const mapped = Object.keys(coords).length >= 2;
  const showProd = mapped && prodMax > 0;
  const showCurt = curtMax > 1e-6;
  const showFlows = mapped && (showCurt || valid.some(d => d.lines.some(l => l.net)));
  const hasGasData = techList(metrics, 'hydrogenTech').length + techList(metrics, 'methaneTech').length > 0;
  const showGas = mapped && hasGasData && (zMax > 1e-6 || valid.some(d => d.gasLines.some(l => l.net)));
  const lng = metrics.auto ? () => false : (l) => l.a === 'SARD' || l.b === 'SARD'; // Italy: liquefied gas to Sardinia
  const name = (n) => (metrics.regionNames?.[n] && n !== metrics.regionNames[n] ? `${metrics.regionNames[n]} (${n})` : n);
  const pct = (a, b) => (b > 0 ? `${(100 * a / b).toFixed(0)}%` : '–');
  const sum = (o, k) => Object.values(o).reduce((t, v) => t + v[k], 0);

  const columns = [
    showProd && 'prod', showFlows && 'flows', showGas && 'gas', 'stack',
  ].filter(Boolean);
  const grid = { gridTemplateColumns: columns.map(c => (c === 'stack' ? '110px' : '1fr')).join(' ') };
  const legendFor = {
    prod: { title: 'Wind and PV annual production', rows: [
      { swatch: PV_COLOR, label: 'PV' }, { swatch: WIND_COLOR, label: 'Wind' },
      { scale: prodTick * prodScale, label: `${prodTick} ${E.label}` }] },
    flows: { title: showCurt ? 'Curtailment and electricity flows' : 'Electricity flows', rows: [
      ...(showCurt ? [{ gradient: [curtColor(0), curtColor(0.5), curtColor(1)], from: (curtMin / E.div).toFixed(1), to: (curtMax / E.div).toFixed(1), label: `curtailed (${E.label})` }] : []),
      { line: '#000', width: 1.5, arrow: true, label: `net flow (${E.label}), width ∝ flow` }] },
    gas: { title: 'Hydrogen, methane, gas flows', rows: [
      { swatch: H2_COLOR, label: 'hydrogen production' }, { swatch: CH4_COLOR, label: 'methane production' },
      { line: GAS_FLOW, width: 1.5, arrow: true, label: `net methane flow (${E.label})` },
      ...(metrics.auto ? [] : [{ line: GAS_FLOW, width: 2, dash: true, label: 'liquefied gas link' }])] },
    stack: { title: 'Installed capacity', rows: (metrics.fig4Legend || []).slice().reverse().map(l => ({ swatch: l.color, label: l.label })) },
  };

  const stackOption = (d) => ({
    backgroundColor: 'transparent', animation: false, textStyle: { fontFamily: 'Arial, sans-serif' },
    tooltip: { trigger: 'item', formatter: (q) => `${q.seriesName}: ${q.value.toFixed(2)} ${P.label}` },
    grid: { left: 44, right: 6, top: 10, bottom: 10 },
    xAxis: { type: 'category', data: [''], axisTick: { show: false } },
    yAxis: { type: 'value', max: Math.ceil(stackMax / P.div / stackTick) * stackTick, name: `Capacity (${P.label})`, nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { fontSize: 9 }, splitLine: { show: false }, axisLabel: { fontSize: 8 } },
    series: d.stack.map(s => ({ name: s.label, type: 'bar', stack: 'c', barWidth: '55%', itemStyle: { color: s.color }, data: [s.cap / P.div] })),
  });

  const csv = () => ({
    name: `figure4_configurations${slack != null ? `_${slack}pct` : ''}.csv`,
    text: toCsv(data.flatMap((d, i) => (d ? [
      ...Object.entries(d.regions).map(([r, v]) => ({ row: rowNames[i], spore_id: ids[i], kind: `region production ${E.label}`, item: r, pv: v.pv / E.div, wind: v.wind / E.div })),
      ...Object.entries(d.zones).map(([z, v]) => ({ row: rowNames[i], spore_id: ids[i], kind: `zone ${E.label}`, item: z, curtailment: v.curtailment / E.div, hydrogen: v.hydrogen / E.div, methane: v.methane / E.div })),
      ...d.lines.map(l => ({ row: rowNames[i], spore_id: ids[i], kind: `electricity flow ${E.label} (net a→b)`, item: l.key, value: l.net / E.div })),
      ...d.gasLines.map(l => ({ row: rowNames[i], spore_id: ids[i], kind: `methane flow ${E.label} (net a→b)`, item: l.key, value: l.net / E.div })),
      ...d.stack.map(s => ({ row: rowNames[i], spore_id: ids[i], kind: `installed ${P.label}`, item: s.label, value: s.cap / P.div })),
    ] : [])), ['row', 'spore_id', 'kind', 'item', 'pv', 'wind', 'curtailment', 'hydrogen', 'methane', 'value']),
  });

  const sporeOptions = spores.map(s => <option key={s.spore_id} value={s.spore_id}>{s.spore_id === 0 ? '0 — cost optimum' : `SPORE ${s.spore_id}`}</option>);
  const caption = metrics.auto
    ? `Rows: the cost optimum and two SPORES (${picks.names[1] === 'SPORE' ? 'the first and the last; ' : 'the low-wind-concentration and high-overcapacity SPORES of Table 1; '}changeable). ${showProd ? `Annual PV and wind production per location (${E.label}). ` : ''}${showFlows ? `${showCurt ? `Curtailed electricity per location (circle fill, ${(curtMin / E.div).toFixed(1)} → ${(curtMax / E.div).toFixed(1)} ${E.label}) and n` : 'N'}et annual electricity flow per line (width ∝ flow). ` : ''}${showGas ? 'Hydrogen and methane production per location and net methane flows. ' : ''}Last column: national installed capacity by technology type, existing + new, same scale in every row. ${mapped ? 'Maps: the model\'s locations; hover any bar, circle or arrow for its numbers.' : 'No maps: the model\'s locations have no coordinates.'}`
    : `Rows: cost optimum and the low-wind-concentration and high-overcapacity SPORES of Table 1 (changeable). Column 1: annual PV (rooftop + farm) and wind (onshore + offshore) production per region, ${E.label}. Column 2: curtailed electricity per bidding zone (circle fill, light ${curtMin / E.div < 0.05 ? '0' : (curtMin / E.div).toFixed(1)} → dark ${(curtMax / E.div).toFixed(1)} ${E.label}, the range over the three rows) and net annual electricity flow per line (${E.label}, width ∝ flow). Column 3: hydrogen (dark) and methane (light) production per zone and net annual methane flow per gas link (${E.label}); dashed: the liquefied-gas links to Sardinia. Hover any bar, zone or arrow for its numbers. Column 4: national installed capacity, existing + new, same scale in every row. No region shapes (map nodes of the published model on a muted basemap).`;

  return (
    <PaperFigure label="Figure 4" title={`System configurations${slack != null ? ` (${slack}% cost relaxation)` : ''}`} file={`figure4_configurations${slack != null ? `_${slack}pct` : ''}`} csv={csv}
      caption={caption}>
      <div className="space-y-4">
        {rowNames.map((rowName, i) => {
          const d = data[i];
          return (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1">
                <FigText className="text-xs font-bold">{`${'ABC'[i]}   ${rowName}`}</FigText>
                {i > 0 && (
                  <SelectField value={ids[i] ?? ''} onChange={e => setSel(s => s.map((v, k) => (k === i ? Number(e.target.value) : v)))}
                    className="text-xs border border-black/15 rounded px-2 py-0.5">{sporeOptions}</SelectField>
                )}
              </div>
              {d ? (
                <div className="grid gap-2" style={grid}>
                  {showProd && (
                    <SporesMarkerMap coords={coords} height={MAP_H} overlay={(project, { hover, active }) => (
                      <RegionBars project={project} regions={metrics.regions} scale={prodScale} hover={hover} active={active}
                        values={Object.fromEntries(Object.entries(d.regions).map(([r, v]) => [r, { pv: { front: v.pv / E.div }, wind: { front: v.wind / E.div } }]))}
                        info={(r) => ({ title: name(r), rows: [
                          ['PV production', fmtE(d.regions[r].pv, E)], ['Share of national PV', pct(d.regions[r].pv, sum(d.regions, 'pv'))],
                          ['Wind production', fmtE(d.regions[r].wind, E)], ['Share of national wind', pct(d.regions[r].wind, sum(d.regions, 'wind'))],
                        ] })} />
                    )} />
                  )}
                  {showFlows && (
                    <SporesMarkerMap coords={coords} height={MAP_H} overlay={(project, { hover, active }) => (
                      <g>
                        {showCurt && metrics.zones.map(z => {
                          const p = project(z);
                          const c = d.zones[z]?.curtailment || 0;
                          const fill = curtColor((c - curtMin) / ((curtMax - curtMin) || 1));
                          const on = active === `curt-${z}`;
                          return p && (
                            <circle key={z} cx={p[0]} cy={p[1]} r={on ? 15 : 13} fill={fill} opacity={0.9} stroke={on ? '#000' : '#fff'}
                              {...hover(`curt-${z}`, { title: metrics.auto ? name(z) : `${z} bidding zone`, color: fill, rows: [
                                ['Curtailed', fmtE(c, E)], ['Share of national curtailment', pct(c, sum(d.zones, 'curtailment'))],
                              ] })} />
                          );
                        })}
                        <FlowArrows project={project} lines={d.lines} color="#000" max={flowMax} hover={hover} active={active}
                          name={name} P={P} E={E} prefix="el" />
                      </g>
                    )} />
                  )}
                  {showGas && (
                    <SporesMarkerMap coords={coords} height={MAP_H} overlay={(project, { hover, active }) => (
                      <g>
                        <FlowArrows project={project} lines={d.gasLines} color={GAS_FLOW} max={gasMax} dashed={lng}
                          hover={hover} active={active} name={name} E={E} prefix="gas" />
                        {metrics.zones.map(z => {
                          const p = project(z);
                          const zd = d.zones[z];
                          if (!p || !zd || !(zd.hydrogen + zd.methane > 0)) return null;
                          const h = (v) => 40 * v / zMax;
                          const { hydrogen, methane } = zd;
                          const top = Math.max(h(methane), h(hydrogen), 6);
                          const on = active === `p2g-${z}`;
                          return (
                            <g key={z} {...hover(`p2g-${z}`, { title: metrics.auto ? name(z) : `${z} bidding zone`, rows: [
                              ['Hydrogen production', fmtE(hydrogen, E)], ['Methane production', fmtE(methane, E)],
                              ['Share of national hydrogen', pct(hydrogen, sum(d.zones, 'hydrogen'))],
                              ['Share of national methane', pct(methane, sum(d.zones, 'methane'))],
                            ] })}>
                              <rect x={p[0]} y={p[1] - top - 3} width={19} height={top + 6}
                                fill={on ? '#fff' : '#000'} fillOpacity={on ? 0.75 : 0} stroke={on ? '#333' : 'none'} strokeWidth={0.8} />
                              <rect x={p[0] + 4} y={p[1] - h(methane)} width={5} height={h(methane)} fill={CH4_COLOR} />
                              <rect x={p[0] + 10} y={p[1] - h(hydrogen)} width={5} height={h(hydrogen)} fill={H2_COLOR} />
                              <line x1={p[0] + 2} x2={p[0] + 17} y1={p[1]} y2={p[1]} stroke="#333" strokeWidth={0.8} />
                            </g>
                          );
                        })}
                      </g>
                    )} />
                  )}
                  <EChartsPanel option={stackOption(d)} style={{ height: MAP_H }} />
                </div>
              ) : <p className="text-xs text-slate-400 italic">No SPORE for this row.</p>}
            </div>
          );
        })}
        <div className="grid gap-2" style={grid}>
          {columns.map(c => (
            <SvgPanel key={c}><LegendSvg rows={legendFor[c].rows} title={legendFor[c].title} /></SvgPanel>
          ))}
        </div>
      </div>
    </PaperFigure>
  );
}
