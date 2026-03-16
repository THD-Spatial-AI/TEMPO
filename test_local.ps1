<#
.SYNOPSIS
  End-to-end local test. Verifies Calliope runs using only files in this repo.
  No Electron, no Go server, no license tokens required.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File test_local.ps1
#>

param([switch]$SkipSolverDownload)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$script:Failed = $false

function Write-Step($msg)  { Write-Host "" ; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:Failed = $true }
function Write-Warn($msg)  { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "        $msg" -ForegroundColor Gray }

# CHECK 1 - CBC solver binary
Write-Step "Check 1 -- CBC solver binary (solvers\windows\cbc.exe)"

$CbcExe = Join-Path $RepoRoot "solvers\windows\cbc.exe"

if (Test-Path $CbcExe) {
    $sizeMB = [math]::Round((Get-Item $CbcExe).Length / 1MB, 1)
    Write-Pass "cbc.exe found - $sizeMB MB"
} elseif ($SkipSolverDownload) {
    Write-Fail "cbc.exe not found. Run: powershell -ExecutionPolicy Bypass -File scripts\download_cbc.ps1"
} else {
    Write-Warn "CBC not found -- downloading now..."
    try {
        $downloadScript = Join-Path $RepoRoot "scripts\download_cbc.ps1"
        & powershell -ExecutionPolicy Bypass -File $downloadScript
        if (Test-Path $CbcExe) {
            Write-Pass "cbc.exe downloaded successfully"
        } else {
            Write-Fail "Download script ran but cbc.exe still missing"
        }
    } catch {
        Write-Fail "Download failed: $_"
    }
}

# CHECK 2 - conda + calliope environment
Write-Step "Check 2 -- conda + calliope conda environment"

$CondaCandidates = @(
    (Join-Path $env:USERPROFILE "anaconda3\Scripts\conda.exe"),
    (Join-Path $env:USERPROFILE "miniconda3\Scripts\conda.exe"),
    (Join-Path $env:USERPROFILE "Anaconda3\Scripts\conda.exe"),
    (Join-Path $env:USERPROFILE "Miniconda3\Scripts\conda.exe"),
    (Join-Path $env:LOCALAPPDATA "miniconda3\Scripts\conda.exe"),
    "C:\ProgramData\Miniconda3\Scripts\conda.exe",
    "C:\ProgramData\Anaconda3\Scripts\conda.exe",
    "C:\tools\miniconda3\Scripts\conda.exe"
)

$CondaExe = $null
foreach ($c in $CondaCandidates) {
    if (Test-Path $c) { $CondaExe = $c; break }
}
if (-not $CondaExe) {
    $condaCmd = Get-Command conda -ErrorAction SilentlyContinue
    if ($condaCmd) { $CondaExe = $condaCmd.Source }
}

if (-not $CondaExe) {
    Write-Fail "conda not found. Install Anaconda/Miniconda, or let the Electron app install it on first launch."
} else {
    Write-Pass "conda found: $CondaExe"

    $envJson = & $CondaExe env list --json 2>&1 | Out-String
    if ($envJson -match '[/\\]calliope"') {
        Write-Pass "calliope conda environment exists"

        $verOut = & $CondaExe run -n calliope python -c "import calliope; print(calliope.__version__)" 2>&1
        $ver = $verOut | Where-Object { $_ -match '^\d' } | Select-Object -First 1
        if ($ver) {
            Write-Pass "calliope $ver installed"
            if ($ver -notlike "0.6*") {
                Write-Warn "calliope_runner.py targets 0.6.x but found $ver -- may fail"
            }
        }
    } else {
        Write-Fail "calliope conda env not found"
        Write-Info "Create it with:"
        Write-Info "  conda create -y -n calliope -c conda-forge python=3.9 calliope=0.6.8 coin-or-cbc"
    }
}

# CHECK 3 - Run sample model
Write-Step "Check 3 -- Run dev\sample_model.json end-to-end"

if ($script:Failed) {
    Write-Warn "Skipping model run -- fix issues above first"
} else {
    $DevModel  = Join-Path $RepoRoot "dev\sample_model.json"
    $RunScript = Join-Path $RepoRoot "run_calliope_dev.py"
    $SolverDir = Join-Path $RepoRoot "solvers\windows"

    Write-Info "Model  : $DevModel"
    Write-Info "Runner : $RunScript"
    Write-Info "CBC    : $CbcExe"
    Write-Host ""

    $env:CALLIOPE_SOLVER_DIR = $SolverDir
    if (Test-Path $SolverDir) {
        $env:PATH = $SolverDir + ";" + $env:PATH
    }

    $Output = & $CondaExe run -n calliope --no-capture-output python $RunScript $DevModel --summary 2>&1

    foreach ($line in $Output) {
        Write-Host "    $line" -ForegroundColor DarkGray
    }

    $successLine   = $Output | Where-Object { $_ -match "Status\s*:\s*SUCCESS" }
    $objectiveLine = $Output | Where-Object { $_ -match "Objective\s*:" }

    if ($successLine) {
        $objVal = "n/a"
        if ($objectiveLine -match "Objective\s*:\s*([\d.]+)") { $objVal = $Matches[1] }
        Write-Pass "Model ran successfully -- Objective: $objVal"
    } else {
        Write-Fail "Model run did NOT return SUCCESS"
        $errors = $Output | Where-Object { $_ -match "Error|FAILED|Traceback" } | Select-Object -First 3
        foreach ($e in $errors) { Write-Info $e }
    }
}

# Summary
Write-Host ""
Write-Host "-------------------------------------------------" -ForegroundColor DarkGray
if ($script:Failed) {
    Write-Host "  RESULT: FAILED -- fix the issues above and re-run" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  RESULT: ALL CHECKS PASSED" -ForegroundColor Green
    Write-Host "  Calliope runs locally using only files in this repo." -ForegroundColor Green
    exit 0
}
