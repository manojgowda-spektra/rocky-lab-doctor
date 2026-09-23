<#
  Rocky-Uninstall.ps1 — removes every trace of Rocky from this VM.
  Needed for the security conversation ("how do we take it out?") and to reset a rehearsal.
  Leaves the bootstrap transcript behind on purpose: it is evidence, and support reads it.
#>
param(
  [string]$Root = "$env:ProgramData\Rocky",
  [switch]$KeepProfile,      # keep the Edge profile (a rehearsal reset usually wants it gone)
  [switch]$Quiet
)
$ErrorActionPreference = 'Continue'
function Say($m) { if (-not $Quiet) { Write-Host "[rocky] $m" } }

# Close only Edge windows running the Rocky profile; never touch the learner's own browser.
$profile = Join-Path $env:LOCALAPPDATA 'Rocky\EdgeProfile'
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*$profile*" } |
  ForEach-Object { Say "closing Rocky's Edge (pid $($_.ProcessId))"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600

if (Get-ScheduledTask -TaskName 'RockyLabPortal' -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName 'RockyLabPortal' -Confirm:$false -ErrorAction SilentlyContinue
  Say "logon task removed"
}
$lnk = 'C:\Users\Public\Desktop\Lab Portal (with Rocky).lnk'
if (Test-Path $lnk) { Remove-Item $lnk -Force -ErrorAction SilentlyContinue; Say "shortcut removed" }
if (-not $KeepProfile -and (Test-Path $profile)) { Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue; Say "browser profile removed" }
if (Test-Path $Root) { Remove-Item $Root -Recurse -Force -ErrorAction SilentlyContinue; Say "package removed from $Root" }

Say "done. Transcript kept at C:\WindowsAzure\Logs\RockyBootstrap.txt"
