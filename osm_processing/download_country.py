"""
Download and process an entire COUNTRY at once.

This script downloads the country-level PBF and processes it with country-level
tagging. All infrastructure gets tagged with region_path = "Continent/Country".

For visual filtering by region/subregion, use the frontend selectors which will
filter based on the osm_districts and osm_communes boundaries.

Usage:
    python download_country.py Europe Germany
    python download_country.py South_America Chile
    python download_country.py Europe Netherlands
"""

import sys
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from add_region_to_geoserver import main as add_region_main

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python download_country.py <continent> <country>")
        print("Example: python download_country.py Europe Germany")
        sys.exit(1)
    
    continent = sys.argv[1]
    country = sys.argv[2]
    
    print(f"📥 Downloading entire country: {continent}/{country}")
    print(f"   All data will be tagged with region_path='{continent}/{country}'")
    print(f"   Use frontend selectors to filter by specific regions\n")
    
    # Call the main pipeline with just continent and country
    sys.argv = ['add_region_to_geoserver.py', continent, country]
    add_region_main()
