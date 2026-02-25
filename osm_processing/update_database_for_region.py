"""
Update regions_database.json for ALL regions that have extracted files
Usage: python update_database_for_region.py
This will automatically scan all extracted OSM data and update the database
"""

import json
import sys
from pathlib import Path


def normalize_name(name):
    """Normalize region/country names for comparison"""
    normalized = name.lower()
    
    # Handle German umlauts in folder names FIRST (ue -> ü, oe -> ö, ae -> ä)
    # This converts folder-style names to proper German
    if '_' in normalized or 'ue' in normalized or 'oe' in normalized or 'ae' in normalized:
        normalized = normalized.replace('ue', 'ü').replace('oe', 'ö').replace('ae', 'ä')
    
    # Now remove all accents and special characters to ASCII
    replacements = {
        'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'å': 'a',
        'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
        'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
        'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o',
        'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
        'ñ': 'n', 'ç': 'c', 'ß': 'ss',
        '_': ' ', '-': ' ', "'": '', '"': ''
    }
    
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    
    # Remove extra spaces
    normalized = ' '.join(normalized.split())
    
    return normalized


def find_matching_key(search_name, available_keys):
    """Find a matching key from available keys using normalized comparison"""
    normalized_search = normalize_name(search_name)
    
    # First try exact match (case-sensitive)
    if search_name in available_keys:
        return search_name
    
    # Try case-insensitive exact match
    for key in available_keys:
        if key.lower() == search_name.lower():
            return key
    
    # Try with simple replacements (underscores to spaces and vice versa)
    search_variants = [
        search_name,
        search_name.replace('_', ' '),
        search_name.replace(' ', '_'),
        search_name.replace('_', '-'),
        search_name.replace('-', '_')
    ]
    
    for variant in search_variants:
        for key in available_keys:
            if key.lower() == variant.lower():
                return key
    
    # Try normalized matching
    for key in available_keys:
        if normalize_name(key) == normalized_search:
            return key
    
    # Try partial matching (for cases like "La Rioja" vs "La_Rioja")
    for key in available_keys:
        key_normalized = normalize_name(key)
        if key_normalized == normalized_search or normalized_search in key_normalized or key_normalized in normalized_search:
            return key
    
    return None


def scan_and_update_all_regions():
    """Scan all extracted OSM data and update the database automatically"""
    project_dir = Path(__file__).parent.parent
    osm_extracts_dir = project_dir / "public" / "data" / "osm_extracts"
    database_path = osm_extracts_dir / "regions_database.json"
    
    print("="*70)
    print("AUTOMATIC DATABASE UPDATE - SCANNING ALL REGIONS")
    print("="*70)
    
    if not database_path.exists():
        print(f"❌ ERROR: Database not found at {database_path}")
        return False
    
    # Load database
    try:
        with open(database_path, 'r', encoding='utf-8') as f:
            full_database = json.load(f)
        
        # Check if database has 'continents' wrapper
        if 'continents' in full_database:
            database = full_database['continents']
            has_wrapper = True
        else:
            database = full_database
            has_wrapper = False
    except Exception as e:
        print(f"❌ ERROR loading database: {e}")
        return False
    
    # Scan for all GeoJSON files
    print(f"\nScanning: {osm_extracts_dir.relative_to(project_dir)}")
    print("="*70)
    
    all_geojson_files = list(osm_extracts_dir.rglob("*.geojson"))
    
    if not all_geojson_files:
        print("❌ No GeoJSON files found")
        return False
    
    print(f"✅ Found {len(all_geojson_files)} GeoJSON files")
    
    # Group files by directory (region)
    regions_with_files = {}
    for file_path in all_geojson_files:
        # Get the directory containing this file
        region_dir = file_path.parent
        
        # Get the path relative to osm_extracts
        try:
            relative_path = region_dir.relative_to(osm_extracts_dir)
            path_parts = list(relative_path.parts)
            
            # Need at least continent/country (2 parts)
            # Can be: continent/country (country-level), continent/country/region (region-level), 
            # or continent/country/region/subregion (subregion-level)
            if len(path_parts) < 2:
                continue
            
            # Create a key for this location
            region_key = tuple(path_parts)
            
            if region_key not in regions_with_files:
                regions_with_files[region_key] = []
            
            regions_with_files[region_key].append(file_path)
        except ValueError:
            continue
    
    print(f"\n✅ Found {len(regions_with_files)} locations with data")
    print("="*70)
    
    # Update database for each region
    updated_count = 0
    failed_count = 0
    
    for path_parts, files in sorted(regions_with_files.items()):
        location_str = " > ".join(path_parts)
        print(f"\n📍 Processing: {location_str}")
        
        try:
            success = update_region_in_database(
                database, 
                list(path_parts), 
                files, 
                project_dir,
                has_wrapper
            )
            
            if success:
                updated_count += 1
            else:
                failed_count += 1
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed_count += 1
    
    # Save the updated database
    try:
        save_database = {'continents': database} if has_wrapper else database
        
        with open(database_path, 'w', encoding='utf-8') as f:
            json.dump(save_database, f, indent=2, ensure_ascii=False)
        
        print("\n" + "="*70)
        print("DATABASE UPDATE COMPLETE")
        print("="*70)
        print(f"✅ Successfully updated: {updated_count} regions")
        print(f"❌ Failed: {failed_count} regions")
        print(f"✅ Database saved: {database_path.relative_to(project_dir)}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR saving database: {e}")
        import traceback
        traceback.print_exc()
        return False


