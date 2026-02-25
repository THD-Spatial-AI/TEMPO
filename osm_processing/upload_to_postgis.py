"""
Upload extracted OSM GeoJSON files to PostGIS for GeoServer
This script loads the extracted GeoJSON files and imports them into PostgreSQL/PostGIS
tables that GeoServer can serve via WFS.

Multi-region support: all regions coexist in the same tables using region_path tagging.
Re-importing a region is idempotent (old rows for that region are deleted first).

Usage: python upload_to_postgis.py <continent> <country> [region] [subregion]
Example: python upload_to_postgis.py Europe Germany Bayern Niederbayern
Example: python upload_to_postgis.py South_America Chile Metropolitana
Example: python upload_to_postgis.py Europe Spain Andalucia
"""

import sys
import json
import psycopg2
from pathlib import Path
from psycopg2.extras import execute_values

# Database configuration
DB_CONFIG = {
    'dbname': 'gis',
    'user': 'postgres',
    'password': 'geoserver123',  # Change this to your password
    'host': 'localhost',
    'port': 5432
}

def create_tables(conn):
    """Create PostGIS tables for OSM data if they don't exist.
    Tables are shared across all regions; rows carry region_path / country /
    continent columns so multiple regions coexist without wiping each other.
    Legacy tables (without region columns) are migrated automatically.
    """
    cursor = conn.cursor()

    # Enable PostGIS extension
    cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

    # ── Create tables (only if they don't already exist) ──────────────────────

    # Substations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS osm_substations (
            id SERIAL PRIMARY KEY,
            osm_id BIGINT,
            name TEXT,
            substation TEXT,
            voltage TEXT,
            voltage_primary TEXT,
            operator TEXT,
            frequency TEXT,
            ref TEXT,
            region_path TEXT,
            country TEXT,
            continent TEXT,
            geom GEOMETRY(Point, 4326)
        );
    """)

    # Power plants table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS osm_power_plants (
            id SERIAL PRIMARY KEY,
            osm_id BIGINT,
            name TEXT,
            source TEXT,
            plant_source TEXT,
            capacity TEXT,
            capacity__MW_ DOUBLE PRECISION,
            generator_output TEXT,
            operator TEXT,
            output_electricity TEXT,
            plant_type TEXT,
            ref TEXT,
            start_date TEXT,
            region_path TEXT,
            country TEXT,
            continent TEXT,
            geom GEOMETRY(Point, 4326)
        );
    """)

    # Power lines table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS osm_power_lines (
            id SERIAL PRIMARY KEY,
            osm_id BIGINT,
            name TEXT,
            voltage TEXT,
            cables INTEGER,
            wires INTEGER,
            frequency TEXT,
            operator TEXT,
            line TEXT,
            cable TEXT,
            location TEXT,
            ref TEXT,
            region_path TEXT,
            country TEXT,
            continent TEXT,
            geom GEOMETRY(LineString, 4326)
        );
    """)

    # Communes table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS osm_communes (
            id SERIAL PRIMARY KEY,
            osm_id BIGINT,
            name TEXT,
            admin_level TEXT,
            type TEXT,
            region_path TEXT,
            country TEXT,
            continent TEXT,
            geom GEOMETRY(Polygon, 4326)
        );
    """)

    # Districts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS osm_districts (
            id SERIAL PRIMARY KEY,
            osm_id BIGINT,
            name TEXT,
            admin_level TEXT,
            type TEXT,
            region_path TEXT,
            country TEXT,
            continent TEXT,
            geom GEOMETRY(Polygon, 4326)
        );
    """)

    conn.commit()

    # ── Migrate legacy tables (add region columns if missing) ─────────────────
    _add_column_if_missing(cursor, conn, 'osm_substations',  'region_path', 'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_substations',  'country',     'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_substations',  'continent',   'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_substations',  'ref',         'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_substations',  'frequency',   'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_substations',  'voltage_primary', 'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_plants', 'region_path', 'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_plants', 'country',     'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_plants', 'continent',   'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_plants', 'plant_type',  'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_plants', 'ref',         'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_plants', 'start_date',  'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_lines',  'region_path', 'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_lines',  'country',     'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_lines',  'continent',   'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_power_lines',  'ref',         'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_communes',     'region_path', 'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_communes',     'country',     'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_communes',     'continent',   'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_districts',    'region_path', 'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_districts',    'country',     'TEXT')
    _add_column_if_missing(cursor, conn, 'osm_districts',    'continent',   'TEXT')

    # ── Spatial indexes ────────────────────────────────────────────────────────
    _create_index_if_missing(cursor, conn, 'idx_substations_geom',    'osm_substations',  'USING GIST(geom)')
    _create_index_if_missing(cursor, conn, 'idx_power_plants_geom',   'osm_power_plants', 'USING GIST(geom)')
    _create_index_if_missing(cursor, conn, 'idx_power_lines_geom',    'osm_power_lines',  'USING GIST(geom)')
    _create_index_if_missing(cursor, conn, 'idx_communes_geom',       'osm_communes',     'USING GIST(geom)')
    _create_index_if_missing(cursor, conn, 'idx_districts_geom',      'osm_districts',    'USING GIST(geom)')

    # ── Region / attribute indexes ─────────────────────────────────────────────
    _create_index_if_missing(cursor, conn, 'idx_substations_region',   'osm_substations',  '(region_path)')
    _create_index_if_missing(cursor, conn, 'idx_substations_country',  'osm_substations',  '(country)')
    _create_index_if_missing(cursor, conn, 'idx_power_plants_region',  'osm_power_plants', '(region_path)')
    _create_index_if_missing(cursor, conn, 'idx_power_plants_country', 'osm_power_plants', '(country)')
    _create_index_if_missing(cursor, conn, 'idx_power_lines_region',   'osm_power_lines',  '(region_path)')
    _create_index_if_missing(cursor, conn, 'idx_power_lines_country',  'osm_power_lines',  '(country)')
    _create_index_if_missing(cursor, conn, 'idx_communes_region',      'osm_communes',     '(region_path)')
    _create_index_if_missing(cursor, conn, 'idx_districts_region',     'osm_districts',    '(region_path)')
    _create_index_if_missing(cursor, conn, 'idx_substations_voltage',  'osm_substations',  '(voltage)')
    _create_index_if_missing(cursor, conn, 'idx_power_plants_source',  'osm_power_plants', '(source)')
    _create_index_if_missing(cursor, conn, 'idx_power_lines_voltage',  'osm_power_lines',  '(voltage)')

    conn.commit()
    print("✓ Tables ready (multi-region schema)")


def _add_column_if_missing(cursor, conn, table, column, col_type):
    """Add a column to a table only when it doesn't already exist."""
    cursor.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    """, (table, column))
    if not cursor.fetchone():
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type};")
        conn.commit()


def _create_index_if_missing(cursor, conn, index_name, table, definition):
    """Create an index only when it doesn't already exist."""
    cursor.execute("""
        SELECT 1 FROM pg_indexes WHERE indexname = %s
    """, (index_name,))
    if not cursor.fetchone():
        cursor.execute(f"CREATE INDEX {index_name} ON {table} {definition};")
        conn.commit()


