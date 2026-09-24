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

Gate 'Manifest vs real labs' { node (Join-Path $pkg 'test/manifest-hosts-test.js') | Out-Null } `
  'every host the real lab guides send a learner to, by the actual MV3 match-pattern rule'

Gate 'Buttons report failure' { node (Join-Path $pkg 'test/controls-report-test.js') | Out-Null } `
  'Next and Back reach the menu error reporter instead of dying in an empty catch'

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

Gate 'World model and monitor' { node (Join-Path $pkg 'test/pilot-test.js') | Out-Null } `
  'Rocky tracks his position as a belief, and stays quiet when he has nothing to say'

Gate 'Guides an uncaptured lab' { node (Join-Path $pkg 'test/pilot-live.js') | Out-Null } `
  'real Edge, a lab with no bundle: reads the guide, pierces shadow DOM, refuses the ambiguous'

Gate 'Ask path' { node (Join-Path $pkg 'test/ask-path-test.js') | Out-Null } `
  'the question survives a failed bundle fetch instead of vanishing into an empty catch'

Gate 'Explore mode' { node (Join-Path $pkg 'test/explore-test.js') | Out-Null } `
  'explanations actually run, cost one model call per control, and never fight the glow'

Gate 'Nobody waits forever' { node (Join-Path $pkg 'test/ask-deadline-test.js') | Out-Null } `
  'a dead service worker or a stalled storage read still releases the learner, with a reason'

Gate 'Recovery' { node (Join-Path $pkg 'test/recovery-test.js') | Out-Null } `
  'the world model is actually fed, the ladder caps itself, and progress ends it'

Gate 'URL as position' { node (Join-Path $pkg 'test/url-position-test.js') | Out-Null } `
  'the URL tells Rocky where he is, and cannot by itself tell him wrong'

Gate 'End-state' { node (Join-Path $pkg 'test/progress-test.js') | Out-Null } `
  'a step completes when the PAGE reaches the described state, not when the mouse clicks'

Gate 'Guide assist' { node (Join-Path $pkg 'test/guide-assist-test.js') | Out-Null } `
  'the model reads what the rules cannot, and can only return labels the guide actually wrote'

Gate 'Ghost cursor and pre-flight' { node (Join-Path $pkg 'test/ghost-preflight-test.js') | Out-Null } `
  'the pointer only points - it never clicks - and Rocky says once what he can do here'

Gate 'Cross-tab' { node (Join-Path $pkg 'test/crosstab-test.js') | Out-Null } `
  'the glow follows the learner to the tab where the work is'

Gate 'No feedback loops' { node (Join-Path $pkg 'test/no-feedback-loop-test.js') | Out-Null } `
  'Rocky never wakes himself up, and the glow arrives even if the animation does not'

Gate 'Coach ladder' { node (Join-Path $pkg 'test/coach-test.js') | Out-Null } `
  'there is no input for which Rocky has nothing true and useful to say'

Gate 'Bundle audit' { node (Join-Path $pkg 'test/resolve-bundle.js') | Out-Null } `
  'every step carries selectors that could clear the 0.70 floor'

Gate 'Resolver on a hostile page' { node (Join-Path $pkg 'test/live-resolve.js') | Out-Null } `
  'the shipped engine, in real Edge: resolves the unique, refuses the ambiguous'

Gate 'Rocky loads and glows' { node (Join-Path $pkg 'test/verify-loaded.js') --ext (Join-Path $pkg 'webext') --shot | Out-Null } `
  'installed into Edge: content scripts inject, overlay mounts, a real bundle step glows'

Gate 'What a learner clicks' { node (Join-Path $pkg 'test/interaction-live.js') | Out-Null } `
  'in the extension own isolated world: explain(), the ask box, Enter, the button, the worker'

Gate 'Confused learner' { node (Join-Path $pkg 'test/behaviour-test.js') | Out-Null } `
  'wrong click -> he names the control; portal error -> he explains it is not their fault'

Gate 'Portal drift' { node (Join-Path $pkg 'test/drift-test.js') | Out-Null } `
  'rename, duplicate and disable the controls: Rocky must refuse, never guess'

if (-not $SkipInstall) {
  Gate 'Install rehearsal' { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pkg 'test/install-local.ps1') | Out-Null } `
    'the CloudLabs install path end to end: bootstrap, lab.json, preflight, uninstall'
}

# AFTER the install rehearsal, because that is what rebuilds the package. This used to be gate 2,
# which meant it compared a stale zip against fresh source and went red on every change until the
# suite was run a second time. A gate that is red for a reason nobody acts on teaches people to
# ignore red.
Gate 'Package integrity' { node (Join-Path $pkg 'test/package-integrity-test.js') | Out-Null } `
  'the bytes inside the shipped zip and the loose installers, which source integrity never reads'

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
