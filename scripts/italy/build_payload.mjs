// Build a Calliope-runner payload for the Calliope-Italy model exactly as TEMPO does:
// the bundled template is imported with the app's own YAML importer, then the
// Lombardi-2020 base scenario (+ an optional sensitivity variant) is applied with
// the Scenario Studio transform ops.
//
//   node scripts/italy/build_payload.mjs --out payload.json [--variant reference]
//        [--start 2015-01-01 --end 2015-01-07]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilesMap, translateCalliopeModel } from '../../src/services/calliopeYamlImport.js';
import { applyOps } from '../../src/services/scenarioStudio/transform.js';
import { BASE_OPS, SENSITIVITY_VARIANTS, MODEL_CONFIG } from '../../src/services/scenarioStudio/presets/lombardi2020Italy.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const root = join(dirname(fileURLToPath(import.meta.url)), '../../public/templates/Italian_model');

const walk = (d) => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
// Same keys the importer uses: relative path for YAML, basename for everything.
const filesMap = new Map();
for (const p of walk(root)) {
  if (!/\.(ya?ml|csv)$/i.test(p)) continue;
  const text = readFileSync(p, 'utf8');
  filesMap.set(relative(root, p).replace(/\\/g, '/'), text);
  filesMap.set(basename(p), text);
}

const merged = await parseFilesMap(filesMap, () => {}, 'model.yaml');
// Same extra CSVs the app's Italian template carries (CalliopeYAMLImporter SERVER_TEMPLATES).
const extraCsvFiles = ['pv', 'wind', 'windoff'].flatMap(p => [`${p}_1989.csv`, `${p}_2010.csv`]);
const t = translateCalliopeModel(merged, filesMap, { extraCsvFiles });
if (t.missingTimeSeries.length) console.warn('missing CSVs:', t.missingTimeSeries);

const variant = SENSITIVITY_VARIANTS.find(v => v.id === (args.variant || 'reference'));
if (!variant) throw new Error(`unknown variant ${args.variant}`);

const model = {
  name: `Calliope-Italy — ${variant.label}`,
  locations: t.locations, links: t.links, parameters: [], technologies: t.technologies,
  timeSeries: t.timeSeries, overrides: t.overrides, scenarios: t.scenarios,
  metadata: { source: 'calliope_yaml', modelType: 'calliope', runConfig: t.runConfig, subsetTime: t.subsetTime },
  locationTechAssignments: {},
  solver: 'highs',
  modelConfig: {
    mode: 'plan',
    ...MODEL_CONFIG,
    ...(args.start ? { startDate: args.start } : {}),
    ...(args.end ? { endDate: args.end } : {}),
  },
};
const payload = applyOps(model, [...BASE_OPS, ...variant.ops]);
writeFileSync(args.out || 'italy_payload.json', JSON.stringify(payload));
console.log(`wrote ${args.out || 'italy_payload.json'}: ${payload.technologies.length} techs, ` +
  `${payload.locations.length} locations, ${payload.links.length} links, ${payload.timeSeries.length} CSVs`);
