# ==============================================================================
# GeoServer + PostGIS Setup Script for TEMPO
# ==============================================================================
# This script sets up the complete GeoServer stack using Docker:
#   - PostGIS database (port 5432)
#   - GeoServer application (port 8080)
#   - Configures layers and workspace
#   - Optionally loads OSM data for a region
#
# Usage:
#   .\setup_geoserver_docker.ps1                    # Setup without data
#   .\setup_geoserver_docker.ps1 -LoadRegion "Europe/Germany/Bayern"
#   .\setup_geoserver_docker.ps1 -Reset             # Remove and recreate containers
#
# ==============================================================================

param(
    [string]$LoadRegion = "",
    [switch]$Reset = $false
)

$ErrorActionPreference = "Stop"

Write-Host "`n" -NoNewline
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     TEMPO GeoServer + PostGIS Setup (Docker)                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ==============================================================================
# Configuration
# ==============================================================================

$POSTGIS_CONTAINER = "calliope-postgis"
$GEOSERVER_CONTAINER = "calliope-geoserver"
$POSTGRES_PASSWORD = "geoserver123"
$POSTGRES_USER = "postgres"
$POSTGRES_DB = "gis"
$GEOSERVER_ADMIN = "admin"
$GEOSERVER_PASSWORD = "geoserver"

# ==============================================================================
# Step 1: Check Prerequisites
# ==============================================================================

Write-Host "[1/8] Checking prerequisites..." -ForegroundColor Yellow

# Check Docker
$dockerTest = docker --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Docker is not installed!" -ForegroundColor Red
    Write-Host "  Please install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Docker is not running!" -ForegroundColor Red
    Write-Host "  Please start Docker Desktop and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host "  ✓ Docker is running ($dockerTest)" -ForegroundColor Green

# Check Python
$pythonTest = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [WARNING] Python not found - OSM data loading will be unavailable" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ Python found ($pythonTest)" -ForegroundColor Green
}

# ==============================================================================
# Step 2: Stop and Remove Existing Containers (if Reset)
# ==============================================================================

if ($Reset) {
    Write-Host "`n[2/8] Removing existing containers and network..." -ForegroundColor Yellow
    
    # Check and remove containers if they exist
    $postgisExists = docker ps -aq --filter "name=$POSTGIS_CONTAINER"
    if ($postgisExists) {
        docker stop $POSTGIS_CONTAINER *>$null
        docker rm $POSTGIS_CONTAINER *>$null
    }
    
    $geoserverExists = docker ps -aq --filter "name=$GEOSERVER_CONTAINER"
    if ($geoserverExists) {
        docker stop $GEOSERVER_CONTAINER *>$null
        docker rm $GEOSERVER_CONTAINER *>$null
    }
    
    # Remove network if it exists
    $networkExists = docker network ls -q --filter "name=calliope-network"
    if ($networkExists) {
        docker network rm calliope-network *>$null
    }
    
    Write-Host "  ✓ Old containers and network removed" -ForegroundColor Green
    
    # Give Docker a moment to release the ports
    Start-Sleep -Seconds 2
}

# Check if required ports are available
Write-Host "`n  Checking ports..." -ForegroundColor Gray
$port8080InUse = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
$port5432InUse = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue

if ($port8080InUse) {
    Write-Host "  [ERROR] Port 8080 is still in use!" -ForegroundColor Red
    $process = Get-Process -Id $port8080InUse.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Process using port 8080: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Yellow
        Write-Host "  To kill it, run as Administrator: taskkill /PID $($process.Id) /F" -ForegroundColor Cyan
    }
    exit 1
}

if ($port5432InUse) {
    Write-Host "  [ERROR] Port 5432 is still in use!" -ForegroundColor Red
    $process = Get-Process -Id $port5432InUse.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Process using port 5432: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Yellow
        Write-Host "  To kill it, run as Administrator: taskkill /PID $($process.Id) /F" -ForegroundColor Cyan
    }
    exit 1
}

Write-Host "  ✓ Ports 8080 and 5432 are available" -ForegroundColor Green

