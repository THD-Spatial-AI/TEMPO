/**
 * Figure configuration for any SPORES result (services/sporesFigures.js, components/results/spores).
 * The Lombardi-2020 Italy preset is used when the plan names it and the result has its zones;
 * every other result gets a configuration derived from the result itself:
 *   - technologies grouped by type (wind, PV, hydro, bioenergy, thermal, storage, hydrogen,
 *     power-to-gas, transmission, other) from the tech's parent, output carrier and name;
 *   - each location is its own "zone" and "region";
 *   - minimisation families from the SPOREs' minimise targets;
 *   - utilisation over the expansion potentials in the result, or, when the result has none
 *     (native Calliope SPORES), over the largest capacity of the group in any SPORE (`relative`).
 */

import { METRICS as ITALY } from './scenarioStudio/presets/lombardi2020Italy.js';

const PRESETS = { lombardi2020Italy: ITALY };

/** Technology types, in figure order. */
export const TECH_TYPES = [
  { id: 'wind', label: 'Wind', color: '#1060f0' },
  { id: 'pv', label: 'PV', color: '#f0c020' },
  { id: 'hydro', label: 'Hydro', color: '#1ccfee' },
  { id: 'bioenergy', label: 'Bioenergy', color: '#33a02c' },
  { id: 'geothermal', label: 'Geothermal', color: '#d95f0e' },
  { id: 'thermal', label: 'Thermal', color: '#7f7f7f' },
  { id: 'storage', label: 'Storage', color: '#8a2be2' },
  { id: 'hydrogen', label: 'Hydrogen', color: '#a52a2a' },
  { id: 'p2g', label: 'Power-to-gas', color: '#c9a882' },
  { id: 'transmission', label: 'Transmission', color: '#555555' },
  { id: 'other', label: 'Other', color: '#94a3b8' },
];
const TYPE = Object.fromEntries(TECH_TYPES.map(t => [t.id, t]));

const FAMILY_COLORS = ['#e8a0b4', '#2e8b3e', '#8fa8e8', '#b070c8', '#f0a020', '#17becf', '#8c564b', '#bcbd22'];

const lc = (s) => String(s).toLowerCase();
const up = (s) => String(s).toUpperCase();
const parse = (key) => {
  const [loc, techFull = ''] = String(key).split('::');
  const [tech, remote = null] = techFull.split(':');
  return { loc: up(loc), tech, remote: remote && up(remote) };
};

/**
 * Type of a technology, or null for techs that are not built (demand, curtailment, export,
 * import, unmet demand). `parent` and `carrier` come from the result's tech_metadata.
 */
export function techType(tech, { parent, carrier, isLine } = {}) {
  const n = lc(tech), p = lc(parent || ''), c = lc(carrier || '');
  if (isLine || p === 'transmission') return 'transmission';
  if (p === 'demand' || /demand|curtail|spill|unmet|_export|^export|el_import|^import/.test(n)) return null;
  if (p === 'storage' || /batter|\bbat\b|_bat|storage|pumped|\bphs/.test(n)) return 'storage';
  if (c === 'hydrogen' || /electroly|hydrogen|\bh2|_h2|h2_|fuel.?cell/.test(n)) return 'hydrogen';
  if (/methan|syngas|\bdac\b|_dac|p2g|power.?to.?gas/.test(n)) return 'p2g';
  if (/wind|eol/.test(n)) return 'wind';
  if (/solar|\bpv|pv_|_pv|photovolt|\bfv|pfv/.test(n)) return 'pv';
  if (/hydro(?!gen)|\bhid|_ror|ror_|run.?of.?river|reservoir|dam\b|_dam/.test(n)) return 'hydro';
  if (/bio|wood|waste|wte|landfill/.test(n)) return 'bioenergy';
  if (/geotherm/.test(n)) return 'geothermal';
  if (/coal|lignite|gas|ccgt|ocgt|diesel|oil|nuclear|thermal|termic|\bter\b|_ter|steam|turbine|chp|engine/.test(n)) return 'thermal';
  return 'other';
}

/** True when the plan names a preset and the result has (most of) the preset's zones. */
function presetFor(meta, spores) {
  const preset = PRESETS[meta?.plan?.metrics];
  if (!preset) return null;
  const nodes = new Set();
  for (const k of Object.keys(spores?.[0]?.capacities || meta?.potentials?.energy_cap_max || {})) nodes.add(parse(k).loc);
  // Plans saved before results carried capacities: trust the plan
  if (!nodes.size) return preset;
  return preset.zones.filter(z => nodes.has(z)).length >= preset.zones.length / 2 ? preset : null;
}

