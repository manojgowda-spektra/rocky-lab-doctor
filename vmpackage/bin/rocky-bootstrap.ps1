<#
  rocky-bootstrap.ps1 — installs Rocky into a CloudLabs JumpVM at deployment time.

  Called by the ARM Custom Script Extension, alongside the house bootstrap
  (psscript-01.ps1), with the lab's own identifiers as arguments. Mirrors the house
  pattern: transcript into C:\WindowsAzure\Logs, download from blob, write to disk,
  drop a Public Desktop shortcut.

  IDENTIFIERS ONLY. Never pass the learner password or any secret: CloudLabs records the
  CSE commandToExecute in the deployment history.

  Exit code is always 0. A lab must never fail to deploy because the copilot could not
  install; the log says what happened and the learner still has a working lab.
#>
param(
  [string]$ODLID          = "",
  [string]$DeploymentID   = "",
  [string]$LabCode        = "foundry-develop-ai",
  [string]$AzureUserName  = "",     # learner UPN — identity only, no password
  [string]$AzureTenantID  = "",
  [string]$AzureSubscriptionID = "",
  [string]$PackageUrl     = "",     # blob URL (+SAS) of rocky-package.zip
  [string]$BundleBaseUrl  = "",     # e.g. https://<acct>.blob.core.windows.net/rocky/bundles  (+SAS)
  [string]$StartUrl       = "https://ai.azure.com",
  [string]$PortalBuild    = "2026-09",
  [switch]$SkipShortcut
)

$ErrorActionPreference = 'Continue'
$log = 'C:\WindowsAzure\Logs\RockyBootstrap.txt'
New-Item -ItemType Directory -Force -Path (Split-Path $log) -ErrorAction SilentlyContinue | Out-Null
Start-Transcript -Path $log -Append -ErrorAction SilentlyContinue | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = "$env:ProgramData\Rocky"
function Step($m) { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $m) }
function Warn($m) { Write-Warning "[rocky] $m" }

