/**
 * archiveFormat.js
 * ----------------
 * Detects which energy-modelling framework a model archive belongs to by
 * inspecting its file listing only (no file contents are parsed — parsing
 * happens Python-side in the target engine's /import endpoint).
 *
 * Formats:
 *   'calliope'  — model.yaml / model.yml archive (0.6 or 0.7; the existing
 *                 Calliope importer distinguishes the two)
 *   'adoptnet0' — AdOpT-NET0 case directory (Topology.json + ConfigModel.json)
 *   'pypsa'     — PyPSA netCDF (*.nc) or CSV folder (buses.csv)
 *   'osemosys'  — otoole CSV dataset (SpecifiedAnnualDemand / TECHNOLOGY+REGION sets)
 *   'unknown'   — none of the above
 */

/**
 * @param {string[]} fileNames  Paths inside the archive (any separator, any depth).
 * @returns {'calliope'|'adoptnet0'|'pypsa'|'osemosys'|'unknown'}
 */
export function detectArchiveFormat(fileNames) {
  const bases = new Set(
    (fileNames || []).map(f =>
      String(f).replace(/\\/g, '/').split('/').pop().toLowerCase()
    )
  );

  if (bases.has('model.yaml') || bases.has('model.yml')) return 'calliope';

  if (bases.has('topology.json') && bases.has('configmodel.json')) return 'adoptnet0';

  const hasNc = [...bases].some(b => b.endsWith('.nc'));
  if (hasNc || bases.has('buses.csv')) return 'pypsa';

  if (
    bases.has('specifiedannualdemand.csv') ||
    bases.has('yearsplit.csv') ||
    (bases.has('technology.csv') && bases.has('region.csv'))
  ) return 'osemosys';

  return 'unknown';
}