if (-not $Reset) {
    Write-Host "`n[2/8] Checking existing containers..." -ForegroundColor Yellow
    
    # Check if containers already exist
    $postgisExists = docker ps -a --filter "name=$POSTGIS_CONTAINER" --format "{{.Names}}" 2>&1 | Out-String
    $geoserverExists = docker ps -a --filter "name=$GEOSERVER_CONTAINER" --format "{{.Names}}" 2>&1 | Out-String
    
    if ($postgisExists.Trim() -eq $POSTGIS_CONTAINER -or $geoserverExists.Trim() -eq $GEOSERVER_CONTAINER) {
        Write-Host "  [INFO] Containers already exist. Starting them..." -ForegroundColor Cyan
        
        if ($postgisExists.Trim() -eq $POSTGIS_CONTAINER) {
            $null = docker start $POSTGIS_CONTAINER 2>&1
            Write-Host "  ✓ PostGIS container started" -ForegroundColor Green
        }
        
        if ($geoserverExists.Trim() -eq $GEOSERVER_CONTAINER) {
            $null = docker start $GEOSERVER_CONTAINER 2>&1
            Write-Host "  ✓ GeoServer container started" -ForegroundColor Green
        }
        
        Write-Host "`n  Containers are already configured. Use -Reset to recreate them." -ForegroundColor Yellow
        Write-Host "  GeoServer: http://localhost:8080/geoserver" -ForegroundColor Cyan
        Write-Host "  Credentials: admin / geoserver" -ForegroundColor Gray
        exit 0
    }
    
    Write-Host "  ✓ No existing containers found" -ForegroundColor Green
}

# ==============================================================================
# Step 3: Create Docker Network
# ==============================================================================

Write-Host "`n[3/8] Creating Docker network..." -ForegroundColor Yellow

# Check if network exists
$networkExists = docker network ls --filter "name=calliope-network" --format "{{.Name}}" 2>&1 | Out-String
if ($networkExists.Trim() -eq "calliope-network") {
    Write-Host "  ✓ Network 'calliope-network' already exists" -ForegroundColor Green
} else {
    docker network create calliope-network
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] Failed to create Docker network!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Network 'calliope-network' created" -ForegroundColor Green
}

# ==============================================================================
# Step 4: Create PostGIS Container
# ==============================================================================

Write-Host "`n[4/8] Creating PostGIS container..." -ForegroundColor Yellow

docker run -d --name $POSTGIS_CONTAINER --network calliope-network -e POSTGRES_USER=$POSTGRES_USER -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD -e POSTGRES_DB=$POSTGRES_DB -p 5432:5432 -v calliope-postgis-data:/var/lib/postgresql/data postgis/postgis:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to create PostGIS container!" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ PostGIS container created" -ForegroundColor Green
Write-Host "    Waiting for PostgreSQL to be ready..." -ForegroundColor Gray

# Wait for PostgreSQL to be ready
$maxAttempts = 30
$attempt = 0
$ready = $false

while (-not $ready -and $attempt -lt $maxAttempts) {
    $attempt++
    Start-Sleep -Seconds 2
    
    $test = docker exec $POSTGIS_CONTAINER pg_isready -U $POSTGRES_USER 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
    } else {
        Write-Host "    Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    }
}

if (-not $ready) {
    Write-Host "  [ERROR] PostgreSQL failed to start!" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ PostgreSQL is ready" -ForegroundColor Green

# ==============================================================================
# Step 5: Create GeoServer Container
# ==============================================================================

Write-Host "`n[5/8] Creating GeoServer container..." -ForegroundColor Yellow

docker run -d --name $GEOSERVER_CONTAINER --network calliope-network -e GEOSERVER_ADMIN_USER=$GEOSERVER_ADMIN -e GEOSERVER_ADMIN_PASSWORD=$GEOSERVER_PASSWORD -e INITIAL_MEMORY=512M -e MAXIMUM_MEMORY=2G -p 8080:8080 -v calliope-geoserver-data:/opt/geoserver_data kartoza/geoserver:latest

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to create GeoServer container!" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ GeoServer container created" -ForegroundColor Green
Write-Host "    Waiting for GeoServer to be ready (this may take 1-2 minutes)..." -ForegroundColor Gray

# Wait for GeoServer to be ready
$maxAttempts = 60
$attempt = 0
$ready = $false

while (-not $ready -and $attempt -lt $maxAttempts) {
    $attempt++
    Start-Sleep -Seconds 3
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/geoserver/web/" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
        }
    } catch {
        Write-Host "    Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    }
}

