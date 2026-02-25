"""
Download ALL OSM data from Geofabrik for the entire world
Systematically downloads all available regions into organized folders
"""

import requests
from pathlib import Path
from tqdm import tqdm
import time

class WorldOSMDownloader:
    """Download all OSM data from Geofabrik worldwide"""
    
    BASE_URL = "https://download.geofabrik.de"
    
    def __init__(self):
        self.project_dir = Path(__file__).parent.parent
        self.data_dir = self.project_dir / "public" / "data" / "countries"
        self.successful = []
        self.failed = []
        self.skipped = []
    
    def download_file(self, url, destination, fallback_info=None):
        """Download file with progress bar and optional fallback to country-level file"""
        try:
            # Check if file already exists and is valid (not HTML error page)
            if destination.exists():
                file_size = destination.stat().st_size
                # Check if it's an HTML error page (small size and starts with HTML)
                if file_size < 1024 * 100:  # Less than 100KB is suspicious
                    with open(destination, 'rb') as f:
                        header = f.read(100)
                        if b'<!DOCTYPE' in header or b'<html' in header:
                            print(f"⚠️  Removing invalid file (HTML page): {destination.name}")
                            destination.unlink()
                        else:
                            print(f"⏭️  Skipping (already exists): {destination.name} ({file_size / 1024 / 1024:.1f} MB)")
                            self.skipped.append(url)
                            return True
                else:
                    print(f"⏭️  Skipping (already exists): {destination.name} ({file_size / 1024 / 1024:.1f} MB)")
                    self.skipped.append(url)
                    return True
            
            # Check if country-level file exists (fallback for regions without individual files)
            if fallback_info:
                country_file = fallback_info['country_file']
                if country_file.exists() and country_file.stat().st_size > 1024 * 100:
                    print(f"⏭️  Country-level file exists, skipping region: {country_file.name}")
                    self.skipped.append(url)
                    return True
            
            print(f"\n📥 Downloading: {url}")
            response = requests.get(url, stream=True, timeout=60)
            response.raise_for_status()
            
            # Check if we got HTML instead of binary data
            content_type = response.headers.get('content-type', '')
            if 'text/html' in content_type:
                print(f"❌ Got HTML page instead of data file (404 or redirect)")
                
                # Try fallback to country-level file if available
                if fallback_info:
                    print(f"🔄 Attempting fallback to country-level file...")
                    return self.download_country_fallback(fallback_info)
                
                self.failed.append(url)
                return False
            
            total_size = int(response.headers.get('content-length', 0))
            
            destination.parent.mkdir(parents=True, exist_ok=True)
            
            with open(destination, 'wb') as f, tqdm(
                desc=destination.name,
                total=total_size,
                unit='B',
                unit_scale=True,
                unit_divisor=1024,
            ) as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
            
            # Verify the downloaded file is not HTML
            with open(destination, 'rb') as f:
                header = f.read(100)
                if b'<!DOCTYPE' in header or b'<html' in header:
                    print(f"❌ Downloaded file is HTML (invalid), removing")
                    destination.unlink()
                    self.failed.append(url)
                    return False
            
            print(f"✅ Downloaded: {destination.name} ({total_size / 1024 / 1024:.1f} MB)")
            self.successful.append(url)
            return True
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"⚠️  Not available: {url.split('/')[-1]}")
                
                # Try fallback to country-level file if available
                if fallback_info:
                    print(f"🔄 Attempting fallback to country-level file...")
                    return self.download_country_fallback(fallback_info)
            else:
                print(f"❌ HTTP Error {e.response.status_code}: {url}")
            self.failed.append(url)
            return False
        except Exception as e:
            print(f"❌ Error: {e}")
            self.failed.append(url)
            return False
    
    def download_country_fallback(self, fallback_info):
        """Download country-level file when region-specific file is not available"""
        country_url = fallback_info['country_url']
        country_file = fallback_info['country_file']
        
        # Check if already downloaded
        if country_file.exists() and country_file.stat().st_size > 1024 * 100:
            print(f"✅ Country file already exists: {country_file.name}")
            self.successful.append(country_url)
            return True
        
        try:
            print(f"📥 Downloading country-level file: {country_url}")
            response = requests.get(country_url, stream=True, timeout=60)
            response.raise_for_status()
            
            # Check if we got HTML instead of binary data
            content_type = response.headers.get('content-type', '')
            if 'text/html' in content_type:
                print(f"❌ Country file also not available")
                self.failed.append(country_url)
                return False
            
            total_size = int(response.headers.get('content-length', 0))
            
            country_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(country_file, 'wb') as f, tqdm(
                desc=country_file.name,
                total=total_size,
                unit='B',
                unit_scale=True,
                unit_divisor=1024,
            ) as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
            
            # Verify the downloaded file is not HTML
            with open(country_file, 'rb') as f:
                header = f.read(100)
                if b'<!DOCTYPE' in header or b'<html' in header:
                    print(f"❌ Downloaded file is HTML (invalid), removing")
                    country_file.unlink()
                    self.failed.append(country_url)
                    return False
            
            print(f"✅ Downloaded country file: {country_file.name} ({total_size / 1024 / 1024:.1f} MB)")
            print(f"   This file will be used for all regions in this country")
            self.successful.append(country_url)
            return True
            
        except Exception as e:
            print(f"❌ Error downloading country file: {e}")
            self.failed.append(country_url)
            return False
    
    def try_download(self, url, destination):
        """
        Attempt to download a file. Returns True if successful or file already exists.
        Returns False if the file is not available (404 or HTML response).
        Does not cascade to fallbacks - just tries this specific URL.
        """
        try:
            # Check if file already exists and is valid
            if destination.exists():
                file_size = destination.stat().st_size
                # Check if it's an HTML error page (small size and starts with HTML)
                if file_size < 1024 * 100:  # Less than 100KB is suspicious
                    with open(destination, 'rb') as f:
                        header = f.read(100)
                        if b'<!DOCTYPE' in header or b'<html' in header:
                            print(f"⚠️  Removing invalid file (HTML page): {destination.name}")
                            destination.unlink()
                        else:
                            print(f"⏭️  Already exists: {destination.name} ({file_size / 1024 / 1024:.1f} MB)")
                            self.skipped.append(url)
                            return True
                else:
                    print(f"⏭️  Already exists: {destination.name} ({file_size / 1024 / 1024:.1f} MB)")
                    self.skipped.append(url)
                    return True
            
            print(f"📥 Downloading: {url}")
            response = requests.get(url, stream=True, timeout=60)
            
            # Check for 404 or other HTTP errors
            if response.status_code == 404:
                print(f"⚠️  Not available (404)")
                return False
            
            response.raise_for_status()
            
            # Check if we got HTML instead of binary data
            content_type = response.headers.get('content-type', '')
            if 'text/html' in content_type:
                print(f"⚠️  Not available (got HTML instead of data)")
                return False
            
            total_size = int(response.headers.get('content-length', 0))
            
            destination.parent.mkdir(parents=True, exist_ok=True)
            
            with open(destination, 'wb') as f, tqdm(
                desc=destination.name,
                total=total_size,
                unit='B',
                unit_scale=True,
                unit_divisor=1024,
            ) as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
            
            # Verify the downloaded file is not HTML
            with open(destination, 'rb') as f:
                header = f.read(100)
                if b'<!DOCTYPE' in header or b'<html' in header:
                    print(f"❌ Downloaded file is HTML (invalid), removing")
                    destination.unlink()
                    return False
            
            print(f"✅ Downloaded: {destination.name} ({total_size / 1024 / 1024:.1f} MB)")
            self.successful.append(url)
            return True
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"⚠️  Not available (404)")
            else:
                print(f"❌ HTTP Error {e.response.status_code}")
            return False
        except Exception as e:
            print(f"❌ Error: {e}")
            return False
    
    def normalize_url_part(self, part):
        """Normalize a name for use in Geofabrik URLs"""
        # Special cases that don't follow the standard pattern
        special_cases = {
            'Australia_Oceania': 'australia-oceania',
            'Central_America': 'central-america',
            'North_America': 'north-america',
            'South_America': 'south-america',
            'Bosnia_Herzegovina': 'bosnia-herzegovina',
            'Czech_Republic': 'czech-republic',
            'Faroe_Islands': 'faroe-islands',
            'Isle_of_Man': 'isle-of-man',
            'Israel_and_Palestine': 'israel-and-palestine',
            'North_Korea': 'north-korea',
            'New_Zealand': 'new-zealand',
            'South_Korea': 'south-korea',
            'Saint_Helena_Ascension_Tristan_da_Cunha': 'saint-helena-ascension-and-tristan-da-cunha',
            'Sao_Tome_and_Principe': 'sao-tome-and-principe',
            'South_Africa': 'south-africa',
            'South_Sudan': 'south-sudan',
            'United_Kingdom': 'united-kingdom',
            'United_States': 'us',
            'Northern_Ireland': 'northern-ireland',
            'England': 'england',
            'Scotland': 'scotland',
            'Wales': 'wales',
            'Cape_Verde': 'cape-verde',
            'Central_African_Republic': 'central-african-republic',
            'Congo_Brazzaville': 'congo-brazzaville',
            'Congo_Kinshasa': 'congo-democratic-republic',
            'Equatorial_Guinea': 'equatorial-guinea',
            'Guinea_Bissau': 'guinea-bissau',
            'Ivory_Coast': 'ivory-coast',
            'Sierra_Leone': 'sierra-leone',
            'Burkina_Faso': 'burkina-faso',
            'Sri_Lanka': 'sri-lanka',
            'Hong_Kong': 'hong-kong',
            'Inner_Mongolia': 'inner-mongolia',
            'New_South_Wales': 'new-south-wales',
            'Northern_Territory': 'northern-territory',
            'South_Australia': 'south-australia',
            'Western_Australia': 'western-australia',
            'Australian_Capital_Territory': 'australian-capital-territory',
            'Costa_Rica': 'costa-rica',
            'El_Salvador': 'el-salvador',
            'Puerto_Rico': 'puerto-rico',
            'New_Hampshire': 'new-hampshire',
            'New_Jersey': 'new-jersey',
            'New_Mexico': 'new-mexico',
            'New_York': 'new-york',
            'North_Carolina': 'north-carolina',
            'North_Dakota': 'north-dakota',
            'Rhode_Island': 'rhode-island',
            'South_Carolina': 'south-carolina',
            'South_Dakota': 'south-dakota',
            'West_Virginia': 'west-virginia',
            'District_of_Columbia': 'district-of-columbia',
            'US_Virgin_Islands': 'us-virgin-islands',
            'British_Columbia': 'british-columbia',
            'New_Brunswick': 'new-brunswick',
            'Newfoundland_and_Labrador': 'newfoundland-and-labrador',
            'Northwest_Territories': 'northwest-territories',
            'Nova_Scotia': 'nova-scotia',
            'Prince_Edward_Island': 'prince-edward-island',
            'Baden_Wuerttemberg': 'baden-wuerttemberg',
            'Regierungsbezirk_Freiburg': 'regierungsbezirk-freiburg',
            'Regierungsbezirk_Karlsruhe': 'regierungsbezirk-karlsruhe',
            'Regierungsbezirk_Stuttgart': 'regierungsbezirk-stuttgart',
            'Regierungsbezirk_Tuebingen': 'regierungsbezirk-tuebingen',
            'Regierungsbezirk_Arnsberg': 'regierungsbezirk-arnsberg',
            'Regierungsbezirk_Detmold': 'regierungsbezirk-detmold',
            'Regierungsbezirk_Duesseldorf': 'regierungsbezirk-duesseldorf',
            'Regierungsbezirk_Koeln': 'regierungsbezirk-koeln',
            'Regierungsbezirk_Muenster': 'regierungsbezirk-muenster',
            'Mecklenburg_Vorpommern': 'mecklenburg-vorpommern',
            'Nordrhein_Westfalen': 'nordrhein-westfalen',
            'Rheinland_Pfalz': 'rheinland-pfalz',
            'Sachsen_Anhalt': 'sachsen-anhalt',
            'Schleswig_Holstein': 'schleswig-holstein',
            'Basse_Normandie': 'basse-normandie',
            'Haute_Normandie': 'haute-normandie',
            'Ile_de_France': 'ile-de-france',
            'Languedoc_Roussillon': 'languedoc-roussillon',
            'Midi_Pyrenees': 'midi-pyrenees',
            'Nord_Pas_de_Calais': 'nord-pas-de-calais',
            'Pays_de_la_Loire': 'pays-de-la-loire',
            'Poitou_Charentes': 'poitou-charentes',
            'Provence_Alpes_Cote_d_Azur': 'provence-alpes-cote-d-azur',
            'Rhone_Alpes': 'rhone-alpes',
            'Champagne_Ardenne': 'champagne-ardenne',
            'Franche_Comte': 'franche-comte',
            'Emilia_Romagna': 'emilia-romagna',
            'Friuli_Venezia_Giulia': 'friuli-venezia-giulia',
            'Trentino_Alto_Adige': 'trentino-alto-adige',
            'Valle_d_Aosta': 'valle-d-aosta',
            'Castilla_La_Mancha': 'castilla-la-mancha',
            'Castilla_y_Leon': 'castilla-y-leon',
            'La_Rioja': 'la-rioja',
            'Pais_Vasco': 'pais-vasco',
            'Islas_Baleares': 'islas-baleares',
            # Netherlands provinces
            'Noord_Brabant': 'noord-brabant',
            'Noord_Holland': 'noord-holland',
            'Zuid_Holland': 'zuid-holland',
            # Polish voivodeships
            'Dolnoslaskie': 'dolnoslaskie',
            'Kujawsko_Pomorskie': 'kujawsko-pomorskie',
            'Lodzkie': 'lodzkie',
            'Lubelskie': 'lubelskie',
            'Lubuskie': 'lubuskie',
            'Malopolskie': 'malopolskie',
            'Mazowieckie': 'mazowieckie',
            'Opolskie': 'opolskie',
            'Podkarpackie': 'podkarpackie',
            'Podlaskie': 'podlaskie',
            'Pomorskie': 'pomorskie',
            'Slaskie': 'slaskie',
            'Swietokrzyskie': 'swietokrzyskie',
            'Warminsko_Mazurskie': 'warminsko-mazurskie',
            'Wielkopolskie': 'wielkopolskie',
            'Zachodniopomorskie': 'zachodniopomorskie',
            # Chile regions
            'Arica_y_Parinacota': 'arica-y-parinacota',
            'Los_Rios': 'los-rios',
            'Los_Lagos': 'los-lagos',
            'O_Higgins': 'o-higgins',
            'Centro_Oeste': 'centro-oeste',
            'Andaman_and_Nicobar': 'andaman-and-nicobar',
            'Andhra_Pradesh': 'andhra-pradesh',
            'Arunachal_Pradesh': 'arunachal-pradesh',
            'Dadra_and_Nagar_Haveli': 'dadra-and-nagar-haveli',
            'Daman_and_Diu': 'daman-and-diu',
            'Himachal_Pradesh': 'himachal-pradesh',
            'Jammu_and_Kashmir': 'jammu-and-kashmir',
            'Madhya_Pradesh': 'madhya-pradesh',
            'Tamil_Nadu': 'tamil-nadu',
            'Uttar_Pradesh': 'uttar-pradesh',
            'West_Bengal': 'west-bengal',
            'Central_District': 'central-fed-district',
            'Crimean_District': 'crimean-fed-district',
            'Far_Eastern_District': 'far-eastern-fed-district',
            'North_Caucasian_District': 'north-caucasian-fed-district',
            'Northwestern_District': 'northwestern-fed-district',
            'Siberian_District': 'siberian-fed-district',
            'South_District': 'south-fed-district',
            'Ural_District': 'ural-fed-district',
            'Volga_District': 'volga-fed-district',
            'French_Guiana': 'french-guiana',
            'Papua_New_Guinea': 'papua-new-guinea',
            'Cook_Islands': 'cook-islands',
            'Marshall_Islands': 'marshall-islands',
            'New_Caledonia': 'new-caledonia',
            'Pitcairn_Islands': 'pitcairn-islands',
            'Solomon_Islands': 'solomon-islands',
            'Falkland_Islands': 'falkland-islands',
            'Central_Zone': 'central-zone',
            'Eastern_Zone': 'eastern-zone',
            'North_Eastern_Zone': 'north-eastern-zone',
            'Northern_Zone': 'northern-zone',
            'Southern_Zone': 'southern-zone',
            'Western_Zone': 'western-zone',
            'Nusa_Tenggara': 'nusa-tenggara',
            'GCC_States': 'gcc-states',
            'Israel_and_Palestine': 'israel-and-palestine',
            'Northern_California': 'norcal',
            'Southern_California': 'socal',
            'Bosnia_Herzegovina': 'bosnia-herzegovina',
            'Czech_Republic': 'czech-republic',
            'Faroe_Islands': 'faroe-islands',
            'Isle_of_Man': 'isle-of-man',
            'North_Macedonia': 'macedonia',
            'American_Oceania': 'us-oceania',
            'Ile_de_Clipperton': 'ile-de-clipperton',
            'Polynesie_francaise': 'french-polynesia',
            'Wallis_et_Futuna': 'wallis-et-futuna',
            'Haiti_and_Dominican_Republic': 'haiti-and-domrep',
            'East_Timor': 'east-timor',
            'Canary_Islands': 'canary-islands',
            'Senegal_and_Gambia': 'senegal-and-gambia',
            'Nord_Est': 'nord-est',
            'Nord_Ovest': 'nord-ovest',
        }
        
        return special_cases.get(part, part.lower().replace('_', '-'))
    
    def build_url_and_path(self, continent, country, region=None, subregion=None):
        """Build URL and local path following Geofabrik's structure"""
        # Special handling for UK regions - they need to go through great-britain path
        uk_regions = {'England', 'Scotland', 'Wales', 'Northern_Ireland'}
        is_uk_region = country == 'United_Kingdom' and region in uk_regions
        
        # URL parts using normalized names
        url_parts = [self.normalize_url_part(continent)]
        
        # For UK regions, the URL structure is: europe/great-britain/england-latest.osm.pbf
        # For other regions with subregions (like Bayern > Mittelfranken):
        # structure is: .../germany/bayern/mittelfranken-latest.osm.pbf
        if region and not subregion:
            # Single region level - add country to URL path
            country_normalized = self.normalize_url_part(country)
            url_parts.append(country_normalized)
            if is_uk_region:
                # UK region: file is at continent/great-britain/region-latest.osm.pbf
                filename_base = self.normalize_url_part(region)
            else:
                # Other regions: file is at continent/country/region-latest.osm.pbf
                # Do NOT add region to url_parts - it's only in the filename
                filename_base = self.normalize_url_part(region)
        elif subregion:
            # Has subregion - file is: continent/country/region/subregion-latest.osm.pbf
            country_normalized = self.normalize_url_part(country)
            url_parts.append(country_normalized)
            url_parts.append(self.normalize_url_part(region))
            filename_base = self.normalize_url_part(subregion)
        else:
            # Just country - file is: continent/country-latest.osm.pbf
            # Don't duplicate country in URL path
            filename_base = self.normalize_url_part(country)
        
        # Construct URL
        url_path = '/'.join(url_parts)
        filename = f"{filename_base}-latest.osm.pbf"
        url = f"{self.BASE_URL}/{url_path}/{filename}"
        
        # Local path (preserve original naming with full structure)
        local_parts = [continent, country]
        if region:
            local_parts.append(region)
        if subregion:
            local_parts.append(subregion)
        
        destination = self.data_dir.joinpath(*local_parts) / filename
        
        return url, destination
    
    def get_all_regions(self):
        """
        Get complete list of all regions to download from Geofabrik.
        
        Countries WITH regional subdivisions on Geofabrik:
        - Germany (3 regions with subregions: Baden-Württemberg, Bayern, Nordrhein-Westfalen)
        - France, Italy, Spain, UK, Poland, Netherlands (Europe regions)
        - Russia (9 federal districts)
        - USA (50 states + DC + territories, California has 2 subregions)
        - Canada (13 provinces/territories)
        - Brazil (5 regions)
        - China (33 provinces)
        - India (6 zones)
        - Indonesia (7 islands)
        - Japan (8 regions)
        
        All other countries are listed at country-level only and will download
        the complete country file (e.g., chile-latest.osm.pbf, australia-latest.osm.pbf).
        """
        return [
            # AFRICA - All country-level only
            ("Africa", "Algeria"),
            ("Africa", "Angola"),
            ("Africa", "Benin"),
            ("Africa", "Botswana"),
            ("Africa", "Burkina_Faso"),
            ("Africa", "Burundi"),
            ("Africa", "Cameroon"),
            ("Africa", "Canary_Islands"),
            ("Africa", "Cape_Verde"),
            ("Africa", "Central_African_Republic"),
            ("Africa", "Chad"),
            ("Africa", "Comoros"),
            ("Africa", "Congo_Brazzaville"),
            ("Africa", "Congo_Kinshasa"),
            ("Africa", "Djibouti"),
            ("Africa", "Egypt"),
            ("Africa", "Equatorial_Guinea"),
            ("Africa", "Eritrea"),
            ("Africa", "Ethiopia"),
            ("Africa", "Gabon"),
            ("Africa", "Ghana"),
            ("Africa", "Guinea"),
            ("Africa", "Guinea_Bissau"),
            ("Africa", "Ivory_Coast"),
            ("Africa", "Kenya"),
            ("Africa", "Lesotho"),
            ("Africa", "Liberia"),
            ("Africa", "Libya"),
            ("Africa", "Madagascar"),
            ("Africa", "Malawi"),
            ("Africa", "Mali"),
            ("Africa", "Mauritania"),
            ("Africa", "Mauritius"),
            ("Africa", "Morocco"),
            ("Africa", "Mozambique"),
            ("Africa", "Namibia"),
            ("Africa", "Niger"),
            ("Africa", "Nigeria"),
            ("Africa", "Rwanda"),
            ("Africa", "Saint_Helena_Ascension_Tristan_da_Cunha"),
            ("Africa", "Sao_Tome_and_Principe"),
            ("Africa", "Senegal_and_Gambia"),
            ("Africa", "Seychelles"),
            ("Africa", "Sierra_Leone"),
            ("Africa", "Somalia"),
            ("Africa", "South_Africa"),
            ("Africa", "South_Sudan"),
            ("Africa", "Sudan"),
            ("Africa", "Swaziland"),
            ("Africa", "Tanzania"),
            ("Africa", "Togo"),
            ("Africa", "Tunisia"),
            ("Africa", "Uganda"),
            ("Africa", "Zambia"),
            ("Africa", "Zimbabwe"),
            
            # ASIA - China, India, Japan have regional files; others are country-level only
            ("Asia", "Afghanistan"),
            ("Asia", "Armenia"),
            ("Asia", "Azerbaijan"),
            ("Asia", "Bangladesh"),
            ("Asia", "Bhutan"),
            ("Asia", "Cambodia"),
            ("Asia", "China", "Anhui"),
            ("Asia", "China", "Beijing"),
            ("Asia", "China", "Chongqing"),
            ("Asia", "China", "Fujian"),
            ("Asia", "China", "Gansu"),
            ("Asia", "China", "Guangdong"),
            ("Asia", "China", "Guangxi"),
            ("Asia", "China", "Guizhou"),
            ("Asia", "China", "Hainan"),
            ("Asia", "China", "Hebei"),
            ("Asia", "China", "Heilongjiang"),
            ("Asia", "China", "Henan"),
            ("Asia", "China", "Hong_Kong"),
            ("Asia", "China", "Hubei"),
            ("Asia", "China", "Hunan"),
            ("Asia", "China", "Inner_Mongolia"),
            ("Asia", "China", "Jiangsu"),
            ("Asia", "China", "Jiangxi"),
            ("Asia", "China", "Jilin"),
            ("Asia", "China", "Liaoning"),
            ("Asia", "China", "Macau"),
            ("Asia", "China", "Ningxia"),
            ("Asia", "China", "Qinghai"),
            ("Asia", "China", "Shaanxi"),
            ("Asia", "China", "Shandong"),
            ("Asia", "China", "Shanghai"),
            ("Asia", "China", "Shanxi"),
            ("Asia", "China", "Sichuan"),
            ("Asia", "China", "Tianjin"),
            ("Asia", "China", "Tibet"),
            ("Asia", "China", "Xinjiang"),
            ("Asia", "China", "Yunnan"),
            ("Asia", "China", "Zhejiang"),
            ("Asia", "East_Timor"),
            ("Asia", "GCC_States"),
            ("Asia", "Georgia"),
            ("Asia", "India", "Central_Zone"),
            ("Asia", "India", "Eastern_Zone"),
            ("Asia", "India", "North_Eastern_Zone"),
            ("Asia", "India", "Northern_Zone"),
            ("Asia", "India", "Southern_Zone"),
            ("Asia", "India", "Western_Zone"),
            ("Asia", "Indonesia", "Java"),
            ("Asia", "Indonesia", "Kalimantan"),
            ("Asia", "Indonesia", "Maluku"),
            ("Asia", "Indonesia", "Nusa_Tenggara"),
            ("Asia", "Indonesia", "Papua"),
            ("Asia", "Indonesia", "Sulawesi"),
            ("Asia", "Indonesia", "Sumatra"),
            ("Asia", "Iran"),
            ("Asia", "Iraq"),
            ("Asia", "Israel_and_Palestine"),
            ("Asia", "Japan", "Chubu"),
            ("Asia", "Japan", "Chugoku"),
            ("Asia", "Japan", "Hokkaido"),
            ("Asia", "Japan", "Kansai"),
            ("Asia", "Japan", "Kanto"),
            ("Asia", "Japan", "Kyushu"),
            ("Asia", "Japan", "Shikoku"),
            ("Asia", "Japan", "Tohoku"),
            ("Asia", "Jordan"),
            ("Asia", "Kazakhstan"),
            ("Asia", "Kyrgyzstan"),
            ("Asia", "Laos"),
            ("Asia", "Lebanon"),
            ("Asia", "Malaysia"),
            ("Asia", "Maldives"),
            ("Asia", "Mongolia"),
            ("Asia", "Myanmar"),
            ("Asia", "Nepal"),
            ("Asia", "North_Korea"),
            ("Asia", "Pakistan"),
            ("Asia", "Philippines"),
            ("Asia", "Singapore"),
            ("Asia", "South_Korea"),
            ("Asia", "Sri_Lanka"),
            ("Asia", "Syria"),
            ("Asia", "Taiwan"),
            ("Asia", "Tajikistan"),
            ("Asia", "Thailand"),
            ("Asia", "Turkmenistan"),
            ("Asia", "Uzbekistan"),
            ("Asia", "Vietnam"),
            ("Asia", "Yemen"),
            
            # AUSTRALIA & OCEANIA - No regional files available, all country-level only
            ("Australia_Oceania", "American_Oceania"),
            ("Australia_Oceania", "Australia"),
            ("Australia_Oceania", "Cook_Islands"),
            ("Australia_Oceania", "Fiji"),
            ("Australia_Oceania", "Ile_de_Clipperton"),
            ("Australia_Oceania", "Kiribati"),
            ("Australia_Oceania", "Marshall_Islands"),
            ("Australia_Oceania", "Micronesia"),
            ("Australia_Oceania", "Nauru"),
            ("Australia_Oceania", "New_Caledonia"),
            ("Australia_Oceania", "New_Zealand"),
            ("Australia_Oceania", "Niue"),
            ("Australia_Oceania", "Palau"),
            ("Australia_Oceania", "Papua_New_Guinea"),
            ("Australia_Oceania", "Pitcairn_Islands"),
            ("Australia_Oceania", "Polynesie_francaise"),
            ("Australia_Oceania", "Samoa"),
            ("Australia_Oceania", "Solomon_Islands"),
            ("Australia_Oceania", "Tokelau"),
            ("Australia_Oceania", "Tonga"),
            ("Australia_Oceania", "Tuvalu"),
            ("Australia_Oceania", "Vanuatu"),
            ("Australia_Oceania", "Wallis_et_Futuna"),
            
            # CENTRAL AMERICA - All country-level only
            ("Central_America", "Bahamas"),
            ("Central_America", "Belize"),
            ("Central_America", "Costa_Rica"),
            ("Central_America", "Cuba"),
            ("Central_America", "El_Salvador"),
            ("Central_America", "Guatemala"),
            ("Central_America", "Haiti_and_Dominican_Republic"),
            ("Central_America", "Honduras"),
            ("Central_America", "Jamaica"),
            ("Central_America", "Nicaragua"),
            ("Central_America", "Panama"),
            
            # EUROPE - Germany, France, Italy, Spain, UK, Russia have regional files; others are country-level only
            ("Europe", "Albania"),
            ("Europe", "Andorra"),
            ("Europe", "Austria"),
            ("Europe", "Belarus"),
            ("Europe", "Belgium"),
            ("Europe", "Bosnia_Herzegovina"),
            ("Europe", "Bulgaria"),
            ("Europe", "Croatia"),
            ("Europe", "Cyprus"),
            ("Europe", "Czech_Republic"),
            ("Europe", "Denmark"),
            ("Europe", "Estonia"),
            ("Europe", "Faroe_Islands"),
            ("Europe", "Finland"),
            ("Europe", "France", "Alsace"),
            ("Europe", "France", "Aquitaine"),
            ("Europe", "France", "Auvergne"),
            ("Europe", "France", "Basse_Normandie"),
            ("Europe", "France", "Bourgogne"),
            ("Europe", "France", "Bretagne"),
            ("Europe", "France", "Centre"),
            ("Europe", "France", "Champagne_Ardenne"),
            ("Europe", "France", "Corse"),
            ("Europe", "France", "Franche_Comte"),
            ("Europe", "France", "Guadeloupe"),
            ("Europe", "France", "Guyane"),
            ("Europe", "France", "Haute_Normandie"),
            ("Europe", "France", "Ile_de_France"),
            ("Europe", "France", "Languedoc_Roussillon"),
            ("Europe", "France", "Limousin"),
            ("Europe", "France", "Lorraine"),
            ("Europe", "France", "Martinique"),
            ("Europe", "France", "Mayotte"),
            ("Europe", "France", "Midi_Pyrenees"),
            ("Europe", "France", "Nord_Pas_de_Calais"),
            ("Europe", "France", "Pays_de_la_Loire"),
            ("Europe", "France", "Picardie"),
            ("Europe", "France", "Poitou_Charentes"),
            ("Europe", "France", "Provence_Alpes_Cote_d_Azur"),
            ("Europe", "France", "Reunion"),
            ("Europe", "France", "Rhone_Alpes"),
            ("Europe", "Germany", "Baden_Wuerttemberg", "Regierungsbezirk_Freiburg"),
            ("Europe", "Germany", "Baden_Wuerttemberg", "Regierungsbezirk_Karlsruhe"),
            ("Europe", "Germany", "Baden_Wuerttemberg", "Regierungsbezirk_Stuttgart"),
            ("Europe", "Germany", "Baden_Wuerttemberg", "Regierungsbezirk_Tuebingen"),
            ("Europe", "Germany", "Bayern", "Mittelfranken"),
            ("Europe", "Germany", "Bayern", "Niederbayern"),
            ("Europe", "Germany", "Bayern", "Oberbayern"),
            ("Europe", "Germany", "Bayern", "Oberfranken"),
            ("Europe", "Germany", "Bayern", "Oberpfalz"),
            ("Europe", "Germany", "Bayern", "Schwaben"),
            ("Europe", "Germany", "Bayern", "Unterfranken"),
            ("Europe", "Germany", "Berlin"),
            ("Europe", "Germany", "Brandenburg"),
            ("Europe", "Germany", "Bremen"),
            ("Europe", "Germany", "Hamburg"),
            ("Europe", "Germany", "Hessen"),
            ("Europe", "Germany", "Mecklenburg_Vorpommern"),
            ("Europe", "Germany", "Niedersachsen"),
            ("Europe", "Germany", "Nordrhein_Westfalen", "Regierungsbezirk_Arnsberg"),
            ("Europe", "Germany", "Nordrhein_Westfalen", "Regierungsbezirk_Detmold"),
            ("Europe", "Germany", "Nordrhein_Westfalen", "Regierungsbezirk_Duesseldorf"),
            ("Europe", "Germany", "Nordrhein_Westfalen", "Regierungsbezirk_Koeln"),
            ("Europe", "Germany", "Nordrhein_Westfalen", "Regierungsbezirk_Muenster"),
            ("Europe", "Germany", "Rheinland_Pfalz"),
            ("Europe", "Germany", "Saarland"),
            ("Europe", "Germany", "Sachsen"),
            ("Europe", "Germany", "Sachsen_Anhalt"),
            ("Europe", "Germany", "Schleswig_Holstein"),
            ("Europe", "Germany", "Thueringen"),
            ("Europe", "Greece"),
            ("Europe", "Hungary"),
            ("Europe", "Iceland"),
            ("Europe", "Ireland"),
            ("Europe", "Isle_of_Man"),
            ("Europe", "Italy", "Centro"),
            ("Europe", "Italy", "Isole"),
            ("Europe", "Italy", "Nord_Est"),
            ("Europe", "Italy", "Nord_Ovest"),
            ("Europe", "Italy", "Sud"),
            ("Europe", "Kosovo"),
            ("Europe", "Latvia"),
            ("Europe", "Liechtenstein"),
            ("Europe", "Lithuania"),
            ("Europe", "Luxembourg"),
            ("Europe", "Macedonia"),
            ("Europe", "Malta"),
            ("Europe", "Moldova"),
            ("Europe", "Monaco"),
            ("Europe", "Montenegro"),
            ("Europe", "Netherlands", "Drenthe"),
            ("Europe", "Netherlands", "Flevoland"),
            ("Europe", "Netherlands", "Friesland"),
            ("Europe", "Netherlands", "Gelderland"),
            ("Europe", "Netherlands", "Groningen"),
            ("Europe", "Netherlands", "Limburg"),
            ("Europe", "Netherlands", "Noord_Brabant"),
            ("Europe", "Netherlands", "Noord_Holland"),
            ("Europe", "Netherlands", "Overijssel"),
            ("Europe", "Netherlands", "Utrecht"),
            ("Europe", "Netherlands", "Zeeland"),
            ("Europe", "Netherlands", "Zuid_Holland"),
            ("Europe", "Norway"),
            ("Europe", "Poland", "Dolnoslaskie"),
            ("Europe", "Poland", "Kujawsko_Pomorskie"),
            ("Europe", "Poland", "Lodzkie"),
            ("Europe", "Poland", "Lubelskie"),
            ("Europe", "Poland", "Lubuskie"),
            ("Europe", "Poland", "Malopolskie"),
            ("Europe", "Poland", "Mazowieckie"),
            ("Europe", "Poland", "Opolskie"),
            ("Europe", "Poland", "Podkarpackie"),
            ("Europe", "Poland", "Podlaskie"),
            ("Europe", "Poland", "Pomorskie"),
            ("Europe", "Poland", "Slaskie"),
            ("Europe", "Poland", "Swietokrzyskie"),
            ("Europe", "Poland", "Warminsko_Mazurskie"),
            ("Europe", "Poland", "Wielkopolskie"),
            ("Europe", "Poland", "Zachodniopomorskie"),
            ("Europe", "Portugal"),
            ("Europe", "Romania"),
            ("Europe", "Russia", "Central_District"),
            ("Europe", "Russia", "Crimean_District"),
            ("Europe", "Russia", "Far_Eastern_District"),
            ("Europe", "Russia", "Kaliningrad"),
            ("Europe", "Russia", "North_Caucasian_District"),
            ("Europe", "Russia", "Northwestern_District"),
            ("Europe", "Russia", "Siberian_District"),
            ("Europe", "Russia", "South_District"),
            ("Europe", "Russia", "Ural_District"),
            ("Europe", "Russia", "Volga_District"),
            ("Europe", "Serbia"),
            ("Europe", "Slovakia"),
            ("Europe", "Slovenia"),
            ("Europe", "Spain", "Andalucia"),
            ("Europe", "Spain", "Aragon"),
            ("Europe", "Spain", "Asturias"),
            ("Europe", "Spain", "Cantabria"),
            ("Europe", "Spain", "Castilla_La_Mancha"),
            ("Europe", "Spain", "Castilla_y_Leon"),
            ("Europe", "Spain", "Cataluna"),
            ("Europe", "Spain", "Ceuta"),
            ("Europe", "Spain", "Extremadura"),
            ("Europe", "Spain", "Galicia"),
            ("Europe", "Spain", "Islas_Baleares"),
            ("Europe", "Spain", "La_Rioja"),
            ("Europe", "Spain", "Madrid"),
            ("Europe", "Spain", "Melilla"),
            ("Europe", "Spain", "Murcia"),
            ("Europe", "Spain", "Navarra"),
            ("Europe", "Spain", "Pais_Vasco"),
            ("Europe", "Spain", "Valencia"),
            ("Europe", "Sweden"),
            ("Europe", "Switzerland"),
            ("Europe", "Turkey"),
            ("Europe", "Ukraine"),
            ("Europe", "United_Kingdom", "England"),
            ("Europe", "United_Kingdom", "Scotland"),
            ("Europe", "United_Kingdom", "Wales"),
            
            # NORTH AMERICA - USA and Canada have regional files; others are country-level only
            ("North_America", "Canada", "Alberta"),
            ("North_America", "Canada", "British_Columbia"),
            ("North_America", "Canada", "Manitoba"),
            ("North_America", "Canada", "New_Brunswick"),
            ("North_America", "Canada", "Newfoundland_and_Labrador"),
            ("North_America", "Canada", "Northwest_Territories"),
            ("North_America", "Canada", "Nova_Scotia"),
            ("North_America", "Canada", "Nunavut"),
            ("North_America", "Canada", "Ontario"),
            ("North_America", "Canada", "Prince_Edward_Island"),
            ("North_America", "Canada", "Quebec"),
            ("North_America", "Canada", "Saskatchewan"),
            ("North_America", "Canada", "Yukon"),
            ("North_America", "Greenland"),
            ("North_America", "Mexico"),
            ("North_America", "United_States", "Alabama"),
            ("North_America", "United_States", "Alaska"),
            ("North_America", "United_States", "Arizona"),
            ("North_America", "United_States", "Arkansas"),
            ("North_America", "United_States", "California", "Northern_California"),
            ("North_America", "United_States", "California", "Southern_California"),
            ("North_America", "United_States", "Colorado"),
            ("North_America", "United_States", "Connecticut"),
            ("North_America", "United_States", "Delaware"),
            ("North_America", "United_States", "District_of_Columbia"),
            ("North_America", "United_States", "Florida"),
            ("North_America", "United_States", "Georgia"),
            ("North_America", "United_States", "Hawaii"),
            ("North_America", "United_States", "Idaho"),
            ("North_America", "United_States", "Illinois"),
            ("North_America", "United_States", "Indiana"),
            ("North_America", "United_States", "Iowa"),
            ("North_America", "United_States", "Kansas"),
            ("North_America", "United_States", "Kentucky"),
            ("North_America", "United_States", "Louisiana"),
            ("North_America", "United_States", "Maine"),
            ("North_America", "United_States", "Maryland"),
            ("North_America", "United_States", "Massachusetts"),
            ("North_America", "United_States", "Michigan"),
            ("North_America", "United_States", "Minnesota"),
            ("North_America", "United_States", "Mississippi"),
            ("North_America", "United_States", "Missouri"),
            ("North_America", "United_States", "Montana"),
            ("North_America", "United_States", "Nebraska"),
            ("North_America", "United_States", "Nevada"),
            ("North_America", "United_States", "New_Hampshire"),
            ("North_America", "United_States", "New_Jersey"),
            ("North_America", "United_States", "New_Mexico"),
            ("North_America", "United_States", "New_York"),
            ("North_America", "United_States", "North_Carolina"),
            ("North_America", "United_States", "North_Dakota"),
            ("North_America", "United_States", "Ohio"),
            ("North_America", "United_States", "Oklahoma"),
            ("North_America", "United_States", "Oregon"),
            ("North_America", "United_States", "Pennsylvania"),
            ("North_America", "United_States", "Puerto_Rico"),
            ("North_America", "United_States", "Rhode_Island"),
            ("North_America", "United_States", "South_Carolina"),
            ("North_America", "United_States", "South_Dakota"),
            ("North_America", "United_States", "Tennessee"),
            ("North_America", "United_States", "Texas"),
            ("North_America", "United_States", "US_Virgin_Islands"),
            ("North_America", "United_States", "Utah"),
            ("North_America", "United_States", "Vermont"),
            ("North_America", "United_States", "Virginia"),
            ("North_America", "United_States", "Washington"),
            ("North_America", "United_States", "West_Virginia"),
            ("North_America", "United_States", "Wisconsin"),
            ("North_America", "United_States", "Wyoming"),
            
            # SOUTH AMERICA - Brazil has regional files; all others are country-level only
            ("South_America", "Argentina"),
            ("South_America", "Bolivia"),
            ("South_America", "Brazil", "Centro_Oeste"),
            ("South_America", "Brazil", "Nordeste"),
            ("South_America", "Brazil", "Norte"),
            ("South_America", "Brazil", "Sudeste"),
            ("South_America", "Brazil", "Sul"),
            ("South_America", "Chile"),  # Country-level only - no regional files on Geofabrik
            ("South_America", "Colombia"),
            ("South_America", "Ecuador"),
            ("South_America", "French_Guiana"),
            ("South_America", "Guyana"),
            ("South_America", "Paraguay"),
            ("South_America", "Peru"),
            ("South_America", "Suriname"),
            ("South_America", "Uruguay"),
            ("South_America", "Venezuela"),
        ]
    
    def download_world(self):
        """Download all available OSM data worldwide"""
        regions = self.get_all_regions()
        
        print("="*80)
        print("WORLDWIDE OSM DATA DOWNLOAD")
        print("="*80)
        print(f"Total regions to process: {len(regions)}")
        print("This will take several hours and requires significant bandwidth/storage.")
        print("="*80)
        
        self.download_batch(regions)
    
    def download_batch(self, regions):
        """Download a batch of regions with progress tracking"""
        print("="*80)
        print(f"DOWNLOADING {len(regions)} REGIONS")
        print("="*80)
        
        for i, region_tuple in enumerate(regions, 1):
            continent = region_tuple[0] if len(region_tuple) > 0 else None
            country = region_tuple[1] if len(region_tuple) > 1 else None
            region = region_tuple[2] if len(region_tuple) > 2 else None
            subregion = region_tuple[3] if len(region_tuple) > 3 else None
            
            region_name = ' > '.join([str(r) for r in region_tuple if r])
            print(f"\n[{i}/{len(regions)}] {region_name}")
            
            # CASCADING DOWNLOAD STRATEGY (try most detailed first):
            # 1. Try subregion (if specified)
            # 2. Try region (if specified and subregion fails)
            # 3. Try country (last resort)
            
            success = False
            
            # Level 1: Try subregion (most detailed)
            if subregion:
                url, destination = self.build_url_and_path(continent, country, region, subregion)
                print(f"🎯 Attempting subregion-level download...")
                if self.try_download(url, destination):
                    success = True
            
            # Level 2: Try region (fallback if subregion failed)
            if not success and region:
                url, destination = self.build_url_and_path(continent, country, region, None)
                print(f"🔄 Subregion not available, trying region-level...")
                if self.try_download(url, destination):
                    success = True
            
            # Level 3: Try country (last resort)
            if not success:
                url, destination = self.build_url_and_path(continent, country, None, None)
                if subregion or region:
                    print(f"🔄 Region not available, trying country-level...")
                if self.try_download(url, destination):
                    success = True
            
            if not success:
                print(f"❌ No data available at any level")
                self.failed.append(region_name)
            
            time.sleep(0.5)
        
        # Summary
        print("\n" + "="*80)
        print("DOWNLOAD COMPLETE")
        print("="*80)
        print(f"✅ Successfully downloaded: {len(self.successful)}")
        print(f"⏭️  Skipped (already existed): {len(self.skipped)}")
        print(f"❌ Failed/Not available: {len(self.failed)}")
        print("="*80)