def clear_region_data(conn, region_path):
    """Remove all rows for a specific region_path (idempotent re-import).
    Uses a prefix match so clearing 'Europe/Germany' also removes any
    sub-region rows that were previously imported under that path.
    """
    cursor = conn.cursor()
    tables = ['osm_substations', 'osm_power_plants', 'osm_power_lines',
              'osm_communes', 'osm_districts']
    total = 0
    for table in tables:
        cursor.execute(
            f"DELETE FROM {table} WHERE region_path LIKE %s",
            (region_path + '%',)
        )
        total += cursor.rowcount
    conn.commit()
    if total > 0:
        print(f"  ↺ Removed {total} existing rows for region '{region_path}'")


def parse_capacity(capacity_str):
    """Parse capacity string to MW value"""
    if not capacity_str or capacity_str == 'unknown' or capacity_str == '':
        return None
    
    # Remove units and convert to float
    capacity_str = str(capacity_str).strip().replace(' ', '').replace('MW', '').replace('kW', '').replace('GW', '')
    
    if not capacity_str:  # After cleaning, might be empty
        return None
    
    try:
        value = float(capacity_str)
        # Convert kW to MW if needed (values < 10 are likely MW, values > 1000 are likely kW)
        if value > 1000:
            value = value / 1000  # kW to MW
        return value
    except:
        return None

def load_substations(conn, geojson_path, region_path, country, continent):
    """Load substations from GeoJSON file tagged with region metadata."""
    if not geojson_path.exists():
        print(f"  ⚠ File not found: {geojson_path}")
        return 0

    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = data.get('features', [])
    if not features:
        print(f"  ⚠ No features in {geojson_path}")
        return 0

    cursor = conn.cursor()

    values = []
    for feature in features:
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})

        if geom.get('type') != 'Point':
            continue

        coords = geom.get('coordinates', [])
        if len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]

        values.append((
            props.get('id'),
            props.get('name'),
            props.get('substation') or props.get('power_type'),
            props.get('voltage'),
            props.get('voltage_primary') or props.get('voltage:primary'),
            props.get('operator'),
            props.get('frequency'),
            props.get('ref'),
            region_path,
            country,
            continent,
            f'SRID=4326;POINT({lon} {lat})'
        ))

    if values:
        execute_values(
            cursor,
            """
            INSERT INTO osm_substations
                (osm_id, name, substation, voltage, voltage_primary, operator, frequency,
                 ref, region_path, country, continent, geom)
            VALUES %s
            """,
            values,
            template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_GeomFromEWKT(%s))"
        )
        conn.commit()

    return len(values)


