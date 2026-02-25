"""
Extract OSM Power Infrastructure & Boundaries from countries folder structure
Automatically detects file location and saves to matching osm_extracts folder
Usage: python extract_osm_region.py <continent> <country> [region] [subregion]
Example: python extract_osm_region.py Europe Germany Baden_Wuerttemberg
Example: python extract_osm_region.py Europe Germany Bayern Mittelfranken
"""

import osmium
import json
import sys
from pathlib import Path
from collections import defaultdict

class DataExtractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.substations = []
        self.power_plants = []
        self.power_lines = []
        self.boundaries = defaultdict(list)
        self.stats = {
            'substations': 0,
            'power_plants': 0,
            'power_lines': 0,
            'boundaries': defaultdict(int)
        }
    
    def node(self, n):
        tags = {tag.k: tag.v for tag in n.tags}
        
        # Extract power substations
        if 'power' in tags and tags['power'] in ['substation', 'station']:
            voltage = tags.get('voltage', 'unknown')
            voltage_kv = self._parse_voltage(voltage)
            
            self.substations.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [n.location.lon, n.location.lat]
                },
                'properties': {
                    'id': n.id,
                    'power_type': tags['power'],
                    'substation': tags.get('substation', 'transmission'),
                    'voltage': voltage,
                    'voltage_kv': voltage_kv,
                    'voltage_primary': tags.get('voltage:primary', ''),
                    'name': tags.get('name', ''),
                    'operator': tags.get('operator', ''),
                    'ref': tags.get('ref', ''),
                    'frequency': tags.get('frequency', ''),
                }
            })
            self.stats['substations'] += 1
        
        # Extract power plants
        elif 'power' in tags and tags['power'] == 'plant':
            self.power_plants.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [n.location.lon, n.location.lat]
                },
                'properties': {
                    'id': n.id,
                    'name': tags.get('name', ''),
                    'operator': tags.get('operator', ''),
                    'plant_source': tags.get('plant:source', ''),
                    'plant_output': tags.get('plant:output:electricity', ''),
                    'plant_type': tags.get('plant:type', ''),
                    'generator_source': tags.get('generator:source', ''),
                    'generator_method': tags.get('generator:method', ''),
                    'capacity': tags.get('capacity', '') or tags.get('plant:output:electricity', ''),
                    'ref': tags.get('ref', ''),
                    'start_date': tags.get('start_date', ''),
                }
            })
            self.stats['power_plants'] += 1
        
        # Also check for power=generator
        elif 'power' in tags and tags['power'] == 'generator':
            self.power_plants.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [n.location.lon, n.location.lat]
                },
                'properties': {
                    'id': n.id,
                    'name': tags.get('name', ''),
                    'operator': tags.get('operator', ''),
                    'plant_source': tags.get('generator:source', ''),
                    'generator_source': tags.get('generator:source', ''),
                    'generator_method': tags.get('generator:method', ''),
                    'generator_output': tags.get('generator:output:electricity', ''),
                    'plant_output': tags.get('generator:output:electricity', ''),
                    'plant_type': tags.get('generator:type', ''),
                    'capacity': tags.get('generator:output:electricity', ''),
                    'ref': tags.get('ref', ''),
                    'start_date': tags.get('start_date', ''),
                }
            })
            self.stats['power_plants'] += 1
    
    def way(self, w):
        tags = {tag.k: tag.v for tag in w.tags}
        if 'power' in tags and tags['power'] == 'line':
            voltage = tags.get('voltage', 'unknown')
            voltage_kv = self._parse_voltage(voltage)
            coords = [[n.lon, n.lat] for n in w.nodes]
            if len(coords) < 2:
                return
            self.power_lines.append({
                'type': 'Feature',
                'geometry': {'type': 'LineString', 'coordinates': coords},
                'properties': {
                    'id': w.id,
                    'voltage': voltage,
                    'voltage_kv': voltage_kv,
                    'name': tags.get('name', ''),
                    'ref': tags.get('ref', ''),
                    'operator': tags.get('operator', ''),
                    'cables': tags.get('cables', ''),
                    'wires': tags.get('wires', ''),
                    'frequency': tags.get('frequency', ''),
                    'location': tags.get('location', 'overhead'),
                    'line': tags.get('line', ''),
                    'circuits': tags.get('circuits', '') or tags.get('circuit', ''),
                }
            })
            self.stats['power_lines'] += 1

        # Power plants mapped as closed ways (polygons) – use centroid
        elif 'power' in tags and tags['power'] == 'plant':
            node_coords = [[n.lon, n.lat] for n in w.nodes
                           if hasattr(n, 'lon') and n.lon != 0]
            if len(node_coords) >= 3:
                avg_lon = sum(c[0] for c in node_coords) / len(node_coords)
                avg_lat = sum(c[1] for c in node_coords) / len(node_coords)
                self.power_plants.append({
                    'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [avg_lon, avg_lat]},
                    'properties': {
                        'id': w.id,
                        'name': tags.get('name', ''),
                        'operator': tags.get('operator', ''),
                        'plant_source': tags.get('plant:source', ''),
                        'plant_output': tags.get('plant:output:electricity', ''),
                        'plant_type': tags.get('plant:type', ''),
                        'generator_source': tags.get('generator:source', ''),
                        'capacity': tags.get('capacity', '') or tags.get('plant:output:electricity', ''),
                        'ref': tags.get('ref', ''),
                        'start_date': tags.get('start_date', ''),
                    }
                })
                self.stats['power_plants'] += 1

        # Substations mapped as closed ways (polygons) – use centroid
        elif 'power' in tags and tags['power'] in ['substation', 'station']:
            node_coords = [[n.lon, n.lat] for n in w.nodes
                           if hasattr(n, 'lon') and n.lon != 0]
            if len(node_coords) >= 3:
                avg_lon = sum(c[0] for c in node_coords) / len(node_coords)
                avg_lat = sum(c[1] for c in node_coords) / len(node_coords)
                voltage = tags.get('voltage', 'unknown')
                self.substations.append({
                    'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [avg_lon, avg_lat]},
                    'properties': {
                        'id': w.id,
                        'power_type': tags['power'],
                        'substation': tags.get('substation', 'transmission'),
                        'voltage': voltage,
                        'voltage_kv': self._parse_voltage(voltage),
                        'voltage_primary': tags.get('voltage:primary', ''),
                        'name': tags.get('name', ''),
                        'operator': tags.get('operator', ''),
                        'ref': tags.get('ref', ''),
                        'frequency': tags.get('frequency', ''),
                    }
                })
                self.stats['substations'] += 1
    
    def area(self, a):
        tags = {tag.k: tag.v for tag in a.tags}
        if 'boundary' in tags and tags['boundary'] == 'administrative':
            admin_level = tags.get('admin_level', '')
            
            if admin_level in ['2', '4', '6', '8']:
                try:
                    coords = []
                    for ring in a.outer_rings():
                        ring_coords = [[n.lon, n.lat] for n in ring]
                        if ring_coords:
                            coords.append(ring_coords)
                    
                    if coords:
                        self.boundaries[admin_level].append({
                            'type': 'Feature',
                            'geometry': {
                                'type': 'Polygon' if len(coords) == 1 else 'MultiPolygon',
                                'coordinates': coords if len(coords) == 1 else [coords]
                            },
                            'properties': {
                                'id': a.id,
                                'name': tags.get('name', ''),
                                'admin_level': admin_level,
                                'type': tags.get('type', ''),
                            }
                        })
                        self.stats['boundaries'][admin_level] += 1
                except:
                    pass
    
    def _parse_voltage(self, voltage_str):
        if not voltage_str or voltage_str == 'unknown':
            return None
        
        voltage_str = voltage_str.replace(' ', '').replace('kV', '').replace('KV', '')
        
        if ';' in voltage_str:
            voltages = voltage_str.split(';')
            voltage_str = max(voltages, key=lambda x: float(x) if x.replace('.','').isdigit() else 0)
        
        try:
            voltage = float(voltage_str)
            if voltage < 1000:
                return voltage
            else:
                return voltage / 1000
        except:
            return None


