"""
Download entire country with automatic region detection.

This downloads the country PBF once, then extracts and tags infrastructure
with detailed region paths by spatially joining with administrative boundaries.

WHY: Allows downloading country once while still having detailed region_path for filtering.

Usage:
    python download_country_detailed.py Europe Germany
    python download_country_detailed.py South_America Chile
    
How it works:
    1. Downloads country PBF (e.g., germany-latest.osm.pbf)
    2. Extracts administrative boundaries first (districts, communes)
    3. For each infrastructure feature, determines which district/commune it's in
    4. Tags infrastructure with detailed region_path from that boundary
    5. Result: All data has detailed region_path for easy filtering
"""

import sys
import json
from pathlib import Path
from shapely.geometry import shape, Point, LineString
from shapely.prepared import prep
from shapely import wkt

sys.path.insert(0, str(Path(__file__).parent))

from add_region_to_geoserver import (
    stage_download, stage_extract, _geojson_dir, _pbf_exists
)
from upload_to_postgis import (
    DB_CONFIG, create_tables, clear_region_data,
    load_substations, load_power_plants, load_power_lines, load_boundaries
)

import psycopg2


def spatial_tag_features(geojson_path, boundaries_by_level):
    """
    Tag each feature with detailed region_path by finding which boundary it's in.
    
    Args:
        geojson_path: Path to infrastructure GeoJSON file
        boundaries_by_level: Dict of {admin_level: [boundary_features]}
    
    Returns:
        Updated GeoJSON with region_path properties
    """
    print(f"  🔍 Spatially tagging {geojson_path.name}...")
    
    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if not data.get('features'):
        return data
    
    # Prepare spatial indexes for boundaries (admin_level 6 = districts, most useful)  
    prepared_boundaries = []
    for level in ['6', '8']:  # Districts and communes
        if level in boundaries_by_level:
            for boundary_feature in boundaries_by_level[level]:
                try:
                    geom = shape(boundary_feature['geometry'])
                    prepared_geom = prep(geom)
                    region_path = boundary_feature['properties'].get('region_path', '')
                    if region_path:
                        prepared_boundaries.append((prepared_geom, region_path, level))
                except:
                    continue
    
    tagged_count = 0
    for feature in data['features']:
        try:
            # Get feature geometry
            feat_geom = shape(feature['geometry'])
            
            # For lines, use midpoint
            if isinstance(feat_geom, LineString):
                feat_point = feat_geom.interpolate(0.5, normalized=True)
            else:
                feat_point = feat_geom
            
            # Find which boundary contains this feature (try districts first, then communes)
            for prep_boundary, region_path, level in prepared_boundaries:
                if prep_boundary.contains(feat_point):
                    feature['properties']['region_path'] = region_path
                    feature['properties']['detected_level'] = level
                    tagged_count += 1
                    break
        except:
            continue
    
    print(f"     ✓ Tagged {tagged_count}/{len(data['features'])} features with detailed region_path")
    return data


