<#
  run-all.ps1 — every gate, in order, in one command.

  This is what to run before touching a lab, and again on demo morning. It answers one
  question: is Rocky, as packaged right now, safe to put in front of a learner?
#>
param([switch]$SkipInstall)   # skip the install/uninstall rehearsal (needs to write to ProgramData)
$ErrorActionPreference = 'Continue'
$pkg = Split-Path $PSScriptRoot -Parent
$repo = Split-Path $pkg -Parent
$results = @()

function Gate($name, $cmd, $what) {
  Write-Host ""
  Write-Host "=== $name ===" -ForegroundColor Cyan
  Write-Host "    $what" -ForegroundColor DarkGray
  & $cmd
  $ok = ($LASTEXITCODE -eq 0)
  $script:results += [pscustomobject]@{ Gate = $name; Passed = $ok }
  if (-not $ok) { Write-Host "    ^ FAILED" -ForegroundColor Red }
}

Gate 'Source integrity' { node (Join-Path $pkg 'test/source-integrity-test.js') | Out-Null } `
  'no mangled escape in a shipped file: the class of bug that reached a learner VM'

Gate 'ARM template' { node (Join-Path $repo 'deploy/validate-arm.js') | Out-Null } `
  'every reference resolves, outputs match VM Configuration, no secret on the command line'

Gate 'Interruption budget' { node (Join-Path $pkg 'test/watcher-test.js') | Out-Null } `
  'a smooth run stays silent; dismissal makes him rarer; errors always get through'

Gate 'CloudLabs knowledge' { node (Join-Path $pkg 'test/knowledge-test.js') | Out-Null } `
  'answers real platform questions from the docs; refuses what the corpus does not cover'

Gate 'Endpoint handling' { node (Join-Path $pkg 'test/endpoint-test.js') | Out-Null } `
  'the AI endpoint a user pastes is the one Rocky calls, query string and all'

Gate 'Guide reading' { node (Join-Path $pkg 'test/guide-test.js') | Out-Null } `
  'works out click targets from a real lab guide, with no captured bundle'

Gate 'Desktop agent parser' { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'agent/rocky-agent.ps1') -ParseTest | Out-Null } `
  'the VM agent reads the same guide lines as the browser half, and splits them the same way'

Gate 'Bundle audit' { node (Join-Path $pkg 'test/resolve-bundle.js') | Out-Null } `
  'every step carries selectors that could clear the 0.70 floor'

Gate 'Resolver on a hostile page' { node (Join-Path $pkg 'test/live-resolve.js') | Out-Null } `
  'the shipped engine, in real Edge: resolves the unique, refuses the ambiguous'

Gate 'Rocky loads and glows' { node (Join-Path $pkg 'test/verify-loaded.js') --ext (Join-Path $pkg 'webext') --shot | Out-Null } `
  'installed into Edge: content scripts inject, overlay mounts, a real bundle step glows'

Gate 'Confused learner' { node (Join-Path $pkg 'test/behaviour-test.js') | Out-Null } `
  'wrong click -> he names the control; portal error -> he explains it is not their fault'

Gate 'Portal drift' { node (Join-Path $pkg 'test/drift-test.js') | Out-Null } `
  'rename, duplicate and disable the controls: Rocky must refuse, never guess'

if (-not $SkipInstall) {
  Gate 'Install rehearsal' { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'test/install-local.ps1') | Out-Null } `
    'the CloudLabs install path end to end: bootstrap, lab.json, preflight, uninstall'
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
$results | ForEach-Object {
  $mark = if ($_.Passed) { '[ok]  ' } else { '[FAIL]' }
  $col  = if ($_.Passed) { 'Green' } else { 'Red' }
  Write-Host ("  {0} {1}" -f $mark, $_.Gate) -ForegroundColor $col
}
$failed = @($results | Where-Object { -not $_.Passed }).Count
Write-Host ""
if ($failed -eq 0) {
  Write-Host "ALL GATES GREEN - safe to put in front of a learner." -ForegroundColor Green
  Write-Host "Screenshot proof: $(Join-Path $pkg 'test/rocky-proof.png')" -ForegroundColor DarkGray
} else {
  Write-Host "$failed GATE(S) FAILED - do not ship." -ForegroundColor Red
}
exit ([int]($failed -gt 0))