def main():
    if len(sys.argv) < 3:
        print("\nUsage: python extract_osm_region.py <continent> <country> [region] [subregion]")
        print("\nExamples:")
        print("  python extract_osm_region.py Europe Germany                    # Extract entire country")
        print("  python extract_osm_region.py Europe Germany Bremen             # Extract region")
        print("  python extract_osm_region.py Europe Germany Bayern Mittelfranken  # Extract subregion")
        print("  python extract_osm_region.py Europe Spain Andalucia")
        print("  python extract_osm_region.py South_America Chile Metropolitana")
        return
    
    project_dir = Path(__file__).parent.parent
    
    # Parse arguments
    continent = sys.argv[1]
    country = sys.argv[2]
    region = sys.argv[3] if len(sys.argv) > 3 else None
    subregion = sys.argv[4] if len(sys.argv) > 4 else None
    
    # Build paths
    path_parts = [continent, country]
    if region:
        path_parts.append(region)
    if subregion:
        path_parts.append(subregion)
    
    # Find OSM file - search in the most specific directory first, then parent directories
    osm_file = None
    search_dir = project_dir / "public" / "data" / "countries" / Path(*path_parts)
    
    # If extracting a region/subregion, try to find file in that directory
    if region:
        osm_files = list(search_dir.glob("*.osm.pbf"))
        if osm_files:
            osm_file = osm_files[0]
    
    # If not found and extracting a region, try country level
    if not osm_file and region:
        country_dir = project_dir / "public" / "data" / "countries" / continent / country
        osm_files = list(country_dir.glob("*.osm.pbf"))
        if osm_files:
            osm_file = osm_files[0]
            print(f"ℹ️  Using country-level OSM file for region extraction")
    
    # If extracting country without OSM file, scan for regions with OSM files and extract them
    if not osm_file and not region:
        country_dir = project_dir / "public" / "data" / "countries" / continent / country
        osm_files = list(country_dir.glob("*.osm.pbf"))
        
        if osm_files:
            # Country has its own OSM file - extract it
            osm_file = osm_files[0]
        else:
            # No country-level OSM file - scan for region/subregion OSM files
            print("="*70)
            print(f"COUNTRY-LEVEL EXTRACTION: {continent} > {country}")
            print("="*70)
            print(f"ℹ️  No country-level OSM file found")
            print(f"ℹ️  Searching for region/subregion OSM files in: {country_dir.relative_to(project_dir)}")
            print("="*70)
            
            # Find all OSM files in subdirectories
            all_osm_files = list(country_dir.rglob("*.osm.pbf"))
            
            if not all_osm_files:
                print(f"\n❌ ERROR: No OSM files found in {country_dir}")
                print(f"\nPlease download OSM files first")
                return
            
            print(f"\n✅ Found {len(all_osm_files)} OSM file(s) to process:")
            
            # Extract data for each OSM file found
            total_extracted = 0
            for osm_file_path in all_osm_files:
                # Determine the region path from the file location
                relative_path = osm_file_path.parent.relative_to(country_dir)
                region_parts = list(relative_path.parts)
                
                if not region_parts:
                    continue
                
                full_path = [continent, country] + region_parts
                region_name = region_parts[-1].lower().replace('_', '_')
                
                print(f"\n{'='*70}")
                print(f"Processing: {' > '.join(full_path)}")
                print(f"File: {osm_file_path.name}")
                print(f"{'='*70}")
                
                # Extract and save this region
                extract_single_region(osm_file_path, full_path, region_name, project_dir)
                total_extracted += 1
            
            print(f"\n{'='*70}")
            print(f"✅ COUNTRY EXTRACTION COMPLETE")
            print(f"{'='*70}")
            print(f"Total regions processed: {total_extracted}")
            return
    
    if not osm_file:
        print(f"\n❌ ERROR: No OSM PBF file found in {search_dir}")
        print(f"\nPlease download the file first using:")
        print(f"  python download_world_osm.py")
        return
    
    # Single region/subregion extraction
    extract_single_region(osm_file, path_parts, path_parts[-1].lower().replace('_', '_'), project_dir)


