# start_calliope_service.ps1
# Starts the Calliope web service (FastAPI/uvicorn) using the local calliope conda environment.
# Use this as a fallback when Docker Desktop is unavailable.
#
# Usage:
#   .\scripts\start_calliope_service.ps1
#   .\scripts\start_calliope_service.ps1 -Port 5000

param(
    # Port 5000 is occupied by the Docker Desktop backend on Windows even when Docker
    # is not running a calliope-runner container, so default to 5001.
    # The Vite frontend reads VITE_CALLIOPE_SERVICE_URL from .env.local (port 5001).
    [int]$Port = 5001
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PythonDir = Join-Path $RepoRoot "python"

Write-Host "[Calliope Service] Starting on port $Port using conda env 'calliope'..." -ForegroundColor Cyan

conda run -n calliope uvicorn calliope_service:app `
    --host 0.0.0.0 `
    --port $Port `
    --app-dir $PythonDir
