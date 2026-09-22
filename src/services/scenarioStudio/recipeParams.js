/**
 * Scenario Studio — pure recipe param helpers (no React / no icons).
 *
 * Lives in the service layer so both the UI (recipeConfig.jsx) and scenario.js can
 * use them without a component→service layering inversion.
 */

import { autoDetectTechs, FOSSIL_KEYWORDS, RENEWABLE_KEYWORDS } from './utils.js';

// UI-shape default params per recipe (edited by the ConfigPanels).
export const DEFAULT_PARAMS = {
  demandGrowth: {
    baseYear: 2025,
    ratePerYear: 1.5,
    snapshotMode: 'range',
    snapshotFrom: 2025, snapshotTo: 2040, snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    demandTechsMode: 'auto',
    demandTechsManual: [],
  },
  renewableTransition: {
    baseYear: 2025,
    targetYear: 2040,
    snapshotMode: 'range',
    snapshotFrom: 2025, snapshotTo: 2040, snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    fossilMode: 'auto',
    fossilManual: [],
    phaseOutMode: 'graduated',
    renewableCapScale: '',
    enableRenewableMin: false,
    renewableMinShare: 80,
    renewableMinMode: 'auto',
    renewableMinManual: [],
  },
  carbonCap: {
    baseYear: 2025,
    targetYear: 2040,
    startCap: 100,
    endCap: 0,
    snapshotMode: 'range',
    snapshotFrom: 2025, snapshotTo: 2040, snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    interpolation: 'linear',
  },
  costSensitivity: {
    techName: '',
    paramPath: 'costs.monetary.energy_cap',
    valueFrom: 800,
    valueTo: 300,
    steps: 5,
    unit: '€/kW',
    level: 'global',
  },
  custom: {
    ops: [],
    variantLabel: 'Custom',
    selectedScenario: '',
  },
  spores: {
    slack: 10,
    sporesNumber: 20,
  },
};

// UI-shape → recipe-shape param conversion (fed to expandRecipe).
export function buildRecipeParams(recipeId, ui, model) {
  const techs = model?.technologies || [];

  const resolveSnapshotYears = () =>
    ui.snapshotMode === 'list'
      ? ui.snapshotList.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : { from: ui.snapshotFrom, to: ui.snapshotTo, step: ui.snapshotStep };

  if (recipeId === 'demandGrowth') {
    return {
      baseYear: ui.baseYear,
      ratePerYear: parseFloat(ui.ratePerYear) / 100,
      snapshotYears: resolveSnapshotYears(),
      demandTechs: ui.demandTechsMode === 'auto'
        ? { parentIs: 'demand' }
        : ui.demandTechsManual,
    };
  }

  if (recipeId === 'renewableTransition') {
    return {
      baseYear: ui.baseYear,
      targetYear: ui.targetYear,
      snapshotYears: resolveSnapshotYears(),
      fossilTechs: ui.fossilMode === 'auto'
        ? { nameContains: FOSSIL_KEYWORDS }
        : ui.fossilManual,
      phaseOutMode: ui.phaseOutMode,
      renewableCapScale: ui.renewableCapScale !== '' ? parseFloat(ui.renewableCapScale) : null,
      renewableMinShare: ui.enableRenewableMin ? ui.renewableMinShare / 100 : null,
      renewableTechs: ui.renewableMinMode === 'auto'
        ? autoDetectTechs(techs, RENEWABLE_KEYWORDS)
        : ui.renewableMinManual,
    };
  }

  if (recipeId === 'carbonCap') {
    return {
      baseYear: ui.baseYear,
      targetYear: ui.targetYear,
      snapshotYears: resolveSnapshotYears(),
      startCap: parseFloat(ui.startCap),
      endCap: parseFloat(ui.endCap),
      interpolation: ui.interpolation,
    };
  }

  if (recipeId === 'costSensitivity') {
    return {
      techMatch: ui.techName || 'solar_pv',
      paramPath: ui.paramPath,
      valueFrom: parseFloat(ui.valueFrom),
      valueTo: parseFloat(ui.valueTo),
      steps: parseInt(ui.steps, 10),
      unit: ui.unit,
      level: ui.level,
    };
  }
  if (recipeId === 'custom') {
    return { ops: ui.ops || [], variantLabel: ui.variantLabel || 'Custom' };
  }
  return {};
}

export function resolveDemandTechNames(model, params) {
  if (!model || !params) return [];
  const { demandTechs } = params;
  if (Array.isArray(demandTechs)) return demandTechs;
  if (typeof demandTechs === 'string') return [demandTechs];
  const parent = demandTechs?.parentIs ?? 'demand';
  return (model.technologies || []).filter(t => t.parent === parent).map(t => t.name);
}

/**
 * Extract a demand profile for preview: the model's demand-like time series.
 * @returns {{ name:string, values:number[] } | null}
 */
export function extractDemandSeries(model, timeSeries) {
  const forModel = (timeSeries || []).filter(ts => ts.modelId === model?.id);
  const demand = forModel.find(ts =>
    /demand|load/i.test(ts.name || '') || (ts.dataColumns || []).some(c => /demand|load/i.test(c)));
  const ts = demand || forModel[0];
  if (!ts || !Array.isArray(ts.data)) return null;
  const col = (ts.dataColumns || []).find(c => /demand|load/i.test(c)) || (ts.dataColumns || [])[0];
  if (!col) return null;
  const values = ts.data.map(row => Number(row?.[col])).filter(v => Number.isFinite(v));
  return values.length ? { name: col, values } : null;
}

export function summarizeOps(ops) {
  if (!ops || ops.length === 0) return null;
  const SYS_LABEL = { co2_cap: 'CO₂', renewable_min: 'RE min', reserve_margin: 'reserve' };
  const parts = ops.map(op => {
    if (op.op === 'scaleParam') {
      const tech = op.techMatch || '*';
      const f = op.factor ?? 1;
      return `${tech} ×${parseFloat(f.toFixed(3))}`;
    }
    if (op.op === 'setParam') {
      const tech = op.techMatch || '*';
      const key  = (op.path || '').split('.').pop();
      return `${tech}.${key}=${op.value ?? ''}`;
    }
    if (op.op === 'disableTech') return `${op.techMatch || '*'} off`;
    if (op.op === 'systemConstraint') {
      const lbl = SYS_LABEL[op.kind] || op.kind;
      return `${lbl} ${op.value ?? ''}`;
    }
    if (op.op === 'addTech') return `+${op.tech}`;
    if (op.op === 'scaleLinkCap') return `links ×${parseFloat((op.factor ?? 1).toFixed(3))}`;
    if (op.op === 'setLinkCap') return `links=${op.value ?? ''}`;
    return op.op;
  });
  return parts.length <= 3
    ? parts.join(' · ')
    : parts.slice(0, 3).join(' · ') + ` +${parts.length - 3} more`;
}
