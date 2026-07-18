// Pure, stateless helpers for rendering optimisation results: SI-aware number
// formatters, the tech colour palette + fallback classifier, the Calliope
// location-name transform, and the shared OSM map style. Extracted from
// Results.jsx so the result views (and the map components, which re-derive the
// same colours/classification) share one source of truth. No React or
// component-state dependency lives here.

// ── Tech colour palette ──────────────────────────────────────────────────────
export const TECH_COLORS = {
  solar_pv:          '#FDB813',
  solar:             '#FDB813',
  wind_onshore:      '#00A8CC',
  wind_offshore:     '#005082',
  wind:              '#00A8CC',
  hydro:             '#1976D2',
  nuclear:           '#E91E63',
  gas_ccgt:          '#FF6F00',
  gas:               '#FF6F00',
  coal:              '#424242',
  biomass:           '#689F38',
  battery_storage:   '#9C27B0',
  storage:           '#AB9BAC',
  ac_transmission:   '#78909C',
  hvdc_transmission: '#546E7A',
  power_demand:      '#D32F2F',
  demand:            '#D32F2F',
};

export const techColor = (name) => {
  if (!name) return '#94A3B8';
  const n = name.toLowerCase();
  for (const [k, c] of Object.entries(TECH_COLORS)) {
    if (n === k || n.includes(k)) return c;
  }
  return '#94A3B8';
};

export const fmtNum = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(dec) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(dec) + 'k';
  return n.toFixed(dec);
};
export const fmtFull = (v) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
};
// Unit-aware formatters — include the SI-scaled unit in their output so callers
// never need to append a unit string manually (which caused "4.5MMW" bugs).
export const fmtPower = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v); const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(dec) + ' TW';
  if (abs >= 1e3) return (n / 1e3).toFixed(dec) + ' GW';
  if (abs > 0 && abs < 1) return (n * 1e3).toFixed(dec) + ' kW';
  return n.toFixed(dec) + ' MW';
};
export const fmtEnergy = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v); const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(dec) + ' TWh';
  if (abs >= 1e3) return (n / 1e3).toFixed(dec) + ' GWh';
  if (abs > 0 && abs < 1) return (n * 1e3).toFixed(dec) + ' kWh';
  return n.toFixed(dec) + ' MWh';
};
export const fmtCost = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v); const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(dec) + ' G€';
  if (abs >= 1e6) return (n / 1e6).toFixed(dec) + ' M€';
  if (abs >= 1e3) return (n / 1e3).toFixed(dec) + ' k€';
  return n.toFixed(dec) + ' €';
};

// Auto-scale a raw value → { div, unit } so axis ticks show clean numbers.
export const autoScale = (maxVal, baseUnit = 'MW') => {
  const abs = Math.abs(maxVal || 0);
  if (baseUnit === 'MW') {
    if (abs >= 1e6) return { div: 1e6, unit: 'TW' };
    if (abs >= 1e3) return { div: 1e3, unit: 'GW' };
    if (abs > 0 && abs < 1) return { div: 1e-3, unit: 'kW' };
    return { div: 1, unit: 'MW' };
  }
  if (baseUnit === '€') {
    if (abs >= 1e9) return { div: 1e9, unit: 'G€' };
    if (abs >= 1e6) return { div: 1e6, unit: 'M€' };
    if (abs >= 1e3) return { div: 1e3, unit: 'k€' };
    return { div: 1, unit: '€' };
  }
  return { div: 1, unit: baseUnit };
};
// Shared ECharts axis-name style (unit placed once at the end of the axis).
export const axisNameStyle = (unit) => ({
  name: unit, nameLocation: 'end', nameGap: 8,
  nameTextStyle: { fontSize: 9, color: '#94a3b8', fontStyle: 'italic' },
});
export const scaledFmt = (div, decimals = 1) => (v) => (v / div).toFixed(decimals);