def load_power_plants(conn, geojson_path, region_path, country, continent):
    """Load power plants from GeoJSON file tagged with region metadata."""
    if not geojson_path.exists():
        print(f"  ⚠ File not found: {geojson_path}")
        return 0

    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = data.get('features', [])
    if not features:
        print(f"  ⚠ No features in {geojson_path}")
        return 0

    cursor = conn.cursor()

    values = []
    for feature in features:
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})

        if geom.get('type') != 'Point':
            continue

        coords = geom.get('coordinates', [])
        if len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]

        # Resolve capacity – extractor uses underscore keys, raw OSM may use colon keys
        capacity_str = (props.get('capacity')
                        or props.get('plant_output')
                        or props.get('generator_output')
                        or props.get('generator:output:electricity')
                        or props.get('plant:output:electricity'))
        capacity_mw = parse_capacity(capacity_str)

        # Resolve the actual fuel/energy source
        fuel_source = (props.get('plant_source')
                       or props.get('plant:source')
                       or props.get('generator_source')
                       or props.get('generator:source'))

        values.append((
            props.get('id'),
            props.get('name'),
            props.get('source'),
            fuel_source,
            capacity_str,
            capacity_mw,
            props.get('generator_output') or props.get('generator:output:electricity'),
            props.get('operator'),
            props.get('plant_output') or props.get('plant:output:electricity'),
            props.get('plant_type'),
            props.get('ref'),
            props.get('start_date'),
            region_path,
            country,
            continent,
            f'SRID=4326;POINT({lon} {lat})'
        ))

    if values:
        execute_values(
            cursor,
            """
            INSERT INTO osm_power_plants
                (osm_id, name, source, plant_source, capacity, capacity__MW_,
                 generator_output, operator, output_electricity,
                 plant_type, ref, start_date,
                 region_path, country, continent, geom)
            VALUES %s
            """,
            values,
            template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_GeomFromEWKT(%s))"
        )
        conn.commit()

    return len(values)


def load_power_lines(conn, geojson_path, region_path, country, continent):
    """Load power lines from GeoJSON file tagged with region metadata."""
    if not geojson_path.exists():
        print(f"  ⚠ File not found: {geojson_path}")
        return 0

    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = data.get('features', [])
    if not features:
        print(f"  ⚠ No features in {geojson_path}")
        return 0

    cursor = conn.cursor()

    values = []
    for feature in features:
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})

        if geom.get('type') != 'LineString':
            continue

        coords = geom.get('coordinates', [])
        if len(coords) < 2:
            continue

        coords_str = ', '.join([f'{lon} {lat}' for lon, lat in coords])
        wkt = f'SRID=4326;LINESTRING({coords_str})'

        cables = props.get('cables') or None
        if cables:
            try:
                cables = int(cables)
            except Exception:
                cables = None

        wires = props.get('wires') or None
        if wires:
            try:
                wires = int(wires)
            except Exception:
                wires = None

        values.append((
            props.get('id'),
            props.get('name'),
            props.get('voltage'),
            cables,
            wires,
            props.get('frequency'),
            props.get('operator'),
            props.get('line'),
            props.get('cable'),
            props.get('location'),
            props.get('ref'),
            region_path,
            country,
            continent,
            wkt
        ))

    if values:
        execute_values(
            cursor,
            """
            INSERT INTO osm_power_lines
                (osm_id, name, voltage, cables, wires, frequency,
                 operator, line, cable, location, ref,
                 region_path, country, continent, geom)
            VALUES %s
            """,
            values,
            template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_GeomFromEWKT(%s))"
        )
        conn.commit()

    return len(values)


def load_boundaries(conn, geojson_path, table_name, region_path, country, continent):
    """Load administrative boundaries from GeoJSON file tagged with region metadata."""
    if not geojson_path.exists():
        print(f"  ⚠ File not found: {geojson_path}")
        return 0

    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = data.get('features', [])
    if not features:
        print(f"  ⚠ No features in {geojson_path}")
        return 0

    cursor = conn.cursor()

    values = []
    for feature in features:
        props = feature.get('properties', {})
        geom = feature.get('geometry', {})

        if geom.get('type') != 'Polygon':
            continue

        coords_rings = geom.get('coordinates', [])
        if not coords_rings:
            continue

        outer_ring = coords_rings[0]
        coords_str = ', '.join([f'{lon} {lat}' for lon, lat in outer_ring])
        wkt = f'SRID=4326;POLYGON(({coords_str}))'

        values.append((
            props.get('id'),
            props.get('name'),
            props.get('admin_level'),
            props.get('type'),
            region_path,
            country,
            continent,
            wkt
        ))

    if values:
        execute_values(
            cursor,
            f"""
            INSERT INTO {table_name}
                (osm_id, name, admin_level, type, region_path, country, continent, geom)
            VALUES %s
            """,
            values,
            template="(%s, %s, %s, %s, %s, %s, %s, ST_GeomFromEWKT(%s))"
        )
        conn.commit()

    return len(values)


