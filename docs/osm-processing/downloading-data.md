# Downloading OSM Data

OSM PBF files are the source format for the local data pipeline. Raw OSM data is distributed by [Geofabrik](https://download.geofabrik.de/) in regional extracts updated daily.

---

## Setting up the folder structure

Run these two scripts once before downloading any data:

```bash
python create_folder_structure.py
python create_extract_structure.py
```

This creates the full continent → country → region directory tree under `public/data/countries/` and a mirrored tree under `public/data/osm_extracts/`.

---

## Interactive download

```bash
python download_world_osm.py
```

The script presents an interactive menu:

```
OSM Data Downloader
-------------------
1. Download entire world
2. Download by continent
3. Download by country
4. Download by region
5. Custom selection
```

Navigate the menu and select the area to download. The script fetches the latest PBF file from Geofabrik and saves it to the appropriate folder under `public/data/countries/`.

Progress is shown with a progress bar. Downloads can be interrupted and resumed — partially downloaded files are overwritten on the next run.

---

## Available regions

The script uses `geofabrik_regions_database.json` as its region index. This file contains the full Geofabrik region hierarchy with download URLs. To update the index:

```bash
python download_world_osm.py --update-index
```

---

## File sizes

As a reference for planning disk space:

| Region | Approximate size |
|---|---|
| Germany (full) | ~4 GB |
| France (full) | ~4.5 GB |
| Spain (full) | ~2 GB |
| Bavaria (state) | ~600 MB |
| Bayern / Niederbayern | ~80 MB |
| World (full planet) | ~75 GB |

!!! warning "Planet file"
    Downloading the full planet file requires ~75 GB of disk space and many hours. Only do this if you need global coverage. For most use cases, country or state-level downloads are sufficient.

---

## Verifying downloads

After download, check that the PBF file exists and is not zero-sized:

```bash
python download_world_osm.py --verify Europe/Germany/Bayern
```
