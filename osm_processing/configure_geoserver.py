"""
Configure GeoServer to serve OSM layers from PostGIS
This script uses GeoServer REST API to create workspace, datastore, and layers

Usage: python configure_geoserver.py
"""

import requests
import json
from requests.auth import HTTPBasicAuth

# GeoServer configuration
GEOSERVER_URL = "http://localhost:8080/geoserver"
GEOSERVER_USER = "admin"
GEOSERVER_PASSWORD = "geoserver"  # Default GeoServer password

# PostGIS connection
POSTGIS_CONFIG = {
    'host': 'localhost',
    'port': '5432',
    'database': 'gis',
    'schema': 'public',
    'user': 'postgres',
    'password': 'geoserver123'
}

# Layers to publish
LAYERS = [
    'osm_substations',
    'osm_power_plants',
    'osm_power_lines',
    'osm_communes',
    'osm_districts'
]

def create_workspace():
    """Create 'osm' workspace in GeoServer"""
    print("\n1. Checking workspace 'osm'...")
    
    # First check if workspace already exists
    check_url = f"{GEOSERVER_URL}/rest/workspaces/osm.json"
    check_response = requests.get(
        check_url,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD)
    )
    
    if check_response.status_code == 401:
        print(f"   ❌ Authentication failed!")
        print(f"   Please update GEOSERVER_PASSWORD in configure_geoserver.py")
        print(f"   Current password: '{GEOSERVER_PASSWORD}'")
        return False
    
    if check_response.status_code == 200:
        print("   ✓ Workspace 'osm' already exists")
        return True
    
    # Workspace doesn't exist, create it
    print("   Creating workspace 'osm'...")
    url = f"{GEOSERVER_URL}/rest/workspaces"
    headers = {'Content-Type': 'application/json'}
    data = {'workspace': {'name': 'osm'}}
    
    response = requests.post(
        url,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD),
        headers=headers,
        json=data
    )
    
    if response.status_code == 201:
        print("   ✓ Workspace 'osm' created")
        return True
    else:
        print(f"   ❌ Failed to create workspace: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

def create_datastore():
    """Create PostGIS datastore in GeoServer"""
    print("\n2. Checking PostGIS datastore...")
    
    # First check if datastore already exists
    check_url = f"{GEOSERVER_URL}/rest/workspaces/osm/datastores/osm_postgis.json"
    check_response = requests.get(
        check_url,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD)
    )
    
    if check_response.status_code == 200:
        print("   ✓ Datastore 'osm_postgis' already exists")
        return True
    
    # Datastore doesn't exist, create it
    print("   Creating PostGIS datastore...")
    url = f"{GEOSERVER_URL}/rest/workspaces/osm/datastores"
    headers = {'Content-Type': 'application/json'}
    
    data = {
        'dataStore': {
            'name': 'osm_postgis',
            'type': 'PostGIS',
            'enabled': True,
            'connectionParameters': {
                'entry': [
                    {'@key': 'host', '$': POSTGIS_CONFIG['host']},
                    {'@key': 'port', '$': POSTGIS_CONFIG['port']},
                    {'@key': 'database', '$': POSTGIS_CONFIG['database']},
                    {'@key': 'schema', '$': POSTGIS_CONFIG['schema']},
                    {'@key': 'user', '$': POSTGIS_CONFIG['user']},
                    {'@key': 'passwd', '$': POSTGIS_CONFIG['password']},
                    {'@key': 'dbtype', '$': 'postgis'},
                    {'@key': 'Expose primary keys', '$': 'true'},
                    {'@key': 'Estimated extends', '$': 'true'}
                ]
            }
        }
    }
    
    response = requests.post(
        url,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD),
        headers=headers,
        json=data
    )
    
    if response.status_code == 201:
        print("   ✓ Datastore 'osm_postgis' created")
        return True
    else:
        print(f"   ❌ Failed to create datastore: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

def delete_layer(layer_name):
    """Delete a layer if it exists"""
    # Try deleting from featureTypes endpoint first
    url1 = f"{GEOSERVER_URL}/rest/workspaces/osm/datastores/osm_postgis/featuretypes/{layer_name}"
    params = {'recurse': 'true'}
    
    response1 = requests.delete(
        url1,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD),
        params=params
    )
    
    # Also try deleting from layers endpoint (in case it's published differently)
    url2 = f"{GEOSERVER_URL}/rest/layers/osm:{layer_name}"
    response2 = requests.delete(
        url2,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD),
        params=params
    )
    
    if response1.status_code == 200 or response2.status_code == 200:
        print(f"      ✓ Deleted existing layer")
        return True
    elif response1.status_code == 404 and response2.status_code == 404:
        print(f"      ✓ No existing layer to delete")
        return True
    else:
        print(f"      ⚠ Delete status: featureType={response1.status_code}, layer={response2.status_code}")
        if response1.status_code not in [200, 404]:
            print(f"      featureType response: {response1.text[:200]}")
        if response2.status_code not in [200, 404]:
            print(f"      layer response: {response2.text[:200]}")
        return False

