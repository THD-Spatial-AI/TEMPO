// Turns a result-contract JSON (as MEME's calliope_extract_contract.py writes) into a completed
// job, so a run made elsewhere can be shown in Results. SPORES contracts join one "imported"
// batch, one per relaxation, which is what the ensemble comparison groups by.
import { SPORES_PLAN } from '../services/scenarioStudio/presets/lombardi2020Italy';
import { stampPowerUnit } from './modelUnits';

export function contractToCompletedJob(contract, { name = 'Imported result', unit, id, now = new Date() } = {}) {
  if (!contract || typeof contract !== 'object' || !(contract.capacities || contract.spores_data)) {
    throw new Error('Not a result contract: expected "capacities" or "spores_data".');
  }
  let result = contract;
  const meta = contract.spores_meta;
  // The plan names the analysis config (and the model unit); MEME doesn't know it.
  if (meta && !meta.plan) result = { ...result, spores_meta: { ...meta, plan: { ...SPORES_PLAN, slack: meta.slack } } };
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
