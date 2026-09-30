// Diagnostic for Gate B: pin every expandable capacity of a TEMPO payload to the
// capacities of a finished run (0.6.8 result JSON), so another engine can be
// asked to price the SAME system. Links are pinned per (pair, tech).
//
//   node scripts/italy/fix_caps_from_result.mjs <payload.json> <result.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [payloadPath, resultPath, outPath] = process.argv.slice(2);
const p = JSON.parse(readFileSync(payloadPath, 'utf8'));
const caps = JSON.parse(readFileSync(resultPath, 'utf8')).capacities || {};
const lc = (s) => String(s).toLowerCase();

// Demand techs (sinks: export, curtailment) have no design capacity to pin.
const demand = new Set(p.technologies.filter(t => (t.essentials?.parent ?? t.parent) === 'demand').map(t => t.name));
let pinned = 0;
// Node techs: 'loc::tech' → locations[loc].techs[tech].constraints.energy_cap_equals
const locByName = new Map(p.locations.map(l => [lc(l.name), l]));
for (const [key, cap] of Object.entries(caps)) {
  const [loc, techFull] = key.split('::');
  if (techFull.includes(':') || demand.has(techFull)) continue; // links below; sinks skipped
  const l = locByName.get(loc);
  const lt = l?.techs?.[techFull];
  if (lt === undefined) continue;
  const c = { ...((lt && lt.constraints) || {}) };
  if ('energy_cap_equals' in c) continue; // already fixed (existing plant)
  delete c.energy_cap_max; delete c.energy_cap_min;
  c.energy_cap_equals = cap;
  l.techs[techFull] = { ...(lt || {}), constraints: c };
  pinned++;
}
// Links: 'a::tech:b' (both directions carry the same capacity)
for (const link of p.links) {
  if (link.capacityKey === 'energy_cap_equals') continue;
  const cap = caps[`${lc(link.from)}::${link.tech}:${lc(link.to)}`];
  if (cap == null) continue;
  link.capacity = cap;
  link.capacityKey = 'energy_cap_equals';
  pinned++;
}
writeFileSync(outPath, JSON.stringify(p));
console.log(`pinned ${pinned} capacities → ${outPath}`);
