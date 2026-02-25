# Import OSM data to PostgreSQL using Docker
# No osm2pgsql installation needed!

param(
    [string]$PostgresPassword = "geoserver123",
    [string]$OsmFile = "niederbayern-latest.osm.pbf"
)

Write-Host "`n=== OSM Data Import via Docker ===" -ForegroundColor Cyan

# Check prerequisites
if (!(Test-Path $OsmFile)) {
    Write-Host "[ERROR] OSM file not found: $OsmFile" -ForegroundColor Red
    Write-Host "Make sure the file is in the current directory" -ForegroundColor Yellow
    exit 1
}

# Verify Docker is running
$dockerTest = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Docker is running" -ForegroundColor Green
Write-Host "[OK] OSM file found: $OsmFile" -ForegroundColor Green

# Get current directory (Docker needs forward slashes)
$currentDir = (Get-Location).Path.Replace('\', '/')
$osmFileSize = (Get-Item $OsmFile).Length / 1MB
Write-Host "[INFO] File size: $([math]::Round($osmFileSize, 2)) MB" -ForegroundColor Cyan

Write-Host "`nStarting import (this may take 10-30 minutes)..." -ForegroundColor Yellow
Write-Host "Docker will download osm2pgsql image (first time only)" -ForegroundColor Gray

# Use a reliable Docker image with osm2pgsql
# iboates/osm2pgsql - community maintained image
Write-Host "`nCommand: docker run iboates/osm2pgsql:latest" -ForegroundColor Gray

docker run --rm `
  -e PGPASSWORD=$PostgresPassword `
  -v "${currentDir}:/data" `
  iboates/osm2pgsql:latest `
  osm2pgsql `
    --create `
    --database gis `
    --username postgres `
    --host host.docker.internal `
    --port 5432 `
    --hstore `
    --latlong `
    /data/$OsmFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] OSM data imported!" -ForegroundColor Green
    
    # Test the data
    Write-Host "`nVerifying imported data..." -ForegroundColor Yellow
    $env:PGPASSWORD = $PostgresPassword
    $env:Path += ";C:\Program Files\PostgreSQL\17\bin"
    
    $tables = psql -U postgres -d gis -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'planet_osm%';"
    Write-Host "[OK] Imported tables:" -ForegroundColor Green
    Write-Host $tables -ForegroundColor Cyan
    
    Write-Host "`nNext: Create views and configure GeoServer" -ForegroundColor Yellow
    Write-Host "Run: .\scripts\setup_complete.ps1" -ForegroundColor Cyan
    
} else {
    Write-Host "`n[WARNING] Import completed with errors" -ForegroundColor Yellow
    Write-Host "Check the output above for details" -ForegroundColor Gray
}
