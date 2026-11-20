// Export of a multi-panel figure as one PNG or SVG. Each panel element (ECharts chart, SVG drawing,
// MapLibre map) registers an exporter; the figure lays the panels out as they sit on screen.
import * as echarts from 'echarts';

const exporters = new WeakMap();

/** Registers a panel's exporter: { png(scale) → dataURL, svg?() → svg string }. Use as a ref callback. */
export const registerPanel = (exporter) => (el) => { if (el) exporters.set(el, exporter); };

export const PANEL_ATTR = 'data-figure-panel';

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

export const svgToDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Serialises an <svg> element with explicit size and namespace. */
export function serializeSvg(svgEl) {
  const clone = svgEl.cloneNode(true);
  const { width, height } = svgEl.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  return new XMLSerializer().serializeToString(clone);
}

/** PNG of an SVG string at `scale` × its size. */
export async function svgToPng(svg, width, height, scale = 3) {
  const img = await loadImage(svgToDataUrl(svg));
  const c = Object.assign(document.createElement('canvas'), { width: width * scale, height: height * scale });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/** Exporter for an ECharts instance: PNG at pixel ratio `scale`, SVG via server-side rendering. */
export function echartsExporter(getInstance) {
  return {
    png: async (scale = 3) => getInstance()?.getDataURL({ type: 'png', pixelRatio: scale, backgroundColor: '#fff' }),
    svg: async () => {
      const inst = getInstance();
      if (!inst) return null;
      const c = echarts.init(null, null, { renderer: 'svg', ssr: true, width: inst.getWidth(), height: inst.getHeight() });
      c.setOption({ ...inst.getOption(), animation: false, backgroundColor: '#fff' });
      const s = c.renderToSVGString();
      c.dispose();
      return s;
    },
  };
}

function panelsOf(container) {
  const box = container.getBoundingClientRect();
  return [...container.querySelectorAll(`[${PANEL_ATTR}]`)].map(el => {
    const r = el.getBoundingClientRect();
    return { el, x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, exp: exporters.get(el) };
  }).filter(p => p.exp && p.w > 0 && p.h > 0);
}

// Text outside the panels (panel letters, headings, legends written in HTML)
function textsOf(container) {
  const box = container.getBoundingClientRect();
  return [...container.querySelectorAll('[data-figure-text]')].map(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { text: el.textContent, x: r.left - box.left, y: r.top - box.top + r.height * 0.8,
             font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, size: cs.fontSize, weight: cs.fontWeight, color: cs.color };
  });
}

/** The whole figure as a PNG data URL. */
export async function figureToPng(container, scale = 3) {
  const { width, height } = container.getBoundingClientRect();
  const c = Object.assign(document.createElement('canvas'), { width: width * scale, height: height * scale });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  for (const p of panelsOf(container)) {
    const url = await p.exp.png(scale);
    if (url) ctx.drawImage(await loadImage(url), p.x * scale, p.y * scale, p.w * scale, p.h * scale);
  }
  ctx.scale(scale, scale);
  for (const t of textsOf(container)) { ctx.font = t.font; ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
  return c.toDataURL('image/png');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** The whole figure as SVG: vector panels nested, raster panels (maps) embedded as images. */
export async function figureToSvg(container) {
  const { width, height } = container.getBoundingClientRect();
  const parts = [];
  for (const p of panelsOf(container)) {
    const svg = p.exp.svg ? await p.exp.svg() : null;
    if (svg) {
      const inner = svg.replace(/^<\?xml[^>]*>/, '').replace(/^<svg/, `<svg x="${p.x}" y="${p.y}"`);
      parts.push(inner);
    } else {
      parts.push(`<image x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" href="${await p.exp.png(3)}"/>`);
    }
  }
  for (const t of textsOf(container)) {
    parts.push(`<text x="${t.x}" y="${t.y}" font-size="${t.size}" font-weight="${t.weight}" fill="${t.color}" font-family="Inter, Arial, sans-serif">${esc(t.text)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`;
}

export function downloadUrl(name, url) {
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
}

export function downloadText(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadUrl(name, url);
  URL.revokeObjectURL(url);
}
