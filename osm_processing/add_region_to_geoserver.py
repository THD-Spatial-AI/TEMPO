"""
Add a new country/region to GeoServer in one step.

This script orchestrates the full pipeline:
  1. Download  – fetch OSM PBF file from Geofabrik
  2. Extract   – parse power infrastructure & admin boundaries into GeoJSON
  3. Upload    – push GeoJSON data into PostGIS (multi-region, additive)

The PostGIS tables are shared across all regions, so running this script for
multiple countries is safe and additive – existing data is never deleted unless
you re-import the same region.

Usage (interactive):
    python add_region_to_geoserver.py

Usage (non-interactive / scripted):
    python add_region_to_geoserver.py Europe Germany
    python add_region_to_geoserver.py Europe Germany Bayern
    python add_region_to_geoserver.py South_America Chile Metropolitana
    python add_region_to_geoserver.py Europe Germany Bayern Niederbayern

Flags:
    --skip-download   Skip download step (PBF already present)
    --skip-extract    Skip extract step (GeoJSON already present)
    --skip-upload     Skip upload step (dry run)
    --list            List all available regions and exit
"""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

# Windows packaged installs may default to cp1252 for stdout/stderr.
# This script prints box-drawing characters; force UTF-8 with replacement
# so logging never crashes the pipeline.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Resolve sibling module imports ────────────────────────────────────────────
_DIR = Path(__file__).parent
sys.path.insert(0, str(_DIR))

from download_world_osm import WorldOSMDownloader
from extract_osm_region import DataExtractor, extract_single_region
from upload_to_postgis import (
    DB_CONFIG, create_tables, clear_region_data,
    load_substations, load_power_plants, load_power_lines, load_boundaries
)

import psycopg2


# ══════════════════════════════════════════════════════════════════════════════
# Pipeline stages
# ══════════════════════════════════════════════════════════════════════════════

def _geojson_dir(region_tuple):
    """Return the osm_extracts directory for a region tuple (may not exist yet)."""
    import os
    project_dir = Path(__file__).parent.parent
    base = Path(os.environ["TEMPO_DATA_DIR"]) if os.environ.get("TEMPO_DATA_DIR") else project_dir / "public" / "data"
    path_parts  = list(region_tuple)
    d = base / "osm_extracts"
    for part in path_parts:
        d = d / part
    return d


def _geojsons_exist(region_tuple):
    """Return True if the core GeoJSON files are already present for this region."""
    d = _geojson_dir(region_tuple)
    if not d.exists():
        return False
    region_name = region_tuple[-1].lower()
    required = [
        f"{region_name}_substations.geojson",
        f"{region_name}_power_plants.geojson",
        f"{region_name}_power_lines.geojson",
    ]
    return all((d / f).exists() for f in required)


def _pbf_exists(region_tuple):
    """Return True if a PBF file is already present for this region (any level)."""
    import os
    project_dir   = Path(__file__).parent.parent
    base          = Path(os.environ["TEMPO_DATA_DIR"]) if os.environ.get("TEMPO_DATA_DIR") else project_dir / "public" / "data"
    path_parts    = list(region_tuple)
    countries_root = base / "countries"
    for depth in range(len(path_parts), 0, -1):
        search_dir = countries_root.joinpath(*path_parts[:depth])
        if list(search_dir.glob("*.osm.pbf")):
            return True
    return False


def _is_port_open(host, port, timeout=1.0):
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


