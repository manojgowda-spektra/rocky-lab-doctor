<#
  Install-Rocky.ps1 — put Rocky into a lab VM by hand, in one command.

  The automatic route (Custom Script Extension) needs a new template, a storage account and
  an acceptable-use answer. This needs none of them: deploy ANY lab you already have, RDP
  in, run one line, and Rocky is live with the real lab identity.

  IT IS THE SAME INSTALL. This script calls the same bootstrap the CSE calls, with the same
  arguments, writing the same lab.json. So a successful manual run is genuine evidence that
  the automatic route will work — not a mock-up of it.

  HOW ROCKY LEARNS WHICH LAB HE IS IN
    Deployment ID and the lab user come from the CloudLabs Environment Details tab; pass
    them here. Resource group, region, subscription and VM name he reads himself from Azure
    instance metadata (169.254.169.254), which needs no credential and cannot be faked.
    Anything you do not pass, he simply does not claim to know.

  USAGE, inside the lab VM (PowerShell, as Administrator):

    iwr https://<acct>.blob.core.windows.net/rocky/Install-Rocky.ps1?<sas> -OutFile i.ps1
    .\i.ps1 -PackageUrl 'https://<acct>.blob.core.windows.net/rocky/rocky-package.zip?<sas>' `
            -DeploymentID 912345

  Everything else is optional. Run it again any time to upgrade; it is idempotent.
#>
param(
  [Parameter(Mandatory = $true)] [string]$PackageUrl,   # blob URL + SAS of rocky-package.zip
  [string]$DeploymentID = "",       # from the lab's Environment Details tab
  [string]$ODLID        = "",       # optional; identity only
  [string]$LabCode      = "foundry-develop-ai",
  [string]$LearnerUpn   = "",       # the lab user, if you want Rocky to know it
  [string]$BundleBaseUrl = "",      # optional bundle registry
  [string]$StartUrl     = "https://ai.azure.com",
  [switch]$NoLaunch,                # install without opening the browser
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = "$env:ProgramData\Rocky"

function Say($m)  { Write-Host "[rocky] $m" -ForegroundColor Cyan }
function Good($m) { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

if ($Uninstall) {
  $u = Join-Path $Root 'bin\Rocky-Uninstall.ps1'
  if (Test-Path $u) { & powershell -NoProfile -ExecutionPolicy Bypass -File $u } else { Warn "Rocky is not installed." }
  return
}

# Admin is needed for the Public Desktop shortcut and the logon task. Without it the install
# still works; the learner just opens Rocky from the launcher instead of a desktop icon.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Warn "Not running as Administrator: no desktop shortcut and no logon task. Everything else works." }

Say "downloading the package"
$tmp = Join-Path $env:TEMP "rocky-manual-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'rocky-package.zip'
try {
  (New-Object Net.WebClient).DownloadFile($PackageUrl, $zip)
} catch {
  Write-Host "  FAILED to download the package." -ForegroundColor Red
  Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Check the SAS has not expired, and that this VM has outbound HTTPS." -ForegroundColor Red
  exit 1
}
Good "package downloaded ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"

# The package carries the bootstrap. Using it (rather than a copy of the logic here) is what
# makes this a real rehearsal of the automatic route.
Say "extracting the installer"
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$boot = Join-Path $tmp 'bin\rocky-bootstrap.ps1'
if (-not (Test-Path $boot)) { Write-Host "  The package has no bin\rocky-bootstrap.ps1 - wrong or corrupt package." -ForegroundColor Red; exit 1 }
Copy-Item $zip (Join-Path $tmp 'bin\rocky-package.zip') -Force   # the bootstrap prefers a staged package

# Fill in what the operator did not pass, from the environment itself. IMDS needs no
# credential, so these values are the machine's own account of where it is.
if (-not $DeploymentID -or -not $LearnerUpn) {
  try {
    $imds = Invoke-RestMethod -Uri 'http://169.254.169.254/metadata/instance?api-version=2021-02-01' `
              -Headers @{ Metadata = 'true' } -TimeoutSec 3 -Proxy $null -ErrorAction Stop
    if (-not $DeploymentID -and $imds.compute.resourceGroupName -match '(\d{4,})') {
      $DeploymentID = $Matches[1]
      Good "Deployment ID $DeploymentID (read from the resource group name)"
    }
  } catch { Warn "Azure instance metadata unavailable - is this a lab VM?" }
}
# The CloudLabs credentials file, if the house bootstrap has run, names the lab user.
if (-not $LearnerUpn -and (Test-Path 'C:\LabFiles\AzureCreds.txt')) {
  try {
    $line = Select-String -Path 'C:\LabFiles\AzureCreds.txt' -Pattern '^\s*Azure Username\s*:?\s*(.+)$' | Select-Object -First 1
    if ($line) { $LearnerUpn = $line.Matches[0].Groups[1].Value.Trim(); Good "lab user $LearnerUpn (from C:\LabFiles)" }
  } catch {}
}

Say "installing"
$args = @('-ExecutionPolicy','Bypass','-NoProfile','-File', $boot,
          '-LabCode', $LabCode, '-StartUrl', $StartUrl)
if ($DeploymentID)  { $args += @('-DeploymentID',  $DeploymentID) }
if ($ODLID)         { $args += @('-ODLID',         $ODLID) }
if ($LearnerUpn)    { $args += @('-AzureUserName', $LearnerUpn) }
if ($BundleBaseUrl) { $args += @('-BundleBaseUrl', $BundleBaseUrl) }
& powershell @args

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Path (Join-Path $Root 'webext\manifest.json'))) {
  Write-Host "  Install did not complete - see C:\WindowsAzure\Logs\RockyBootstrap.txt" -ForegroundColor Red
  exit 1
}

Write-Host ""
Say "what Rocky now knows about this lab:"
try {
  $lab = [IO.File]::ReadAllText((Join-Path $Root 'lab.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($k in 'labCode','odlId','deploymentId','learnerUpn','resourceGroup','region','vmName') {
    $v = $lab.$k
    if ($v) { Good ("{0,-15} {1}" -f $k, $v) } else { Warn ("{0,-15} (not known - pass it if you want him to)" -f $k) }
  }
} catch { Warn "lab.json unreadable" }

Write-Host ""
if (-not $NoLaunch) {
  Say "opening the portal with Rocky"
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'bin\Rocky-Launch.ps1') -Fresh
  Write-Host ""
  Good "Sign in with the lab credentials. Rocky appears bottom-right and glows the first control."
} else {
  Good "Installed. Open it with:  powershell -File $Root\bin\Rocky-Launch.ps1"
}
Write-Host ""
Write-Host "  Check it any time:  powershell -File $Root\bin\Rocky-Preflight.ps1" -ForegroundColor DarkGray
Write-Host "  Remove it:          powershell -File $Root\bin\Rocky-Uninstall.ps1" -ForegroundColor DarkGray
