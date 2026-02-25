"""
Create mirrored folder structure for extracted OSM data (GeoJSON files)
Mirrors the countries folder structure in osm_extracts
"""

from pathlib import Path
import shutil

def mirror_structure():
    source_dir = Path(__file__).parent.parent / "public" / "data" / "countries"
    target_dir = Path(__file__).parent.parent / "public" / "data" / "osm_extracts"
    
    print("Creating mirrored folder structure for OSM extracts...")
    print("="*60)
    
    # Walk through countries directory and replicate structure
    folder_count = 0
    for source_path in source_dir.rglob("*"):
        if source_path.is_dir():
            # Calculate relative path from source
            relative_path = source_path.relative_to(source_dir)
            target_path = target_dir / relative_path
            
            # Create the directory
            target_path.mkdir(parents=True, exist_ok=True)
            folder_count += 1
    
    print(f"\n✅ Created {folder_count} folders in osm_extracts/")
    print(f"📁 Base location: {target_dir}")
    print("\nExtracted GeoJSON files will be organized by:")
    print("  osm_extracts/Continent/Country/Region/Subregion/")

if __name__ == "__main__":
    mirror_structure()
