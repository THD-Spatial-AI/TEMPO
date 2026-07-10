<#
.SYNOPSIS
    Standalone installer for the Calliope 0.7 (experimental) engine.

.DESCRIPTION
    Creates an isolated Python venv at %APPDATA%\TEMPO\calliope07-venv, installs
    the Calliope 0.7 stack, and downloads the CBC solver binary.

    Run this when the TEMPO Electron app is not available or when the in-app
    install panel fails.  After the script completes, launch the TEMPO app and
    the 0.7 service will start automatically.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install_calliope07.ps1

.NOTES
    Requires Python 3.10+ on PATH or via the py launcher.
    Internet access needed for pip and CBC download.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }

# ── Paths ─────────────────────────────────────────────────────────────────────

$tempoData  = Join-Path $env:APPDATA 'TEMPO'
$venvDir    = Join-Path $tempoData 'calliope07-venv'
$solverDir  = Join-Path $tempoData 'solvers\windows'
$scriptDir  = Split-Path -Parent $PSCommandPath
$repoRoot   = Split-Path -Parent $scriptDir
$pythonDir  = Join-Path $repoRoot 'python'
$reqService = Join-Path $pythonDir 'requirements.service.txt'
$reqCalliope07 = Join-Path $pythonDir 'requirements.calliope07.txt'

Write-Host "`nCalliope 0.7 Engine Installer" -ForegroundColor White
Write-Host "Venv location : $venvDir"
Write-Host "Solver dir    : $solverDir"
Write-Host "Requirements  : $reqCalliope07"

foreach ($f in @($reqService, $reqCalliope07)) {
    if (-not (Test-Path $f)) {
        Write-Error "Required file not found: $f`nRun this script from the TEMPO repository root."
    }
}

# ── Find Python 3.10+ ─────────────────────────────────────────────────────────

Write-Step 'Locating Python 3.10+ ...'

# Windows Store Python (path contains 'WindowsApps') cannot create venvs
# reliably: ensurepip fails because Store apps run in a restricted AppContainer
# that blocks subprocess creation. We skip any such path.
function Test-IsStorePython([string]$exePath) {
    return $exePath -match 'WindowsApps'
}

function Resolve-PythonExe([string]$cmd) {
    try {
        $exe = (& $cmd -c 'import sys; print(sys.executable)' 2>&1).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($exe)) { return $null }
        if (Test-IsStorePython $exe) {
            Write-Warn "Skipping Windows Store Python at $exe (restricted environment — use python.org installer)"
            return $null
        }
        return $exe
    } catch { return $null }
}

$pythonExe = $null

# Try py launcher first (most reliable on Windows — resolves to real python.org install)
foreach ($ver in @('3.13', '3.12', '3.11', '3.10')) {
    try {
        $out = & py "-$ver" --version 2>&1
        if ($out -match "Python $($ver -replace '\.','\\.')") {
            $candidate = Resolve-PythonExe "py -$ver"
            if ($candidate) {
                # py launcher resolved exe — double-check it's not Store
                $candidate = (& py "-$ver" -c 'import sys; print(sys.executable)' 2>&1).Trim()
                if (-not (Test-IsStorePython $candidate)) {
                    $pythonExe = $candidate
                    Write-OK "py -$ver → $pythonExe"
                    break
                } else {
                    Write-Warn "Skipping Windows Store Python for py -$ver"
                }
            }
        }
    } catch { }
}

# Fall back to PATH candidates
if (-not $pythonExe) {
    foreach ($cmd in @('python3.11', 'python3.12', 'python3.10', 'python3.13', 'python3', 'python')) {
        try {
            $out = & $cmd --version 2>&1
            if ($out -match 'Python 3\.(1[0-9]|[2-9]\d)') {
                $exe = Resolve-PythonExe $cmd
                if ($exe) {
                    $pythonExe = $exe
                    Write-OK "$cmd → $pythonExe"
                    break
                }
            }
        } catch { }
    }
}

if (-not $pythonExe) {
    Write-Error (
        "No usable Python 3.10+ found.`n`n" +
        "Your system only has Windows Store Python, which cannot create virtual`n" +
        "environments. Install a full Python 3.11 or 3.12 from python.org:`n`n" +
        "  https://www.python.org/downloads/`n`n" +
        "Check 'Add Python to PATH' during install, then re-run this script.`n`n" +
        "Alternative: use the Docker option instead:`n" +
        "  docker compose up calliope07-runner"
    )
}

# ── Create venv ───────────────────────────────────────────────────────────────

Write-Step 'Creating Python virtual environment ...'

