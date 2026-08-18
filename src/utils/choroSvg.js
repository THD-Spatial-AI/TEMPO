/**
 * Render a commune choropleth as a self-contained SVG string — deterministic,
 * no WebGL, no basemap. Publication-grade vector output for the paper.
 *
 *   buildChoroplethSVG(geo, metrics, metricKey, opts) → "<svg …>…</svg>"
 *
 * geo      : the bundled commune GeoJSON (FeatureCollection, WGS84)
 * metrics  : { demand:{loc:v}, unmet:{loc:v}, demandMet:{loc:0..1} } (choroMetricsFromResult)
 * metricKey: which metric to shade by
 * opts     : { ramp:[c0,c1,c2], kind:'seq'|'pct', label, unit, width, height }
 *
 * Pure function (no DOM / no async) so it can be unit-tested in Node.
 */
import { normComuna } from './loadCommunesGeo';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// 3-stop ramp interpolation → rgb() string
const rampColor = (ramp, t) => {
  const x = clamp01(t);
  const [a, b, c] = ramp.map(hexToRgb);
  const [p, q, s] = x < 0.5
    ? [a, b, x * 2]
    : [b, c, (x - 0.5) * 2];
  return `rgb(${lerp(p[0], q[0], s)},${lerp(p[1], q[1], s)},${lerp(p[2], q[2], s)})`;
};

// walk every [lng,lat] pair in a geometry
const eachCoord = (coords, cb) => {
  if (typeof coords[0] === 'number') cb(coords[0], coords[1]);
  else coords.forEach((c) => eachCoord(c, cb));
};

export function buildChoroplethSVG(geo, metrics, metricKey, opts = {}) {
  const {
    ramp = ['#fff7ec', '#fdbb84', '#d7301f'],
    kind = 'seq',
    label = '',
    unit = '',
    width = 900,
    height = 1100,
  } = opts;

  const pad = 24;
  const legendH = 54;
  const titleH = label ? 30 : 8;

  // metric value per (normalized) commune
  const valMap = new Map();
  Object.entries(metrics?.[metricKey] || {}).forEach(([loc, v]) => valMap.set(normComuna(loc), Number(v) || 0));

  // matched features + bbox
  const feats = (geo?.features || []).filter((f) => valMap.has(normComuna(f.properties?.comuna)));
  if (!feats.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="20" y="30" font-family="sans-serif" font-size="14" fill="#94a3b8">No commune data for ${metricKey}</text></svg>`;
  }
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  feats.forEach((f) => eachCoord(f.geometry.coordinates, (lng, lat) => {
    if (lng < minLon) minLon = lng; if (lng > maxLon) maxLon = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }));

  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1;
  const dLonC = Math.max(1e-6, (maxLon - minLon) * cosLat);
  const dLat = Math.max(1e-6, maxLat - minLat);

  const availW = width - 2 * pad;
  const availH = height - 2 * pad - legendH - titleH;
  const scale = Math.min(availW / dLonC, availH / dLat);
  const drawW = dLonC * scale, drawH = dLat * scale;
  const offX = pad + (availW - drawW) / 2;
  const offY = pad + titleH + (availH - drawH) / 2;

  const px = (lng) => (offX + (lng - minLon) * cosLat * scale).toFixed(1);
  const py = (lat) => (offY + (maxLat - lat) * scale).toFixed(1);

  // metric domain
  const values = [...valMap.values()];
  const vMax = kind === 'pct' ? 1 : Math.max(0, ...values);
  const vMin = 0;
  const colorFor = (v) => (vMax <= vMin ? ramp[0] : rampColor(ramp, (v - vMin) / (vMax - vMin)));

  // one ring → path fragment
  const ringPath = (ring) => 'M' + ring.map(([lng, lat]) => `${px(lng)} ${py(lat)}`).join(' L') + 'Z';
  const geomPath = (geom) => {
    if (geom.type === 'Polygon') return geom.coordinates.map(ringPath).join(' ');
    if (geom.type === 'MultiPolygon') return geom.coordinates.flat().map(ringPath).join(' ');
    return '';
  };

  const paths = feats.map((f) => {
    const v = valMap.get(normComuna(f.properties.comuna)) || 0;
    const d = geomPath(f.geometry);
    const name = String(f.properties.comuna || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<path d="${d}" fill="${colorFor(v)}" stroke="#334155" stroke-width="0.4" stroke-opacity="0.55"><title>${name}: ${kind === 'pct' ? (v * 100).toFixed(0) + '%' : v.toFixed(1) + (unit ? ' ' + unit : '')}</title></path>`;
  }).join('\n');

  // legend gradient
  const lx = pad, ly = height - legendH + 8, lw = Math.min(260, width - 2 * pad), lh = 12;
  const fmt = (v) => (kind === 'pct' ? `${(v * 100).toFixed(0)}%` : `${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}${unit ? ' ' + unit : ''}`);
  const gradId = 'g_' + metricKey;
  const legend = `
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ramp[0]}"/><stop offset="50%" stop-color="${ramp[1]}"/><stop offset="100%" stop-color="${ramp[2]}"/>
    </linearGradient></defs>
    <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" fill="url(#${gradId})" stroke="#cbd5e1" stroke-width="0.5"/>
    <text x="${lx}" y="${ly + lh + 14}" font-family="sans-serif" font-size="11" fill="#64748b">${fmt(vMin)}</text>
    <text x="${lx + lw}" y="${ly + lh + 14}" font-family="sans-serif" font-size="11" fill="#64748b" text-anchor="end">${fmt(vMax)}</text>`;

  const title = label
    ? `<text x="${pad}" y="22" font-family="sans-serif" font-size="15" font-weight="600" fill="#1e293b">${label}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${title}
${paths}
${legend}
</svg>`;
}

