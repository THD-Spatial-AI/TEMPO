# =============================================================================
# Setup Calliope Conda Environment  (Windows)
# Run this once before launching the Calliope Visualizator app.
#
# Usage:
#   .\scripts\setup_calliope_env.ps1
#
# What it does:
#   1. Verifies that conda (Miniconda / Anaconda) is available on PATH.
#   2. Creates a "calliope" conda environment with the calliope package and
#      the CBC solver from conda-forge.
#   3. Verifies the installation by importing calliope inside the environment.
# =============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Calliope Environment Setup (Windows)  " -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Locate conda
# ---------------------------------------------------------------------------
$condaCmd = $null

# Try to find conda on PATH first
try {
    $condaCmd = (Get-Command conda -ErrorAction SilentlyContinue).Source
} catch {}

if (-not $condaCmd) {
    # Common install locations
    $candidates = @(
        "$env:USERPROFILE\Miniconda3\Scripts\conda.exe",
        "$env:USERPROFILE\miniconda3\Scripts\conda.exe",
        "$env:USERPROFILE\Anaconda3\Scripts\conda.exe",
        "$env:USERPROFILE\anaconda3\Scripts\conda.exe",
        "C:\ProgramData\Miniconda3\Scripts\conda.exe",
        "C:\ProgramData\miniconda3\Scripts\conda.exe",
        "C:\ProgramData\Anaconda3\Scripts\conda.exe",
        "C:\tools\miniconda3\Scripts\conda.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $condaCmd = $c
            break
        }
    }
}

if (-not $condaCmd) {
    Write-Host "ERROR: conda not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Miniconda from https://docs.conda.io/en/latest/miniconda.html" -ForegroundColor Yellow
    Write-Host "Then re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found conda at: $condaCmd" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. Check if 'calliope' environment already exists
# ---------------------------------------------------------------------------
$envList = & $condaCmd env list 2>&1 | Out-String
if ($envList -match '(?m)^\s*calliope\s') {
    Write-Host ""
    Write-Host "The 'calliope' conda environment already exists." -ForegroundColor Yellow
    Write-Host "To reinstall, remove it first with:  conda env remove -n calliope" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Verifying existing installation …" -ForegroundColor Cyan
} else {
    # ---------------------------------------------------------------------------
    # 3. Create the calliope environment
    # ---------------------------------------------------------------------------
    Write-Host ""
    Write-Host "Creating 'calliope' conda environment (this may take several minutes) …" -ForegroundColor Cyan
    Write-Host "  Installing: calliope, coin-or-cbc, python=3.9" -ForegroundColor Gray
    Write-Host ""

    & $condaCmd create -y -c conda-forge -n calliope calliope coin-or-cbc python=3.9
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: conda create failed." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "Environment created successfully." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 4. Verify installation
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Verifying calliope installation …" -ForegroundColor Cyan

$verify = & $condaCmd run -n calliope python -c "import calliope; print('calliope version:', calliope.__version__)" 2>&1
Write-Host $verify

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: calliope could not be imported in the environment." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  Setup complete! You can now run the  " -ForegroundColor Green
Write-Host "  Calliope Visualizator application.   " -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
