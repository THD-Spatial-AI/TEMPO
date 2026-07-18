// Pure Calliope-YAML → internal-model translation, extracted verbatim from
// CalliopeYAMLImporter.jsx so the parse pipeline is testable in isolation and
// the importer component stays focused on UI. Mirrors the 0.7 side's
// calliope07Format.js. No React here — only js-yaml + papaparse + browser file APIs.
import jsyaml from 'js-yaml';
import Papa from 'papaparse';

// ─── helpers ─────────────────────────────────────────────────────────────────

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function resolveFile(filesMap, rawPath) {
  const clean = rawPath.replace(/\\/g, '/').trim();
  const base  = clean.split('/').pop();
  return filesMap.get(clean) ?? filesMap.get(base) ?? null;
}

/** Read a single browser File as text, with a clear error if it's a directory. */
export function readText(file) {
  return new Promise((resolve, reject) => {
    if (file.size === 0 || (file.size === 4096 && file.type === '')) {
      reject(new Error(
        `"${file.name}" appears to be a directory or an unreadable entry. ` +
        'Use "Select Folder" or drag the whole folder to expand it automatically.'
      ));
      return;
    }
    const r = new FileReader();
    r.onload  = e  => resolve(e.target.result);
    r.onerror = () => reject(new Error(
      `FileReader failed on "${file.name}". If this is a directory, use the folder picker instead.`
    ));
    r.readAsText(file);
  });
}

/** Recursively expand a FileSystemDirectoryEntry into a flat array of Files. */
function readDirEntry(entry) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (f) => {
          try {
            Object.defineProperty(f, '_entryPath', {
              value: entry.fullPath.replace(/^\//, ''),
              writable: false, configurable: true,
            });
          } catch (_) { /* ignore */ }
          resolve([f]);
        },
        () => resolve([])
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const collect = (acc) => {
        reader.readEntries(
          (entries) => {
            if (!entries.length) { resolve(acc); return; }
            Promise.all(entries.map(e => readDirEntry(e))).then(results =>
              collect([...acc, ...results.flat()])
            );
          },
          () => resolve(acc)
        );
      };
      collect([]);
    } else {
      resolve([]);
    }
  });
}

/** Extract all files from a DataTransfer, expanding directories recursively. */
export async function getFilesFromDataTransfer(dt) {
  const items = [...(dt.items || [])];
  const all = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      const files = await readDirEntry(entry);
      all.push(...files);
    } else {
      const f = item.getAsFile?.();
      if (f) all.push(f);
    }
  }
  return all;
}

/** Replace Infinity/NaN (from js-yaml .inf) with JSON-safe numbers. */
function sanitizeInfinity(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    if (!isFinite(obj)) return obj > 0 ? 1e15 : -1e15;
    if (isNaN(obj)) return 0;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(sanitizeInfinity);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = sanitizeInfinity(v);
    return out;
  }
  return obj;
}

const _CALLIOPE_BASE_TYPES = new Set([
  'supply', 'supply_plus', 'demand', 'storage',
  'transmission', 'conversion', 'conversion_plus',
]);

function techColor(parent) {
  return ({
    supply:          '#F59E0B',
    supply_plus:     '#F59E0B',
    demand:          '#EF4444',
    storage:         '#8B5CF6',
    transmission:    '#3B82F6',
    conversion:      '#10B981',
    conversion_plus: '#10B981',
  })[parent] || '#6B7280';
}

/**
 * Walk the tech_groups inheritance chain to find the nearest Calliope base type.
 * tech_groups are abstract parent classes defined per-model (e.g. supply_electricity_fossil).
 */
function resolveBaseType(parentName, techGroups, depth = 0) {
  if (!parentName || depth > 12) return parentName || 'supply';
  if (_CALLIOPE_BASE_TYPES.has(parentName)) return parentName;
  const group = techGroups[parentName];
  if (!group) return parentName; // unknown group — keep as-is
  const next = group?.essentials?.parent;
  if (!next || next === parentName) return parentName;
  return resolveBaseType(next, techGroups, depth + 1);
}

