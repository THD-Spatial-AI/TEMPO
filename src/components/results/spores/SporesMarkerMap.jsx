// A MapLibre map of Italy with an SVG overlay (bars, arrows, filled zone markers) drawn at projected
// node coordinates (decision D1: MapLibre + markers, no bundled shapes). The overlay re-projects on
// every move; hovering an element shows its numbers; export composites the map canvas and the overlay
// (tooltips are not exported, legends are).
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { OSM_STYLE, osmTransformRequest } from '../../../utils/resultFormat';
import { PANEL_ATTR, registerPanel, serializeSvg, svgToDataUrl } from '../../../utils/figureExport';

// Muted basemap so the overlay reads as on the paper's plain maps
const STYLE = {
  ...OSM_STYLE,
  layers: OSM_STYLE.layers.map(l => (l.type === 'raster'
    ? { ...l, paint: { ...(l.paint || {}), 'raster-saturation': -1, 'raster-opacity': 0.45 } } : l)),
};
// Bounds of the nodes, padded; extra room on top for the bars drawn above the nodes
function boundsOf(coords) {
  const pts = Object.values(coords || {});
  if (!pts.length) return [[-10, 35], [30, 60]];
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const dy = Math.max(n - s, 0.5), dx = Math.max(e - w, 0.5);
  return [[w - dx * 0.06, s - dy * 0.06], [e + dx * 0.06, n + dy * 0.14]];
}

// The WebGL buffer is only readable during a render (no preserveDrawingBuffer: 11 maps would be heavy)
// (a background tab never renders: fall back to the canvas as it is after 2 s)
const snapshot = (map) => new Promise((resolve) => {
  const grab = () => resolve(map.getCanvas().toDataURL('image/png'));
  const t = setTimeout(grab, 2000);
  map.once('render', () => { clearTimeout(t); grab(); });
  map.triggerRepaint();
});

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/**
 * @param coords  { NODE: [lat, lon] }
 * @param overlay (project, { hover, active, w, h }) => SVG children.
 *                project(node) → [x, y] | null; hover(id, { title, rows: [[label, value]], color })
 *                → props to spread on a hoverable element; active = id of the hovered element.
 * @param legend  rows for <LegendRows>, drawn in a bottom corner (`legendCorner` 'left' | 'right'; exported with the map)
 */
