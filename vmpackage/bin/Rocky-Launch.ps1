<#
  Rocky-Launch.ps1 — opens the lab portal with Rocky loaded.
  Runs as the logged-on learner (never System). Safe to run twice: a second run
  reuses the same profile and just opens another tab.

  Edge ignores --load-extension when it is handed to an ALREADY-RUNNING process for the
  same profile, which is why Rocky gets his own --user-data-dir: the first launch of that
  profile always honours the switch. Verified on Edge 153.
#>
param(
  [string]$Root       = "$env:ProgramData\Rocky",
  [string]$Url        = "",                       # default comes from lab.json, else Foundry
  [switch]$Fresh,                                 # wipe the Rocky browser profile first
  [switch]$AllowLocalFile,                        # permit a file:/// URL (local testing only)
  [switch]$Quiet
)
$ErrorActionPreference = 'Stop'
function Say($m) { if (-not $Quiet) { Write-Host "[rocky] $m" } }

$ext     = Join-Path $Root 'webext'
$profile = Join-Path $env:LOCALAPPDATA 'Rocky\EdgeProfile'
$labFile = Join-Path $Root 'lab.json'

if (-not (Test-Path (Join-Path $ext 'manifest.json'))) {
  throw "Rocky is not installed: no manifest at $ext. Re-run the bootstrap or reinstall the package."
}

# Lab context decides the start page; fall back to Foundry so the shortcut always works.
$lab = $null
if (Test-Path $labFile) { try { $lab = [IO.File]::ReadAllText($labFile, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { Say "lab.json unreadable; continuing without it" } }
if (-not $Url) {
  if ($lab -and $lab.startUrl) { $Url = [string]$lab.startUrl } else { $Url = 'https://ai.azure.com' }
}
# https only for real labs: a lab portal is never http, and a stray URL in lab.json must
# not be able to send a learner somewhere unencrypted. -AllowLocalFile is for our own
# mock-page testing and is never used by the shortcut or the logon task.
if ($Url -notmatch '^https://' -and -not ($AllowLocalFile -and $Url -match '^file:///')) {
  throw "Start URL must be https (use -AllowLocalFile for a local test page): '$Url'"
}

$edge = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw "Microsoft Edge not found on this VM." }

if ($Fresh -and (Test-Path $profile)) { Say "resetting the Rocky browser profile"; Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $profile | Out-Null

# A first run of this profile writes the extension into its Secure Preferences; later runs
# reuse it. Passing the switch every time is harmless and self-heals a wiped profile.
$args = @(
  "--user-data-dir=$profile"
  "--load-extension=$ext"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-features=DisableLoadExtensionCommandLineSwitch"
  "--start-maximized"
  $Url
)
Say "starting Edge with Rocky  ->  $Url"
Start-Process -FilePath $edge -ArgumentList $args | Out-Null
if ($lab -and $lab.labCode) { Say "lab: $($lab.labCode)  ODL $($lab.odlId)  deployment $($lab.deploymentId)" }
Say "Rocky appears bottom-right once the page loads. Click him for Back / Next / Explore / Ask."
