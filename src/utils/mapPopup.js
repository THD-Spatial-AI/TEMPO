// Shared HTML for map popups (MapLibre and Leaflet), styled by .tempo-popup in index.css.
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// stats: [[label, value]]; rows: [{ color, name, value?, pct? }]
export function popupCard({ title, stats = [], rows = [], note = '' }) {
  const statHtml = stats.length
    ? `<div class="tp-stats" style="grid-template-columns:repeat(${Math.min(stats.length, 3)},1fr)">${stats.map(([l, v]) => `<span><small>${esc(l)}</small><b>${esc(v)}</b></span>`).join('')}</div>`
    : '';
  const rowHtml = rows.map((r) => {
    const pct = r.pct != null ? Math.max(0, Math.min(100, r.pct)) : null;
    return `<div class="tp-row"><span class="tp-dot" style="background:${r.color}"></span><span class="tp-name">${esc(r.name)}</span>`
      + `<span class="tp-val">${esc(r.value ?? '')}</span><span class="tp-pct">${pct != null ? `${pct.toFixed(0)}%` : ''}</span>`
      + (pct != null ? `<span class="tp-bar"><span style="width:${pct.toFixed(1)}%;background:${r.color}"></span></span>` : '')
      + '</div>';
  }).join('');
  return `<div class="tp-head"><div class="tp-title">${esc(title)}</div>${statHtml}</div>`
    + (rowHtml || note ? `<div class="tp-body">${rowHtml}${note ? `<div class="tp-empty">${esc(note)}</div>` : ''}</div>` : '');
}