def main():
    if len(sys.argv) < 3:
        print("Usage: python download_country_detailed.py <continent> <country>")
        print("Example: python download_country_detailed.py Europe Germany")
        sys.exit(1)
    
    continent = sys.argv[1]
    country = sys.argv[2]
    region_tuple = (continent, country)
    
    print(f"{'═' * 70}")
    print(f"DOWNLOADING {continent}/{country} WITH DETAILED TAGGING")
    print(f"{'═' * 70}\n")
    
    # Stage 1: Download
    print("\n[Stage 1/4] Downloading country PBF...")
    if not _pbf_exists(region_tuple):
        if not stage_download(region_tuple):
            print("❌ Download failed")
            return
    else:
        print(f"  ✓ PBF already exists for {country}")
    
    # Stage 2: Extract (force re-extraction to ensure we have boundaries)
    print("\n[Stage 2/4] Extracting OSM data...")
    
    # Delete existing GeoJSON files to force re-extraction
    geojson_dir = _geojson_dir(region_tuple)
    if geojson_dir.exists():
        print(f"  🗑️  Clearing existing GeoJSON files to force fresh extraction...")
        import shutil
        for file in geojson_dir.glob("*.geojson"):
            file.unlink()
    
    if not stage_extract(region_tuple):
        print("❌ Extract failed")
        return
    
    geojson_dir = _geojson_dir(region_tuple)
    
    # Stage 3: Load boundaries and assign region_paths
    print("\n[Stage 3/4] Loading administrative boundaries...")
    
    country_lower = country.lower()
    
    # Boundaries are saved in separate files by admin_level
    states_geojson = geojson_dir / f"{country_lower}_states.geojson"  # admin_level 4
    districts_geojson = geojson_dir / f"{country_lower}_districts.geojson"  # admin_level 6
    communes_geojson = geojson_dir / f"{country_lower}_communes.geojson"  # admin_level 8
    
    # Merge all boundaries into one structure for spatial tagging
    all_boundaries = {'type': 'FeatureCollection', 'features': []}
    boundaries_by_level = {}
    
    for boundary_file, admin_level in [(states_geojson, '4'), (districts_geojson, '6'), (communes_geojson, '8')]:
        if boundary_file.exists():
            with open(boundary_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            features = data.get('features', [])
            print(f"  ✓ Loaded {len(features)} level-{admin_level} boundaries from {boundary_file.name}")
            
            # Assign region_path to each boundary
            for feature in features:
                props = feature['properties']
                props['admin_level'] = admin_level
                name = props.get('name', '').replace(' ', '_').replace('/', '_')
                
                # Build hierarchical region_path
                # For now, just assign country-level path - we'll build hierarchy in next step
                if admin_level == '4':  # States/Provinces (REGIONS)
                    props['region_path'] = f"{continent}/{country}/{name}"
                    props['province_name'] = name  # Store for hierarchy building
                else:
                    # Will be updated based on spatial containment
                    props['region_path'] = f"{continent}/{country}"
                    props['province_name'] = None
                
                all_boundaries['features'].append(feature)
            
            # Group by level
            boundaries_by_level[admin_level] = features
    
    # Build hierarchical region_paths for lower admin levels
    if '4' in boundaries_by_level and '8' in boundaries_by_level:
        print(f"  🔗 Building hierarchical region paths...")
        from shapely.geometry import shape
        from shapely.prepared import prep
        
        # Prepare province geometries for fast spatial queries
        province_geoms = []
        for province_feature in boundaries_by_level['4']:
            geom = shape(province_feature['geometry'])
            province_name = province_feature['properties']['province_name']
            province_path = province_feature['properties']['region_path']
            province_geoms.append((prep(geom), province_name, province_path))
        
        # For each commune (municipality), find which province contains it
        updated_count = 0
        for commune_feature in boundaries_by_level['8']:
            try:
                commune_geom = shape(commune_feature['geometry'])
                commune_centroid = commune_geom.centroid
                commune_name = commune_feature['properties'].get('name', '').replace(' ', '_').replace('/', '_')
                
                # Find containing province
                for prep_prov, prov_name, prov_path in province_geoms:
                    if prep_prov.contains(commune_centroid):
                        # Build hierarchical path: Europe/Netherlands/Noord-Holland/Amsterdam
                        commune_feature['properties']['region_path'] = f"{prov_path}/{commune_name}"
                        commune_feature['properties']['province_name'] = prov_name
                        updated_count += 1
                        break
            except Exception as e:
                # Keep default path if spatial join fails
                pass
        
        print(f"     ✓ Updated {updated_count}/{len(boundaries_by_level['8'])} municipalities with province hierarchy")
    
    # Handle admin_level 6 if exists
    if '4' in boundaries_by_level and '6' in boundaries_by_level:
        from shapely.geometry import shape
        from shapely.prepared import prep
        
        province_geoms = []
        for province_feature in boundaries_by_level['4']:
            geom = shape(province_feature['geometry'])
            province_name = province_feature['properties']['province_name']
            province_path = province_feature['properties']['region_path']
            province_geoms.append((prep(geom), province_name, province_path))
        
        updated_count = 0
        for district_feature in boundaries_by_level['6']:
            try:
                district_geom = shape(district_feature['geometry'])
                district_centroid = district_geom.centroid
                district_name = district_feature['properties'].get('name', '').replace(' ', '_').replace('/', '_')
                
                for prep_prov, prov_name, prov_path in province_geoms:
                    if prep_prov.contains(district_centroid):
                        district_feature['properties']['region_path'] = f"{prov_path}/{district_name}"
                        district_feature['properties']['province_name'] = prov_name
                        updated_count += 1
                        break
            except Exception as e:
                pass
        
        print(f"     ✓ Updated {updated_count}/{len(boundaries_by_level['6'])} districts with province hierarchy")
    
    if not all_boundaries['features']:
        print(f"  ⚠ No boundaries found, skipping spatial tagging")
        print(f"     All features will have region_path = {continent}/{country}")
        boundaries_by_level = {}
    else:
        print(f"  📍 Total boundaries loaded: {len(all_boundaries['features'])}")
        for level, bounds in boundaries_by_level.items():
            print(f"     Level {level}: {len(bounds)} boundaries")
    
 # Stage 4: Spatial tagging and upload
    print("\n[Stage 4/4] Spatial tagging and uploading to PostGIS...")
    
    # Connect to database
    conn = psycopg2.connect(**DB_CONFIG)
    create_tables(conn)
    
    # Clear existing data for this country
    region_path = f"{continent}/{country}"
    clear_region_data(conn, region_path)
    
    # Process each infrastructure layer with spatial tagging
    country_lower = country.lower()
    
    layers = [
        (f"{country_lower}_substations.geojson", lambda geo, path: load_substations(conn, geo, path, country, continent)),
        (f"{country_lower}_power_plants.geojson", lambda geo, path: load_power_plants(conn, geo, path, country, continent)),
        (f"{country_lower}_power_lines.geojson", lambda geo, path: load_power_lines(conn, geo, path, country, continent)),
    ]
    
    for filename, loader_func in layers:
        filepath = geojson_dir / filename
        if filepath.exists():
            # Do spatial tagging if we have boundaries
            if boundaries_by_level:
                tagged_data = spatial_tag_features(filepath, boundaries_by_level)
                
                # Save tagged version
                tagged_path = filepath.with_suffix('.tagged.geojson')
                with open(tagged_path, 'w', encoding='utf-8') as f:
                    json.dump(tagged_data, f)
                
                # Load from tagged version (pass country-level region_path as fallback)
                loader_func(tagged_path, region_path)
            else:
                # Load without spatial tagging
                loader_func(filepath, region_path)
    
    # Load boundaries to PostGIS
    print("\n  📥 Loading boundaries to PostGIS...")
    
    # Load states (admin_level 4) as districts - these are the REGIONS (provinces)
    if '4' in boundaries_by_level and len(boundaries_by_level['4']) > 0:
        states_data = {'type': 'FeatureCollection', 'features': boundaries_by_level['4']}
        temp_path = geojson_dir / f"{country_lower}_states_hierarchical.geojson"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(states_data, f)
        load_boundaries(conn, temp_path, 'osm_districts', region_path, country, continent)
        temp_path.unlink()
        print(f"     ✓ Loaded {len(states_data['features'])} provinces/states as districts (REGIONS)")
    
    # Load communes (admin_level 8) - these are the SUBREGIONS (municipalities)
    if '8' in boundaries_by_level and len(boundaries_by_level['8']) > 0:
        communes_data = {'type': 'FeatureCollection', 'features': boundaries_by_level['8']}
        temp_path = geojson_dir / f"{country_lower}_communes_hierarchical.geojson"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(communes_data, f)
        load_boundaries(conn, temp_path, 'osm_communes', region_path, country, continent)
        temp_path.unlink()
        print(f"     ✓ Loaded {len(communes_data['features'])} municipalities as communes (SUBREGIONS)")
    
    # Load districts (admin_level 6) if they exist and weren't already loaded
    if '6' in boundaries_by_level and len(boundaries_by_level['6']) > 0:
        districts_data = {'type': 'FeatureCollection', 'features': boundaries_by_level['6']}
        temp_path = geojson_dir / f"{country_lower}_districts_hierarchical.geojson"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(districts_data, f)
        load_boundaries(conn, temp_path, 'osm_districts', region_path, country, continent)
        temp_path.unlink()
        print(f"     ✓ Loaded {len(districts_data['features'])} districts (intermediate level)")
    
    conn.close()
    
    print(f"\n{'═' * 70}")
    print(f"✅ SUCCESS! {country} data loaded with detailed region paths")
    print(f"   Frontend selectors will now show infrastructure by region/subregion")
    print(f"{'═' * 70}\n")


if __name__ == "__main__":
    main()
