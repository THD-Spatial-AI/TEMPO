export const MAP_STYLES = {
  streets: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxzoom: 19
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  },
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri',
        maxzoom: 19
      }
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
  },
  terrain: {
    version: 8,
    sources: {
      terrain: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri, HERE, Garmin, OpenStreetMap contributors',
        maxzoom: 19
      }
    },
    layers: [{ id: 'terrain', type: 'raster', source: 'terrain' }]
  },
  dark: {
    version: 8,
    sources: {
      dark: {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxzoom: 17
      }
    },
    layers: [{ id: 'dark', type: 'raster', source: 'dark' }]
  }
};

export const MAP_STYLE_NAMES = {
  streets: 'Streets',
  satellite: 'Satellite',
  terrain: 'Terrain',
  dark: 'Dark'
};