def interactive_menu():
    """Interactive menu for selecting regions to download"""
    downloader = WorldOSMDownloader()
    all_regions = downloader.get_all_regions()
    
    # Group by continent
    continents = {}
    for region in all_regions:
        continent = region[0]
        if continent not in continents:
            continents[continent] = []
        continents[continent].append(region)
    
    while True:
        print("\n" + "="*80)
        print("OSM DATA DOWNLOADER - INTERACTIVE MODE")
        print("="*80)
        print("\n📍 SELECT WHAT TO DOWNLOAD:\n")
        print("  1. Download entire world (500+ regions)")
        print("  2. Download by continent")
        print("  3. Download by country")
        print("  4. Download specific regions (custom selection)")
        print("  0. Exit")
        print()
        
        choice = input("Enter your choice (0-4): ").strip()
        
        if choice == "0":
            print("\n👋 Goodbye!")
            break
        
        elif choice == "1":
            # Download entire world
            print(f"\n⚠️  This will download {len(all_regions)} regions")
            print("   Total size: Several hundred GB")
            confirm = input("\nContinue? (yes/no): ").strip().lower()
            if confirm in ['yes', 'y']:
                downloader.download_batch(all_regions)
            else:
                print("❌ Cancelled")
        
        elif choice == "2":
            # Download by continent
            print("\n🌍 SELECT CONTINENT:\n")
            continent_list = sorted(continents.keys())
            for i, cont in enumerate(continent_list, 1):
                count = len(continents[cont])
                print(f"  {i}. {cont.replace('_', ' ')} ({count} regions)")
            print("  0. Back")
            
            cont_choice = input("\nEnter continent number: ").strip()
            if cont_choice == "0":
                continue
            
            try:
                cont_idx = int(cont_choice) - 1
                if 0 <= cont_idx < len(continent_list):
                    selected_continent = continent_list[cont_idx]
                    regions_to_download = continents[selected_continent]
                    
                    print(f"\n📥 Will download {len(regions_to_download)} regions from {selected_continent}")
                    confirm = input("Continue? (yes/no): ").strip().lower()
                    if confirm in ['yes', 'y']:
                        downloader.download_batch(regions_to_download)
                    else:
                        print("❌ Cancelled")
                else:
                    print("❌ Invalid selection")
            except ValueError:
                print("❌ Please enter a number")
        
        elif choice == "3":
            # Download by country
            print("\n🏳️  SELECT CONTINENT FIRST:\n")
            continent_list = sorted(continents.keys())
            for i, cont in enumerate(continent_list, 1):
                print(f"  {i}. {cont.replace('_', ' ')}")
            print("  0. Back")
            
            cont_choice = input("\nEnter continent number: ").strip()
            if cont_choice == "0":
                continue
            
            try:
                cont_idx = int(cont_choice) - 1
                if 0 <= cont_idx < len(continent_list):
                    selected_continent = continent_list[cont_idx]
                    
                    # Get unique countries in this continent
                    countries_dict = {}
                    for region in continents[selected_continent]:
                        if len(region) >= 2:
                            country = region[1]
                            if country not in countries_dict:
                                countries_dict[country] = []
                            countries_dict[country].append(region)
                    
                    print(f"\n🏳️  SELECT COUNTRY FROM {selected_continent}:\n")
                    country_list = sorted(countries_dict.keys())
                    for i, country in enumerate(country_list, 1):
                        count = len(countries_dict[country])
                        print(f"  {i}. {country.replace('_', ' ')} ({count} regions)")
                    print("  0. Back")
                    
                    country_choice = input("\nEnter country number: ").strip()
                    if country_choice == "0":
                        continue
                    
                    try:
                        country_idx = int(country_choice) - 1
                        if 0 <= country_idx < len(country_list):
                            selected_country = country_list[country_idx]
                            regions_to_download = countries_dict[selected_country]
                            
                            print(f"\n📥 Will download {len(regions_to_download)} regions from {selected_country}")
                            
                            # Show what will be downloaded
                            print("\nRegions:")
                            for region in regions_to_download[:10]:
                                print(f"  - {' > '.join(str(r) for r in region)}")
                            if len(regions_to_download) > 10:
                                print(f"  ... and {len(regions_to_download) - 10} more")
                            
                            confirm = input("\nContinue? (yes/no): ").strip().lower()
                            if confirm in ['yes', 'y']:
                                downloader.download_batch(regions_to_download)
                            else:
                                print("❌ Cancelled")
                        else:
                            print("❌ Invalid selection")
                    except ValueError:
                        print("❌ Please enter a number")
                else:
                    print("❌ Invalid selection")
            except ValueError:
                print("❌ Please enter a number")
        
        elif choice == "4":
            # Custom selection
            print("\n🎯 CUSTOM SELECTION")
            print("\nEnter region codes separated by commas")
            print("Examples:")
            print("  Europe/Germany")
            print("  Europe/Spain/Andalucia")
            print("  South_America/Chile/Metropolitana")
            print()
            
            regions_input = input("Enter regions (or 'list' to see all, '0' to cancel): ").strip()
            
            if regions_input == "0":
                continue
            elif regions_input.lower() == "list":
                print("\n📋 ALL AVAILABLE REGIONS:\n")
                for region in all_regions[:50]:
                    print(f"  {'/'.join(str(r) for r in region)}")
                if len(all_regions) > 50:
                    print(f"\n  ... and {len(all_regions) - 50} more")
                    print("\n  (Full list too long for display)")
                continue
            else:
                # Parse input
                region_codes = [r.strip() for r in regions_input.split(',')]
                regions_to_download = []
                
                for code in region_codes:
                    parts = tuple(code.split('/'))
                    # Find matching regions
                    matches = [r for r in all_regions if r == parts or (len(r) >= len(parts) and r[:len(parts)] == parts)]
                    regions_to_download.extend(matches)
                
                if regions_to_download:
                    print(f"\n📥 Found {len(regions_to_download)} matching regions")
                    for region in regions_to_download[:10]:
                        print(f"  - {' > '.join(str(r) for r in region)}")
                    if len(regions_to_download) > 10:
                        print(f"  ... and {len(regions_to_download) - 10} more")
                    
                    confirm = input("\nContinue? (yes/no): ").strip().lower()
                    if confirm in ['yes', 'y']:
                        downloader.download_batch(regions_to_download)
                    else:
                        print("❌ Cancelled")
                else:
                    print("❌ No matching regions found")
        
        else:
            print("❌ Invalid choice. Please enter 0-4")


def main():
    interactive_menu()


if __name__ == "__main__":
    main()