/**
 * Walk the tech_groups inheritance chain to find the first defined value for
 * any of the given essentials fields (checked in order). Returns null if none found.
 *
 * Used to inherit carrier / carrier_out / carrier_in from abstract tech_groups
 * (e.g. storage_electricity defines carrier: electricity, transmission_electricity
 * defines carrier: electricity) into the concrete tech's essentials.
 */
function resolveFromChain(startParent, techGroups, fields, depth = 0) {
  if (!startParent || depth > 12) return null;
  const group = techGroups[startParent];
  if (!group) return null;
  const ess = group?.essentials || {};
  for (const f of fields) {
    if (ess[f] != null) return ess[f];
  }
  return resolveFromChain(ess.parent, techGroups, fields, depth + 1);
}

/**
 * Walk the tech_groups chain to find the first non-null value at an arbitrary
 * nested path within a group entry (e.g. ['constraints','lifetime']).
 * Unlike resolveFromChain which searches inside `essentials`, this helper
 * searches anywhere in the group object, following `essentials.parent` to walk up.
 */
function resolveNestedFromChain(startParent, techGroups, path, depth = 0) {
  if (!startParent || depth > 12) return null;
  const group = techGroups[startParent];
  if (!group) return null;
  const val = path.reduce((o, k) => (o != null ? o[k] : undefined), group);
  if (val != null) return val;
  return resolveNestedFromChain(group?.essentials?.parent, techGroups, path, depth + 1);
}

/**
 * Expand Calliope dot-notation shorthand into nested objects.
 *
 * Calliope 0.6 allows flat dot-path keys as a compact override syntax:
 *   Z2.techs.hvdc_import.constraints.energy_cap_equals: 1400000
 * instead of the fully-nested equivalent. js-yaml keeps these as literal
 * string keys, so we must expand them before any further processing.
 *
 * Non-dot keys are passed through unchanged (they may still be
 * comma-separated location lists, handled by expandLocations next).
 */
function expandDotKeys(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!key.includes('.')) {
      // Plain key — keep as-is; deepMerge handles the rare case of duplicates
      result[key] = result[key] !== undefined
        ? deepMerge(result[key] || {}, val ?? {})
        : val;
    } else {
      // Dot-path key — build nested object from right to left, then merge
      const parts = key.split('.');
      const topKey = parts[0];
      let nested = val;
      for (let i = parts.length - 1; i >= 1; i--) {
        nested = { [parts[i]]: nested };
      }
      result[topKey] = deepMerge(result[topKey] ?? {}, nested);
    }
  }
  return result;
}

/**
 * Recursively apply expandDotKeys at every level of a plain-object tree.
 *
 * Calliope 0.6 allows dot-path shorthand at any nesting depth:
 *   - tech_groups: costs.monetary.interest_rate: 0.1  (not inside essentials)
 *   - techs:       costs.monetary: { energy_cap: 700 }  (dot-key as map key)
 *   - links:       D07b,D06.techs: { ... }  (dot-key with location pair)
 *   - link techs:  electricity_lines.distance: 99
 * Running this once over the whole merged document before any field lookups
 * means all subsequent code can use plain nested-object access.
 */
function deepExpandDotKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const shallow = expandDotKeys(value);
  const result = {};
  for (const [k, v] of Object.entries(shallow)) {
    result[k] = deepExpandDotKeys(v);
  }
  return result;
}

/**
 * Expand comma-separated location keys into individual per-location entries.
 *
 * Calliope allows shorthand like:
 *   Z1,Z2,Z3:
 *     techs:
 *       demand_electricity:
 * to assign the same config to multiple locations at once.
 * TEMPO's internal format needs one entry per location.
 */
