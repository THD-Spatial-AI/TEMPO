/**
 * Scenario Studio — recipe metadata + pure param helpers (non-component).
 *
 * Kept separate from recipeConfig.jsx so that file can export only React
 * components (satisfies react-refresh/only-export-components). Lifted verbatim
 * from the old ScenarioStudio.jsx form shell.
 */

import {
  FiTrendingUp, FiSun, FiCloud, FiDollarSign, FiSliders, FiGitMerge,
} from 'react-icons/fi';
import { autoDetectTechs, FOSSIL_KEYWORDS, RENEWABLE_KEYWORDS } from '../../services/scenarioStudio/utils.js';

// ─── Recipe catalogue (UI metadata) ─────────────────────────────────────────

export const RECIPE_CARDS = [
  {
    id: 'demandGrowth',
    label: 'Demand growth pathway',
    description: 'Grow electricity demand year by year at a defined rate. Each year is an independent solve.',
    Icon: FiTrendingUp,
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: 'renewableTransition',
    label: 'Renewable transition',
    description: 'Phase out fossil techs across yearly snapshots toward a renewable-dominated grid.',
    Icon: FiSun,
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'carbonCap',
    label: 'Carbon cap / net-zero',
    description: 'Tighten a CO₂ cap from a starting level toward net-zero across yearly snapshots.',
    Icon: FiCloud,
    color: 'from-green-500 to-emerald-600',
  },
  {
    id: 'costSensitivity',
    label: 'Cost sensitivity sweep',
    description: 'Sweep a key cost parameter to see how the optimal energy mix shifts with prices.',
    Icon: FiDollarSign,
    color: 'from-purple-500 to-violet-600',
  },
  {
    id: 'spores',
    label: 'Explore alternatives (SPORES)',
    description: 'Generate N near-optimal, spatially diverse designs at nearly equal cost. Calliope 0.6 only.',
    Icon: FiGitMerge,
    color: 'from-teal-500 to-cyan-600',
  },
  {
    id: 'custom',
    label: 'Custom ops',
    description: 'Compose your own ops manually or import from a saved legacy scenario.',
    Icon: FiSliders,
    color: 'from-slate-500 to-slate-600',
  },
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPE_CARDS.map(c => [c.id, c]));

// ─── Default params per recipe ────────────────────────────────────────────────

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
    slack: 10,          // integer % cost slack
    sporesNumber: 20,
  },
};

// ─── Build recipe params from UI state ───────────────────────────────────────

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

// ─── Preview: affected demand techs for demandGrowth ────────────────────────

export function resolveDemandTechNames(model, params) {
  if (!model || !params) return [];
  const { demandTechs } = params;
  if (Array.isArray(demandTechs)) return demandTechs;
  if (typeof demandTechs === 'string') return [demandTechs];
  const parent = demandTechs?.parentIs ?? 'demand';
  return (model.technologies || []).filter(t => t.parent === parent).map(t => t.name);
}

// ─── Op summary (variant badge + card face) ──────────────────────────────────

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