/**
 * Configuration for the SPORES figures of `result` (spores_data, spores_meta, tech_metadata).
 * `locations`: the model's locations, for map coordinates and names (optional).
 */
const cache = new WeakMap(); // result → { locations, metrics }: every SPORES view asks on each render

export function figureMetrics(result, { locations } = {}) {
  const hit = result && cache.get(result);
  if (hit && hit.locations === locations) return hit.metrics;
  const meta = result?.spores_meta || null;
  const spores = result?.spores_data || [];
  const metrics = presetFor(meta, spores)
    || autoMetrics(spores, meta, { techMeta: result?.tech_metadata, techParents: result?.tech_parents, locations });
  if (result) cache.set(result, { locations, metrics });
  return metrics;
}

/** The derived configuration (exported for tests). */
export function autoMetrics(spores, meta, { techMeta = {}, techParents = {}, locations = [] } = {}) {
  const pot = meta?.potentials?.energy_cap_max || {};
  const hasPot = Object.keys(pot).length > 0;
  const info = (t) => ({ parent: techMeta?.[t]?.parent || techParents?.[t], carrier: techMeta?.[t]?.carrier_out });

  // Technologies, lines and nodes seen in the result
  const techs = new Map();   // tech → type
  const lineTechs = new Set();
  const nodes = new Map();   // node → total capacity in the cost optimum (for ordering)
  const addKey = (key, cap) => {
    const p = parse(key);
    if (!p.tech) return;
    if (p.remote) lineTechs.add(p.tech);
    if (!techs.has(p.tech)) techs.set(p.tech, techType(p.tech, { ...info(p.tech), isLine: !!p.remote }));
    if (!p.remote) nodes.set(p.loc, (nodes.get(p.loc) || 0) + (Number(cap) || 0));
  };
  for (const s of spores) for (const k of Object.keys(s.capacities || {})) addKey(k, s === spores[0] ? s.capacities[k] : 0);
  for (const k of Object.keys(pot)) addKey(k, 0);

  // Expandable: a finite potential in the result, or (no potentials) a capacity that changes
  const capRange = new Map();
  for (const s of spores) {
    const tot = {};
    for (const [k, v] of Object.entries(s.capacities || {})) { const t = parse(k).tech; tot[t] = (tot[t] || 0) + (Number(v) || 0); }
    for (const t of techs.keys()) {
      const r = capRange.get(t) || [Infinity, -Infinity];
      capRange.set(t, [Math.min(r[0], tot[t] || 0), Math.max(r[1], tot[t] || 0)]);
    }
  }
  // Potential per tech (Σ over nodes). A potential far above anything built (> 1e5 ×) is a
  // modelling "unlimited" (e.g. 1e12 on free links) and isn't one; one equal to the built capacity
  // in every SPORE is a fixed fleet (energy_cap_equals), not an expansion potential.
  const potByTech = {};
  for (const [k, v] of Object.entries(pot)) { const t = parse(k).tech; potByTech[t] = (potByTech[t] || 0) + (Number(v) || 0); }
  const varies = (t) => (capRange.get(t)?.[1] - capRange.get(t)?.[0]) > 1e-6 * Math.max(1, capRange.get(t)?.[1] || 0);
  const potTechs = new Set(Object.keys(potByTech).filter(t => {
    const p = potByTech[t], built = capRange.get(t)?.[1] || 0;
    if (!(p > 0)) return false;
    if (built > 0 && p > 1e5 * built) return false;
    return varies(t) || p > built * 1.001 + 1e-9;
  }));
  const expandable = [...techs.keys()].filter(t => techs.get(t) && (hasPot ? potTechs.has(t) : varies(t)));

  // Gas pipelines aren't electricity transmission: left out of the groups (drawn in Fig 4 only)
  const isGasLine = (t) => lineTechs.has(t) && techs.get(t) === 'transmission' && /gas|methane|pipe/.test(lc(t));
  const ofType = (id, list = [...techs.keys()]) => list.filter(t => techs.get(t) === id && !isGasLine(t));
  const types = TECH_TYPES.filter(t => ofType(t.id, expandable).length);

  // National capacity of a tech list per SPORE (for `relative` utilisation)
  const national = (s, set) => Object.entries(s.capacities || {})
    .reduce((a, [k, v]) => a + (set.has(parse(k).tech) ? Number(v) || 0 : 0), 0);
  const groups = types.map(t => {
    const list = ofType(t.id, expandable);
    const g = { label: t.label, techs: list, type: t.id };
    if (!hasPot) {
      const set = new Set(list);
      g.potential = Math.max(0, ...spores.map(s => national(s, set))) || undefined;
    }
    return g;
  });

  const nodeIds = [...nodes.keys()].sort((a, b) => nodes.get(b) - nodes.get(a) || a.localeCompare(b));
  const coordinates = {}, regionNames = {};
  for (const l of locations || []) {
    const id = up(l.calliopeName || calliopeId(l.name));
    if (l.latitude != null && l.longitude != null) coordinates[id] = [Number(l.latitude), Number(l.longitude)];
    if (l.name) regionNames[id] = l.name;
  }

  // Families: one per distinct minimise target set
  const families = [];
  for (const s of spores) {
    if (s.stage !== 'minimise' || !s.target) continue;
    const ts = [...new Set([].concat(s.target))].sort();
    const id = ts.join('|');
    if (families.some(f => f.id === id)) continue;
    // Targets may name a link as tech_from_to (MEME): match the longest tech prefix
    const tech = techs.has(ts[0]) ? ts[0] : [...techs.keys()].filter(t => ts[0].startsWith(`${t}_`)).sort((a, b) => b.length - a.length)[0];
    const ty = tech ? techs.get(tech) : techType(ts[0]);
    families.push({
      id, techs: ts, label: `${ts.length > 3 ? `${ts.slice(0, 3).join(', ')}…` : ts.join(', ')} minimised`,
      color: FAMILY_COLORS[families.length % FAMILY_COLORS.length],
      group: groups.find(g => g.type === ty)?.label || null,
    });
  }

  const labelsOf = (...ids) => groups.filter(g => ids.includes(g.type)).map(g => g.label);
  // Carriers each tech produces (one pass over the SPOREs' generation keys)
  const carriers = {};
  for (const s of spores) {
    for (const k of Object.keys(s.generation || {})) {
      const [, tf = '', c] = k.split('::');
      const t = tf.split(':')[0];
      (carriers[t] = carriers[t] || new Set()).add(c);
    }
  }
  const producers = (c) => [...techs.keys()].filter(t => carriers[t]?.has(c) && !lineTechs.has(t) && techs.get(t) !== 'storage');
  const lineList = [...lineTechs];
  const gasLines = lineList.filter(t => carriers[t]?.has('methane') || carriers[t]?.has('gas'));
  const elLines = lineList.filter(t => !gasLines.includes(t));

  return {
    auto: true,
    relative: !hasPot,
    zones: nodeIds,
    regions: nodeIds,
    foreign: [],
    regionZone: Object.fromEntries(nodeIds.map(n => [n, n])),
    regionNames,
    coordinates,
    windTechs: ofType('wind'),
    regionWindTechs: ofType('wind'),
    pvTechs: ofType('pv'),
    lineTechs: elLines,
    expansionLineTechs: elLines.filter(t => !hasPot || potTechs.has(t)),
    gasLineTechs: gasLines,
    overcapTechs: [...ofType('wind'), ...ofType('pv'), ...ofType('storage')],
    curtailmentTech: [...techs.keys()].find(t => /curtail|spill/.test(lc(t))) || null,
    hydrogenTechs: producers('hydrogen'),
    methaneTechs: producers('methane'),
    expandable,
    units: { power: 1e3, powerLabel: 'GW', energy: 1e3, energyLabel: 'GWh' },
    groups,
    fig3Groups: groups.map(g => (g.type === 'transmission' ? { label: g.label, lines: true } : { label: g.label, techs: g.techs })),
    fig1Large: groups.filter(g => g.type !== 'transmission').map(g => ({
      label: g.label, techs: ofType(g.type), color: TYPE[g.type].color, ...(g.potential ? { systemwide: g.potential } : {}),
    })),
    fig1Small: TECH_TYPES.filter(t => t.id !== 'transmission' && !types.includes(t) && ofType(t.id).length)
      .map(t => ({ label: t.label, techs: ofType(t.id), color: t.color })),
    fig4Legend: TECH_TYPES.filter(t => t.id !== 'transmission' && ofType(t.id).length)
      .map(t => ({ label: t.label, techs: ofType(t.id), color: t.color })),
    problematic: families,
    fig5Axes: null,
    fig6Axes: null,
    renewableGroups: labelsOf('wind', 'pv'),
    transmissionGroups: labelsOf('transmission'),
    storageGroups: labelsOf('storage'),
    p2gGroups: labelsOf('p2g', 'hydrogen'),
    caseOrder: [],
  };
}

// Calliope's location id for a TEMPO location name (as resultFormat.calliopeLocName)
function calliopeId(name) {
  return String(name ?? '').trim().replace(/::/g, '__').replace(/:/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'unknown';
}
