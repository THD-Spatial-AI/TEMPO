// Regenerates the paper-pinned fixtures used by sporesPaper.test.js.
// usage: node extract.mjs <desktop dir holding s05/v7, v9, s20/v8, hourly_ee00c393>
// Keeps only what sporeMetrics reads: wind + overcap techs, inter-zonal (zone-to-zone) line capacities and flows.
// Capacities are kW, as written by the VM runs (the app's views get MW; the test scales).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2];
const { METRICS } = await import(pathToFileURL(join(here, '../../../scenarioStudio/presets/lombardi2020Italy.js')).href);
const keep = new Set([...METRICS.windTechs, ...METRICS.overcapTechs]);
const parse = (id) => { const p = id.split('_'); return { a: p.at(-2), b: p.at(-1), tech: p.slice(0, -2).join('_') }; };
const read = (...p) => JSON.parse(readFileSync(join(root, ...p), 'utf8'));
const round = (x) => Math.round(x);
const zonal = ({ a, b, tech }) => METRICS.lineTechs.includes(tech) && METRICS.zones.includes(a) && METRICS.zones.includes(b);

function lines(link_cap, flow) {
  const capacities = {}, generation = {};
  for (const [id, c] of Object.entries(link_cap)) {
    const p = parse(id); if (!zonal(p)) continue;
    const { a, b, tech } = p;
    capacities[`${a}::${tech}:${b}`] = round(c);
    capacities[`${b}::${tech}:${a}`] = round(c);
  }
  for (const [id, f] of Object.entries(flow)) {
    const p = parse(id); if (!zonal(p)) continue;
    const { a, b, tech } = p;
    generation[`${b}::${tech}:${a}::electricity`] = round(f.A_to_B);
    generation[`${a}::${tech}:${b}::electricity`] = round(f.B_to_A);
  }
  return { capacities, generation };
}

for (const [slack, dir] of [[5, 's05/v7'], [10, 'v9'], [20, 's20/v8']]) {
  const { meta, spores } = read(dir, 'analysis.json');
  const flows = read(dir, 'line_flow_dir.json');
  const out = spores.filter(s => s.status === 'done').map(s => {
    const l = lines(s.link_cap, flows[String(s.spore_id)]);
    const capacities = { ...l.capacities };
    for (const [lt, c] of Object.entries(s.flow_cap)) if (keep.has(lt.split('::')[1]) && c >= 1) capacities[lt] = round(c);
    return { spore_id: s.spore_id, capacities, generation: l.generation };
  });
  writeFileSync(join(here, `ensemble_${slack}.json`), JSON.stringify({ meta: { slack, hours: meta.hours }, spores: out }));
}

// Hourly cost optimum: only line capacities and flows survive in the source folder.
const hf = read('hourly_ee00c393', 'line_flow_dir.json')['0'];
const link_cap = Object.fromEntries(Object.entries(hf).map(([id, f]) => [id, f.capacity_kW]));
writeFileSync(join(here, 'hourly_optimum_lines.json'), JSON.stringify({ hours: 8760, spore: { spore_id: 0, ...lines(link_cap, hf) } }));
