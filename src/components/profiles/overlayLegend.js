// Resource-overlay legend constants (V1, V7). Ranges and colour stops must match
// the palettes in python/renewables_atlas.py `colorize` (6 evenly spaced stops,
// values clipped to [min, max]).

const SOLAR_STOPS = ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#f46d43', '#a50026'];
const WIND_STOPS = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b', '#3f007d'];

/** Atlas layers by id; `source` keys into ATTRIBUTION. */
export const OVERLAY_LAYERS = {
  pvout: { label: 'Solar potential (PVOUT)', unit: 'kWh/kWp/yr', min: 700, max: 2300, stops: SOLAR_STOPS, source: 'gsa' },
  wind100: { label: 'Wind speed 100 m', unit: 'm/s', min: 2, max: 12, stops: WIND_STOPS, source: 'gwa' },
};

/** Licence attribution shown whenever the source is visible (V7). */
export const ATTRIBUTION = {
  gsa: 'Global Solar Atlas 2.0 (Solargis / World Bank–ESMAP), CC BY 4.0',
  gwa: 'Global Wind Atlas (DTU / World Bank–ESMAP), CC BY 4.0',
  flow: 'Wind flow: Open-Meteo.com (ERA5), CC BY 4.0',
};
