import { expand as expandDemandGrowth,      PARAM_SCHEMA as demandGrowthSchema      } from './demandGrowth.js';
import { expand as expandRenewableTransition, PARAM_SCHEMA as renewableTransitionSchema } from './renewableTransition.js';
import { expand as expandCarbonCap,           PARAM_SCHEMA as carbonCapSchema           } from './carbonCap.js';
import { expand as expandCostSensitivity,     PARAM_SCHEMA as costSensitivitySchema     } from './costSensitivity.js';
import { tr } from '../../../i18n';

export const RECIPES = {
  demandGrowth: {
    id: 'demandGrowth',
    label: tr("Demand growth pathway"),
    description: 'Grow electricity demand year by year at a defined rate, solving each year as an independent snapshot.',
    icon: 'FiTrendingUp',
    paramSchema: demandGrowthSchema,
    expand: expandDemandGrowth,
  },
  renewableTransition: {
    id: 'renewableTransition',
    label: tr("Renewable transition"),
    description: 'Phase out fossil techs and build toward a renewable-dominated grid across yearly snapshots.',
    icon: 'FiSun',
    paramSchema: renewableTransitionSchema,
    expand: expandRenewableTransition,
  },
  carbonCap: {
    id: 'carbonCap',
    label: tr("Carbon cap / net-zero"),
    description: 'Tighten a CO₂ emission cap from a starting level toward net-zero across yearly snapshots.',
    icon: 'FiCloud',
    paramSchema: carbonCapSchema,
    expand: expandCarbonCap,
  },
  costSensitivity: {
    id: 'costSensitivity',
    label: tr("Cost sensitivity sweep"),
    description: 'Sweep a key cost parameter across a range of values to see how the optimal mix shifts.',
    icon: 'FiDollarSign',
    paramSchema: costSensitivitySchema,
    expand: expandCostSensitivity,
  },
};

// Custom op builder: ops are provided directly in params; generates a single variant.
RECIPES.custom = {
  id: 'custom',
  label: tr("Custom ops"),
  description: 'Compose your own set of operations, or import from a saved legacy scenario.',
  icon: 'FiSliders',
  paramSchema: {},
  expand: (_model, params = {}) => {
    const { ops = [], variantLabel = 'Custom' } = params;
    if (ops.length === 0) return [];
    return [{ label: variantLabel, ops }];
  },
};

/**
 * Expand a recipe into a list of variants.
 * Each variant: { label, ops: TransformOp[] }
 * Apply with: applyOps(deepCopy(model), variant.ops)
 */
export function expandRecipe(model, recipeId, params) {
  const recipe = RECIPES[recipeId];
  if (!recipe) throw new Error(`Unknown recipe: "${recipeId}"`);
  return recipe.expand(model, params);
}
