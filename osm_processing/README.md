# OSM Power Infrastructure Data Processing

This folder contains scripts to download and extract power infrastructure data from OpenStreetMap (OSM).

## 📁 Files

- **`create_folder_structure.py`** - Creates organized folder structure for OSM data (countries/continents)
- **`create_extract_structure.py`** - Mirrors folder structure for extracted GeoJSON files
- **`download_world_osm.py`** - Interactive downloader for OSM data from Geofabrik
- **`extract_osm_region.py`** - Extracts power infrastructure from OSM files to GeoJSON
- **`requirements.txt`** - Python dependencies

## 🚀 Quick Start

### 1. Setup Folders

```bash
python create_folder_structure.py
python create_extract_structure.py
```

This creates:
- `public/data/countries/` - Organized by Continent/Country/Region
- `public/data/osm_extracts/` - Mirrored structure for GeoJSON outputs

### 2. Download OSM Data

```bash
python download_world_osm.py
```

Interactive menu to download data by:
- Entire world
- By continent
- By country
- Custom selection

### 3. Extract Power Infrastructure

```bash
python extract_osm_region.py <Continent> <Country> [Region] [Subregion]
```

**Examples:**
```bash
python extract_osm_region.py Europe Germany Baden_Wuerttemberg
python extract_osm_region.py Europe Germany Bayern Niederbayern
python extract_osm_region.py Europe Spain Andalucia
python extract_osm_region.py South_America Chile Metropolitana
```

## 📊 Extracted Data

Each region generates GeoJSON files with:

- **Substations** - Power substations and stations with voltage info
- **Power Plants** - Generation facilities (solar, wind, hydro, etc.)
- **Power Lines** - Transmission lines with voltage ratings
- **Administrative Boundaries** - Countries, states, districts, communes

## 🗺️ Data Sources

- OSM Data: https://download.geofabrik.de/
- Format: PBF (Protocol Buffer Format)
- License: ODbL 1.0

## 📦 Dependencies

```bash
pip install osmium requests tqdm
```

Or use the requirements.txt:
```bash
pip install -r requirements.txt
```

## 🌍 Folder Structure

```
public/data/
├── countries/
│   ├── Africa/
│   ├── Asia/
│   ├── Europe/
│   │   └── Germany/
│   │       ├── Bayern/
│   │       │   ├── Niederbayern/
│   │       │   │   └── niederbayern-latest.osm.pbf
│   │       │   └── ...
│   │       └── Baden_Wuerttemberg/
│   │           └── baden-wuerttemberg-latest.osm.pbf
│   └── ...
└── osm_extracts/
    └── Europe/
        └── Germany/
            └── Bayern/
                └── Niederbayern/
                    ├── niederbayern_substations.geojson
                    ├── niederbayern_power_plants.geojson
                    ├── niederbayern_power_lines.geojson
                    ├── niederbayern_communes.geojson
                    └── niederbayern_districts.geojson
```

## ⚙️ Processing Times

- Small regions (~50MB): 2-5 minutes
- Medium regions (~200MB): 5-15 minutes
- Large regions (~600MB): 15-30 minutes
- Very large (1GB+): 30-60 minutes

## 🎯 Use Cases

- Energy system modeling
- Grid infrastructure analysis
- Renewable energy planning
- Location optimization for new facilities
- Network connectivity analysis
