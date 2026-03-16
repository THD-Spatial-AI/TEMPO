<#
.SYNOPSIS
  Downloads the CBC (COIN-OR Branch-and-Cut) solver binary for Windows.
  CBC is free, open-source, and requires no license or token.

.DESCRIPTION
  Downloads Cbc 2.10.11 from the official COIN-OR GitHub releases page and
  extracts cbc.exe into solvers\windows\.  Run this once per checkout.

.EXAMPLE
  pwsh -File scripts\download_cbc.ps1
#>

param(
  [string]$Version = "2.10.11"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$DestDir  = Join-Path $RepoRoot "solvers\windows"
$DestExe  = Join-Path $DestDir  "cbc.exe"

# ── Already done? ─────────────────────────────────────────────────────────────
if (Test-Path $DestExe) {
  Write-Host "CBC already present at $DestExe" -ForegroundColor Green
  exit 0
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

# ── Download ───────────────────────────────────────────────────────────────────
$ZipName = "Cbc-releases.${Version}-w64-msvc17-md.zip"
$Url     = "https://github.com/coin-or/Cbc/releases/download/releases%2F${Version}/${ZipName}"
$TmpZip  = Join-Path $env:TEMP $ZipName

Write-Host "Downloading CBC ${Version} from GitHub…" -ForegroundColor Cyan
Write-Host "  URL: $Url"

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $wc = New-Object System.Net.WebClient
  $wc.DownloadFile($Url, $TmpZip)
} catch {
  Write-Error "Download failed: $_"
  exit 1
}

# ── Extract cbc.exe ────────────────────────────────────────────────────────────
Write-Host "Extracting cbc.exe…" -ForegroundColor Cyan

$TmpExtract = Join-Path $env:TEMP "cbc_extract_${Version}"
Remove-Item -Recurse -Force $TmpExtract -ErrorAction SilentlyContinue
Expand-Archive -Path $TmpZip -DestinationPath $TmpExtract -Force

# The zip structure is:  Cbc-releases.X.Y.Z-*/bin/cbc.exe
$CbcExe = Get-ChildItem -Recurse -Filter "cbc.exe" $TmpExtract | Select-Object -First 1
if (-not $CbcExe) {
  Write-Error "cbc.exe not found inside the downloaded archive. Archive contents:"
  Get-ChildItem -Recurse $TmpExtract | Select-Object FullName
  exit 1
}

Copy-Item $CbcExe.FullName $DestExe -Force
Remove-Item -Recurse -Force $TmpExtract
Remove-Item -Force $TmpZip

# ── Verify ────────────────────────────────────────────────────────────────────
$size = (Get-Item $DestExe).Length
Write-Host ""
Write-Host "  Saved to : $DestExe" -ForegroundColor Green
Write-Host "  Size     : $([math]::Round($size/1MB,1)) MB"

try {
  $ver = & $DestExe --version 2>&1 | Select-Object -First 1
  Write-Host "  Version  : $ver" -ForegroundColor Green
} catch {
  Write-Host "  (could not run --version, that's OK)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. CBC is ready for local Calliope runs." -ForegroundColor Green