// Shared: project lon/lat → svg x/y over a bbox of features + points.
function makeProjection(feats, points, { width, height, pad, legendH, titleH }) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const ext = (lng, lat) => { if (lng < minLon) minLon = lng; if (lng > maxLon) maxLon = lng; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; };
  feats.forEach((f) => eachCoord(f.geometry.coordinates, ext));
  points.forEach(([lng, lat]) => ext(lng, lat));
  if (!isFinite(minLon)) return null;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1;
  const dLonC = Math.max(1e-6, (maxLon - minLon) * cosLat);
  const dLat = Math.max(1e-6, maxLat - minLat);
  const availW = width - 2 * pad;
  const availH = height - 2 * pad - legendH - titleH;
  const scale = Math.min(availW / dLonC, availH / dLat);
  const offX = pad + (availW - dLonC * scale) / 2;
  const offY = pad + titleH + (availH - dLat * scale) / 2;
  return {
    px: (lng) => offX + (lng - minLon) * cosLat * scale,
    py: (lat) => offY + (maxLat - lat) * scale,
    scale,
  };
}

const commumeBackdrop = (feats, proj) => {
  const ringPath = (ring) => 'M' + ring.map(([lng, lat]) => `${proj.px(lng).toFixed(1)} ${proj.py(lat).toFixed(1)}`).join(' L') + 'Z';
  const gp = (g) => g.type === 'Polygon' ? g.coordinates.map(ringPath).join(' ') : g.type === 'MultiPolygon' ? g.coordinates.flat().map(ringPath).join(' ') : '';
  return feats.map((f) => `<path d="${gp(f.geometry)}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.4"/>`).join('\n');
};

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const congestionColor = (u) => u >= 0.9 ? '#dc2626' : u >= 0.75 ? '#ea580c' : u >= 0.5 ? '#ca8a04' : '#16a34a';

/**
 * Node map as SVG — one circle per location over a commune backdrop, with
 * transmission lines. Mirrors the Results "Capacity" / "Gen Heatmap" map views.
 *
 * nodes: [{ name, lat, lon, value, color? }]   (color used in colorMode:'tech')
 * links: [{ ax, ay, bx, by, cap }]             (lon/lat endpoints, pre-resolved)
 * colorMode: 'tech' (circle = node.color) | 'value' (circle = heat ramp of value)
 */