export default function SporesMarkerMap({ coords, overlay, legend, legendTitle, legendCorner = 'left', height = 340 }) {
  const box = useRef(null);
  const holder = useRef(null);
  const mapRef = useRef(null);
  const [, setTick] = useState(0);
  const [size, setSize] = useState({ w: 0, h: height });
  const [tip, setTip] = useState(null);
  const boundsKey = JSON.stringify(boundsOf(coords));

  useEffect(() => {
    let destroyed = false;
    import('maplibre-gl').then((ns) => {
      const mgl = ns.default ?? ns;
      if (destroyed || !holder.current) return;
      const map = new mgl.Map({
        container: holder.current, style: STYLE, bounds: JSON.parse(boundsKey), fitBoundsOptions: { padding: 8 },
        attributionControl: { compact: true }, failIfMajorPerformanceCaveat: false,
        transformRequest: osmTransformRequest,
        dragRotate: false, pitchWithRotate: false,
      });
      mapRef.current = map;
      const redraw = () => {
        const c = map.getContainer();
        setSize({ w: c.clientWidth, h: c.clientHeight });
        setTick(t => t + 1);
      };
      map.on('move', redraw);
      map.on('resize', redraw);
      map.on('load', redraw);
    });
    return () => { destroyed = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [boundsKey]);

  const project = (node) => {
    const map = mapRef.current;
    const c = coords[String(node).toUpperCase()];
    if (!map || !c) return null;
    const p = map.project([c[1], c[0]]);
    return [p.x, p.y];
  };

  const at = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hover = (id, info) => ({
    onMouseEnter: (e) => setTip({ id, ...info, ...at(e) }),
    onMouseMove: (e) => { const p = at(e); setTip(t => (t && t.id === id ? { ...t, ...p } : t)); },
    onMouseLeave: () => setTip(t => (t?.id === id ? null : t)),
    style: { pointerEvents: 'all', cursor: 'pointer' },
  });

  const reg = useCallback((el) => { box.current = el; registerPanel({
    png: async (scale = 3) => {
      const map = mapRef.current;
      const el = box.current;
      const { width, height: h } = el.getBoundingClientRect();
      const out = Object.assign(document.createElement('canvas'), { width: width * scale, height: h * scale });
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, out.width, out.height);
      if (map) ctx.drawImage(await loadImage(await snapshot(map)), 0, 0, out.width, out.height);
      const svg = el.querySelector('svg[data-overlay]');
      if (svg) ctx.drawImage(await loadImage(svgToDataUrl(serializeSvg(svg))), 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
    svg: async () => {
      const map = mapRef.current;
      const svg = box.current.querySelector('svg[data-overlay]');
      const { width, height: h } = box.current.getBoundingClientRect();
      const base = map ? await snapshot(map) : null;
      const inner = svg ? serializeSvg(svg).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">`
        + (base ? `<image width="${width}" height="${h}" href="${base}"/>` : '') + `${inner}</svg>`;
    },
  })(el); }, []);

  const ready = mapRef.current && size.w > 0;
  const lh = legend ? legendHeight(legend, legendTitle) : 0;
  return (
    <div ref={reg} {...{ [PANEL_ATTR]: '' }} className="relative w-full overflow-hidden" style={{ height }}
      onMouseLeave={() => setTip(null)}>
      <div ref={holder} style={{ position: 'absolute', inset: 0 }} />
      <svg data-overlay="" width={size.w} height={size.h} className="absolute inset-0 pointer-events-none"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        {ready ? overlay(project, { hover, active: tip?.id ?? null, w: size.w, h: size.h }) : null}
        {ready && legend && (
          <g transform={`translate(${legendCorner === 'right' ? size.w - legendWidth(legend, legendTitle) - 6 : 6}, ${size.h - lh - 6})`}>
            <rect width={legendWidth(legend, legendTitle)} height={lh} rx={2} fill="#fff" fillOpacity={0.88} stroke="#ccc" strokeWidth={0.5} />
            <LegendRows rows={legend} title={legendTitle} x={6} y={4} />
          </g>
        )}
      </svg>
      {tip && <Tooltip tip={tip} w={size.w} h={size.h} />}
    </div>
  );
}

function Tooltip({ tip, w, h }) {
  const left = tip.x > w - 220 ? Math.max(4, tip.x - 214) : tip.x + 14;
  const top = Math.min(Math.max(4, tip.y - 10), Math.max(4, h - 30 - (tip.rows?.length || 0) * 16));
  return (
    <div className="absolute z-10 pointer-events-none bg-white/95 border border-black/15 shadow-md px-2.5 py-1.5 text-[11px] text-slate-700 min-w-[150px] max-w-[210px]"
      style={{ left, top }}>
      <div className="font-semibold text-slate-800 flex items-center gap-1.5 mb-0.5">
        {tip.color && <span className="inline-block w-2.5 h-2.5 shrink-0" style={{ background: tip.color }} />}
        {tip.title}
      </div>
      {(tip.rows || []).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 leading-4"><span className="text-slate-500">{k}</span><span className="tabular-nums font-medium">{v}</span></div>
      ))}
    </div>
  );
}

// ─── Legends ─────────────────────────────────────────────────────────────────
// Rows: { swatch: color, opacity? } | { pair: color } (light = potential, solid = value) |
//       { line: color, width?, dash?, arrow? } | { circle: color } |
//       { gradient: [colors], from, to } | { scale: px, max } ; each with `label`.

const ROW = 13, ICON = 22, CHAR = 4.6;
const rowH = (r) => (r.gradient ? 22 : r.scale ? r.scale + 6 : ROW);
const legendHeight = (rows, title) => rows.reduce((s, r) => s + rowH(r), 0) + (title ? ROW : 0) + 6;
const legendWidth = (rows, title) => 12 + Math.max(title ? title.length * CHAR : 0,
  ...rows.map(r => (r.gradient ? 70 : ICON) + 4 + String(r.label || '').length * CHAR));

/** Legend entries as SVG (inside a map, or in a legend <SvgPanel>). */
export function LegendRows({ rows, title, x = 0, y = 0 }) {
  const gid = useId().replace(/:/g, '');
  const tops = rows.reduce((acc, r, i) => [...acc, i ? acc[i - 1] + rowH(rows[i - 1]) : y + (title ? ROW : 0)], []);
  return (
    <g fontSize={9} fill="#333" fontFamily="Arial, sans-serif">
      {title && <text x={x} y={y + 9} fontWeight="bold">{title}</text>}
      {rows.map((r, i) => {
        const top = tops[i];
        const mid = top + ROW / 2 + 1;
        const tx = x + (r.gradient ? 70 : ICON) + 4;
        let icon = null;
        if (r.swatch) icon = <rect x={x} y={top + 2} width={10} height={9} fill={r.swatch} opacity={r.opacity ?? 1} />;
        if (r.pair) icon = (<g><rect x={x} y={top + 1} width={6} height={10} fill={r.pair} opacity={0.35} /><rect x={x + 7} y={top + 4} width={6} height={7} fill={r.pair} /></g>);
        if (r.circle) icon = <circle cx={x + 5} cy={mid} r={5} fill={r.circle} stroke="#fff" />;
        if (r.line) icon = (
          <g>
            <line x1={x} x2={x + 18} y1={mid} y2={mid} stroke={r.line} strokeWidth={r.width ?? 1.5} strokeDasharray={r.dash ? '3 2' : undefined} />
            {r.arrow && <polygon points={`${x + 20},${mid} ${x + 15},${mid - 3} ${x + 15},${mid + 3}`} fill={r.line} />}
          </g>
        );
        if (r.gradient) icon = (
          <g>
            <defs><linearGradient id={`${gid}-${i}`}>{r.gradient.map((c, k) => <stop key={k} offset={k / (r.gradient.length - 1)} stopColor={c} />)}</linearGradient></defs>
            <rect x={x} y={top + 2} width={64} height={8} fill={`url(#${gid}-${i})`} />
            <text x={x} y={top + 19} fontSize={8}>{r.from}</text>
            <text x={x + 64} y={top + 19} fontSize={8} textAnchor="end">{r.to}</text>
          </g>
        );
        if (r.scale) icon = (
          <g>
            <line x1={x + 4} x2={x + 4} y1={top + 2} y2={top + 2 + r.scale} stroke="#333" />
            <line x1={x + 1} x2={x + 7} y1={top + 2} y2={top + 2} stroke="#333" />
            <line x1={x + 1} x2={x + 7} y1={top + 2 + r.scale} y2={top + 2 + r.scale} stroke="#333" />
          </g>
        );
        return (
          <g key={i}>
            {icon}
            <text x={tx} y={r.scale ? top + 2 + r.scale / 2 + 3 : r.gradient ? top + 9 : mid + 3}>{r.label}</text>
          </g>
        );
      })}
    </g>
  );
}

/** A legend as its own <svg> (e.g. under a figure column, inside an SvgPanel). */
export function LegendSvg({ rows, title }) {
  return (
    <svg width={legendWidth(rows, title)} height={legendHeight(rows, title)}>
      <LegendRows rows={rows} title={title} x={2} y={2} />
    </svg>
  );
}

// ─── Arrows ──────────────────────────────────────────────────────────────────

const head = (tip, from, size, color) => {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const bx = tip[0] - ux * size, by = tip[1] - uy * size;
  return <polygon points={`${tip[0]},${tip[1]} ${bx - uy * size * 0.45},${by + ux * size * 0.45} ${bx + uy * size * 0.45},${by - ux * size * 0.45}`} fill={color} />;
};

/** A line between two projected points with arrowheads (`heads`: 'end' | 'both'); `hover` props
 *  from the map make it hoverable along a wide invisible band; `active` thickens it. */
export function Arrow({ a, b, color = '#000', width = 1.5, heads = 'both', hover, active, children }) {
  if (!a || !b) return null;
  const w = active ? width + 2 : width;
  return (
    <g {...(hover || {})}>
      {hover && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#000" strokeOpacity={0} strokeWidth={Math.max(12, w + 8)} />}
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} />
      {head(b, a, active ? 9 : 7, color)}
      {heads === 'both' && head(a, b, active ? 9 : 7, color)}
      {children}
    </g>
  );
}