def main():
    if len(sys.argv) < 3:
        print("\nUsage: python upload_to_postgis.py <continent> <country> [region] [subregion]")
        print("\nExamples:")
        print("  python upload_to_postgis.py Europe Germany Bayern Niederbayern")
        print("  python upload_to_postgis.py South_America Chile Metropolitana")
        print("  python upload_to_postgis.py Europe Spain Andalucia")
        print("  python upload_to_postgis.py Asia Japan")
        return

    project_dir = Path(__file__).parent.parent

    # Parse arguments
    continent = sys.argv[1]
    country = sys.argv[2]
    region = sys.argv[3] if len(sys.argv) > 3 else None
    subregion = sys.argv[4] if len(sys.argv) > 4 else None
    
    # Build region_path: e.g. "Europe/Germany/Bayern/Niederbayern"
    path_parts = [continent, country]
    if region:
        path_parts.append(region)
    if subregion:
        path_parts.append(subregion)

    region_path = '/'.join(path_parts)  # e.g. "Europe/Germany/Bayern/Niederbayern"

    data_dir = Path(__file__).parent.parent / "public" / "data" / "osm_extracts"
    for part in path_parts:
        data_dir = data_dir / part

    if not data_dir.exists():
        print(f"\n❌ ERROR: Data directory not found: {data_dir}")
        print("\nPlease extract OSM data first using:")
        print(f"  python extract_osm_region.py {' '.join(sys.argv[1:])}")
        return

    # Leaf name used as filename prefix (lowercase, underscores preserved)
    region_name = path_parts[-1].lower()

    print("=" * 70)
    print("UPLOADING OSM DATA TO POSTGIS  [multi-region mode]")
    print("=" * 70)
    print(f"Region path : {region_path}")
    print(f"Data dir    : {data_dir}")
    print(f"Database    : {DB_CONFIG['dbname']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print()

    # Connect to PostgreSQL
    try:
        print("Connecting to PostgreSQL...")
        conn = psycopg2.connect(**DB_CONFIG)
        print("✓ Connected\n")
    except Exception as e:
        print(f"❌ ERROR: Could not connect to PostgreSQL: {e}")
        print("\nMake sure PostgreSQL is running and credentials are correct.")
        return

    try:
        # Ensure tables and indexes exist (non-destructive)
        create_tables(conn)

        # Remove any previously imported rows for this exact region (idempotent)
        clear_region_data(conn, region_path)
        print()

        # Load GeoJSON files
        print("Loading GeoJSON files...")

        substations_file = data_dir / f"{region_name}_substations.geojson"
        count = load_substations(conn, substations_file, region_path, country, continent)
        print(f"  ✓ Substations : {count} features")

        plants_file = data_dir / f"{region_name}_power_plants.geojson"
        count = load_power_plants(conn, plants_file, region_path, country, continent)
        print(f"  ✓ Power Plants : {count} features")

        lines_file = data_dir / f"{region_name}_power_lines.geojson"
        count = load_power_lines(conn, lines_file, region_path, country, continent)
        print(f"  ✓ Power Lines  : {count} features")

        communes_file = data_dir / f"{region_name}_communes.geojson"
        count = load_boundaries(conn, communes_file, 'osm_communes', region_path, country, continent)
        print(f"  ✓ Communes     : {count} features")

        districts_file = data_dir / f"{region_name}_districts.geojson"
        count = load_boundaries(conn, districts_file, 'osm_districts', region_path, country, continent)
        print(f"  ✓ Districts    : {count} features")

        print("\n" + "=" * 70)
        print("✓ UPLOAD COMPLETE")
        print("=" * 70)
        print(f"\nRegion '{region_path}' is now available in GeoServer.")
        print("Previous regions already in the database are UNTOUCHED.")
        print("\nQuery this region via the backend API:")
        print(f"  curl 'http://localhost:8082/api/osm/osm_substations?region={region_path}'")
        print("\nGeoServer WFS layers (all regions combined):")
        print("  osm:osm_substations  |  osm:osm_power_plants  |  osm:osm_power_lines")
        print("  osm:osm_communes     |  osm:osm_districts")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    main()