def update_region_in_database(database, path_parts, files, project_dir, has_wrapper):
    """Update a specific location (country/region/subregion) in the database"""
    continent = path_parts[0]
    country = path_parts[1] if len(path_parts) > 1 else None
    
    if not country:
        print(f"  ⚠️  Invalid path structure, skipping")
        return False
    
    # Navigate to the correct location in the database
    if continent not in database:
        print(f"  ⚠️  Continent '{continent}' not found in database, skipping")
        return False
    
    # Check if continent has 'countries' wrapper
    continent_data = database[continent]
    if 'countries' in continent_data:
        countries = continent_data['countries']
    else:
        countries = continent_data
    
    # Find matching country
    country_key = find_matching_key(country, countries.keys())
    if not country_key:
        print(f"  ⚠️  Country '{country}' not found in {continent}, skipping")
        return False
    
    # Check if country has 'regions' wrapper
    country_data = countries[country_key]
    if 'regions' in country_data:
        regions = country_data['regions']
    else:
        regions = country_data
    
    # Determine the target based on path depth
    if len(path_parts) == 2:
        # Country-level: South_America/Chile
        print(f"  ℹ️  Country-level data detected")
        
        # Update country-level files
        target = country_data
        
    elif len(path_parts) >= 4:
        # Subregion: Europe/Germany/Bremen/Bremen or Europe/Germany/Bayern/Niederbayern
        region = path_parts[2]
        subregion = path_parts[3]
        
        # Find matching region
        region_key = find_matching_key(region, regions.keys())
        if not region_key:
            print(f"  ⚠️  Region '{region}' not found in {country_key}, skipping")
            return False
        
        if 'subregions' not in regions[region_key]:
            regions[region_key]['subregions'] = {}
        
        # Find matching subregion
        subregion_key = find_matching_key(subregion, regions[region_key]['subregions'].keys())
        if not subregion_key:
            print(f"  ⚠️  Subregion '{subregion}' not found in {region_key}, creating entry...")
            regions[region_key]['subregions'][subregion] = {
                'communes': [],
                'files': {},
                'center': [0, 0],
                'zoom': 11
            }
            subregion_key = subregion
        
        target = regions[region_key]['subregions'][subregion_key]
        
    elif len(path_parts) == 3:
        # Region: Europe/Germany/Bremen or Europe/Spain/Galicia
        region = path_parts[2]
        
        # Find matching region
        region_key = find_matching_key(region, regions.keys())
        if not region_key:
            # Region doesn't exist, create it
            print(f"  ℹ️  Region '{region}' not found in database, creating new entry...")
            regions[region] = {
                'communes': [],
                'files': {},
                'center': [0, 0],
                'zoom': 9
            }
            region_key = region
        
        # Check if this is a city-state (region with subregions where one has same name)
        if 'subregions' in regions[region_key]:
            subregions_dict = regions[region_key]['subregions']
            # Try to find matching subregion with same name
            matching_subregion = find_matching_key(region, subregions_dict.keys())
            if matching_subregion:
                # City-state like Bremen/Bremen
                target = subregions_dict[matching_subregion]
                print(f"  ℹ️  City-state structure detected, updating subregion '{matching_subregion}'")
            else:
                # Regular region with subregions - update region level
                target = regions[region_key]
        else:
            # Regular region without subregions
            target = regions[region_key]
    else:
        print(f"  ⚠️  Invalid path depth ({len(path_parts)} parts), skipping")
        return False
    
    # Build files dictionary from found files
    # Use the last part of the path as the base name for file matching
    location_name = path_parts[-1].lower().replace('_', '_')
    files_dict = {}
    
    file_type_map = {
        'substations': f"{location_name}_substations.geojson",
        'power_plants': f"{location_name}_power_plants.geojson",
        'power_lines': f"{location_name}_power_lines.geojson",
        'communes': f"{location_name}_communes.geojson",
        'districts': f"{location_name}_districts.geojson",
        'states': f"{location_name}_states.geojson"
    }
    
    for file_path in files:
        filename = file_path.name
        for file_type, expected_name in file_type_map.items():
            if filename == expected_name:
                files_dict[file_type] = filename
                print(f"  ✅ {file_type}: {filename}")
                break
    
    if not files_dict:
        print(f"  ⚠️  No matching files found")
        return False
    
    # Update the target
    target['files'] = files_dict
    
    return True


def main():
    print("\n🔄 Automatic Database Update Tool")
    print("This will scan ALL extracted OSM data and update the database\n")
    
    success = scan_and_update_all_regions()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
