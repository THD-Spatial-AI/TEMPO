import { GeoJsonLayer } from '@deck.gl/layers';
import { cellColor, cellValue } from '../../services/demandCells';

export function makeDemandCellsLayer({ features, colorBy, scale, onHover }) {
  if (!features?.length) return null;
  return new GeoJsonLayer({
    id: 'demand-cells',
    data: features,
    filled: true,
    stroked: true,
    getFillColor: f => cellColor(cellValue(f, colorBy), scale),
    getLineColor: [120, 53, 15, 160],
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    parameters: { depthTest: false },
    updateTriggers: { getFillColor: [colorBy, scale] },
    onHover,
  });
}

const fixed = (v, d) => (Number(v) || 0).toFixed(d);

/** deck.gl hover info → HoverTooltip `hoveredInfo` (null when nothing is hovered). */
export function demandCellHover(info) {
  if (!info?.object) return null;
  const p = info.object.properties || {};
  const mix = Object.entries(p.mix || {})
    .sort((a, b) => b[1] - a[1])
    .map(([code, pct]) => `${code} ${pct}`)
    .join(' · ');
  const details = [
    { label: 'Annual demand', value: `${fixed(p.annualGWh, 1)} GWh/yr` },
    { label: 'Average', value: `${fixed(p.avgMW, 2)} MW` },
    { label: 'Density', value: `${fixed(p.densityGWhKm2, 2)} GWh/km²` },
    { label: 'Area', value: `${fixed(p.areaKm2, 1)} km²` },
  ];
  if (mix) details.push({ label: 'Mix', value: mix });
  return {
    x: info.x, y: info.y,
    name: p.name,
    layerType: 'Demand cell',
    accentColor: '#f03b20',
    details,
  };
}
