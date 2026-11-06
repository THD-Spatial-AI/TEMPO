// Inc 4 acceptance: Arica estimate -> edit one substation's GWh -> the CSV column the
// import writes carries that GWh over a full year (+-0.5 %). Runs the renderer helpers
// (src/services/substationDemand.js) against the real demand service.
//
// The service must be running:
//   <demand-venv>\Scripts\python.exe -m uvicorn demand_service:app --app-dir python --port 5006
// Run (vite-node resolves the extension-less renderer imports):
//   npx vite-node scripts/smoke_demand_panel.mjs [http://127.0.0.1:5006]
import {
  estimatePayload, applyDemandEdits, demandByOsmId, shapeWithFallback, seriesColumns,
} from '../src/services/substationDemand.js';
import { estimateDemand } from '../src/services/demandServiceClient.js';

const base = (process.argv[2] || 'http://127.0.0.1:5006').replace(/\/$/, '');
globalThis.window = { electronAPI: { getServiceURLs: async () => ({ demand: { running: true, url: base } }) } };

const UA = { 'User-Agent': 'TEMPO-demand-smoke' };
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'];
const YEAR = 2024;
const HOURS = 8784; // 2024 is a leap year

async function fetchArea() {
  const q = new URLSearchParams({ q: 'Arica, Chile', format: 'jsonv2', polygon_geojson: '1', limit: '1' });
  const [hit] = await (await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: UA })).json();
  // No countryCode: the boundary built by the panel may lack one; estimatePayload stamps it.
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Arica' }, geometry: hit.geojson }] };
}

function bounds(fc) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  fc.features.forEach(f => walk(f.geometry.coordinates));
  return [x0, y0, x1, y1];
}

// Max of ';'-separated voltages in kV (OSM tags volts), as the app's parsed voltage_kv.
const kv = v => Math.max(0, ...String(v || '').split(';').map(Number).filter(Number.isFinite)
  .map(x => (x > 1000 ? x / 1000 : x))) || null;

async function fetchSubstations([minlon, minlat, maxlon, maxlat]) {
  const bb = `${minlat},${minlon},${maxlat},${maxlon}`;
  const q = `[out:json][timeout:120];(node["power"="substation"](${bb});way["power"="substation"](${bb}););out center tags;`;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: 'POST', body: q, headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.elements.map(el => {
        const lon = el.lon ?? el.center?.lon; const lat = el.lat ?? el.center?.lat;
        if (lon == null || lat == null) return null;
        const t = el.tags || {};
        return { id: `${el.type}/${el.id}`, lon, lat, name: t.name || `${el.type}/${el.id}`,
          substation: t.substation || null, voltage_kv: kv(t.voltage) };
      }).filter(Boolean);
    } catch (err) {
      console.log(`  mirror failed ${url}: ${err.message}`);
    }
  }
  throw new Error('all Overpass mirrors failed');
}

const area = await fetchArea();
const subs = await fetchSubstations(bounds(area));
console.log(`${subs.length} substations`);

const res = await estimateDemand(estimatePayload({
  boundary: area, substations: subs, modelYear: YEAR, country: 'CL', family: 'classic', landuse: true,
}));
if (res.error) throw new Error(`estimate failed: ${res.error}`);
console.log(`estimate total ${res.totalGWh.toFixed(1)} GWh, ${res.substations.filter(s => s.seed).length} seeds`);

const first = applyDemandEdits(res, {}).find(r => r.annual_gwh > 0);
if (!first) throw new Error('no seed with demand');
const editedGwh = first.annual_gwh * 2;
const rows = applyDemandEdits(res, { [first.id]: { gwh: editedGwh } });
const byId = demandByOsmId(rows);
const ids = Object.keys(byId);

const shaped = await shapeWithFallback({
  substations: ids.map(id => ({ id, avg_mw: byId[id].avgMW, mix: byId[id].mix })),
  start: `${YEAR}-01-01`, end: `${YEAR}-12-31`, resolution: '60min',
  country: 'CL', family: 'classic', latitude: res.latitude,
});
const nameOf = Object.fromEntries(rows.map(r => [r.id, r.name]));
const { colBySub, data } = seriesColumns({
  datetimes: shaped.datetimes, series: shaped.series, subs: ids.map(id => ({ key: id, name: nameOf[id] })),
});

const col = colBySub[ids.indexOf(first.id)];
const csvGwh = -data.reduce((s, r) => s + r[col], 0) / 1000;
const expected = (editedGwh * HOURS) / 8760; // avg MW is defined on 8760 h
const err = Math.abs(csvGwh - expected) / expected;
console.log(`source ${shaped.source}; ${first.name}: ${first.annual_gwh.toFixed(3)} -> edited ${editedGwh.toFixed(3)} GWh`);
console.log(`column ${col}: ${csvGwh.toFixed(3)} GWh over ${data.length} h vs expected ${expected.toFixed(3)} (err ${(err * 100).toFixed(3)} %)`);
if (shaped.source !== 'demandlib') throw new Error('expected the service shape, got the synthetic fallback');
if (data.length !== HOURS || !Number.isFinite(err) || err > 0.005) throw new Error('FAIL');
console.log('OK');