try {
  Step "Rocky bootstrap starting. ODL=$ODLID Deployment=$DeploymentID Lab=$LabCode"
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Warn "not elevated: the Public Desktop shortcut and the logon task will be skipped. The CSE runs as SYSTEM, so both work in a real deployment." }
  New-Item -ItemType Directory -Force -Path $Root | Out-Null

  # ---- 1. the package -------------------------------------------------------------
  # The CSE downloads fileUris next to the script, so a package staged beside us wins;
  # otherwise fetch it from blob. Either way we end up with $Root\webext\manifest.json.
  $localZip = Join-Path $PSScriptRoot 'rocky-package.zip'
  $zip      = Join-Path $env:TEMP 'rocky-package.zip'
  if (Test-Path $localZip) {
    Step "using the package staged by the CSE: $localZip"
    Copy-Item $localZip $zip -Force
  } elseif ($PackageUrl) {
    Step "downloading the package"
    (New-Object Net.WebClient).DownloadFile($PackageUrl, $zip)
  } else {
    throw "no package: pass -PackageUrl or stage rocky-package.zip beside this script"
  }

  Step "expanding into $Root"
  # Expand-Archive refuses to overwrite; a clean re-install is simpler and idempotent.
  foreach ($d in @('webext','bin','bundles','agent')) {
    $p = Join-Path $Root $d
    if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Expand-Archive -Path $zip -DestinationPath $Root -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $Root 'webext\manifest.json'))) { throw "package expanded but webext\manifest.json is missing" }

  # ---- 2. lab identity ------------------------------------------------------------
  # Resource group / region / VM size come free from IMDS — no credential needed.
  $imds = $null
  # IMDS answers in milliseconds on a real Azure VM; a long timeout only slows down
  # machines that will never answer. A proxy must not apply to a link-local address.
  try {
    $imds = Invoke-RestMethod -Uri 'http://169.254.169.254/metadata/instance?api-version=2021-02-01' `
              -Headers @{ Metadata = 'true' } -TimeoutSec 2 -Proxy $null -ErrorAction Stop
  } catch { Warn "IMDS unavailable (not an Azure VM, or blocked): $($_.Exception.Message)" }

  $lab = [ordered]@{
    schema         = 1
    labCode        = $LabCode
    odlId          = $ODLID
    deploymentId   = $DeploymentID
    learnerUpn     = $AzureUserName
    tenantId       = $AzureTenantID
    subscriptionId = if ($AzureSubscriptionID) { $AzureSubscriptionID } elseif ($imds) { $imds.compute.subscriptionId } else { "" }
    resourceGroup  = if ($imds) { $imds.compute.resourceGroupName } else { "" }
    region         = if ($imds) { $imds.compute.location } else { "" }
    vmName         = if ($imds) { $imds.compute.name } else { $env:COMPUTERNAME }
    vmSize         = if ($imds) { $imds.compute.vmSize } else { "" }
    portalBuild    = $PortalBuild
    startUrl       = $StartUrl
    bundleBaseUrl  = $BundleBaseUrl
    installedAt    = (Get-Date).ToUniversalTime().ToString('o')
  }
  $labPath = Join-Path $Root 'lab.json'
  $labJson = $lab | ConvertTo-Json -Depth 4
  $labJson | Set-Content -Path $labPath -Encoding UTF8
  # A content script cannot read the filesystem, so Rocky gets his own copy inside the
  # extension folder, declared web-accessible in the manifest. This is how he can answer
  # "which lab am I in" from record rather than from guesswork.
  $labJson | Set-Content -Path (Join-Path $Root 'webext\lab.json') -Encoding UTF8
  Step "lab.json written: rg=$($lab.resourceGroup) region=$($lab.region) vm=$($lab.vmName)"

  # ---- 3. this lab's bundle -------------------------------------------------------
  # content.js reads bundle\test-bundle.json from the extension folder, so swapping that
  # file IS the per-lab configuration. No extension change needed.
  $target = Join-Path $Root 'webext\bundle\test-bundle.json'
  $got = $false
  if ($BundleBaseUrl) {
    foreach ($u in @("$BundleBaseUrl/$LabCode/$PortalBuild.json", "$BundleBaseUrl/$LabCode/latest.json")) {
      try {
        Step "fetching bundle: $u"
        $tmp = Join-Path $env:TEMP 'rocky-bundle.json'
        (New-Object Net.WebClient).DownloadFile($u, $tmp)
        $b = [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8) | ConvertFrom-Json   # parse = validate
        $n = 0; foreach ($l in $b.labs) { foreach ($t in $l.tasks) { $n += @($t.steps).Count } }
        if ($n -lt 1) { throw "bundle parsed but contains no steps" }
        Copy-Item $tmp $target -Force; Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        Step "bundle installed: $n steps"
        $got = $true; break
      } catch { Warn "bundle fetch failed ($u): $($_.Exception.Message)" }
    }
  }
  if (-not $got) {
    # The package ships the demo bundles, so an unreachable registry is not fatal.
    $fallback = Join-Path $Root "bundles\$LabCode.json"
    if (Test-Path $fallback) { Copy-Item $fallback $target -Force; Step "using the packaged bundle for $LabCode" }
    else { Step "using the bundle shipped inside the extension" }
  }

  # ---- 4. the learner's way in ----------------------------------------------------
  if (-not $SkipShortcut -and $isAdmin) {
    $launch = Join-Path $Root 'bin\Rocky-Launch.ps1'
    $lnk    = 'C:\Users\Public\Desktop\Lab Portal (with Rocky).lnk'
    try {
      $ws = New-Object -ComObject WScript.Shell
      $s  = $ws.CreateShortcut($lnk)
      $s.TargetPath       = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
      $s.Arguments        = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launch`""
      $s.WorkingDirectory = $Root
      $s.IconLocation     = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe,0"
      $s.Description      = 'Open the lab portal with Rocky, your lab copilot'
      $s.Save()
      if (Test-Path $lnk) { Step "desktop shortcut created" } else { Warn "shortcut saved without error but the file is not there" }
    } catch { Warn "could not create the shortcut: $($_.Exception.Message)" }

    # Open it automatically at first logon, once, so Rocky is simply there.
    try {
      $act = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
               -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launch`" -Quiet"
      $trg = New-ScheduledTaskTrigger -AtLogOn
      $trg.Delay = 'PT45S'                      # let the desktop and network settle
      $set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::FromMinutes(10)) -StartWhenAvailable
      $prc = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited   # BUILTIN\Users: whoever logs on
      # -ErrorAction Stop: Register-ScheduledTask is a CIM cmdlet whose failures are
      # non-terminating, so without this the catch never runs and we would claim success.
      Register-ScheduledTask -TaskName 'RockyLabPortal' -Action $act -Trigger $trg -Settings $set -Principal $prc -Force -ErrorAction Stop | Out-Null
      if (Get-ScheduledTask -TaskName 'RockyLabPortal' -ErrorAction SilentlyContinue) { Step "logon task registered (RockyLabPortal)" }
      else { Warn "logon task did not appear after registration" }
    } catch { Warn "could not register the logon task: $($_.Exception.Message)" }
  }

  # ---- 5. prove it ----------------------------------------------------------------
  $pre = Join-Path $Root 'bin\Rocky-Preflight.ps1'
  if (Test-Path $pre) { Step "preflight:"; & powershell -NoProfile -ExecutionPolicy Bypass -File $pre -Root $Root }

  Step "Rocky bootstrap finished."
}
catch {
  Warn "bootstrap failed: $($_.Exception.Message)"
  Warn $_.ScriptStackTrace
}
finally {
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
exit 0   # never fail the deployment over the copilot