function expandLocations(locationsRaw) {
  // First, normalise any dot-notation keys into proper nested objects.
  // This handles entries like:
  //   Z2.techs.hvdc_import.constraints.energy_cap_equals: 1400000
  const normalised = expandDotKeys(locationsRaw);

  // Accumulate shared (comma-key) config per location name
  const sharedByName = {}; // locName → merged config from all comma-keys that include it
  const singleByName = {}; // locName → config from individual key

  for (const [key, val] of Object.entries(normalised)) {
    const names = key.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length > 1) {
      // Comma-separated key — distribute to each named location
      for (const name of names) {
        sharedByName[name] = deepMerge(sharedByName[name] || {}, val || {});
      }
    } else {
      singleByName[names[0]] = deepMerge(singleByName[names[0]] || {}, val || {});
    }
  }

  // Collect all unique location names
  const allNames = new Set([
    ...Object.keys(sharedByName),
    ...Object.keys(singleByName),
  ]);

  const result = {};
  for (const name of allNames) {
    // Shared config is the base; individual entry overrides (coordinates and per-tech constraints)
    result[name] = deepMerge(sharedByName[name] || {}, singleByName[name] || {});
  }
  return result;
}

// ─── YAML parser ──────────────────────────────────────────────────────────────

export async function parseFilesMap(filesMap, addLog) {
  // Find root model.yaml
  let rootKey = null;
  for (const key of filesMap.keys()) {
    const base = key.split('/').pop().toLowerCase();
    if (base === 'model.yaml' || base === 'model.yml') {
      if (!rootKey || key.split('/').length < rootKey.split('/').length) rootKey = key;
    }
  }
  if (!rootKey) {
    const yamlKeys = [...filesMap.keys()].filter(k => k.endsWith('.yaml') || k.endsWith('.yml'));
    if (yamlKeys.length === 1) rootKey = yamlKeys[0];
    else if (yamlKeys.length === 0) throw new Error('No YAML files found. Upload a .zip or use Select Folder / Select Files.');
    else throw new Error('Could not identify model.yaml.\nFound: ' + yamlKeys.slice(0, 5).join(', ') + '\nRename the main config file to model.yaml.');
  }

  addLog('Root config: ' + rootKey);
  let mergedDoc = jsyaml.load(filesMap.get(rootKey), { schema: jsyaml.DEFAULT_SCHEMA }) || {};

  // Resolve `import:` chains (BFS, max depth 10)
  const seen = new Set([rootKey]);
  let pending = [...(mergedDoc.import || [])];
  delete mergedDoc.import;

  for (let depth = 0; depth < 10 && pending.length; depth++) {
    const next = [];
    for (const imp of pending) {
      const content = resolveFile(filesMap, imp);
      if (content) {
        addLog('Merging: ' + imp);
        const parsed = jsyaml.load(content, { schema: jsyaml.DEFAULT_SCHEMA }) || {};
        const subs = parsed.import || [];
        delete parsed.import;
        mergedDoc = deepMerge(mergedDoc, parsed);
        subs.forEach(s => { if (!seen.has(s)) { next.push(s); seen.add(s); } });
      } else {
        addLog('⚠ Import not found (file missing): ' + imp);
      }
    }
    pending = next;
  }

  return mergedDoc;
}

// ─── YAML → internal model translator ────────────────────────────────────────