def extract_single_region(osm_file, path_parts, region_name, project_dir):
    """Extract data for a single region and save to GeoJSON files"""
    
    # Output directory (mirrored structure in osm_extracts)
    output_dir = project_dir / "public" / "data" / "osm_extracts" / Path(*path_parts)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Region: {' > '.join(path_parts)}")
    print(f"Input:  {osm_file.relative_to(project_dir) if isinstance(osm_file, Path) else osm_file}")
    print(f"Output: {output_dir.relative_to(project_dir)}")
    print(f"\nProcessing... This may take a few minutes.")
    
    # Extract data
    handler = DataExtractor()
    handler.apply_file(str(osm_file), locations=True, idx='sparse_mem_array')
    
    print(f"\n✅ Substations:  {handler.stats['substations']}")
    print(f"✅ Power Plants: {handler.stats['power_plants']}")
    print(f"✅ Power Lines:  {handler.stats['power_lines']}")
    
    if handler.stats['boundaries']:
        print(f"\nAdministrative Boundaries:")
        for level, count in sorted(handler.stats['boundaries'].items()):
            level_name = {'2': 'Countries', '4': 'States', '6': 'Districts', '8': 'Communes'}
            print(f"  Level {level} ({level_name.get(level, 'Unknown')}): {count}")
    
    # Save GeoJSON files
    print(f"\nSaving files...")
    
    # CRS definition
    crs = {
        'type': 'name',
        'properties': {
            'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'
        }
    }
    
    # Save substations
    if handler.substations:
        substations_file = output_dir / f"{region_name}_substations.geojson"
        with open(substations_file, 'w') as f:
            json.dump({
                'type': 'FeatureCollection',
                'crs': crs,
                'features': handler.substations
            }, f, indent=2)
        print(f"  ✅ {substations_file.name} ({len(handler.substations)} features)")
    
    # Save power plants
    if handler.power_plants:
        plants_file = output_dir / f"{region_name}_power_plants.geojson"
        with open(plants_file, 'w') as f:
            json.dump({
                'type': 'FeatureCollection',
                'crs': crs,
                'features': handler.power_plants
            }, f, indent=2)
        print(f"  ✅ {plants_file.name} ({len(handler.power_plants)} features)")
    
    # Save power lines
    if handler.power_lines:
        lines_file = output_dir / f"{region_name}_power_lines.geojson"
        with open(lines_file, 'w') as f:
            json.dump({
                'type': 'FeatureCollection',
                'crs': crs,
                'features': handler.power_lines
            }, f, indent=2)
        print(f"  ✅ {lines_file.name} ({len(handler.power_lines)} features)")
    
    # Save boundaries
    for level, features in handler.boundaries.items():
        if features:
            level_name = {'2': 'countries', '4': 'states', '6': 'districts', '8': 'communes'}
            boundary_file = output_dir / f"{region_name}_{level_name.get(level, f'level{level}')}.geojson"
            with open(boundary_file, 'w') as f:
                json.dump({
                    'type': 'FeatureCollection',
                    'crs': crs,
                    'features': features
                }, f, indent=2)
            print(f"  ✅ {boundary_file.name} ({len(features)} features)")
    
    print(f"\n✅ Files saved to: {output_dir.relative_to(project_dir)}")
    
    # Update regions_database.json with the new files
    update_regions_database(path_parts, region_name, project_dir)