def publish_layer(layer_name):
    """Publish a layer from PostGIS table"""
    print(f"\n   Configuring layer '{layer_name}'...")
    
    # Always try to delete first (in case it exists)
    print(f"   Removing any existing layer...")
    delete_layer(layer_name)
    
    # Publish the layer
    print(f"   Publishing layer '{layer_name}'...")
    url = f"{GEOSERVER_URL}/rest/workspaces/osm/datastores/osm_postgis/featuretypes"
    headers = {'Content-Type': 'application/json'}
    
    data = {
        'featureType': {
            'name': layer_name,
            'nativeName': layer_name,
            'title': layer_name,
            'srs': 'EPSG:4326',
            'enabled': True,
            'store': {
                '@class': 'dataStore',
                'name': 'osm:osm_postgis'
            }
        }
    }
    
    response = requests.post(
        url,
        auth=HTTPBasicAuth(GEOSERVER_USER, GEOSERVER_PASSWORD),
        headers=headers,
        json=data
    )
    
    if response.status_code == 201:
        print(f"   ✓ Layer '{layer_name}' published successfully")
        return True
    else:
        print(f"   ❌ Failed to publish layer: {response.status_code}")
        print(f"   Response: {response.text}")
        return False

def verify_layer(layer_name):
    """Verify layer is accessible via WFS"""
    print(f"\n4. Verifying layer 'osm:{layer_name}'...")
    
    url = f"{GEOSERVER_URL}/wfs"
    params = {
        'service': 'WFS',
        'version': '2.0.0',
        'request': 'GetFeature',
        'typeName': f'osm:{layer_name}',
        'outputFormat': 'application/json',
        'count': '1'
    }
    
    response = requests.get(url, params=params)
    
    if response.status_code == 200:
        try:
            data = response.json()
            count = len(data.get('features', []))
            print(f"   ✓ Layer accessible, {count} feature(s) returned")
            return True
        except:
            print(f"   ❌ Invalid JSON response")
            return False
    else:
        print(f"   ❌ Failed to access layer: {response.status_code}")
        return False

def main():
    print("="*70)
    print("GEOSERVER CONFIGURATION FOR OSM LAYERS")
    print("="*70)
    print(f"\nGeoServer: {GEOSERVER_URL}")
    print(f"Database:  {POSTGIS_CONFIG['database']}@{POSTGIS_CONFIG['host']}:{POSTGIS_CONFIG['port']}")
    print(f"Layers:    {', '.join(LAYERS)}")
    
    # Step 1: Create workspace
    if not create_workspace():
        print("\n❌ Failed to create workspace. Check GeoServer credentials.")
        return
    
    # Step 2: Create datastore
    if not create_datastore():
        print("\n❌ Failed to create datastore. Check PostGIS connection.")
        return
    
    # Step 3: Publish layers
    print("\n" + "="*70)
    print("PUBLISHING LAYERS")
    print("="*70)
    
    success_count = 0
    for layer in LAYERS:
        if publish_layer(layer):
            success_count += 1
    
    # Step 4: Verify layers
    print("\n" + "="*70)
    print("VERIFYING LAYERS")
    print("="*70)
    
    verified_count = 0
    for layer in LAYERS:
        if verify_layer(layer):
            verified_count += 1
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"Published: {success_count}/{len(LAYERS)} layers")
    print(f"Verified:  {verified_count}/{len(LAYERS)} layers")
    
    if verified_count == len(LAYERS):
        print("\n✅ SUCCESS! All layers are configured and accessible.")
        print("\nYou can now use the frontend to view OSM infrastructure.")
        print(f"\nGeoServer admin panel: {GEOSERVER_URL}/web")
        print(f"Username: {GEOSERVER_USER}")
        print(f"Password: {GEOSERVER_PASSWORD}")
    else:
        print("\n⚠ Some layers failed to configure. Check errors above.")
        print(f"\nManual configuration: {GEOSERVER_URL}/web")

if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to GeoServer")
        print(f"Make sure GeoServer is running on {GEOSERVER_URL}")
        print("\nCheck if GeoServer is started (usually via startup script or service)")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
