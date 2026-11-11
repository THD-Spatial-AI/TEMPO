import { describe, it, expect } from 'vitest';
import { getTechColor, createLocationIcon, getLinkColor } from '../mapVisuals';
import { getTechColor as getTechColorFromTechUtils } from '../techUtils';

describe('getTechColor', () => {
  it('uses the colour defined on the tech', () => {
    const techMap = { my_tech: { essentials: { color: '#102030' } } };
    expect(getTechColor('my_tech', techMap)).toEqual([16, 32, 48, 220]);
  });

  it('gives unknown techs a stable, non-grey colour', () => {
    const a = getTechColor('substation_conversion');
    expect(getTechColor('substation_conversion')).toEqual(a);
    expect(a).not.toEqual([158, 158, 158, 200]);
  });

  it('gives different unknown techs different colours', () => {
    const names = ['substation_conversion', 'electrolyser', 'heat_pump', 'chp', 'geothermal', 'ac_transmission'];
    const colours = new Set(names.map(n => getTechColor(n).join(',')));
    expect(colours.size).toBe(names.length);
  });

  it('is the same function from techUtils (one palette for every view)', () => {
    expect(getTechColorFromTechUtils).toBe(getTechColor);
  });
});

describe('createLocationIcon', () => {
  it('draws one pie slice per technology', () => {
    const icon = createLocationIcon({ techs: { pv: {}, wind: {}, battery: {} } }, {});
    expect(decodeURIComponent(icon.url).match(/<path /g)).toHaveLength(3);
  });

  it('reuses cached icons for identical locations', () => {
    const cache = new Map();
    const a = createLocationIcon({ id: 1, techs: { pv: {} } }, {}, cache);
    const b = createLocationIcon({ id: 2, techs: { pv: {} } }, {}, cache);
    expect(b).toBe(a);
  });
});

describe('getLinkColor', () => {
  it('colours voltage-named links by voltage and keeps alpha', () => {
    expect(getLinkColor({ techs: { '220_kv': {} } }, 100)[3]).toBe(100);
  });

  it('falls back to indigo when nothing is known', () => {
    expect(getLinkColor({})).toEqual([99, 102, 241, 220]);
  });
});
