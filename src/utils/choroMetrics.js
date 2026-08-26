/**
 * Per-commune demand-side metrics for the region choropleth, derived from a run's
 * frozen result contract. Keyed by location/commune name.
 *
 *   demand    — total demand per commune (MWh)         [result.demand_by_location]
 *   unmet     — unmet demand per commune (MWh)          [result.unmet_demand_by_location]
 *   demandMet — fraction of demand met = (d − u) / d    [derived, 0..1]
 *
 * Older runs (pre-G1 extraction) lack the demand fields → maps come back empty and
 * the choropleth shows its empty state.
 */
export function choroMetricsFromResult(result) {
  const demand = result?.demand_by_location || {};
  const unmet  = result?.unmet_demand_by_location || {};
  const demandMet = {};
  Object.keys(demand).forEach((loc) => {
    const d = demand[loc] || 0;
    const u = unmet[loc] || 0;
    if (d > 0) demandMet[loc] = Math.max(0, Math.min(1, (d - u) / d));
  });
  return { demand, unmet, demandMet };
}
