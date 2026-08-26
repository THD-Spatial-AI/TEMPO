import { describe, it, expect } from 'vitest';
import { frameworkParamNames } from '../techDatabaseApi.js';

// Response shapes captured from the live OEO /{framework} endpoints.
const PYPSA = {
  _oeo_class: 'OEO_00000016',
  _source_label: 'SOFC 250kW',
  bus0_carrier: 'hydrogen',
  bus1_carrier: 'electricity',
  efficiency: 0.6,
  p_nom: 0.25,
  capital_cost: 648.97,
  marginal_cost: 4.0,
};

const OSEMOSYS = {
  TECHNOLOGY: 'SOFC',
  InputActivityRatio: { H2: 1.666667 },
  OutputActivityRatio: { ELEC: 1.0 },
  CapitalCost: 5000.0,
  FixedCost: 100.0,
  VariableCost: 1.111112,
  OperationalLife: 15,
  CapacityToActivityUnit: 31.536,
  _units: { CapitalCost: 'MEUR/GW' },
  _oeo_class: 'OEO_00000016',
};

describe('frameworkParamNames', () => {
  it('keeps scalar PyPSA attrs, drops _meta and carriers', () => {
    expect(frameworkParamNames(PYPSA).sort()).toEqual(
      ['capital_cost', 'efficiency', 'marginal_cost', 'p_nom'].sort()
    );
  });

  it('keeps scalar OSeMOSYS params, drops dicts/_meta/TECHNOLOGY', () => {
    expect(frameworkParamNames(OSEMOSYS).sort()).toEqual(
      ['CapacityToActivityUnit', 'CapitalCost', 'FixedCost', 'OperationalLife', 'VariableCost'].sort()
    );
  });

  it('handles empty / non-object input', () => {
    expect(frameworkParamNames(null)).toEqual([]);
    expect(frameworkParamNames(undefined)).toEqual([]);
    expect(frameworkParamNames('x')).toEqual([]);
    expect(frameworkParamNames({})).toEqual([]);
  });
});
