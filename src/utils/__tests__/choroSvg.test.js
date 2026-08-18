import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { buildChoroplethSVG, buildTechPieMapSVG, buildNodeMapSVG, buildTransmissionMapSVG } from '../choroSvg';

const geo = JSON.parse(readFileSync('public/data/geo/chile_communes.geojson', 'utf8'));

// Communes known to exist in the bundled GeoJSON (Arica region)
const metrics = {
  demand:    { Arica: 29007, Putre: 122, Camarones: 46 },
  unmet:     { Arica: 0, Putre: 122, Camarones: 20 },
  demandMet: { Arica: 1, Putre: 0, Camarones: 0.56 },
};

describe('buildChoroplethSVG', () => {
  it('renders matched communes as shaded paths (seq metric)', () => {
    const svg = buildChoroplethSVG(geo, metrics, 'demand', { label: 'Demand', unit: 'MWh' });
    expect(svg.startsWith('<svg')).toBe(true);
    // one <path> per matched commune (3)
    expect((svg.match(/<path /g) || []).length).toBe(3);
    expect(svg).toContain('fill="rgb(');       // ramp color applied
    expect(svg).toContain('<linearGradient');  // legend present
    expect(svg).toContain('Demand');           // title
    expect(svg).toContain('<title>Arica: ');   // hover tooltip
  });

  it('handles pct metric domain 0..1', () => {
    const svg = buildChoroplethSVG(geo, metrics, 'demandMet', { kind: 'pct', ramp: ['#d73027', '#fee08b', '#1a9850'], label: 'Demand met' });
    expect((svg.match(/<path /g) || []).length).toBe(3);
    expect(svg).toContain('100%'); // legend max for pct
  });

  it('returns a placeholder when no communes match', () => {
    const svg = buildChoroplethSVG(geo, { demand: { Nowhereville: 5 } }, 'demand', {});
    expect(svg).toContain('No commune data');
    expect((svg.match(/<path /g) || []).length).toBe(0);
  });
});

describe('buildTechPieMapSVG', () => {
  const pies = [
    { name: 'TER ARICA', lat: -18.47, lon: -70.30, slices: [{ tech: 'oil', color: '#000000', value: 13207 }] },
    { name: 'PFV EL AGUILA', lat: -18.45, lon: -69.89, slices: [
      { tech: 'pv', color: '#F9FF2C', value: 2013 }, { tech: 'wind', color: '#47D154', value: 900 },
    ] },
  ];

  it('renders one pie per located generator with a tech legend', () => {
    const svg = buildTechPieMapSVG({ geo, communeNames: ['Arica', 'Camarones'], pies, label: 'Tech mix' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Tech mix');            // title
    expect(svg).toContain('<title>TER ARICA</title>');
    expect(svg).toContain('#F9FF2C');             // pv slice colour
    // single-slice pie → circle; multi-slice → paths
    expect(svg).toContain('<circle');
    expect((svg.match(/<path /g) || []).length).toBeGreaterThan(0);
  });

  it('placeholder when no located pies', () => {
    const svg = buildTechPieMapSVG({ geo, pies: [{ name: 'x', lat: NaN, lon: NaN, slices: [] }] });
    expect(svg).toContain('No located generation');
  });
});

describe('buildNodeMapSVG / buildTransmissionMapSVG', () => {
  const nodes = [
    { name: 'TER ARICA', lat: -18.47, lon: -70.30, value: 13207, color: '#000000' },
    { name: 'PFV EL AGUILA', lat: -18.45, lon: -69.89, value: 2013, color: '#F9FF2C' },
  ];
  const links = [{ from: 'TER ARICA', to: 'PFV EL AGUILA', cap: 5000, util: 0.8, ax: -70.30, ay: -18.47, bx: -69.89, by: -18.45 }];

  it('node map draws a circle per located node (tech colours)', () => {
    const svg = buildNodeMapSVG({ geo, communeNames: ['Arica'], nodes, links, colorMode: 'tech', legend: [['oil', '#000000']], label: 'Capacity' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<circle /g) || []).length).toBe(2);
    expect(svg).toContain('<line ');       // transmission line
    expect(svg).toContain('Capacity');
  });

  it('transmission map colours links by utilisation', () => {
    const svg = buildTransmissionMapSVG({ geo, communeNames: ['Arica'], nodes: nodes.map(n => ({ name: n.name, lat: n.lat, lon: n.lon })), links, label: 'TX' });
    expect((svg.match(/<line /g) || []).length).toBeGreaterThanOrEqual(1);
    expect(svg).toContain('stroke="#ea580c"'); // 0.8 util → High-load line colour
  });
});