def update_regions_database(path_parts, region_name, project_dir):
    """Update the regions_database.json with file references for the extracted region"""
    print("\n" + "="*70)
    print("UPDATING REGIONS DATABASE")
    print("="*70)
    
    database_path = project_dir / "public" / "data" / "osm_extracts" / "regions_database.json"
    
    if not database_path.exists():
        print(f"❌ ERROR: Database not found at {database_path}")
        return
    
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
        
        # Navigate to the correct location in the database
        continent = path_parts[0]
        country = path_parts[1]
        
        if continent not in database:
            print(f"❌ Continent '{continent}' not found in database")
            print(f"Available continents: {', '.join(database.keys())}")
            return
        
        # Check if continent has 'countries' wrapper
        continent_data = database[continent]
        if 'countries' in continent_data:
            countries = continent_data['countries']
        else:
            countries = continent_data
        
        if country not in countries:
            print(f"❌ Country '{country}' not found in {continent}")
            print(f"Available countries: {', '.join(countries.keys())}")
            return
        
        # Check if country has 'regions' wrapper
        country_data = countries[country]
        if 'regions' in country_data:
            regions = country_data['regions']
        else:
            regions = country_data
        
        # Determine extraction level: country, region, or subregion
        if len(path_parts) == 2:
            # Country-level extraction: Europe/Germany
            target = country_data
            location_str = f"{continent} > {country}"
            print(f"ℹ️  Updating country-level files: {location_str}")
            
        elif len(path_parts) >= 4:
            # Subregion extraction: Europe/Germany/Bremen/Bremen
            region = path_parts[2]
            subregion = path_parts[3]
            
            if region not in regions:
                print(f"❌ Region '{region}' not found in {country}")
                return
            
            if 'subregions' not in regions[region]:
                regions[region]['subregions'] = {}
            
            if subregion not in regions[region]['subregions']:
                print(f"⚠️  Subregion '{subregion}' not found, creating entry...")
                regions[region]['subregions'][subregion] = {
                    'communes': [],
                    'files': {},
                    'center': [0, 0],  # Default, should be updated manually
                    'zoom': 11
                }
            
            # Update the files for this subregion
            target = regions[region]['subregions'][subregion]
            location_str = f"{continent} > {country} > {region} > {subregion}"
            
        elif len(path_parts) == 3:
            # Region extraction: Europe/Germany/Bremen
            region = path_parts[2]
            
            if region not in regions:
                print(f"❌ Region '{region}' not found in {country}")
                return
            
            # Check if this is a city-state (region with subregions where one subregion has same name)
            if 'subregions' in regions[region]:
                subregions_dict = regions[region]['subregions']
                if region in subregions_dict:
                    # This is a subregion with same name as region (like Bremen/Bremen)
                    target = subregions_dict[region]
                    location_str = f"{continent} > {country} > {region} > {region}"
                    print(f"ℹ️  Detected city-state structure, updating subregion: {region}")
                else:
                    # Update the region level
                    target = regions[region]
                    location_str = f"{continent} > {country} > {region}"
            else:
                # Update the region level
                target = regions[region]
                location_str = f"{continent} > {country} > {region}"
        else:
            print(f"❌ Invalid path structure: {path_parts}")
            return
        
        # Build the files dictionary based on what files exist
        output_dir = project_dir / "public" / "data" / "osm_extracts" / Path(*path_parts)
        files_dict = {}
        
        print(f"\nScanning directory: {output_dir.relative_to(project_dir)}")
        
        possible_files = {
            'substations': f"{region_name}_substations.geojson",
            'power_plants': f"{region_name}_power_plants.geojson",
            'power_lines': f"{region_name}_power_lines.geojson",
            'communes': f"{region_name}_communes.geojson",
            'districts': f"{region_name}_districts.geojson",
            'states': f"{region_name}_states.geojson"
        }
        
        for key, filename in possible_files.items():
            file_path = output_dir / filename
            if file_path.exists():
                files_dict[key] = filename
                print(f"  ✅ Found {key}: {filename}")
        
        if not files_dict:
            print(f"\n❌ No GeoJSON files found in {output_dir}")
            return
        
        # Update the database
        target['files'] = files_dict
        
        # Save the updated database (restore wrapper if it existed)
        if has_wrapper:
            save_database = {'continents': database}
        else:
            save_database = database
            
        with open(database_path, 'w', encoding='utf-8') as f:
            json.dump(save_database, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Updated database for: {location_str}")
        print(f"✅ Added {len(files_dict)} file references")
        print(f"✅ Database saved: {database_path.relative_to(project_dir)}")
        
    except Exception as e:
        print(f"❌ ERROR updating database: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
