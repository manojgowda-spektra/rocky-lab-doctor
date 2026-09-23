<#
  install-local.ps1 — rehearse the whole CloudLabs install on this machine.

  Runs the bootstrap exactly as the Custom Script Extension will (same staged files, same
  arguments, identifiers only), then preflight, then optionally opens Edge with Rocky on
  the mock portal page, then uninstalls. If this is not clean, the lab will not be either.

  It deliberately does NOT need Azure, a tenant, or a login.
#>
param(
  [switch]$KeepInstalled,    # leave Rocky installed afterwards
  [switch]$OpenBrowser,      # actually open Edge with Rocky (visual check)
  [string]$Root = "$env:ProgramData\Rocky"
)
$ErrorActionPreference = 'Stop'
$pkgDir = Split-Path $PSScriptRoot -Parent
$fail = 0
function Head($m) { Write-Host ""; Write-Host "=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red; $script:fail++ }

Head "1. build"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkgDir 'build-package.ps1') | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Bad "build failed"; exit 1 }
$zip = Join-Path $pkgDir 'dist\rocky-package.zip'
if (Test-Path $zip) { Ok "package built" } else { Bad "no package"; exit 1 }

Head "2. stage exactly as the CSE does"
# The CSE downloads every fileUri into one directory and runs the command there.
$stage = Join-Path $env:TEMP 'rocky-cse-sim'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item $zip $stage
Copy-Item (Join-Path $pkgDir 'dist\rocky-bootstrap.ps1') $stage
Ok "staged rocky-package.zip + rocky-bootstrap.ps1 in $stage"

Head "3. bootstrap (identifiers only, as the CSE passes them)"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $stage 'rocky-bootstrap.ps1') `
    -ODLID 'ODL-ROCKYQA-0001' -DeploymentID '912345' -LabCode 'foundry-develop-ai' `
    -AzureUserName 'odl_user_912345@contoso.onmicrosoft.com' `
    -AzureTenantID '00000000-1111-2222-3333-444444444444' `
    -AzureSubscriptionID '55555555-6666-7777-8888-999999999999' `
    -PortalBuild '2026-09' 2>&1 | ForEach-Object { Write-Host "  $_" }

Head "4. did it install what it claimed?"
foreach ($p in @('webext\manifest.json','webext\bundle\test-bundle.json','bin\Rocky-Launch.ps1','bin\Rocky-Preflight.ps1','bin\Rocky-Uninstall.ps1','lab.json','VERSION.json')) {
  if (Test-Path (Join-Path $Root $p)) { Ok $p } else { Bad "missing: $p" }
}
# lab.json must carry the identifiers we passed, or Rocky does not know its lab
try {
  $lab = [IO.File]::ReadAllText((Join-Path $Root 'lab.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  if ($lab.odlId -eq 'ODL-ROCKYQA-0001' -and $lab.deploymentId -eq '912345') { Ok "lab.json carries the lab identity" }
  else { Bad "lab.json identity wrong: odl=$($lab.odlId) dep=$($lab.deploymentId)" }
  if ($lab.learnerUpn) { Ok "learner identity recorded" }
} catch { Bad "lab.json unreadable: $($_.Exception.Message)" }

# the package must not contain a password, ever
$leak = Get-ChildItem $Root -Recurse -File -Include *.json,*.txt,*.ps1 -ErrorAction SilentlyContinue |
        Select-String -Pattern 'password' -SimpleMatch -ErrorAction SilentlyContinue |
        Where-Object { $_.Line -notmatch 'vmAdminPassword|trainerUserPassword|never|Password=|no password|AzurePassword' }
if ($leak) { $leak | Select-Object -First 3 | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber)" -ForegroundColor Yellow }; Bad "something password-shaped was installed" }
else { Ok "no credential written to disk" }

Head "5. lab.json must be readable BY THE BROWSER"
# PowerShell's Set-Content -Encoding UTF8 writes a byte-order mark, and JSON.parse rejects
# it outright. That made Rocky silently unable to read his own lab identity - a failure with
# no error message anywhere. Assert the bytes, not the intent.
$labWeb = Join-Path $Root 'webext\lab.json'
if (Test-Path $labWeb) {
  $bytes = [IO.File]::ReadAllBytes($labWeb)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Bad "webext\lab.json starts with a BOM - the browser cannot JSON.parse it"
  } else { Ok "webext\lab.json has no BOM" }
  try {
    $txt = [IO.File]::ReadAllText($labWeb, [Text.Encoding]::UTF8)
    $j = $txt | ConvertFrom-Json
    if ($j.labCode) { Ok "lab.json parses and names the lab: $($j.labCode)" } else { Bad "lab.json parses but has no labCode" }
  } catch { Bad "lab.json does not parse: $($_.Exception.Message)" }
} else { Bad "no webext\lab.json - Rocky cannot know which lab he is in" }

Head "6. preflight"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'bin\Rocky-Preflight.ps1') -Root $Root | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { Bad "preflight reported failures" } else { Ok "preflight clean" }

if ($OpenBrowser) {
  Head "7. open Edge with Rocky on the mock portal"
  $mock = 'file:///' + (Join-Path $PSScriptRoot 'mock-foundry.html').Replace('\','/')
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'bin\Rocky-Launch.ps1') -Root $Root -Url $mock -Fresh -AllowLocalFile
  Write-Host "  Edge is opening. Rocky should appear bottom-right." -ForegroundColor Yellow
  Write-Host "  (The mock page is not the real portal, so he will honestly say he cannot find step 1 — that is correct behaviour.)" -ForegroundColor Yellow
  Start-Sleep -Seconds 6
}

if (-not $KeepInstalled) {
  Head "8. uninstall"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'bin\Rocky-Uninstall.ps1') | ForEach-Object { Write-Host "  $_" }
  if (Test-Path $Root) { Bad "uninstall left $Root behind" } else { Ok "removed cleanly" }
}

Write-Host ""
if ($fail -eq 0) { Write-Host "LOCAL INSTALL REHEARSAL PASSED — the CloudLabs path should behave the same." -ForegroundColor Green }
else { Write-Host "$fail FAILURE(S) — fix before touching a lab." -ForegroundColor Red }
exit ([int]($fail -gt 0))