def _find_geoserver_compose_file():
    """Locate docker-compose.geoserver.yml in dev and packaged layouts."""
    script_root = Path(os.environ.get("TEMPO_OSM_SCRIPTS", Path(__file__).parent.parent))
    candidates = [
        script_root / "geoserver" / "docker-compose.geoserver.yml",
        script_root / "docker-compose.geoserver.yml",
        Path(__file__).parent.parent / "geoserver" / "docker-compose.geoserver.yml",
        Path(__file__).parent.parent / "docker-compose.geoserver.yml",
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def _ensure_postgis_running():
    """Best-effort start of PostGIS/GeoServer stack when DB is down."""
    host = DB_CONFIG.get('host', 'localhost')
    port = int(DB_CONFIG.get('port', 5432))
    if _is_port_open(host, port):
        return True

    compose_file = _find_geoserver_compose_file()
    if not compose_file:
        print("⚠️  GeoServer compose file not found; cannot auto-start PostGIS.")
        return False

    print("ℹ️  PostgreSQL is not reachable. Attempting to start TEMPO GeoServer/PostGIS Docker services…")
    try:
        subprocess.run(['docker', 'info'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        print("⚠️  Docker is not available/running. Please start Docker Desktop and retry.")
        return False

    # First try to start already-existing containers (common after upgrades).
    for name in ('calliope-postgis', 'calliope-geoserver'):
        try:
            subprocess.run(['docker', 'start', name], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    if _is_port_open(host, port):
        print("✓ PostGIS is up")
        return True

    # If not running yet, bring up via compose.
    try:
        compose_cmd = ['docker', 'compose', '-f', str(compose_file), 'up', '-d', '--remove-orphans', 'calliope-postgis', 'calliope-geoserver']
        proc = subprocess.run(
            compose_cmd,
            cwd=str(compose_file.parent),
            check=False,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            out = (proc.stdout or '') + '\n' + (proc.stderr or '')
            # Container-name conflict usually means container already exists and just needs start.
            if 'already in use by container' in out.lower() or 'conflict' in out.lower():
                for name in ('calliope-postgis', 'calliope-geoserver'):
                    subprocess.run(['docker', 'start', name], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                print(f"⚠️  Failed to start GeoServer/PostGIS stack: {out.strip()}")
                return False
    except Exception as e:
        print(f"⚠️  Failed to start GeoServer/PostGIS stack: {e}")
        return False

    deadline = time.time() + 90
    while time.time() < deadline:
        if _is_port_open(host, port):
            print("✓ PostGIS is up")
            return True
        time.sleep(2)

    print("⚠️  PostGIS did not become ready in time.")
    return False


def stage_download(region_tuple):
    """Download the OSM PBF file(s) for the given region tuple."""
    downloader = WorldOSMDownloader()
    print("\n" + "─" * 70)
    print("STAGE 1 / 3 — DOWNLOAD")
    print("─" * 70)
    downloader.download_batch([region_tuple])
    return downloader


def stage_extract(region_tuple):
    """Extract power infrastructure from the PBF file into GeoJSON.
    Skips automatically if all GeoJSON files are already present.
    """
    print("\n" + "─" * 70)
    print("STAGE 2 / 3 — EXTRACT")
    print("─" * 70)

    if _geojsons_exist(region_tuple):
        d = _geojson_dir(region_tuple)
        print(f"⏭  GeoJSON files already exist in:")
        print(f"   {d}")
        print("   Skipping extraction. Use --force-extract to re-extract.")
        return True

    project_dir = Path(__file__).parent.parent
    continent = region_tuple[0]
    country   = region_tuple[1]
    region    = region_tuple[2] if len(region_tuple) > 2 else None
    subregion = region_tuple[3] if len(region_tuple) > 3 else None

    path_parts = [continent, country]
    if region:
        path_parts.append(region)
    if subregion:
        path_parts.append(subregion)

    # Search for the downloaded PBF file (most specific level first, then up)
    import os
    data_root = Path(os.environ["TEMPO_DATA_DIR"]) if os.environ.get("TEMPO_DATA_DIR") else (project_dir / "public" / "data")
    countries_root = data_root / "countries"
    osm_file = None

    for depth in range(len(path_parts), 0, -1):
        search_dir = countries_root.joinpath(*path_parts[:depth])
        pbf_files  = list(search_dir.glob("*.osm.pbf"))
        if pbf_files:
            # Prefer the file whose name matches the leaf directory
            leaf = path_parts[depth - 1].lower().replace('_', '-')
            best = next((f for f in pbf_files if leaf in f.name.lower()), pbf_files[0])
            osm_file = best
            if depth < len(path_parts):
                print(f"ℹ️  Using higher-level PBF: {osm_file.name}")
            break

    if not osm_file:
        print(f"❌ No PBF file found for {' > '.join(path_parts)}")
        print("   Run stage 1 (download) first, or check public/data/countries/")
        return False

    region_name = path_parts[-1].lower()
    extract_single_region(osm_file, path_parts, region_name, project_dir)
    return True


def stage_upload(region_tuple):
    """Upload the extracted GeoJSON files to PostGIS."""
    print("\n" + "─" * 70)
    print("STAGE 3 / 3 — UPLOAD TO POSTGIS")
    print("─" * 70)

    project_dir = Path(__file__).parent.parent
    continent = region_tuple[0]
    country   = region_tuple[1]
    region    = region_tuple[2] if len(region_tuple) > 2 else None
    subregion = region_tuple[3] if len(region_tuple) > 3 else None

    path_parts = [continent, country]
    if region:
        path_parts.append(region)
    if subregion:
        path_parts.append(subregion)

    region_path = '/'.join(path_parts)
    region_name = path_parts[-1].lower()

    data_dir = _geojson_dir(tuple(path_parts))

    if not data_dir.exists():
        print(f"❌ No extracted data found at {data_dir}")
        print("   Run stage 2 (extract) first.")
        return False

    # Connect
    _ensure_postgis_running()
    try:
        print(f"Connecting to PostgreSQL ({DB_CONFIG['host']}:{DB_CONFIG['port']})...")
        conn = psycopg2.connect(**DB_CONFIG)
        print("✓ Connected")
    except Exception as e:
        print(f"❌ Cannot connect to PostgreSQL: {e}")
        print("   Check DB_CONFIG in upload_to_postgis.py or ensure PostgreSQL is running.")
        print("ℹ️  Continuing in local-file mode (GeoJSON saved under TEMPO data directory).")
        return True

    try:
        create_tables(conn)
        clear_region_data(conn, region_path)
        print()

        totals = {}

        for layer, loader, table in [
            ('substations', load_substations,    None),
            ('powerPlants', load_power_plants,   None),
            ('powerLines',  load_power_lines,    None),
            ('communes',    load_boundaries,     'osm_communes'),
            ('districts',   load_boundaries,     'osm_districts'),
        ]:
            fname_map = {
                'substations': f"{region_name}_substations.geojson",
                'powerPlants': f"{region_name}_power_plants.geojson",
                'powerLines':  f"{region_name}_power_lines.geojson",
                'communes':    f"{region_name}_communes.geojson",
                'districts':   f"{region_name}_districts.geojson",
            }
            fpath = data_dir / fname_map[layer]

            if table:
                count = loader(conn, fpath, table, region_path, country, continent)
            else:
                count = loader(conn, fpath, region_path, country, continent)

            label = fname_map[layer].split('_', 1)[1].replace('.geojson', '').replace('_', ' ').title()
            print(f"  ✓ {label:<15} {count} features")
            totals[layer] = count

        conn.close()
        print(f"\n✓ Upload complete – {sum(totals.values())} total features for '{region_path}'")
        return True

    except Exception as e:
        import traceback
        print(f"\n❌ Upload error: {e}")
        traceback.print_exc()
        conn.rollback()
        conn.close()
        return False


def run_pipeline(region_tuple, skip_download=False, skip_extract=False, skip_upload=False, force_extract=False):
    """Run the full download → extract → upload pipeline for one region.

    Auto-detection (overridable with flags):
      - Download is skipped automatically if a PBF already exists.
      - Extract is skipped automatically if all GeoJSON files already exist.
        Use force_extract=True (or --force-extract on CLI) to override.
    """
    label = ' > '.join(region_tuple)
    print("\n" + "═" * 70)
    print(f"PIPELINE: {label}")
    print("═" * 70)
    t0 = time.time()

    # Auto-skip download if a PBF file already exists
    if not skip_download:
        if _pbf_exists(region_tuple):
            print("\n[Stage 1/3] PBF file already present — skipping download.")
        else:
            stage_download(region_tuple)
    else:
        print("\n[Stage 1/3] Download skipped (--skip-download).")

    # Auto-skip extract if GeoJSON files already exist (unless force_extract)
    if not skip_extract:
        if not force_extract and _geojsons_exist(region_tuple):
            d = _geojson_dir(region_tuple)
            print(f"\n[Stage 2/3] GeoJSON files already exist in:")
            print(f"   {d}")
            print("   Skipping extraction. Use --force-extract to re-extract.")
        else:
            ok = stage_extract(region_tuple)
            if not ok:
                print("\n❌ Pipeline aborted at extract stage.")
                return False
    else:
        print("\n[Stage 2/3] Extract skipped (--skip-extract).")

    if not skip_upload:
        ok = stage_upload(region_tuple)
        if not ok:
            print("\n❌ Pipeline aborted at upload stage.")
            return False
    else:
        print("\n[Stage 3/3] Upload skipped.")

    elapsed = time.time() - t0
    print(f"\n{'═' * 70}")
    print(f"✓ PIPELINE COMPLETE — {label}")
    print(f"  Total time: {elapsed:.1f}s")
    print("═" * 70)
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Interactive menu
# ══════════════════════════════════════════════════════════════════════════════

def _group_regions(all_regions):
    """Group flat region list into {continent: {country: [tuples]}}."""
    grouped = {}
    for r in all_regions:
        cont = r[0]
        ctry = r[1] if len(r) > 1 else None
        if ctry is None:
            continue
        grouped.setdefault(cont, {}).setdefault(ctry, []).append(r)
    return grouped


def _pick_from_list(items, label, zero_label="Back"):
    """Generic numbered picker. Returns chosen item or None."""
    for i, item in enumerate(items, 1):
        print(f"  {i:>3}. {item}")
    print(f"    0. {zero_label}")
    raw = input("\nEnter number: ").strip()
    if raw == "0":
        return None
    try:
        idx = int(raw) - 1
        if 0 <= idx < len(items):
            return items[idx]
    except ValueError:
        pass
    print("❌ Invalid selection")
    return None


def interactive_menu():
    downloader = WorldOSMDownloader()
    all_regions = downloader.get_all_regions()
    grouped = _group_regions(all_regions)

    print("\n" + "═" * 70)
    print("  ADD REGION TO GEOSERVER — Full Pipeline (download → extract → upload)")
    print("═" * 70)

    # Ask which pipeline stages to run
    print("\nWhich steps do you want to run?")
    print("  1. Full pipeline  (download + extract + upload)  ← recommended")
    print("  2. Download only")
    print("  3. Extract only   (PBF already downloaded)")
    print("  4. Upload only    (GeoJSON already extracted)")
    print("  0. Exit")

    mode = input("\nChoice: ").strip()
    if mode == "0":
        return

    skip_download = mode in ("3", "4")
    skip_extract  = mode in ("2", "4")
    skip_upload   = mode in ("2", "3")

    # Select scope
    print("\n" + "─" * 70)
    print("SCOPE — what do you want to add?")
    print("─" * 70)
    print("  1. Single country / region")
    print("  2. Entire continent")
    print("  3. Multiple countries (comma-separated codes)")
    print("  0. Back")

    scope = input("\nChoice: ").strip()
    if scope == "0":
        return

    regions_to_process = []

    # ── Single country/region ──────────────────────────────────────────────
    if scope == "1":
        cont_list = sorted(grouped.keys())
        print("\n🌍 SELECT CONTINENT:\n")
        cont = _pick_from_list([c.replace('_', ' ') for c in cont_list], "Continent")
        if cont is None:
            return
        cont_key = cont_list[[c.replace('_', ' ') for c in cont_list].index(cont)]

        country_dict = grouped[cont_key]
        country_list = sorted(country_dict.keys())
        print(f"\n🏳 SELECT COUNTRY  ({cont_key.replace('_',' ')}):\n")
        cname = _pick_from_list([c.replace('_', ' ') for c in country_list], "Country")
        if cname is None:
            return
        ckey = country_list[[c.replace('_', ' ') for c in country_list].index(cname)]

        sub_regions = country_dict[ckey]

        if len(sub_regions) == 1:
            # Country has no sub-regions - just one entry at country level
            regions_to_process = sub_regions
        else:
            print(f"\n📍 {ckey.replace('_',' ')} has {len(sub_regions)} sub-regions in Geofabrik.")
            print("  1. Download entire country (all sub-regions)")
            print("  2. Choose a specific sub-region")
            print("  0. Back")
            sub_choice = input("\nChoice: ").strip()
            if sub_choice == "0":
                return
            elif sub_choice == "1":
                regions_to_process = sub_regions
            elif sub_choice == "2":
                sub_labels = [' > '.join(r[2:]) or '(country-level)' for r in sub_regions]
                print(f"\n📍 SELECT SUB-REGION:\n")
                picked = _pick_from_list(sub_labels, "Sub-region")
                if picked is None:
                    return
                idx = sub_labels.index(picked)
                regions_to_process = [sub_regions[idx]]
            else:
                print("❌ Invalid")
                return

    # ── Entire continent ───────────────────────────────────────────────────
    elif scope == "2":
        cont_list = sorted(grouped.keys())
        print("\n🌍 SELECT CONTINENT:\n")
        cont = _pick_from_list([c.replace('_', ' ') for c in cont_list], "Continent")
        if cont is None:
            return
        cont_key = cont_list[[c.replace('_', ' ') for c in cont_list].index(cont)]
        regions_to_process = all_regions  # filtered below
        regions_to_process = [r for r in all_regions if r[0] == cont_key]
        print(f"\n  → {len(regions_to_process)} regions selected in {cont_key.replace('_',' ')}")

    # ── Multiple countries ─────────────────────────────────────────────────
    elif scope == "3":
        print("\nEnter region codes separated by commas.")
        print("Format: Continent/Country  or  Continent/Country/Region")
        print("Examples:  Europe/Germany, South_America/Chile, Europe/Spain/Andalucia\n")
        raw = input("Codes: ").strip()
        for code in raw.split(','):
            parts = tuple(p.strip() for p in code.strip().split('/') if p.strip())
            if len(parts) < 2:
                print(f"  ⚠ Skipping '{code}' (need at least Continent/Country)")
                continue
            matches = [r for r in all_regions
                       if r[:len(parts)] == parts or r == parts]
            if matches:
                regions_to_process.extend(matches)
                print(f"  ✓ '{'/'.join(parts)}' → {len(matches)} region(s)")
            else:
                print(f"  ❌ '{'/'.join(parts)}' not found")
        if not regions_to_process:
            print("No valid regions selected.")
            return
    else:
        print("❌ Invalid scope")
        return

    # ── Confirmation ──────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print(f"READY TO PROCESS {len(regions_to_process)} REGION(S):")
    print("─" * 70)
    for r in regions_to_process[:15]:
        print(f"  • {' > '.join(r)}")
    if len(regions_to_process) > 15:
        print(f"  … and {len(regions_to_process) - 15} more")
    print()
    print(f"Steps: {'download ' if not skip_download else ''}{'extract ' if not skip_extract else ''}{'upload' if not skip_upload else '(no upload)'}")
    confirm = input("\nStart? (yes/no): ").strip().lower()
    if confirm not in ('yes', 'y'):
        print("❌ Cancelled")
        return

    # ── Run pipeline for each region ─────────────────────────────────────
    ok_count = 0
    fail_count = 0
    t_total = time.time()

    for region_tuple in regions_to_process:
        ok = run_pipeline(region_tuple,
                          skip_download=skip_download,
                          skip_extract=skip_extract,
                          skip_upload=skip_upload)
        if ok:
            ok_count += 1
        else:
            fail_count += 1

    elapsed = time.time() - t_total
    print("\n" + "═" * 70)
    print("BATCH COMPLETE")
    print("═" * 70)
    print(f"  ✓ Success : {ok_count}")
    print(f"  ❌ Failed  : {fail_count}")
    print(f"  ⏱  Time    : {elapsed:.1f}s")
    print("═" * 70)

    if ok_count > 0:
        print("\nQuery your new data via the backend API:")
        for r in regions_to_process[:3]:
            path = '/'.join(r)
            print(f"  curl 'http://localhost:8082/api/osm/osm_substations?region={path}'")
        print("\nOr load all regions: curl 'http://localhost:8082/api/osm/regions'")


# ══════════════════════════════════════════════════════════════════════════════
# CLI entry point
# ══════════════════════════════════════════════════════════════════════════════

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]

    skip_download  = '--skip-download'  in flags
    skip_extract   = '--skip-extract'   in flags
    skip_upload    = '--skip-upload'    in flags
    force_extract  = '--force-extract'  in flags

    # --list flag: show all available regions and exit
    if '--list' in flags:
        downloader = WorldOSMDownloader()
        for r in downloader.get_all_regions():
            print('/'.join(r))
        return

    # Non-interactive mode: region specified on command line
    if args:
        if len(args) < 2:
            print("Usage: python add_region_to_geoserver.py <Continent> <Country> [Region] [Subregion]")
            sys.exit(1)
        region_tuple = tuple(args[:4])
        run_pipeline(region_tuple,
                     skip_download=skip_download,
                     skip_extract=skip_extract,
                     skip_upload=skip_upload,
                     force_extract=force_extract)
        return

    # Interactive mode
    interactive_menu()


if __name__ == "__main__":
    main()
