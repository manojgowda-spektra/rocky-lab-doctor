# One-click launcher for Rocky (PowerShell). Right-click > Run with PowerShell, or run from a terminal.
$OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 > $null } catch {}
Set-Location -Path $PSScriptRoot
Write-Host "Starting Rocky...  (type /help for commands, /quit to exit)`n"
node chat.js
Write-Host "`nRocky has exited."
Read-Host "Press Enter to close"
