import { expand as expandDemandGrowth, PARAM_SCHEMA as demandGrowthSchema } from './demandGrowth.js';

export const RECIPES = {
  demandGrowth: {
    id: 'demandGrowth',
    label: 'Demand growth pathway',
    description: 'Grow electricity demand year by year at a defined rate, solving each year as an independent snapshot.',
    icon: 'FiTrendingUp',
    paramSchema: demandGrowthSchema,
    expand: expandDemandGrowth,
  },
  // renewableTransition, carbonCap, costSensitivity — to be added in subsequent increments
};

/**
 * Expand a recipe into a list of { label, year?, ops[] } variants.
 * Each variant can be turned into a concrete model via applyOps(model, variant.ops).
 */
export function expandRecipe(model, recipeId, params) {
  const recipe = RECIPES[recipeId];
  if (!recipe) throw new Error(`Unknown recipe: "${recipeId}"`);
  return recipe.expand(model, params);
}