if (-not $ready) {
    Write-Host "  [ERROR] GeoServer failed to start!" -ForegroundColor Red
    Write-Host "  Check logs: docker logs $GEOSERVER_CONTAINER" -ForegroundColor Yellow
    exit 1
}

Write-Host "  ✓ GeoServer is ready" -ForegroundColor Green

# ==============================================================================
# Step 6: Create Database Tables
# ==============================================================================

Write-Host "`n[6/8] Creating OSM database tables..." -ForegroundColor Yellow

$createTablesSQL = @"
-- OSM Substations
CREATE TABLE IF NOT EXISTS osm_substations (
    id SERIAL PRIMARY KEY,
    osm6: Create Database Tables
# ==============================================================================

Write-Host "`n[6,
    voltage_primary TEXT,
    operator TEXT,
    frequency TEXT,
    ref TEXT,
    region_path TEXT,
    country TEXT,
    continent TEXT,
    geom GEOMETRY(Point, 4326)
);

-- OSM Power Plants
CREATE TABLE IF NOT EXISTS osm_power_plants (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT,
    name TEXT,
    source TEXT,
    plant_output_source TEXT,
    capacity_mw REAL,
    operator TEXT,
    plant_type TEXT,
    region_path TEXT,
    country TEXT,
    continent TEXT,
    geom GEOMETRY(Point, 4326)
);

-- OSM Power Lines
CREATE TABLE IF NOT EXISTS osm_power_lines (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT,
    name TEXT,
    voltage TEXT,
    cables INTEGER,
    frequency TEXT,
    operator TEXT,
    ref TEXT,
    region_path TEXT,
    country TEXT,
    continent TEXT,
    geom GEOMETRY(LineString, 4326)
);

-- OSM Communes
CREATE TABLE IF NOT EXISTS osm_communes (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT,
    name TEXT,
    admin_level INTEGER,
    boundary_type TEXT,
    region_path TEXT,
    country TEXT,
    continent TEXT,
    geom GEOMETRY(Polygon, 4326)
);

-- OSM Districts
CREATE TABLE IF NOT EXISTS osm_districts (
    id SERIAL PRIMARY KEY,
    osm_id BIGINT,
    name TEXT,
    admin_level INTEGER,
    boundary_type TEXT,
    region_path TEXT,
    country TEXT,
    continent TEXT,
    geom GEOMETRY(Polygon, 4326)
);

-- Create spatial indexes
CREATE INDEX IF NOT EXISTS idx_osm_substations_geom ON osm_substations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_osm_power_plants_geom ON osm_power_plants USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_osm_power_lines_geom ON osm_power_lines USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_osm_communes_geom ON osm_communes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_osm_districts_geom ON osm_districts USING GIST (geom);

-- Create region indexes
CREATE INDEX IF NOT EXISTS idx_osm_substations_region ON osm_substations (region_path);
CREATE INDEX IF NOT EXISTS idx_osm_power_plants_region ON osm_power_plants (region_path);
CREATE INDEX IF NOT EXISTS idx_osm_power_lines_region ON osm_power_lines (region_path);
CREATE INDEX IF NOT EXISTS idx_osm_communes_region ON osm_communes (region_path);
CREATE INDEX IF NOT EXISTS idx_osm_districts_region ON osm_districts (region_path);
"@

# Write SQL to temporary file
$tempSQLFile = [System.IO.Path]::GetTempFileName()
$createTablesSQL | Out-File -FilePath $tempSQLFile -Encoding UTF8

# Copy SQL file to container and execute
$containerTempFile = "/tmp/create_tables.sql"
docker cp $tempSQLFile "${POSTGIS_CONTAINER}:${containerTempFile}"
docker exec $POSTGIS_CONTAINER psql -U $POSTGRES_USER -d $POSTGRES_DB -f $containerTempFile

Remove-Item $tempSQLFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to create tables!" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Database tables created" -ForegroundColor Green

# ==============================================================================
# Step 7: Configure GeoServer Workspace and Layers
# ==============================================================================

Write-Host "`n[7/8] Configuring GeoServer workspace and layers..." -ForegroundColor Yellow

