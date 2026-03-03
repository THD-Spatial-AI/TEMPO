# Extracting Power Infrastructure

Once you have downloaded the OSM PBF files, the extraction script reads them and produces GeoJSON files containing only power infrastructure features.

---

## Running the extraction

```bash
python extract_osm_region.py <Continent> <Country> [Region] [Subregion]
```

**Examples:**

```bash
# Federal state
python extract_osm_region.py Europe Germany Bayern

# Administrative district
python extract_osm_region.py Europe Germany Bayern Niederbayern

# Country level (uses the full country PBF)
python extract_osm_region.py Europe Spain

# Other continents
python extract_osm_region.py South_America Chile Metropolitana
```

The `Continent`, `Country`, `Region`, and `Subregion` arguments must match the folder names created by `create_folder_structure.py` (case-sensitive, underscores instead of spaces).

---

## Output files

For each region the script produces four GeoJSON files in `public/data/osm_extracts/<path>/`:

| File | OSM tags | Description |
|---|---|---|
| `*_substations.geojson` | `power=substation`, `power=station` | Transformer stations with voltage metadata |
| `*_power_plants.geojson` | `power=plant` | Generation facilities with type and capacity |
| `*_power_lines.geojson` | `power=line`, `power=cable` | HV/MV transmission and distribution lines |
| `*_boundaries.geojson` | `boundary=administrative` | Country, state, district, and commune polygons |

---

## Extracted properties

### Substations

| Property | Description |
|---|---|
| `name` | OSM name tag |
| `voltage` | Voltage in kV (parsed from `voltage` tag) |
| `operator` | Grid operator if tagged |
| `osm_id` | OSM way or relation ID |

### Power plants

| Property | Description |
|---|---|
| `name` | Plant name |
| `plant:source` | Energy source (`solar`, `wind`, `hydro`, `gas`, etc.) |
| `generator:output:electricity` | Installed capacity in MW (if tagged) |
| `operator` | |

### Power lines

| Property | Description |
|---|---|
| `name` | Line name or identifier |
| `voltage` | Operating voltage in kV |
| `cables` | Number of cables |
| `frequency` | AC frequency (blank = DC) |

---

## Updating a region

To re-extract after downloading a newer PBF file:

```bash
python update_database_for_region.py Europe Germany Bayern
```

This re-runs the extraction and, if PostGIS is configured, re-imports the updated GeoJSON files into the database.

---

## Processing time

Extraction time scales with the PBF file size. As a rough guide:

| Area | Extraction time |
|---|---|
| Small district (~80 MB) | < 1 minute |
| German federal state (~600 MB) | 2–5 minutes |
| Full country (~4 GB) | 15–30 minutes |