// Tech classification groups for the filter bar
// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY classification uses the model's tech definitions (essentials.parent)
// and the backend result's tech_parents map — both are authoritative.
// This module-level classifyTech() is a FALLBACK for custom/imported models
// whose names don't match any definition.
//
// Calliope parent types → group IDs:
//   supply / supply_plus  → 'gen'
//   storage               → 'stor'
//   conversion(_plus)     → 'conv'
//   transmission          → 'tx'
//   demand                → 'demand'
//
// Additional heuristics for short abbreviations common in Spanish/Chilean models:
//   pFV / FV → solar     eol → wind     hid → hydro
//   ter / TER → thermal  bat → battery  emb → reservoir storage
export const TECH_GROUPS = [
  {
    id: 'tx', label: 'Links', color: '#0ea5e9',
    // Structural: colon inside name = "techType:destLocation" in Calliope
    match: (t) => t.includes(':'),
  },
  {
    id: 'demand', label: 'Demand', color: '#ef4444',
    match: (base) => /\bdemand\b|\bload\b|\bconsumo\b|\bdemanda\b/i.test(base),
  },
  {
    id: 'stor', label: 'Storage', color: '#8b5cf6',
    match: (base) => /\bbat(ter)?\b|_bat\b|bat_|\bBATT?|storage(?!.*tx|.*pipe)|pumped|embalse|\bemb\b|capacitor|thermal.?stor|heat.?stor/i.test(base),
  },
  {
    id: 'h2', label: 'Hydrogen', color: '#7c3aed',
    match: (base) => /\bh2\b|hydrogen|electrolys|fuel.?cell|h2_|_h2|hidrogeno|pila/i.test(base),
  },
  {
    id: 'conv', label: 'Conversion', color: '#10b981',
    match: (base) => /heat.?pump|boiler|chp|methan|fischer|haber|dac|desalination|convert/i.test(base),
  },
  {
    id: 'gen', label: 'Generation', color: '#f59e0b',
    match: (base) => /solar|\bpv\b|pfv\b|fv\b|wind|\beol|hidro|hydro(?!gen)|biomass|coal|gas\b|nuclear|geotherm|csp|ccgt|ocgt|diesel|oil|lignite|turbine|ter\b|termica|hid\b|hidraulic|ernc|renovable/i.test(base),
  },
  {
    id: 'infra', label: 'Substations', color: '#94a3b8',
    match: (base) => /substation|busbar|\bbus\b|\bhub\b|transformer|\bnode\b|barra|subestacion|\bSE_/i.test(base),
  },
];
// Pure fallback classifier (no model context). Used by classifyTechSmart when
// no parent info is available.
export const classifyTech = (t) => {
  if (t.includes(':')) return 'tx';
  const base = t.split(':')[0];
  return TECH_GROUPS.find(g => g.match(base))?.id ?? 'other';
};
// For a link tech like "pFV:CHERCAN", return the base type label "pFV"
export const linkTechBase = (t) => t.split(':')[0];

// Replicate Python's _safe_id(name).lower() — the exact transform Calliope applies
// to frontend model location names before they become result keys.
export const calliopeLocName = (name) => {
  const s = String(name).trim();
  return s.replace(/::/g, '__').replace(/:/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '')
    .toLowerCase() || 'unknown';
};

// Parse "Berlin::solar_pv::electricity" → {loc, tech, carrier}
export const parseLTC = (s) => {
  const p = String(s).split('::');
  if (p.length >= 3) return { loc: p[0], tech: p[1], carrier: p[2] };
  if (p.length === 2) return { loc: p[0], tech: p[1], carrier: '' };
  return { loc: '', tech: p[0], carrier: '' };
};

// OSM map style — attribution required per OpenStreetMap tile usage policy:
// https://operations.osmfoundation.org/policies/tiles/
export const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Inject Referer + User-Agent on OSM tile/geocode requests when running
// outside Electron (in Electron, main.cjs session.webRequest handles this).
export const osmTransformRequest = (url) => {
  if (/tile\.openstreetmap\.org|nominatim\.openstreetmap\.org|basemaps\.cartocdn\.com|tile\.opentopomap\.org/.test(url)) {
    return { url, headers: { Referer: 'https://www.openstreetmap.org/', 'User-Agent': 'TEMPO-Energy-Tool/1.0' } };
  }
  return { url };
};