# Check if Python is available
if ($pythonTest) {
    $pythonScript = Join-Path $PSScriptRoot "..\osm_processing\configure_geoserver.py"
    
    if (Test-Path $pythonScript) {
        Write-Host "  Running configure_geoserver.py..." -ForegroundColor Gray
        
        # Wait a bit more for GeoServer to fully initialize
        Start-Sleep -Seconds 10
        
        Push-Location (Split-Path $pythonScript)
        python configure_geoserver.py
        Pop-Location
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ GeoServer configured" -ForegroundColor Green
        } else {
            Write-Host "  [WARNING] GeoServer configuration had issues" -ForegroundColor Yellow
            Write-Host "  You can manually run: python osm_processing\configure_geoserver.py" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARNING] configure_geoserver.py not found" -ForegroundColor Yellow
        Write-Host "  You may need to manually configure GeoServer workspace" -ForegroundColor Gray
    }
} else {
    Write-Host "  [SKIP] Python not available, skipping automatic configuration" -ForegroundColor Yellow
    Write-Host "  Install Python and run: python osm_processing\configure_geoserver.py" -ForegroundColor Gray
}

# ==============================================================================
# Step 8: Load Region Data (Optional)
# ==============================================================================

Write-Host "`n[8/8] Loading OSM region data..." -ForegroundColor Yellow

if ($LoadRegion -ne "") {
    if ($pythonTest) {
        $addRegionScript = Join-Path $PSScriptRoot "..\osm_processing\add_region_to_geoserver.py"
        
        if (Test-Path $addRegionScript) {
            Write-Host "  Loading region: $LoadRegion" -ForegroundColor Cyan
            
            $regionParts = $LoadRegion -split '/'
            
            Push-Location (Split-Path $addRegionScript)
            python add_region_to_geoserver.py @regionParts
            Pop-Location
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Region data loaded" -ForegroundColor Green
            } else {
                Write-Host "  [WARNING] Failed to load region data" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  [WARNING] add_region_to_geoserver.py not found" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [SKIP] Python not available" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [SKIP] No region specified" -ForegroundColor Gray
    Write-Host "  To load data later, run:" -ForegroundColor Gray
    Write-Host "    python osm_processing\add_region_to_geoserver.py Europe Germany Bayern" -ForegroundColor Cyan
}

# ==============================================================================
# Summary
# ==============================================================================

Write-Host "`n" -NoNewline
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    Setup Complete! ✓                          ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "GeoServer URL:  " -NoNewline -ForegroundColor White
Write-Host "http://localhost:8080/geoserver" -ForegroundColor Cyan

Write-Host "Web Interface:  " -NoNewline -ForegroundColor White
Write-Host "http://localhost:8080/geoserver/web/" -ForegroundColor Cyan

Write-Host "Credentials:    " -NoNewline -ForegroundColor White
Write-Host "admin / geoserver" -ForegroundColor Yellow

Write-Host "`nPostGIS:        " -NoNewline -ForegroundColor White
Write-Host "localhost:5432 (database: gis)" -ForegroundColor Cyan

Write-Host "Credentials:    " -NoNewline -ForegroundColor White
Write-Host "postgres / geoserver123" -ForegroundColor Yellow

Write-Host "`nDocker Commands:" -ForegroundColor White
Write-Host "  Start:   " -NoNewline -ForegroundColor Gray
Write-Host "docker start $POSTGIS_CONTAINER $GEOSERVER_CONTAINER" -ForegroundColor Cyan

Write-Host "  Stop:    " -NoNewline -ForegroundColor Gray
Write-Host "docker stop $GEOSERVER_CONTAINER $POSTGIS_CONTAINER" -ForegroundColor Cyan

Write-Host "  Restart: " -NoNewline -ForegroundColor Gray
Write-Host "docker restart $POSTGIS_CONTAINER $GEOSERVER_CONTAINER" -ForegroundColor Cyan

Write-Host "  Status:  " -NoNewline -ForegroundColor Gray
Write-Host "docker ps" -ForegroundColor Cyan

Write-Host "  Logs:    " -NoNewline -ForegroundColor Gray
Write-Host "docker logs $GEOSERVER_CONTAINER" -ForegroundColor Cyan

Write-Host "`nNext Steps:" -ForegroundColor White
Write-Host "  1. Open TEMPO and go to Settings" -ForegroundColor Gray
Write-Host "  2. Set GeoServer URL to: http://localhost:8080/geoserver" -ForegroundColor Gray
Write-Host "  3. Set Workspace to: osm" -ForegroundColor Gray
Write-Host "  4. Load OSM data for your region (see documentation)" -ForegroundColor Gray

Write-Host ""
