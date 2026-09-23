<#
  publish-bundle.ps1 — put a lab's step map in the registry, so a drifted step can be fixed
  without redeploying anything.

  The bootstrap fetches  <BundleBaseUrl>/<labCode>/<portalBuild>.json  and falls back to
  <labCode>/latest.json, then to the copy inside the package. So publishing here changes
  what the NEXT learner gets, in seconds, with no ARM, no template edit and no new VM.

  This is the answer to the only failure mode we expect on the day: the portal changed
  overnight, one step now shows an honest card, and we want it glowing again before the
  next launch.

  Needs Azure CLI and a signed-in account with write access to the container.
  VALIDATES BEFORE IT PUBLISHES: a bundle that cannot resolve is worse than a stale one.
#>
param(
  [Parameter(Mandatory = $true)] [string]$Bundle,        # path to the .json to publish
  [Parameter(Mandatory = $true)] [string]$StorageAccount,
  [string]$Container   = 'rocky',
  [string]$LabCode     = 'foundry-develop-ai',
  [string]$PortalBuild = '',                              # default: this month, yyyy-MM
  [switch]$AlsoLatest,                                    # also publish as latest.json
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "[publish] $m" }
function Die($m) { Write-Host "[publish] FAIL: $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $Bundle)) { Die "no such bundle: $Bundle" }
if (-not $PortalBuild) { $PortalBuild = Get-Date -Format 'yyyy-MM' }

# ---- validate first ------------------------------------------------------------------
# Publishing a broken bundle would break every future learner silently, which is exactly
# the failure this whole project exists to prevent.
try { $j = [IO.File]::ReadAllText($Bundle, [Text.Encoding]::UTF8) | ConvertFrom-Json }
catch { Die "not valid JSON: $($_.Exception.Message)" }

$steps = 0; $withLearn = 0
foreach ($l in $j.labs) { foreach ($t in $l.tasks) { foreach ($s in $t.steps) {
  $steps++; if ($s.learn) { $withLearn++ } } } }
if ($steps -lt 1) { Die "bundle contains no steps" }
Say "bundle '$($j.title)' - $steps steps, $withLearn with WHY/WHAT/TIP"

$audit = Join-Path (Split-Path $PSScriptRoot -Parent) 'vmpackage/test/resolve-bundle.js'
if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path $audit)) {
  Say "auditing..."
  & node $audit $Bundle | Out-Null
  if ($LASTEXITCODE -ne 0) { & node $audit $Bundle; Die "bundle audit failed - not publishing" }
  Say "audit clean"
} else { Say "WARNING: could not audit (node or the auditor is missing)" }

# ---- publish -------------------------------------------------------------------------
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { Die "Azure CLI not found" }

$blobs = @("$LabCode/$PortalBuild.json")
if ($AlsoLatest) { $blobs += "$LabCode/latest.json" }

foreach ($b in $blobs) {
  if ($WhatIf) { Say "WHATIF would upload $Bundle -> $Container/$b"; continue }
  Say "uploading -> $Container/$b"
  az storage blob upload --account-name $StorageAccount --container-name $Container `
     --name $b --file $Bundle --overwrite --only-show-errors --content-type 'application/json' | Out-Null
  if ($LASTEXITCODE -ne 0) { Die "upload failed for $b" }
}

if (-not $WhatIf) {
  Say "published. The next learner to launch gets this bundle; running sessions keep the one they started with."
  Say "verify:  curl -s '<BundleBaseUrl>/$LabCode/$PortalBuild.json?<SAS>' | head -c 200"
}
