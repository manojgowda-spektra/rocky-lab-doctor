<#
  Rocky-Preflight.ps1 — is Rocky correctly installed on this VM, and can it work here?
  Run it after the bootstrap, and again on demo morning. Every line is a fact, not a hope.
  Exit 0 = all green, 1 = at least one hard failure. Warnings never fail the run.
#>
param(
  [string]$Root = "$env:ProgramData\Rocky",
  [switch]$SkipNetwork
)
$ErrorActionPreference = 'Continue'
$fail = 0; $warn = 0
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red;    $script:fail++ }
function Meh($m)  { Write-Host "  [warn] $m" -ForegroundColor Yellow; $script:warn++ }

Write-Host ""
Write-Host "=== ROCKY PREFLIGHT ===" -ForegroundColor Cyan

# --- the package -------------------------------------------------------------------
$ext = Join-Path $Root 'webext'
if (Test-Path (Join-Path $ext 'manifest.json')) {
  $m = [IO.File]::ReadAllText((Join-Path $ext 'manifest.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  Ok "extension present — $($m.name) $($m.version)"
  $missing = @('content/anchor-engine.js','content/content.js','content/rocky.js','content/overlay.js',
               'content/explore.js','content/foundry-kb.js','background.js','bundle/test-bundle.json') |
             Where-Object { -not (Test-Path (Join-Path $ext $_)) }
  if ($missing) { Bad "extension files missing: $($missing -join ', ')" } else { Ok "all content scripts present" }
} else { Bad "no extension at $ext" }

# --- the bundle: the thing that decides whether Rocky knows this lab ----------------
$bp = Join-Path $ext 'bundle\test-bundle.json'
if (Test-Path $bp) {
  try {
    $b = [IO.File]::ReadAllText($bp, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $steps = 0; $vision = 0; $learn = 0
    foreach ($l in $b.labs) { foreach ($t in $l.tasks) { foreach ($s in $t.steps) {
      $steps++; if ($s.surface -eq 'vision') { $vision++ }; if ($s.learn) { $learn++ } } } }
    if ($steps -gt 0) { Ok "bundle '$($b.title)' — $steps steps, $learn with WHY/WHAT/TIP, $vision vision" }
    else { Bad "bundle has no steps" }
    if ($vision -gt 0 -and -not (Test-Path (Join-Path $ext 'vision-templates\manifest.json'))) {
      Meh "$vision vision step(s) but no vision templates installed" }
  } catch { Bad "bundle is not valid JSON: $($_.Exception.Message)" }
} else { Bad "no bundle at $bp" }

# --- lab identity -------------------------------------------------------------------
$lp = Join-Path $Root 'lab.json'
if (Test-Path $lp) {
  try {
    $lab = [IO.File]::ReadAllText($lp, [Text.Encoding]::UTF8) | ConvertFrom-Json
    Ok "lab.json — lab=$($lab.labCode) odl=$($lab.odlId) deployment=$($lab.deploymentId)"
    if ($lab.resourceGroup) { Ok "environment — rg=$($lab.resourceGroup) region=$($lab.region) vm=$($lab.vmName) $($lab.vmSize)" }
    else { Meh "no resource group in lab.json (IMDS was unreachable at install)" }
    foreach ($k in 'odlId','deploymentId') { if (-not $lab.$k) { Meh "lab.json has no $k — CloudLabs token may not be mapped" } }
  } catch { Bad "lab.json is not valid JSON" }
} else { Meh "no lab.json — Rocky will still guide, but without lab identity" }

# --- browser ------------------------------------------------------------------------
$edge = @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
          "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
  $v = (Get-Item $edge).VersionInfo.ProductVersion
  Ok "Edge $v"
  if ([int]($v -split '\.')[0] -lt 120) { Meh "Edge is older than expected; --load-extension behaviour unverified below 120" }
} else { Bad "Microsoft Edge not installed" }

# is the extension actually registered in Rocky's own browser profile?
$sp = Join-Path $env:LOCALAPPDATA 'Rocky\EdgeProfile\Default\Secure Preferences'
if (Test-Path $sp) {
  if ((Get-Content $sp -Raw) -match [regex]::Escape($ext.Replace('\','\\'))) { Ok "extension registered in the Rocky browser profile" }
  else { Meh "Rocky profile exists but the extension is not registered yet (it registers on first launch)" }
} else { Meh "Rocky browser profile not created yet (created on first launch)" }

# --- the learner's way in -------------------------------------------------------------
if (Test-Path 'C:\Users\Public\Desktop\Lab Portal (with Rocky).lnk') { Ok "desktop shortcut present" } else { Meh "no desktop shortcut" }
if (Get-ScheduledTask -TaskName 'RockyLabPortal' -ErrorAction SilentlyContinue) { Ok "logon task registered" } else { Meh "no logon task (shortcut still works)" }
if (Test-Path (Join-Path $Root 'bin\Rocky-Launch.ps1')) { Ok "launcher present" } else { Bad "launcher missing" }

# --- can this VM reach what the lab needs? ---------------------------------------------
if (-not $SkipNetwork) {
  foreach ($h in 'ai.azure.com','login.microsoftonline.com') {
    try {
      $r = Invoke-WebRequest -Uri "https://$h" -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 3
      Ok "reachable: $h (HTTP $($r.StatusCode))"
    } catch {
      $sc = $null; try { $sc = [int]$_.Exception.Response.StatusCode } catch {}
      if ($sc) { Ok "reachable: $h (HTTP $sc)" } else { Bad "cannot reach https://$h — $($_.Exception.Message)" }
    }
  }
}

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL GREEN — Rocky is ready ($warn warning(s))." -ForegroundColor Green }
else { Write-Host "$fail FAILURE(S), $warn warning(s) — fix before the demo." -ForegroundColor Red }
Write-Host ""
exit ([int]($fail -gt 0))
