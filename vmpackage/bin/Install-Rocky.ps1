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

  To switch on free-text questions, add your Foundry model to the same command:

    .\i.ps1 -FromLocal .\rocky-package.zip `
            -AiEndpoint 'https://<res>.services.ai.azure.com/openai/v1/responses' `
            -AiModel '<deployment name>' -AiKey '<key>'

  The key is written to the install folder on this machine and used only to call your own
  endpoint. Everything else is optional. Run it again any time to upgrade; it is idempotent.
#>
param(
  [string]$PackageUrl = "",         # blob URL (+SAS) of rocky-package.zip
  [string]$FromLocal  = "",         # ...or a copy already inside the VM (drag it over RDP)
  [string]$DeploymentID = "",       # from the lab's Environment Details tab
  [string]$ODLID        = "",       # optional; identity only
  [string]$LabCode      = "foundry-develop-ai",
  [string]$LearnerUpn   = "",       # the lab user, if you want Rocky to know it
  [string]$BundleBaseUrl = "",      # optional bundle registry
  [string]$StartUrl     = "https://ai.azure.com",
  [string]$AiEndpoint = "",         # e.g. https://<resource>.services.ai.azure.com/openai/v1/responses
  [string]$AiModel    = "",         # the DEPLOYMENT name from Foundry, not the model's catalogue name
  [string]$AiKey      = "",         # from Keys and Endpoint
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

if (-not $PackageUrl -and -not $FromLocal) {
  Write-Host "  Give me the package: -FromLocal <path to rocky-package.zip> or -PackageUrl <blob url>" -ForegroundColor Red
  exit 1
}

$tmp = Join-Path $env:TEMP "rocky-manual-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'rocky-package.zip'

if ($FromLocal) {
  if (-not (Test-Path $FromLocal)) { Write-Host "  No such file: $FromLocal" -ForegroundColor Red; exit 1 }
  Say "using the package already in this VM"
  Copy-Item $FromLocal $zip -Force
} else {
  Say "downloading the package"
  try {
    (New-Object Net.WebClient).DownloadFile($PackageUrl, $zip)
  } catch {
    Write-Host "  FAILED to download the package." -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Check the SAS has not expired, and that this VM has outbound HTTPS." -ForegroundColor Red
    exit 1
  }
}
$kb = [math]::Round((Get-Item $zip).Length / 1KB)
Good "package ready ($kb KB)"

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

# Edge keeps an unpacked extension loaded in memory, so replacing the files under a running
# browser leaves the OLD code running - the reinstall appears to do nothing. Close Rocky's
# own Edge (never the learner's other windows) before swapping the files.
$prof = Join-Path $env:LOCALAPPDATA 'Rocky\EdgeProfile'
$running = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
             Where-Object { $_.CommandLine -and $_.CommandLine -like "*$prof*" })
if ($running.Count) {
  Say "closing Rocky's browser so the new build actually loads"
  $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 900
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

# ---- optional: the AI, supplied on the command line ---------------------------------
# Written as a file the extension reads at startup rather than through a settings panel,
# so there is nothing to click and nothing that can fail to open.
if ($AiEndpoint -and $AiModel -and $AiKey) {
  if ($AiEndpoint -notmatch '^https://') {
    Warn "the endpoint must start with https:// - skipping the AI configuration"
  } else {
    $aiPath = Join-Path (Join-Path $Root 'webext') 'ai.json'
    $ai = [ordered]@{ endpoint = $AiEndpoint; deployment = $AiModel; apiKey = $AiKey }
    # No BOM: JSON.parse in the browser rejects one outright.
    [IO.File]::WriteAllText($aiPath, ($ai | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    Good "AI configured - Rocky can answer wider questions"
  }
} elseif ($AiEndpoint -or $AiModel -or $AiKey) {
  Warn "AI needs all three: -AiEndpoint, -AiModel and -AiKey. Skipping."
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
# The VM agent covers what the browser extension cannot see: VS Code, Windows dialogs,
# Teams, Outlook. It reads the lab guide from the browser window through UI Automation, so
# there is no bridge, no port and no registry key between the two halves.
$agent = Join-Path (Join-Path $Root 'agent') 'rocky-agent.ps1'
if ((Test-Path $agent) -and -not $NoLaunch) {
  try {
    Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Minimized','-File', $agent) | Out-Null
    Good "desktop agent started - Rocky can now point inside VS Code and Windows dialogs"
  } catch { Warn "could not start the desktop agent: $($_.Exception.Message)" }
}

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
