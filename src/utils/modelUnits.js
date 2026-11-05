// A model's numbers are in whatever unit its author chose: the Calliope templates are in kW, models
// built in TEMPO in MW, and engines report results in those same units. The Results views all
// assume MW / MWh, so a run is converted once, where the app hands completed runs to the views.
import { METRICS as ITALY_METRICS } from '../services/scenarioStudio/presets/lombardi2020Italy.js';

/** Size of one model unit in MW. */
export const POWER_UNITS = { kW: 1e-3, MW: 1, GW: 1e3 };

const PRESET_UNITS = { lombardi2020Italy: ITALY_METRICS.modelPowerUnit };

// Contract fields holding power or energy. Costs and objective are money, so they stay.
const RESULT_FIELDS = [
  'capacities', 'storage_capacities', 'generation', 'consumption', 'dispatch',
  'transmission_flow', 'transmission_fwd', 'transmission_rev', 'demand_timeseries', 'demand_by_location',
  'imports_by_location', 'exports_by_location', 'unmet_demand_timeseries', 'unmet_demand_by_location',
  'unmet_demand_total', 'total_unmet_demand_mwh',
];
const SPORE_FIELDS = ['capacities', 'storage_capacities', 'generation', 'consumption'];

const scale = (v, k) => {
  if (typeof v === 'number') return v * k;
  if (Array.isArray(v)) return v.map(x => scale(x, k));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([key, x]) => [key, scale(x, k)]));
  return v;
};

const scaleFields = (obj, fields, k) => {
  const out = { ...obj };
  for (const f of fields) if (f in out) out[f] = scale(out[f], k);
  return out;
};

/** The unit a model's numbers are in. */
export const modelPowerUnit = (model) => model?.metadata?.modelConfig?.powerUnit || 'MW';

/** Stamps a unit on a result, so the run keeps it if its model later changes or goes. */
export const stampPowerUnit = (result, unit) => (result && unit ? { ...result, model_power_unit: unit } : result);

/** The unit a finished run is in: stamped on it, else its model's, else its SPORES preset's, else MW. */
export function powerUnitOfJob(job, models) {
  const result = job?.result;
  if (result?.model_power_unit) return result.model_power_unit;
  const name = String(job?.modelName || '').replace(/ \(version \d+\)$/, '');
  const model = (models || []).find(m => m.name === name);
  if (model) return modelPowerUnit(model);
  return PRESET_UNITS[result?.spores_meta?.plan?.metrics] || 'MW';
}

/** A result with every power and energy value in MW / MWh. MW results come back as they are. */
export function resultInMW(result, unit) {
  const k = POWER_UNITS[unit];
  if (!result || !k || k === 1) return result;
  // Downloads carry these values, so the result says what they are now and what they were.
  const out = { ...scaleFields(result, RESULT_FIELDS, k), model_power_unit: 'MW', source_power_unit: unit };
  // Prices are per unit of energy, so they go the other way.
  if (out.shadow_prices) out.shadow_prices = scale(out.shadow_prices, 1 / k);
  if (out.spores_data) out.spores_data = out.spores_data.map(s => scaleFields(s, SPORE_FIELDS, k));
  if (out.spores_meta?.potentials) out.spores_meta = { ...out.spores_meta, potentials: scale(out.spores_meta.potentials, k) };
  return out;
}

const converted = new WeakMap();

/** A completed run with its result in MW / MWh; conversions are cached per job and unit. */
export function jobInMW(job, models) {
  const unit = powerUnitOfJob(job, models);
  if (!job?.result || !POWER_UNITS[unit] || POWER_UNITS[unit] === 1) return job;
  const hit = converted.get(job);
  if (hit?.unit === unit) return hit.job;
  const out = { ...job, result: resultInMW(job.result, unit) };
  converted.set(job, { unit, job: out });
  return out;
}
