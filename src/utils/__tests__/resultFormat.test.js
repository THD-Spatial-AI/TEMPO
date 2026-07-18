import { describe, it, expect } from 'vitest';
import {
  techColor, fmtNum, fmtPower, fmtEnergy, fmtCost, autoScale,
  classifyTech, linkTechBase, calliopeLocName, parseLTC,
} from '../resultFormat';

describe('resultFormat', () => {
  it('techColor matches known techs and falls back to slate', () => {
    expect(techColor('solar_pv')).toBe('#FDB813');
    expect(techColor('offshore_wind_onshore')).toBe('#00A8CC'); // substring match
    expect(techColor('')).toBe('#94A3B8');
    expect(techColor('totally_unknown')).toBe('#94A3B8');
  });

  it('fmtNum / fmtPower / fmtEnergy / fmtCost scale by SI and append units', () => {
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(1500)).toBe('1.5k');
    expect(fmtNum(2_500_000)).toBe('2.5M');
    expect(fmtPower(1500)).toBe('1.5 GW');
    expect(fmtPower(0.5)).toBe('500.0 kW');
    expect(fmtEnergy(2_000_000)).toBe('2.0 TWh');
    expect(fmtCost(2_000_000_000)).toBe('2.0 G€');
    expect(fmtCost(500)).toBe('500.0 €');
  });

  it('autoScale returns divisor + unit per base unit', () => {
    expect(autoScale(1500, 'MW')).toEqual({ div: 1e3, unit: 'GW' });
    expect(autoScale(0.5, 'MW')).toEqual({ div: 1e-3, unit: 'kW' });
    expect(autoScale(5_000_000_000, '€')).toEqual({ div: 1e9, unit: 'G€' });
    expect(autoScale(10, 'widgets')).toEqual({ div: 1, unit: 'widgets' });
  });

  it('classifyTech falls back by name heuristics', () => {
    expect(classifyTech('pFV:CHERCAN')).toBe('tx');   // colon = link
    expect(classifyTech('solar_pv')).toBe('gen');
    expect(classifyTech('battery')).toBe('stor');
    expect(classifyTech('h2_electrolyser')).toBe('h2');
    expect(classifyTech('demand')).toBe('demand');       // \bdemand\b needs a word boundary
    expect(classifyTech('power_demand')).toBe('other');  // '_demand' has no boundary — matches original behaviour
    expect(classifyTech('mystery_widget')).toBe('other');
  });

  it('linkTechBase / parseLTC / calliopeLocName parse Calliope keys', () => {
    expect(linkTechBase('pFV:CHERCAN')).toBe('pFV');
    expect(parseLTC('Berlin::solar_pv::electricity')).toEqual({ loc: 'Berlin', tech: 'solar_pv', carrier: 'electricity' });
    expect(parseLTC('Berlin::solar_pv')).toEqual({ loc: 'Berlin', tech: 'solar_pv', carrier: '' });
    expect(calliopeLocName('Región del Bío-Bío')).toBe('regi_n_del_b_o-b_o');
    expect(calliopeLocName('  ')).toBe('unknown');
  });
});