export function buildNodeMapSVG({ geo, communeNames = [], nodes = [], links = [], colorMode = 'tech', ramp = ['#fbbf24', '#f59e0b', '#dc2626'], legend = [], label = '', unit = 'MW', width = 900, height = 1100 } = {}) {
  const pad = 24, legendH = 56, titleH = label ? 30 : 8;
  const communeSet = new Set((communeNames || []).map(normComuna));
  const feats = (geo?.features || []).filter(f => communeSet.has(normComuna(f.properties?.comuna)));
  const valid = nodes.filter(n => Number.isFinite(n.lat) && Number.isFinite(n.lon) && (n.value || 0) > 0);
  if (!valid.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="20" y="30" font-family="sans-serif" font-size="14" fill="#94a3b8">No located generation to map</text></svg>`;
  const pts = [...valid.map(n => [n.lon, n.lat]), ...links.flatMap(l => [[l.ax, l.ay], [l.bx, l.by]])];
  const proj = makeProjection(feats, pts, { width, height, pad, legendH, titleH });
  if (!proj) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;

  const maxVal = Math.max(1, ...valid.map(n => n.value || 0));
  const maxCap = Math.max(1, ...links.map(l => l.cap || 0));
  const linksSvg = links.map(l => {
    const w = Math.max(0.6, Math.min(4, 0.6 + (l.cap || 0) / maxCap * 3));
    return `<line x1="${proj.px(l.ax).toFixed(1)}" y1="${proj.py(l.ay).toFixed(1)}" x2="${proj.px(l.bx).toFixed(1)}" y2="${proj.py(l.by).toFixed(1)}" stroke="#94a3b8" stroke-width="${w.toFixed(1)}" stroke-opacity="0.6"/>`;
  }).join('\n');

  const nodesSvg = valid.map(n => {
    const r = 3 + Math.sqrt((n.value || 0) / maxVal) * 16;
    const fill = colorMode === 'tech' ? (n.color || '#64748b') : rampColor(ramp, (n.value || 0) / maxVal);
    const disp = n.value >= 1000 ? (n.value / 1000).toFixed(1) + 'k' : Math.round(n.value);
    return `<circle cx="${proj.px(n.lon).toFixed(1)}" cy="${proj.py(n.lat).toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" fill-opacity="0.9" stroke="#ffffff" stroke-width="0.8"><title>${esc(n.name)}: ${disp} ${unit}</title></circle>`;
  }).join('\n');

  // legend
  const lx = pad, ly = height - legendH + 10;
  let legendSvg;
  if (colorMode === 'tech') {
    legendSvg = (legend || []).slice(0, 12).map(([tech, color], i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const ex = lx + col * ((width - 2 * pad) / 4), ey = ly + row * 15;
      return `<rect x="${ex}" y="${ey - 8}" width="9" height="9" rx="1.5" fill="${color}"/><text x="${ex + 13}" y="${ey}" font-family="sans-serif" font-size="10" fill="#475569">${esc(String(tech).replace(/_/g, ' '))}</text>`;
    }).join('\n');
  } else {
    const lw = Math.min(240, width - 2 * pad);
    legendSvg = `<defs><linearGradient id="ng" x1="0" x2="1"><stop offset="0%" stop-color="${ramp[0]}"/><stop offset="50%" stop-color="${ramp[1]}"/><stop offset="100%" stop-color="${ramp[2]}"/></linearGradient></defs>
      <rect x="${lx}" y="${ly}" width="${lw}" height="10" fill="url(#ng)"/>
      <text x="${lx}" y="${ly + 24}" font-family="sans-serif" font-size="10" fill="#64748b">0</text>
      <text x="${lx + lw}" y="${ly + 24}" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="end">${maxVal >= 1000 ? (maxVal / 1000).toFixed(0) + 'k' : Math.round(maxVal)} ${unit}</text>`;
  }
  const title = label ? `<text x="${pad}" y="22" font-family="sans-serif" font-size="15" font-weight="600" fill="#1e293b">${esc(label)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${title}${commumeBackdrop(feats, proj)}${linksSvg}${nodesSvg}${legendSvg}</svg>`;
}

/**
 * Transmission map as SVG — links coloured by peak utilisation, width by capacity.
 * links: [{ ax, ay, bx, by, cap, util }] ; nodes: [{ name, lat, lon }]
 */
export function buildTransmissionMapSVG({ geo, communeNames = [], nodes = [], links = [], label = '', width = 900, height = 1100 } = {}) {
  const pad = 24, legendH = 40, titleH = label ? 30 : 8;
  const communeSet = new Set((communeNames || []).map(normComuna));
  const feats = (geo?.features || []).filter(f => communeSet.has(normComuna(f.properties?.comuna)));
  const validLinks = links.filter(l => [l.ax, l.ay, l.bx, l.by].every(Number.isFinite));
  if (!validLinks.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="20" y="30" font-family="sans-serif" font-size="14" fill="#94a3b8">No transmission lines to map</text></svg>`;
  const pts = [...validLinks.flatMap(l => [[l.ax, l.ay], [l.bx, l.by]]), ...nodes.filter(n => Number.isFinite(n.lat)).map(n => [n.lon, n.lat])];
  const proj = makeProjection(feats, pts, { width, height, pad, legendH, titleH });
  if (!proj) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  const maxCap = Math.max(1, ...validLinks.map(l => l.cap || 0));
  const linksSvg = validLinks.map(l => {
    const w = Math.max(1, Math.min(5, 1 + (l.cap || 0) / maxCap * 4));
    const col = l.util != null ? congestionColor(l.util) : '#64748b';
    return `<line x1="${proj.px(l.ax).toFixed(1)}" y1="${proj.py(l.ay).toFixed(1)}" x2="${proj.px(l.bx).toFixed(1)}" y2="${proj.py(l.by).toFixed(1)}" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-opacity="0.85"><title>${esc(l.from || '')} ↔ ${esc(l.to || '')}${l.util != null ? ` · ${(l.util * 100).toFixed(0)}% peak` : ''}</title></line>`;
  }).join('\n');
  const nodesSvg = nodes.filter(n => Number.isFinite(n.lat) && Number.isFinite(n.lon)).map(n => `<circle cx="${proj.px(n.lon).toFixed(1)}" cy="${proj.py(n.lat).toFixed(1)}" r="2.4" fill="#ffffff" stroke="#06b6d4" stroke-width="1.2"><title>${esc(n.name)}</title></circle>`).join('\n');
  const levels = [['Free < 50%', '#16a34a'], ['Moderate', '#ca8a04'], ['High', '#ea580c'], ['Congested ≥ 90%', '#dc2626']];
  const ly = height - legendH + 14;
  const legendSvg = levels.map(([lab, col], i) => { const ex = pad + i * ((width - 2 * pad) / 4); return `<line x1="${ex}" y1="${ly - 4}" x2="${ex + 16}" y2="${ly - 4}" stroke="${col}" stroke-width="3"/><text x="${ex + 20}" y="${ly}" font-family="sans-serif" font-size="10" fill="#475569">${lab}</text>`; }).join('\n');
  const title = label ? `<text x="${pad}" y="22" font-family="sans-serif" font-size="15" font-weight="600" fill="#1e293b">${esc(label)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${title}${commumeBackdrop(feats, proj)}${linksSvg}${nodesSvg}${legendSvg}</svg>`;
}

/**
 * Tech-mix pie map as SVG — one pie per generation location, sized by total
 * capacity, sliced by technology, over a light commune-outline backdrop.
 *
 *   buildTechPieMapSVG({ geo, communeNames, pies, label, width, height })
 *
 * pies: [{ name, lat, lon, slices:[{ tech, color, value }] }]  (caller supplies colours)
 * Pure function — unit-testable in Node.
 */
export function buildTechPieMapSVG({ geo, communeNames = [], pies = [], label = '', width = 900, height = 1100 } = {}) {
  const pad = 24;
  const legendH = 20;
  const titleH = label ? 30 : 8;

  const communeSet = new Set((communeNames || []).map(normComuna));
  const feats = (geo?.features || []).filter((f) => communeSet.has(normComuna(f.properties?.comuna)));
  const validPies = (pies || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && (p.slices || []).some(s => (s.value || 0) > 0));

  if (!validPies.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="20" y="30" font-family="sans-serif" font-size="14" fill="#94a3b8">No located generation to map</text></svg>`;
  }

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const ext = (lng, lat) => { if (lng < minLon) minLon = lng; if (lng > maxLon) maxLon = lng; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; };
  feats.forEach((f) => eachCoord(f.geometry.coordinates, ext));
  validPies.forEach((p) => ext(p.lon, p.lat));

  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1;
  const dLonC = Math.max(1e-6, (maxLon - minLon) * cosLat);
  const dLat = Math.max(1e-6, maxLat - minLat);
  const availW = width - 2 * pad;
  const availH = height - 2 * pad - legendH - titleH;
  const scale = Math.min(availW / dLonC, availH / dLat);
  const drawW = dLonC * scale, drawH = dLat * scale;
  const offX = pad + (availW - drawW) / 2;
  const offY = pad + titleH + (availH - drawH) / 2;
  const px = (lng) => offX + (lng - minLon) * cosLat * scale;
  const py = (lat) => offY + (maxLat - lat) * scale;

  // commune outline backdrop
  const ringPath = (ring) => 'M' + ring.map(([lng, lat]) => `${px(lng).toFixed(1)} ${py(lat).toFixed(1)}`).join(' L') + 'Z';
  const geomPath = (geom) => geom.type === 'Polygon' ? geom.coordinates.map(ringPath).join(' ')
    : geom.type === 'MultiPolygon' ? geom.coordinates.flat().map(ringPath).join(' ') : '';
  const backdrop = feats.map((f) => `<path d="${geomPath(f.geometry)}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.4"/>`).join('\n');

  // pies sized by sqrt(total capacity)
  const totals = validPies.map(p => (p.slices || []).reduce((s, d) => s + (d.value || 0), 0));
  const maxTotal = Math.max(1, ...totals);
  const rMin = 4, rMax = Math.max(10, Math.min(26, scale * 0.35 + 8));

  const piePaths = (cx, cy, r, slices) => {
    const total = slices.reduce((s, d) => s + (d.value || 0), 0);
    if (total <= 0) return '';
    if (slices.length === 1) return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${slices[0].color}" stroke="#ffffff" stroke-width="0.6"/>`;
    let a0 = 0, out = '';
    slices.forEach((d) => {
      const a1 = a0 + (d.value / total) * Math.PI * 2;
      const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0);
      const x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      out += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} L${x0.toFixed(1)} ${y0.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${d.color}"/>`;
      a0 = a1;
    });
    return out + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="0.6"/>`;
  };

  const piesSvg = validPies.map((p, i) => {
    const total = totals[i];
    const r = rMin + Math.sqrt(total / maxTotal) * (rMax - rMin);
    const cx = px(p.lon), cy = py(p.lat);
    const name = String(p.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<g><title>${name}</title>${piePaths(cx, cy, r, p.slices)}</g>`;
  }).join('\n');

  // legend: unique techs → colour
  const seen = new Map();
  validPies.forEach(p => (p.slices || []).forEach(s => { if (s.tech && !seen.has(s.tech)) seen.set(s.tech, s.color); }));
  const legendItems = [...seen.entries()];
  const lx = pad, lyTop = height - pad - Math.ceil(legendItems.length / 4) * 16;
  const legend = legendItems.map(([tech, color], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const ex = lx + col * ((width - 2 * pad) / 4), ey = lyTop + row * 16;
    return `<rect x="${ex}" y="${ey - 8}" width="9" height="9" rx="1.5" fill="${color}"/><text x="${ex + 13}" y="${ey}" font-family="sans-serif" font-size="10" fill="#475569">${String(tech).replace(/_/g, ' ')}</text>`;
  }).join('\n');

  const title = label ? `<text x="${pad}" y="22" font-family="sans-serif" font-size="15" font-weight="600" fill="#1e293b">${label}</text>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${title}
${backdrop}
${piesSvg}
${legend}
</svg>`;
}
