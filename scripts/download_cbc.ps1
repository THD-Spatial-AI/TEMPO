# download_cbc.ps1
# Downloads a pre-built CBC (COIN-OR Branch-and-Cut) solver binary for Windows
# and places it in solvers/windows/ so calliope_runner.py can find it automatically.
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts\download_cbc.ps1

$ErrorActionPreference = 'Stop'
$repoRoot  = Split-Path $PSScriptRoot -Parent
$targetDir = Join-Path $repoRoot 'solvers\windows'

# CBC 2.10.x Windows x86-64 binary from the COIN-OR Bintray / GitHub release.
# The release asset URL may change — update the version tag below if needed.
$cbcVersion = '2.10.12'
$zipName    = "Cbc-$cbcVersion-win64-msvc17-md.zip"
$downloadUrl = "https://github.com/coin-or/Cbc/releases/download/releases%2F$cbcVersion/$zipName"
$zipPath    = Join-Path $env:TEMP $zipName
$extractDir = Join-Path $env:TEMP "cbc-extract"

Write-Host "Downloading CBC $cbcVersion for Windows..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting..." -ForegroundColor Cyan
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $extractDir

# Find cbc.exe in the extracted tree
$cbcExe = Get-ChildItem -Path $extractDir -Filter 'cbc.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $cbcExe) {
    Write-Error "cbc.exe not found in the downloaded archive. The archive layout may have changed."
    exit 1
}

# Copy to solvers/windows/
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item $cbcExe.FullName -Destination $targetDir -Force
Write-Host "CBC solver installed to: $targetDir\cbc.exe" -ForegroundColor Green

# Cleanup
Remove-Item $zipPath, $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Restart TEMPO for the solver to be picked up automatically." -ForegroundColor Green
