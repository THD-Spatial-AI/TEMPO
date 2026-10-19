// Map credits (OSM, Esri and OpenTopoMap terms require visible attribution).
export const ORG_CREDIT = `© ${new Date().getFullYear()} Deggendorf Institute of Technology`;

const OSM = { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' };

export const BASEMAP_CREDITS = {
  streets: [OSM],
  satellite: [{ text: 'Powered by Esri', href: 'https://www.esri.com' }, { text: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' }, OSM],
  terrain: [{ text: 'Powered by Esri', href: 'https://www.esri.com' }, { text: 'Esri, HERE, Garmin, USGS, FAO, NOAA' }, OSM],
  dark: [OSM, { text: 'SRTM' }, { text: 'Map style © OpenTopoMap (CC-BY-SA)', href: 'https://opentopomap.org' }],
};

// HTML string for MapLibre / Leaflet attribution controls
export const ORG_CREDIT_HTML = `<a href="https://www.th-deg.de" target="_blank" rel="noopener">${ORG_CREDIT}</a>`;
export const OSM_CREDIT_HTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
