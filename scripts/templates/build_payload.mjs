// Build an engine payload for a bundled/downloaded template exactly as TEMPO's YAML importer does
// (no scenario applied; base model), optionally restricted to a short time window.
//
//   node scripts/templates/build_payload.mjs --template italian|uk|cambridge --out p.json
//        [--start 2015-01-01 --end 2015-01-07]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilesMap, translateCalliopeModel } from '../../src/services/calliopeYamlImport.js';

const TEMPLATES = {
  italian:   { dir: 'Italian_model', root: 'model.yaml', name: 'Italian Energy System',
               extra: ['pv', 'wind', 'windoff'].flatMap(p => [`${p}_1989.csv`, `${p}_2010.csv`]) },
  uk:        { dir: 'uk-calliope-master/uk-calliope-master', root: 'model.yaml', name: 'UK Energy System', extra: [] },
  cambridge: { dir: 'cambridge-calliope-master/model', root: 'model.yaml', name: 'Cambridge District Energy', extra: [] },
};
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const tpl = TEMPLATES[args.template];
if (!tpl) throw new Error(`--template must be one of ${Object.keys(TEMPLATES).join(', ')}`);
const base = process.env.TEMPO_TEMPLATES || join(dirname(fileURLToPath(import.meta.url)), '../../public/templates');
const root = join(base, tpl.dir);

const walk = (d) => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  if (p.split(sep).join('/').includes('DMUU/scenarios')) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const filesMap = new Map();
for (const p of walk(root)) {
  if (!/\.(ya?ml|csv)$/i.test(p)) continue;
  const text = readFileSync(p, 'utf8');
  filesMap.set(relative(root, p).split(sep).join('/'), text);
  filesMap.set(basename(p), text);
}
const merged = await parseFilesMap(filesMap, () => {}, tpl.root);
const t = translateCalliopeModel(merged, filesMap, { extraCsvFiles: tpl.extra });
if (t.missingTimeSeries.length) console.warn('missing CSVs:', t.missingTimeSeries);

// With a window, trim both the parsed rows (read by the 0.7/PyPSA/OSeMOSYS/AdOpT runners) and the raw
// CSV (read by 0.6.8) to it — full multi-decade series would make the payload hundreds of MB.
const inWindow = (line) => { const d = line.slice(0, 10); return d >= args.start && d <= args.end; };
for (const ts of t.timeSeries) {
  if (args.start && args.end) ts.data = ts.data.filter(r => inWindow(String(r[ts.dateColumn] ?? '')));
  if (args.start && args.end && ts.csvContent) {
    const NL = String.fromCharCode(10);
    const [head, ...rows] = ts.csvContent.split(NL);
    ts.csvContent = [head, ...rows.filter(inWindow)].join(NL);
  }
}

const payload = {
  name: tpl.name,
  locations: t.locations, links: t.links, parameters: [], technologies: t.technologies,
  timeSeries: t.timeSeries, overrides: t.overrides, scenarios: t.scenarios,
  metadata: { source: 'calliope_yaml', modelType: 'calliope', runConfig: t.runConfig, subsetTime: t.subsetTime },
  locationTechAssignments: {},
  solver: 'highs',
  // Same defaults the Run page sends (Run.jsx)
  modelConfig: { mode: 'plan', ensureFeasibility: true, cyclicStorage: false, ...(args.start ? { startDate: args.start } : {}), ...(args.end ? { endDate: args.end } : {}) },
};
writeFileSync(args.out, JSON.stringify(payload));
console.log(`${tpl.name}: ${payload.technologies.length} techs, ${payload.locations.length} locations, ` +
  `${payload.links.length} links, ${payload.timeSeries.length} CSVs; subset_time=${JSON.stringify(t.subsetTime)}`);
