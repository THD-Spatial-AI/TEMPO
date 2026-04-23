/**
 * CalliopeYAMLImporter.jsx
 *
 * Imports a Calliope 0.6.x model from three sources:
 *  1. Pre-loaded server templates (already in public/templates/)
 *  2. A .zip archive (download from GitHub / Zenodo and drop here)
 *  3. Folder or individual files (multi-select YAML + CSV)
 *
 * Parsing strategy
 *  1. Find the root model YAML (model.yaml / model.yml).
 *  2. Resolve every `import:` reference recursively.
 *  3. Deep-merge all YAML documents into one.
 *  4. Translate locations / links / techs → app-internal format.
 *  5. Scan `file=xxx.csv` references in constraints and load CSV timeseries if present.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  FiUploadCloud, FiPackage, FiCheckCircle,
  FiAlertTriangle, FiX, FiChevronDown, FiChevronRight,
  FiMap, FiZap, FiDatabase, FiActivity, FiInfo, FiRefreshCw,
  FiServer, FiFolder,
} from 'react-icons/fi';
import JSZip from 'jszip';
import jsyaml from 'js-yaml';
import Papa from 'papaparse';
import { fetchTemplate } from '../utils/templateFetch';

// ─── known server-side YAML templates ────────────────────────────────────────
// Add entries here as more YAML models are placed in public/templates/
const SERVER_TEMPLATES = [
  {
    id:          'italian_model',
    name:        'Italian Energy System',
    description: 'Multi-region Italian power system (6–20 nodes) with VRE, thermal, hydro, storage and import/export technologies. Includes 2015 timeseries data.',
    flag:        '🇮🇹',
    rootYaml:    'Italian_model/model.yaml',
    basePath:    'Italian_model',
    // All YAML imports relative to basePath (resolved automatically but listed for transparency)
    imports:     [
      'model_config/techs.yaml',
      'model_config/locations.yaml',
      'overrides.yaml',
      'model_config/new_techs.yaml',
      'model_config/new_locations.yaml',
    ],
    // Timeseries CSVs in timeseries_data/ (optional, loaded if present)
    csvFiles:    [
      'timeseries_data/regional_demand.csv',
      'timeseries_data/pv_series.csv',
      'timeseries_data/wind_series.csv',
      'timeseries_data/wind_offshore_series.csv',
      'timeseries_data/hydro_reservoirs.csv',
    ],
    color: 'green',
  },
  {
    id:          'uk_model',
    name:        'UK Energy System',
    description: 'Multi-zone UK power system (17 zones) with wind, solar, hydro, fossil, nuclear, storage and HVAC/HVDC transmission. Based on UK-Calliope 0.6.3.',
    flag:        '🇬🇧',
    rootYaml:    'uk-calliope-master/uk-calliope-master/model.yaml',
    basePath:    'uk-calliope-master/uk-calliope-master',
    // YAML imports are auto-discovered recursively — no need to list them explicitly
    imports:     [],
    csvFiles:    [
      'data/demand.csv',
      'data/pv.csv',
      'data/wind_onshore.csv',
      'data/wind_offshore.csv',
    ],
    color: 'blue',
  },
  {
    id:          'cambridge_model',
    name:        'Cambridge District Energy',
    description: 'West Cambridge district-scale multi-carrier model (~50 building nodes) with CHP, GSHP, PV, solar thermal, storage and district heat/gas/electricity networks.',
    flag:        '🎓',
    rootYaml:    'cambridge-calliope-master/model/model.yaml',
    basePath:    'cambridge-calliope-master/model',
    // YAML imports + CSVs are auto-discovered via fetchYamlRecursive
    imports:     [],
    csvFiles:    [],
    auto:        true,
    color: 'purple',
  },
];

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
function readText(file) {
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
async function getFilesFromDataTransfer(dt) {
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

async function parseFilesMap(filesMap, addLog) {
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

function translateCalliopeModel(mergedDoc, filesMap) {
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
        const baseMon = tech?.costs?.monetary || {};
        const inherited = {};
        // Inherit interest_rate from tech_groups chain if not set on this tech
        if (baseMon.interest_rate == null) {
          const ir = resolveNestedFromChain(rawParent, techGroupsRaw, ['costs', 'monetary', 'interest_rate']);
          if (ir != null) inherited.interest_rate = ir;
        }
        return { monetary: { ...inherited, ...baseMon } };
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
    solver:             runConf.solver             || 'cbc',
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

// ─── component ────────────────────────────────────────────────────────────────

export default function CalliopeYAMLImporter({ onImport, onClose }) {
  const [uploadMode, setUploadMode] = useState('server');
  const [dragOver,   setDragOver]   = useState(false);
  const [status,     setStatus]     = useState('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [parseLog,   setParseLog]   = useState([]);
  const [preview,    setPreview]    = useState(null);
  const [showLog,    setShowLog]    = useState(false);
  const [modelName,  setModelName]  = useState('');
  const [loadingTpl, setLoadingTpl] = useState(null);
  const [tplAvailable, setTplAvailable] = useState({});

  // Check which server templates are actually present on first switch to 'server' tab
  useEffect(() => {
    if (uploadMode !== 'server') return;
    (async () => {
      const avail = {};
      await Promise.all(SERVER_TEMPLATES.map(async tpl => {
        try {
          const resp = await fetchTemplate(tpl.rootYaml);
          avail[tpl.id] = resp.ok;
        } catch { avail[tpl.id] = false; }
      }));
      setTplAvailable(avail);
    })();
  }, [uploadMode]);

  const zipRef    = useRef(null);
  const filesRef  = useRef(null);
  const folderRef = useRef(null);

  const addLog = useCallback(msg => setParseLog(p => [...p, msg]), []);

  const reset = () => {
    setStatus('idle'); setErrorMsg(''); setParseLog([]);
    setPreview(null);  setShowLog(false); setModelName(''); setLoadingTpl(null);
  };

  // ── shared: parse a filesMap ───────────────────────────────────────────────
  const runParse = useCallback(async (filesMap) => {
    setStatus('parsing');
    try {
      const mergedDoc = await parseFilesMap(filesMap, addLog);
      const result    = translateCalliopeModel(mergedDoc, filesMap);
      result.log.forEach(l => addLog(l));
      setPreview(result);
      setModelName(result.modelName);
      setStatus('preview');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatus('error');
    }
  }, [addLog]);

  // ── ZIP mode ───────────────────────────────────────────────────────────────
  const handleZIP = useCallback(async (file) => {
    setStatus('parsing');
    setParseLog([]);
    addLog('Opening ZIP: ' + file.name);
    try {
      const zip      = await JSZip.loadAsync(file);
      const filesMap = new Map();
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const ext = path.split('.').pop().toLowerCase();
        if (['yaml', 'yml', 'csv'].includes(ext)) {
          const text = await entry.async('string');
          const norm = path.replace(/\\/g, '/');
          filesMap.set(norm, text);
          filesMap.set(norm.split('/').pop(), text);
        }
      }
      addLog('Extracted YAML/CSV files from ZIP');
      await runParse(filesMap);
    } catch (err) {
      setErrorMsg('ZIP error: ' + err.message);
      setStatus('error');
    }
  }, [addLog, runParse]);

  // ── files/folder mode ─────────────────────────────────────────────────────
  const handleFileList = useCallback(async (fileList) => {
    setStatus('parsing');
    setParseLog([]);
    const filesMap = new Map();
    let skipped    = 0;
    for (const f of fileList) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!['yaml', 'yml', 'csv'].includes(ext)) continue;
      try {
        const text    = await readText(f);
        const relPath = (f._entryPath || f.webkitRelativePath || f.name).replace(/\\/g, '/');
        filesMap.set(relPath, text);
        filesMap.set(relPath.split('/').pop(), text);
      } catch (err) {
        skipped++;
        addLog('⚠ Skipped: ' + err.message);
      }
    }
    if (filesMap.size === 0) {
      setErrorMsg(
        skipped > 0
          ? 'All files were skipped (possibly directories). Use the "Select Folder" button or drag the model folder here.'
          : 'No YAML or CSV files found in the selection.'
      );
      setStatus('error');
      return;
    }
    addLog('Loaded ' + (filesMap.size / 2) + ' YAML/CSV files');
    await runParse(filesMap);
  }, [addLog, runParse]);

  // ── server template mode ──────────────────────────────────────────────────
  const loadServerTemplate = useCallback(async (tpl) => {
    setLoadingTpl(tpl.id);
    setStatus('parsing');
    setParseLog([]);
    try {
      const filesMap = new Map();

      const fetchFile = async (templateRelPath, storeAs) => {
        const resp = await fetchTemplate(templateRelPath);
        if (!resp.ok) return false;
        const text = await resp.text();
        if (storeAs) filesMap.set(storeAs, text);
        filesMap.set(templateRelPath.split('/').pop(), text);
        // also store relative to basePath for import: resolution
        const subPath = templateRelPath.replace(tpl.basePath + '/', '');
        if (subPath !== storeAs) filesMap.set(subPath, text);
        return text;
      };

      // Recursively fetch all YAML files referenced via `import:` in the model,
      // starting from the root. This handles models with arbitrary directory structures
      // without needing to enumerate every file in the template definition.
      const fetchedPaths = new Set();
      const fetchYamlRecursive = async (relPathFromBase) => {
        if (fetchedPaths.has(relPathFromBase)) return;
        fetchedPaths.add(relPathFromBase);
        const fullPath = tpl.basePath + '/' + relPathFromBase;
        const text = await fetchFile(fullPath, relPathFromBase);
        if (!text) { addLog('⚠ Import not found on server: ' + relPathFromBase); return; }
        try {
          const parsed = jsyaml.load(text, { schema: jsyaml.DEFAULT_SCHEMA }) || {};
          for (const imp of (parsed.import || [])) {
            // import paths in Calliope are always relative to the model root
            if (!fetchedPaths.has(imp)) await fetchYamlRecursive(imp);
          }
        } catch (_) { /* ignore parse errors during pre-fetch */ }
      };

      addLog('Fetching ' + tpl.rootYaml);
      // Determine the root yaml path relative to basePath
      const rootRelPath = tpl.rootYaml.replace(tpl.basePath + '/', '');
      await fetchYamlRecursive(rootRelPath);
      if (!filesMap.has(rootRelPath) && !filesMap.has('model.yaml')) {
        throw new Error('Cannot fetch ' + tpl.rootYaml);
      }
      // Ensure the root is also accessible as 'model.yaml'
      const rootContent = filesMap.get(rootRelPath);
      if (rootContent && !filesMap.has('model.yaml')) filesMap.set('model.yaml', rootContent);

      // Also fetch any explicitly listed imports (legacy / extra files)
      for (const imp of (tpl.imports || [])) {
        if (!fetchedPaths.has(imp)) {
          addLog('Fetching ' + imp);
          await fetchFile(tpl.basePath + '/' + imp, imp);
        }
      }

      for (const csv of (tpl.csvFiles || [])) {
        const csvOk = await fetchFile(tpl.basePath + '/' + csv, csv.split('/').pop());
        if (csvOk) addLog('Fetched CSV: ' + csv.split('/').pop());
      }

      // Auto-discover and fetch any 'file=xxx.csv' references found across all
      // fetched YAML content (handles cost timeseries like export_price.csv that
      // are not listed in tpl.csvFiles and not reachable via YAML import: chains).
      const allCsvRefs = new Set();
      for (const [, yamlText] of filesMap) {
        if (!yamlText || typeof yamlText !== 'string' || !yamlText.includes('file=')) continue;
        for (const m of yamlText.matchAll(/file=([^\s:'"]+\.csv)/gi)) {
          allCsvRefs.add(m[1]);
        }
      }
      for (const ref of allCsvRefs) {
        if (filesMap.has(ref)) continue; // already loaded
        // Try tsPath (timeseries_data subdirs) first, then basePath root
        const tryPaths = [
          tpl.basePath + '/timeseries_data/DMUU/' + ref,
          tpl.basePath + '/timeseries_data/' + ref,
          tpl.basePath + '/data/' + ref,
          tpl.basePath + '/' + ref,
        ];
        let fetched = false;
        for (const p of tryPaths) {
          const ok = await fetchFile(p, ref);
          if (ok) { addLog('Auto-fetched CSV: ' + ref); fetched = true; break; }
        }
        if (!fetched) addLog('⚠ CSV not on server: ' + ref + ' (safety net will handle it)');
      }

      await runParse(filesMap);
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatus('error');
    } finally {
      setLoadingTpl(null);
    }
  }, [addLog, runParse]);

  // ── drag/drop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploadMode === 'zip') {
      const zip = [...e.dataTransfer.files].find(f => f.name.endsWith('.zip'));
      if (zip) { handleZIP(zip); return; }
      setErrorMsg('Please drop a .zip file.'); setStatus('error'); return;
    }
    const items = e.dataTransfer.items;
    if (items && [...items].some(i => i.webkitGetAsEntry?.()?.isDirectory)) {
      addLog('Expanding folder…');
      const files = await getFilesFromDataTransfer(e.dataTransfer);
      handleFileList(files);
    } else {
      handleFileList([...e.dataTransfer.files]);
    }
  }, [uploadMode, handleZIP, handleFileList, addLog]);

  // ── confirm import ────────────────────────────────────────────────────────
  const doImport = () => {
    if (!preview) return;
    const name = (modelName.trim() || preview.modelName).trim() || 'Calliope Model';
    onImport(
      name,
      preview.locations,
      preview.links,
      [],
      preview.technologies,
      preview.timeSeries,
      { source: 'calliope_yaml', runConfig: preview.runConfig, subsetTime: preview.subsetTime, description: 'Imported: ' + name },
      preview.overrides,
      preview.scenarios,
    );
    setStatus('done');
  };

  // ─── sub-components ───────────────────────────────────────────────────────

  const StatBadge = ({ icon: Icon, label, value, color }) => (
    <div className={'flex items-center gap-3 bg-' + color + '-50 border border-' + color + '-200 rounded-lg px-4 py-3'}>
      <Icon size={18} className={'text-' + color + '-500'} />
      <div>
        <div className={'text-xl font-bold text-' + color + '-700'}>{value}</div>
        <div className={'text-xs text-' + color + '-600'}>{label}</div>
      </div>
    </div>
  );

  const DropZone = () => (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={'border-2 border-dashed rounded-xl p-10 text-center transition-all ' +
        (dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50')}
    >
      <FiUploadCloud size={40} className="mx-auto text-blue-400 mb-3" />
      {uploadMode === 'zip' ? (
        <>
          <p className="text-slate-700 font-semibold text-lg mb-1">Drop a .zip file here</p>
          <p className="text-slate-400 text-sm mb-4">or click to browse</p>
          <button onClick={() => zipRef.current?.click()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Select ZIP
          </button>
          <input ref={zipRef} type="file" accept=".zip" className="hidden"
            onChange={e => e.target.files[0] && handleZIP(e.target.files[0])} />
        </>
      ) : (
        <>
          <p className="text-slate-700 font-semibold text-lg mb-1">Drop the model folder or files here</p>
          <p className="text-slate-400 text-sm mb-4">or use the buttons below</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => folderRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
              <FiFolder size={14} /> Select Folder
            </button>
            <button onClick={() => filesRef.current?.click()}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors flex items-center gap-2">
              <FiUploadCloud size={14} /> Select Files
            </button>
          </div>
          <input ref={folderRef} type="file" className="hidden"
            {...{ webkitdirectory: 'true', mozdirectory: 'true' }}
            onChange={e => handleFileList([...e.target.files])} />
          <input ref={filesRef} type="file" multiple accept=".yaml,.yml,.csv" className="hidden"
            onChange={e => handleFileList([...e.target.files])} />
          <p className="text-xs text-slate-400 mt-3">
            Subdirectories are expanded automatically when using Select Folder or dragging the folder.
          </p>
        </>
      )}
    </div>
  );

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <FiPackage size={22} />
          <div>
            <h3 className="font-bold text-lg">Import Calliope Model</h3>
            <p className="text-blue-200 text-sm">Calliope 0.6.x YAML format</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 text-blue-200 hover:text-white hover:bg-blue-600 rounded-lg transition-colors">
            <FiX size={20} />
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">

        {status === 'idle' && (
          <>
            {/* Mode tabs */}
            <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'server', icon: FiServer,      label: 'Built-in Templates' },
                { id: 'zip',    icon: FiPackage,     label: 'ZIP Archive'        },
                { id: 'files',  icon: FiUploadCloud, label: 'Files / Folder'     },
              ].map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setUploadMode(id)}
                  className={'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ' +
                    (uploadMode === id ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700')}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            {uploadMode === 'server' && (
              <div className="space-y-3">
                {SERVER_TEMPLATES.map(tpl => {
                  const available = tplAvailable[tpl.id] !== false; // default true while checking
                  const checking  = !(tpl.id in tplAvailable);
                  return (
                  <div key={tpl.id} className={`border rounded-xl p-5 flex items-start gap-4 ${available ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                    <div className="text-3xl">{tpl.flag}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-base ${available ? 'text-green-800' : 'text-gray-500'}`}>{tpl.name}</h4>
                      <p className={`text-sm mt-1 ${available ? 'text-green-700' : 'text-gray-400'}`}>{tpl.description}</p>
                      {!available && !checking && (
                        <p className="text-xs text-amber-600 mt-1">⚠ Template files not found in <code className="bg-amber-50 px-1 rounded">public/templates/{tpl.basePath}/</code></p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {tpl.imports.map(f => (
                          <span key={f} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 font-mono text-gray-500">{f}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => loadServerTemplate(tpl)}
                      disabled={loadingTpl !== null || !available || checking}
                      className={`px-5 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2 flex-shrink-0 ${available && !checking ? 'bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-wait' : 'bg-gray-400 cursor-not-allowed'}`}
                    >
                      {loadingTpl === tpl.id && <FiRefreshCw size={13} className="animate-spin" />}
                      {checking ? '…' : loadingTpl === tpl.id ? 'Loading…' : available ? 'Load' : 'Not available'}
                    </button>
                  </div>
                  );
                })}
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-400">
                  More templates can be added by placing YAML models in <code className="bg-gray-100 px-1 rounded text-xs">public/templates/</code>
                </div>
              </div>
            )}

            {uploadMode === 'zip' && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-sm text-blue-800">
                  <FiInfo size={15} className="flex-shrink-0 mt-0.5 text-blue-500" />
                  <span>Upload a <strong>.zip</strong> of the model folder. <code className="bg-blue-100 px-1 rounded text-xs">import:</code> references are resolved automatically from files inside the archive.</span>
                </div>
                <DropZone />
              </>
            )}

            {uploadMode === 'files' && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-sm text-blue-800">
                  <FiInfo size={15} className="flex-shrink-0 mt-0.5 text-blue-500" />
                  <span>Use <strong>Select Folder</strong> (or drag the folder here) to load the whole model directory including <code className="bg-blue-100 px-1 rounded text-xs">model_config/</code> and <code className="bg-blue-100 px-1 rounded text-xs">timeseries_data/</code>.</span>
                </div>
                <DropZone />
              </>
            )}
          </>
        )}

        {/* Parsing spinner */}
        {status === 'parsing' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <FiRefreshCw size={36} className="text-blue-500 animate-spin" />
            <p className="text-slate-600 font-medium">Parsing model…</p>
            <div className="w-full max-h-40 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 space-y-0.5">
              {parseLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <FiAlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-700 mb-1">Import failed</p>
                <pre className="text-red-600 text-sm whitespace-pre-wrap">{errorMsg}</pre>
              </div>
            </div>
            {parseLog.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-36 overflow-y-auto space-y-0.5">
                {parseLog.map((l, i) => <div key={i} className={l.startsWith('⚠') ? 'text-yellow-400' : ''}>{l}</div>)}
              </div>
            )}
            <button onClick={reset}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
              <FiRefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {/* Preview */}
        {status === 'preview' && preview && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Model Name</label>
              <input value={modelName} onChange={e => setModelName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBadge icon={FiMap}      label="Locations"    value={preview.locations.length}    color="blue"   />
              <StatBadge icon={FiActivity} label="Links"        value={preview.links.length}        color="green"  />
              <StatBadge icon={FiZap}      label="Technologies" value={preview.technologies.length} color="yellow" />
              <StatBadge icon={FiDatabase} label="Timeseries"   value={preview.timeSeries.length}   color="purple" />
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs flex flex-wrap gap-2">
              <span className="bg-white border border-slate-200 rounded px-2 py-1">Solver: <strong>{preview.runConfig.solver}</strong></span>
              <span className="bg-white border border-slate-200 rounded px-2 py-1">Mode: <strong>{preview.runConfig.mode}</strong></span>
              {preview.subsetTime && (
                <span className="bg-white border border-slate-200 rounded px-2 py-1">
                  Subset: <strong>{Array.isArray(preview.subsetTime) ? preview.subsetTime.join(' → ') : preview.subsetTime}</strong>
                </span>
              )}
            </div>

            {preview.technologies.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Technologies ({preview.technologies.length})</p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {preview.technologies.map(t => (
                    <span key={t.name}
                      className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.essentials.color }} />
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button onClick={() => setShowLog(v => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
                {showLog ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                {showLog ? 'Hide' : 'Show'} parse log ({parseLog.length} entries)
              </button>
              {showLog && (
                <div className="mt-2 bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-44 overflow-y-auto space-y-0.5">
                  {parseLog.map((l, i) => <div key={i} className={l.startsWith('⚠') ? 'text-yellow-400' : ''}>{l}</div>)}
                </div>
              )}
            </div>

            {parseLog.some(l => l.includes('⚠ Timeseries CSV')) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-800">
                <FiAlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <span>Some timeseries CSV files were not found. The model imports without them — you can add them later in the TimeSeries section.</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={doImport}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                <FiCheckCircle size={16} /> Import Model
              </button>
              <button onClick={reset}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {status === 'done' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <FiCheckCircle size={48} className="text-green-500" />
            <p className="font-bold text-slate-800 text-xl">Model Imported!</p>
            <p className="text-slate-500 text-sm text-center">
              <strong>{modelName}</strong> is ready. Open <strong>Map</strong> or <strong>Locations</strong> to explore it.
            </p>
            {onClose && (
              <button onClick={onClose}
                className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm">
                Close
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
