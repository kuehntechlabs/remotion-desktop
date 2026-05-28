# Wraps a signed Windows installer into a .intunewin package for
# Microsoft Intune Win32 app deployment.
#
# Usage (on Windows or PowerShell Core):
#   pwsh ./scripts/package-intune-win.ps1 \
#     -Installer dist/RemotionDesktop.exe \
#     -OutDir dist/intune
#
# On first run, downloads Microsoft's IntuneWinAppUtil.exe into ./tools/.
# See docs/INTUNE.md for the full deployment flow.

param(
  [Parameter(Mandatory = $true)]
  [string]$Installer,

  [string]$OutDir = "dist/intune",

  [string]$ToolDir = "tools"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Installer)) {
  throw "Installer not found: $Installer"
}

$installerFull = (Resolve-Path $Installer).Path
$installerDir = Split-Path -Parent $installerFull
$installerName = Split-Path -Leaf $installerFull

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $ToolDir | Out-Null

$tool = Join-Path $ToolDir "IntuneWinAppUtil.exe"
if (-not (Test-Path $tool)) {
  Write-Host "Downloading IntuneWinAppUtil.exe..."
  $url = "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/raw/master/IntuneWinAppUtil.exe"
  Invoke-WebRequest -Uri $url -OutFile $tool
}

Write-Host "Wrapping $installerName -> $OutDir"
& $tool -c $installerDir -s $installerName -o $OutDir -q

$packaged = Get-ChildItem -Path $OutDir -Filter "*.intunewin" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $packaged) {
  throw "IntuneWinAppUtil did not produce a .intunewin file"
}

Write-Host ""
Write-Host "Done: $($packaged.FullName)"
Write-Host ""
Write-Host "Upload to: intune.microsoft.com -> Apps -> Windows -> + Add -> Win32 app"
Write-Host "See docs/INTUNE.md for install command, detection rules, assignments."