export function translateCalliopeModel(mergedDoc, filesMap) {
  const log = [];
  // Normalise ALL Calliope dot-path shorthand at every level before any field
  // lookups. This covers tech_group bare keys (costs.monetary.interest_rate: 0.1),
  // tech-level keys (costs.monetary: {...}), and link keys (D07b,D06.techs: {...}).
  const doc = deepExpandDotKeys(sanitizeInfinity(mergedDoc));

  // Tech groups (abstract parent classes — used only for parent-chain resolution)
  const techGroupsRaw = doc.tech_groups || {};
  if (Object.keys(techGroupsRaw).length)
    log.push('Found ' + Object.keys(techGroupsRaw).length + ' tech_groups (used for parent resolution)');

  // Technologies
  const techsRaw = doc.techs || {};
  const technologies = Object.entries(techsRaw).map(([id, tech]) => {
    const ess           = tech?.essentials || {};
    const rawParent     = ess.parent || 'supply';
    // Resolve parent chain through tech_groups to find the Calliope base type
    const resolvedParent = resolveBaseType(rawParent, techGroupsRaw);

    // Inherit carrier fields from the tech_groups chain when not set on the tech itself.
    // Calliope 0.6 rules:
    //   storage / transmission  → require 'carrier'      (not carrier_out/carrier_in)
    //   demand                  → require 'carrier_in'   (not carrier_out)
    //   supply / supply_plus    → require 'carrier_out'
    //   conversion              → require both carrier_in + carrier_out
    const isStorageTrans = resolvedParent === 'storage' || resolvedParent === 'transmission';
    const isDemand       = resolvedParent === 'demand'  || resolvedParent === 'unmet_demand';
    const isConversion   = resolvedParent === 'conversion' || resolvedParent === 'conversion_plus';

    const chainCarrier    = ess.carrier     || resolveFromChain(rawParent, techGroupsRaw, ['carrier']);
    // ess.carrier is Calliope's shorthand for carrier_out (used by supply, storage, etc.)
    // so include it as a fallback before walking the tech_groups chain.
    const chainCarrierOut = ess.carrier_out || ess.carrier || resolveFromChain(rawParent, techGroupsRaw, ['carrier_out', 'carrier']);
    const chainCarrierIn  = ess.carrier_in  || resolveFromChain(rawParent, techGroupsRaw, ['carrier_in', 'carrier']);

    // Assign the right field per Calliope type
    const resolvedCarrier    = isStorageTrans ? (chainCarrier || chainCarrierOut || chainCarrierIn || 'electricity') : null;
    const resolvedCarrierOut = (!isStorageTrans && !isDemand) ? (chainCarrierOut || 'electricity') : null;
    // demand always needs carrier_in; conversion also needs it; supply optionally
    const resolvedCarrierIn  = isStorageTrans ? null
      : isDemand    ? (chainCarrierIn || chainCarrier || chainCarrierOut || 'electricity')
      : isConversion ? (chainCarrierIn || chainCarrier || 'electricity')
      : chainCarrierIn;  // supply: carry through if explicitly set

    return {
      name: id, parent: resolvedParent,
      description: ess.name || id,
      essentials: {
        name:        ess.name  || id,
        color:       ess.color || techColor(resolvedParent),
        parent:      resolvedParent,
        carrier_out: resolvedCarrierOut,
        carrier_in:  resolvedCarrierIn,
        carrier:     resolvedCarrier,
        // Preserve conversion_plus / supply_plus secondary carrier fields and other
        // essentials that are tech-specific and must not be silently dropped.
        ...(ess.primary_carrier_out != null ? { primary_carrier_out: ess.primary_carrier_out } : {}),
        ...(ess.primary_carrier_in  != null ? { primary_carrier_in:  ess.primary_carrier_in  } : {}),
        ...(ess.carrier_out_2       != null ? { carrier_out_2:       ess.carrier_out_2       } : {}),
        ...(ess.carrier_out_3       != null ? { carrier_out_3:       ess.carrier_out_3       } : {}),
        ...(ess.carrier_in_2        != null ? { carrier_in_2:        ess.carrier_in_2        } : {}),
        ...(ess.carrier_in_3        != null ? { carrier_in_3:        ess.carrier_in_3        } : {}),
        ...(ess.stack_weight        != null ? { stack_weight:        ess.stack_weight        } : {}),
        ...(ess.export_carrier      != null ? { export_carrier:      ess.export_carrier      } : {}),
      },
      constraints: (() => {
        const base = tech?.constraints || {};
        // Inherit lifetime from tech_groups chain if not set on this tech
        if (base.lifetime == null) {
          const inherited = resolveNestedFromChain(rawParent, techGroupsRaw, ['constraints', 'lifetime']);
          if (inherited != null) return { ...base, lifetime: inherited };
        }
        return base;
      })(),
      costs: (() => {
        const allCosts = tech?.costs || {};
        const baseMon = allCosts.monetary || {};
        const inherited = {};
        // Inherit interest_rate from tech_groups chain if not set on this tech
        if (baseMon.interest_rate == null) {
          const ir = resolveNestedFromChain(rawParent, techGroupsRaw, ['costs', 'monetary', 'interest_rate']);
          if (ir != null) inherited.interest_rate = ir;
        }
        // Preserve all cost classes (nos_score, excl_score, co2, etc.) — not just monetary
        return { ...allCosts, monetary: { ...inherited, ...baseMon } };
      })(),
    };
  });
  log.push('Found ' + technologies.length + ' technologies');

  // Locations — expand comma-separated shorthand keys first
  const locationsExpanded = expandLocations(doc.locations || {});
  const locations = Object.entries(locationsExpanded).map(([name, loc]) => {
    const c   = loc?.coordinates || {};
    const lat = c.lat ?? c.latitude  ?? loc?.lat  ?? loc?.latitude  ?? 0;
    const lon = c.lon ?? c.longitude ?? loc?.lon  ?? loc?.longitude ?? 0;
    return { name, latitude: lat, longitude: lon, lat, lon, type: loc?.type || 'site', techs: loc?.techs || {} };
  });
  log.push('Found ' + locations.length + ' locations');

  // Links  ("loc1,loc2" key)
  const linksRaw = doc.links || {};
  const links = Object.entries(linksRaw).map(([key, link]) => {
    const parts = key.split(',').map(s => s.trim());
    const techs = link?.techs || {};
    const ft    = Object.keys(techs)[0] || 'ac_transmission';
    const tc    = techs[ft]?.constraints || {};
    return {
      from:     parts[0] || '',
      to:       parts[1] || '',
      tech:     ft,
      // energy_cap_equals takes precedence (UK model uses it), fall back to energy_cap_max/min
      capacity: tc.energy_cap_equals ?? tc.energy_cap_max ?? tc.energy_cap_min ?? 0,
      distance: tc.distance ?? link?.distance ?? techs[ft]?.distance ?? 0,
    };
  });
  log.push('Found ' + links.length + ' links');

  // Run / model config
  const modelConf  = doc.model || {};
  const runConf    = doc.run   || {};
  const modelName  = modelConf.name || 'Imported Calliope Model';
  // Normalise subset_time to a 2-element [start, end] date string array.
  // Calliope allows: a bare year integer (2015), a single year string ('2015'),
  // a list of two date strings, or a string like '2015-01-01'.
  const normaliseSubsetTime = (raw) => {
    if (!raw && raw !== 0) return null;
    if (Array.isArray(raw) && raw.length === 2) {
      // Already a range — normalise each element to YYYY-MM-DD
      const toDate = (v) => {
        const s = String(v).trim();
        return /^\d{4}$/.test(s) ? s + '-01-01' : s.slice(0, 10);
      };
      return [toDate(raw[0]), toDate(raw[1])];
    }
    // Single value: a year like 2015 or '2015'
    const s = String(raw).trim().slice(0, 10);
    if (/^\d{4}$/.test(s)) return [s + '-01-01', s + '-12-31'];
    return [s, s];
  };
  const subsetTime = normaliseSubsetTime(modelConf.subset_time);
  const tsPath     = modelConf.timeseries_data_path || 'timeseries_data';
  const runConfig  = {
    solver:             runConf.solver             || 'highs',
    mode:               runConf.mode               || 'plan',
    ensure_feasibility: !!runConf.ensure_feasibility,
    cyclic_storage:     runConf.cyclic_storage      ?? true,
    solver_options:     runConf.solver_options      || {},
  };

  // Overrides / scenarios
  const overrides = doc.overrides  || {};
  const scenarios = doc.scenarios  || {};
  if (Object.keys(overrides).length) log.push('Found ' + Object.keys(overrides).length + ' overrides');
  if (Object.keys(scenarios).length) log.push('Found ' + Object.keys(scenarios).length + ' scenarios');

  // ── Collect file= references per location→tech ─────────────────────────────
  // Calliope convention: resource: file=xxx.csv at location L → use column L (implicit)
  // resource: file=xxx.csv:col → use column col (explicit)
  const fileRefMap = new Map(); // csvFilename → [{location, tech, param, column}]

  const collectFileRefs = (obj, locName, techName) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.startsWith('file=')) {
        const withoutPrefix = v.replace('file=', '').trim();
        const colonIdx      = withoutPrefix.indexOf(':');
        const csvFile       = colonIdx >= 0 ? withoutPrefix.slice(0, colonIdx).trim() : withoutPrefix;
        const column        = colonIdx >= 0 ? withoutPrefix.slice(colonIdx + 1).trim() : locName;
        if (!fileRefMap.has(csvFile)) fileRefMap.set(csvFile, []);
        fileRefMap.get(csvFile).push({ location: locName, tech: techName, param: k, column });
      } else if (v && typeof v === 'object') {
        collectFileRefs(v, locName, techName);
      }
    }
  };

  // Scan per-location tech constraints (canonical source of per-location timeseries)
  // Use expanded locations so comma-key entries are properly attributed
  Object.entries(locationsExpanded).forEach(([locName, loc]) => {
    Object.entries(loc?.techs || {}).forEach(([techName, tech]) => {
      if (tech?.constraints) collectFileRefs(tech.constraints, locName, techName);
    });
  });
  // Scan all techs for file= references in constraints AND costs
  // (e.g. Cambridge model uses costs.monetary.export: file=export_price.csv:export)
  Object.entries(doc.techs || {}).forEach(([techName, tech]) => {
    if (tech?.constraints) collectFileRefs(tech.constraints, null, techName);
    if (tech?.costs)       collectFileRefs(tech.costs, null, techName);
  });

  // ── Build one timeSeries entry per CSV file ────────────────────────────────
  const timeSeries = [];
  for (const [csvFile, tsRefs] of fileRefMap.entries()) {
    const content = resolveFile(filesMap, csvFile) ?? resolveFile(filesMap, tsPath + '/' + csvFile);
    if (content) {
      const parsed   = Papa.parse(content, { header: true, skipEmptyLines: true, dynamicTyping: true });
      // Normalize empty first-column header (e.g. regional_demand.csv has no header for the date col)
      const rawCols  = parsed.meta.fields || [];
      const allCols  = rawCols.map((c, i) => (i === 0 && c === '') ? 'time' : c);
      const rowData  = (rawCols[0] === '')
        ? parsed.data.map(row => { const { '': dateVal, ...rest } = row; return { time: dateVal, ...rest }; })
        : parsed.data;
      const dateCol  = allCols[0] || 'time';
      const dataCols = allCols.slice(1);

      const statistics = {};
      dataCols.forEach(col => {
        const vals = rowData.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
        if (vals.length > 0) {
          statistics[col] = {
            min:  Math.min(...vals),
            max:  Math.max(...vals),
            mean: vals.reduce((a, b) => a + b, 0) / vals.length,
            sum:  vals.reduce((a, b) => a + b, 0),
          };
        }
      });

      // locationColumns: { locationName → csvColumn } for Calliope implicit mapping
      const locationColumns = {};
      tsRefs.forEach(({ location, column }) => { if (location) locationColumns[location] = column; });

      timeSeries.push({
        id:             'ts_' + csvFile.replace('.csv', '') + '_' + Date.now(),
        name:           csvFile.replace('.csv', ''),
        fileName:       csvFile,
        file:           csvFile,
        csvContent:     content,        // raw CSV string — used to re-parse data after a reload
        data:           rowData,        // array of row objects — compatible with TimeSeries.jsx
        columns:        allCols,
        dateColumn:     dateCol,
        dataColumns:    dataCols,
        rowCount:       parsed.data.length,
        statistics,
        locationColumns,              // { loc → col } encodes Calliope implicit column mapping
        refs:           tsRefs,       // [{location, tech, param, column}]
        type:           'resource',
        source:         'calliope_yaml',
      });
      log.push('Loaded CSV: ' + csvFile + ' (' + dataCols.length + ' columns, ' + parsed.data.length + ' rows)');
    } else {
      log.push('⚠ CSV not available: ' + csvFile + ' (referenced by ' + tsRefs.length + ' constraints)');
    }
  }

  return { modelName, locations, links, technologies, timeSeries, runConfig, subsetTime, overrides, scenarios, log };
}