if (Test-Path $venvDir) {
    Write-Warn "Removing existing venv at $venvDir"
    Remove-Item $venvDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path (Split-Path $venvDir) | Out-Null

# --without-pip avoids ensurepip (which spawns a subprocess that fails under some
# restricted Python installs). We bootstrap pip via get-pip.py instead.
& $pythonExe -m venv --clear --without-pip $venvDir
if ($LASTEXITCODE -ne 0) { Write-Error 'venv creation failed' }

$venvPython = Join-Path $venvDir 'Scripts\python.exe'

Write-Host '    Bootstrapping pip via get-pip.py ...'
$getPip = Join-Path $env:TEMP 'get-pip.py'
Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPip -UseBasicParsing
& $venvPython $getPip --quiet
if ($LASTEXITCODE -ne 0) { Write-Error 'pip bootstrap failed' }
Remove-Item $getPip -Force -ErrorAction SilentlyContinue

Write-OK "Venv created → $venvPython"

# ── Upgrade build tools ───────────────────────────────────────────────────────

Write-Step 'Upgrading pip / setuptools / wheel ...'
& $venvPython -m pip install --upgrade --quiet pip setuptools wheel
if ($LASTEXITCODE -ne 0) { Write-Error 'pip upgrade failed' }
Write-OK 'Build tools up to date'

# ── Install FastAPI / uvicorn (service layer) ─────────────────────────────────

Write-Step 'Installing service layer (FastAPI + uvicorn) ...'
& $venvPython -m pip install --prefer-binary --no-cache-dir -r $reqService
if ($LASTEXITCODE -ne 0) { Write-Error 'Service layer install failed' }
Write-OK 'FastAPI + uvicorn installed'

# ── Install Calliope 0.7 stack ────────────────────────────────────────────────

Write-Step 'Installing Calliope 0.7 stack (this may take several minutes) ...'
& $venvPython -m pip install --prefer-binary --no-cache-dir -r $reqCalliope07
if ($LASTEXITCODE -ne 0) { Write-Error 'Calliope 0.7 install failed' }
Write-OK 'Calliope 0.7 stack installed'

# ── Verify ────────────────────────────────────────────────────────────────────

Write-Step 'Verifying Calliope 0.7 ...'
$verOut = & $venvPython -c "import calliope; print('calliope', calliope.__version__)" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Error "Calliope import failed: $verOut" }
if ($verOut -notmatch '0\.7') { Write-Error "Unexpected version: $verOut" }
Write-OK $verOut

# ── Download CBC solver ───────────────────────────────────────────────────────

Write-Step 'Downloading CBC solver binary ...'
New-Item -ItemType Directory -Force -Path $solverDir | Out-Null

$cbcDst = Join-Path $solverDir 'cbc.exe'
if (Test-Path $cbcDst) {
    Write-OK "CBC already present: $cbcDst"
} else {
    $candidates = @(
        @{ ver = '2.10.13'; zip = 'Cbc-releases.2.10.13-w64-msvc17-md.zip' },
        @{ ver = '2.10.12'; zip = 'Cbc-releases.2.10.12-w64-msvc17-md.zip' },
        @{ ver = '2.10.11'; zip = 'Cbc-releases.2.10.11-w64-msvc17-md.zip' }
    )

    $chosen = $null
    foreach ($c in $candidates) {
        $url = "https://github.com/coin-or/Cbc/releases/download/releases/$($c.ver)/$($c.zip)"
        try {
            $resp = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) { $chosen = @{ url = $url; zip = $c.zip; ver = $c.ver }; break }
        } catch { }
    }

    if (-not $chosen) {
        Write-Warn 'CBC download failed — install manually from https://github.com/coin-or/Cbc/releases'
        Write-Warn 'Place cbc.exe in: $solverDir'
    } else {
        $tmpZip     = Join-Path $env:TEMP $chosen.zip
        $tmpExtract = Join-Path $env:TEMP 'tempo-cbc-extract'
        Write-Host "    Downloading CBC $($chosen.ver) (~20 MB) ..."
        Invoke-WebRequest -Uri $chosen.url -OutFile $tmpZip -UseBasicParsing
        if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
        Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
        $cbcFound = Get-ChildItem -Path $tmpExtract -Filter 'cbc.exe' -Recurse | Select-Object -First 1
        if ($cbcFound) {
            Copy-Item $cbcFound.FullName -Destination $cbcDst -Force
            Write-OK "cbc.exe → $cbcDst"
        } else {
            Write-Warn 'cbc.exe not found in archive — install manually'
        }
        Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
        Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " Calliope 0.7 engine installed successfully." -ForegroundColor Green
Write-Host " Venv : $venvDir" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "`nNext steps:"
Write-Host "  1. Launch TEMPO — the 0.7 service starts automatically."
Write-Host "  2. In the Run view, select engine '0.7.0.dev7 (experimental)'."
Write-Host "  3. Click Run.  Any TEMPO model works on either engine."
Write-Host ""
