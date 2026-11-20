// Turns a result-contract JSON (as MEME's calliope_extract_contract.py writes) into a completed
// job, so a run made elsewhere can be shown in Results. SPORES contracts join one "imported"
// batch, one per relaxation, which is what the ensemble comparison groups by.
import { SPORES_PLAN, METRICS as ITALY } from '../services/scenarioStudio/presets/lombardi2020Italy';
import { stampPowerUnit } from './modelUnits';

export function contractToCompletedJob(contract, { name = 'Imported result', unit, id, now = new Date() } = {}) {
  if (!contract || typeof contract !== 'object' || !(contract.capacities || contract.spores_data)) {
    throw new Error('Not a result contract: expected "capacities" or "spores_data".');
  }
  let result = contract;
  const meta = contract.spores_meta;
  // The plan names the analysis config (and the model unit); MEME doesn't know it. Only the
  // Calliope-Italy model gets the Lombardi preset; other models get a bare plan and their
  // figures are configured from the result (services/sporesAutoMetrics.js).
  // MEME's extractor puts the slack on each SPORE, not on spores_meta.
  const metaSlack = meta?.slack ?? contract.spores_data?.find(s => s?.slack != null)?.slack;
  if (meta && !meta.plan) {
    const plan = isItalyModel(contract) ? { ...SPORES_PLAN, slack: metaSlack } : { algorithm: meta.algorithm || 'spores', slack: metaSlack };
    result = { ...result, spores_meta: { ...meta, plan } };
  }
  result = stampPowerUnit(result, unit ?? contract.model_power_unit);

  const slack = result.spores_meta?.plan?.slack;
  const job = {
    id: id || `import-${now.getTime()}`,
    modelName: name,
    framework: contract.framework || 'calliope07',
    solver: contract.solver || null,
    mode: meta ? 'spores' : 'plan',
    status: 'completed',
    completedAt: now.toISOString(),
    duration: '–',
    objective: contract.objective ?? null,
    terminationCondition: contract.termination_condition || 'optimal',
    result,
    logs: [],
  };
  if (meta) { job.batchId = 'imported'; job.variantLabel = `Imported · Imported · SPORES ${Math.round((slack ?? 0) * 100)}%`; }
  return job;
}

/** The contract holds most of Calliope-Italy's bidding zones (NORD, CNOR, …). */
function isItalyModel(contract) {
  const keys = Object.keys(contract.spores_data?.[0]?.capacities || contract.capacities || contract.spores_meta?.potentials?.energy_cap_max || {});
  const nodes = new Set(keys.map(k => String(k).split('::')[0].toUpperCase()));
  return ITALY.zones.filter(z => nodes.has(z)).length >= ITALY.zones.length / 2;
}
