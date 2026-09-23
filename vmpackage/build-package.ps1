<#
  build-package.ps1 — builds rocky-package.zip, the artefact the CloudLabs CSE installs.

  Validates before it packs: a package that expands into a broken Rocky is worse than no
  package, because the failure surfaces in front of a learner instead of here.
#>
param(
  [string]$Out     = "$PSScriptRoot\dist",
  [string]$Version = "",              # default: 0.8.0+<git short sha>
  [switch]$SkipGit,
  [switch]$SkipLive          # skip the headless-Edge resolver test (CI without a browser)
)
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
function Say($m) { Write-Host "[build] $m" }
function Die($m) { Write-Host "[build] FAIL: $m" -ForegroundColor Red; exit 1 }

# ---- validate ----------------------------------------------------------------------
$man = Join-Path $src 'webext\manifest.json'
if (-not (Test-Path $man)) { Die "no extension at webext\" }
$m = [IO.File]::ReadAllText($man, [Text.Encoding]::UTF8) | ConvertFrom-Json
Say "extension: $($m.name) $($m.version)"

# every content script the manifest declares must exist, or Edge silently loads a half Rocky
$declared = @(); $declared += $m.content_scripts[0].js; $declared += $m.content_scripts[0].css
$declared += $m.background.service_worker; $declared += $m.action.default_popup
$missing = $declared | Where-Object { $_ -and -not (Test-Path (Join-Path $src "webext\$_")) }
if ($missing) { Die "manifest declares files that are not present: $($missing -join ', ')" }
Say "$($declared.Count) declared files present"

# every bundle must parse and contain steps
$bundles = Get-ChildItem (Join-Path $src 'webext\bundle') -Filter *.json -ErrorAction SilentlyContinue
if (-not $bundles) { Die "no bundles in webext\bundle" }
foreach ($b in $bundles) {
  try { $j = [IO.File]::ReadAllText($b.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { Die "$($b.Name) is not valid JSON" }
  $n = 0; foreach ($l in $j.labs) { foreach ($t in $l.tasks) { $n += @($t.steps).Count } }
  if ($n -lt 1) { Die "$($b.Name) contains no steps" }
  Say "bundle $($b.Name): $n steps — $($j.title)"
}

# scripts must parse as PowerShell (catches a stray brace before it reaches a VM)
foreach ($f in Get-ChildItem (Join-Path $src 'bin') -Filter *.ps1) {
  $errs = $null; [void][Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$errs)
  if ($errs -and $errs.Count) { Die "$($f.Name) has $($errs.Count) parse error(s): $($errs[0].Message)" }
}
$nScripts = (Get-ChildItem (Join-Path $src 'bin') -Filter *.ps1).Count
Say "$nScripts scripts parse cleanly"

# nothing secret ships
$q = [char]34
$patterns = @(
  'sk-[A-Za-z0-9]{12,}',
  ('api[-_]?key' + $q + '\s*:\s*' + $q + '[^' + $q + ']{12,}'),
  'BEGIN (RSA|PRIVATE)',
  'foundry-aidev'
)
# the builder itself holds the pattern list, so it is never its own suspect
$leaks = Get-ChildItem $src -Recurse -File -Include *.js,*.json,*.ps1,*.txt -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notlike "*\dist\*" -and $_.Name -ne 'build-package.ps1' } |
  Select-String -Pattern $patterns -ErrorAction SilentlyContinue
if ($leaks) { $leaks | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber)" -ForegroundColor Yellow }; Die "possible secret or personal endpoint in the package" }
Say "no secrets found"

# ---- the engine must actually resolve, not merely parse --------------------------------
# resolve-bundle.js audits every step offline; live-resolve.js runs the SHIPPED engine in
# real headless Edge against a deliberately ambiguous page and asserts that it refuses to
# glow when it should. A package that cannot pass these has no business reaching a learner.
$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) {
  # FIRST, before any behavioural gate: are the shipped files intact? A heredoc turned
  # 'agent\rocky-agent.ps1' into a carriage return and shipped it; the installer failed in a
  # learner's VM with "Illegal characters in path". The same accident ate three regex \b in
  # the agent's guide parser, which threw no error and simply matched nothing. No behaviour
  # test can see either one, because neither file is executed by Node or Edge.
  Say "checking source integrity..."
  & node (Join-Path $src 'test/source-integrity-test.js') | Out-Null
  if ($LASTEXITCODE -ne 0) { & node (Join-Path $src 'test/source-integrity-test.js'); Die "a shipped file carries a mangled escape sequence" }
  Say "no mangled escapes - every shipped path is real"

  # The desktop agent's guide parser is pure logic and runs without a desktop, so gate it
  # here alongside the browser reader rather than only discovering it live in a VM.
  Say "checking the desktop agent's guide parser..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $src 'agent/rocky-agent.ps1') -ParseTest | Out-Null
  if ($LASTEXITCODE -ne 0) { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $src 'agent/rocky-agent.ps1') -ParseTest; Die "the VM agent can no longer read a lab guide" }
  Say "the VM agent reads a real guide"

  # Does Rocky know when to stay quiet? The interruption budget is what separates a
  # companion from Clippy, so it is gated like anything else.
  Say "checking the interruption budget..."
  & node (Join-Path $src 'test/watcher-test.js') | Out-Null
  if ($LASTEXITCODE -ne 0) { & node (Join-Path $src 'test/watcher-test.js'); Die "watcher decision logic failed" }
  Say "watcher logic clean"

  # Rocky's CloudLabs knowledge: does it answer real questions, and - just as important -
  # does it refuse questions the corpus does not cover?
  if (Test-Path (Join-Path $src 'webext/knowledge/cloudlabs-kb.json')) {
    Say "checking the CloudLabs knowledge..."
    & node (Join-Path $src 'test/knowledge-test.js') | Out-Null
    if ($LASTEXITCODE -ne 0) { & node (Join-Path $src 'test/knowledge-test.js'); Die "CloudLabs knowledge retrieval failed" }
    Say "knowledge answers the real questions and refuses the rest"
  } else {
    Say "no knowledge index (build it with: node tools/build-knowledge.js)"
  }

  # Azure hands out several endpoint shapes; rewriting one into another silently sends the
  # request somewhere the user never asked for and fails with no useful error.
  Say "checking endpoint handling..."
  & node (Join-Path $src 'test/endpoint-test.js') | Out-Null
  if ($LASTEXITCODE -ne 0) { & node (Join-Path $src 'test/endpoint-test.js'); Die "endpoint handling failed" }
  Say "the endpoint a user pastes is the endpoint Rocky calls"

  # Can Rocky work out the steps of a lab nobody captured? This is the claim that makes him
  # worth having next to CloudLabs Copilot, tested against real workshop guide text.
  Say "reading a real lab guide..."
  & node (Join-Path $src 'test/guide-test.js') | Out-Null
  if ($LASTEXITCODE -ne 0) { & node (Join-Path $src 'test/guide-test.js'); Die "guide reading failed" }
  Say "guide reader clean"

  Say "auditing bundles..."
  & node (Join-Path $src 'test/resolve-bundle.js') | Out-Null
  if ($LASTEXITCODE -ne 0) { & node (Join-Path $src 'test/resolve-bundle.js'); Die "bundle audit failed" }
  Say "bundle audit clean"

  if (-not $SkipLive) {
    Say "running the engine against the hostile mock page in headless Edge..."
    $live = & node (Join-Path $src 'test/live-resolve.js') 2>&1
    if ($LASTEXITCODE -ne 0) { $live | ForEach-Object { Write-Host "    $_" }; Die "live resolve test failed" }
    $summary = ($live | Where-Object { $_ -match 'passed,' } | Select-Object -Last 1)
    Say "live resolve: $summary"

    # The decisive one: install the extension into a real Edge and confirm the content
    # scripts inject, the overlay mounts and a real bundle step actually glows. This is the
    # check that catches "the extension silently did not load" before a learner does.
    $installed = Join-Path $env:ProgramData 'Rocky\webext'
    $extForTest = if (Test-Path (Join-Path $installed 'manifest.json')) { $installed } else { Join-Path $src 'webext' }
    Say "verifying Rocky loads and glows in real Edge..."
    $vl = & node (Join-Path $src 'test/verify-loaded.js') --ext $extForTest --shot 2>&1
    if ($LASTEXITCODE -ne 0) { $vl | ForEach-Object { Write-Host "    $_" }; Die "Rocky did not load correctly in the browser" }
    $glow = ($vl | Where-Object { $_ -match 'GLOWING' } | Select-Object -First 1)
    if ($glow) { Say ("browser check: " + $glow.Trim()) } else { Say "browser check: loaded (no glow on the mock page)" }

    # The safety claim, made to fail on purpose: rename, duplicate and disable the controls
    # a real step depends on, and assert Rocky refuses rather than guessing.
    # Drive the browser like a confused learner: wrong click, portal error. Asserts on the
    # text Rocky actually rendered, so a silent wiring regression cannot reach a demo.
    Say "behaving like a confused learner..."
    $bt = & node (Join-Path $src 'test/behaviour-test.js') 2>&1
    if ($LASTEXITCODE -ne 0) { $bt | ForEach-Object { Write-Host "    $_" }; Die "Rocky did not react correctly to a confused learner" }
    $wrong = ($bt | Where-Object { $_ -match 'WRONG CLICK' } | Select-Object -First 1)
    if ($wrong) { Say ("behaviour: " + $wrong.Trim()) }
    $err = ($bt | Where-Object { $_ -match 'PORTAL ERROR' } | Select-Object -First 1)
    if ($err) { Say ("behaviour: " + $err.Trim()) }

    Say "breaking the portal on purpose to check Rocky refuses..."
    $dt = & node (Join-Path $src 'test/drift-test.js') 2>&1
    if ($LASTEXITCODE -ne 0) { $dt | ForEach-Object { Write-Host "    $_" }; Die "Rocky did not degrade safely under portal drift" }
    Say ("drift check: " + (($dt | Where-Object { $_ -match 'passed,' } | Select-Object -Last 1)).Trim())
  }
} else { Say "node not found - skipping the resolver tests (NOT recommended for a release build)" }

# ---- version -------------------------------------------------------------------------
$sha = 'nogit'
if (-not $SkipGit) { try { $sha = (git -C $src rev-parse --short HEAD 2>$null); if (-not $sha) { $sha = 'nogit' } } catch { $sha = 'nogit' } }
if (-not $Version) { $Version = "$($m.version)+$sha" }
$portalBuild = (Get-Date -Format 'yyyy-MM')
@{
  package     = 'rocky-vm-package'
  version     = $Version
  extension   = $m.version
  commit      = $sha
  builtAt     = (Get-Date).ToUniversalTime().ToString('o')
  portalBuild = $portalBuild
  bundles     = @($bundles | ForEach-Object { $_.Name })
  note        = 'Bundles were captured against the portal build above. Re-capture if the portal changes.'
} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $src 'VERSION.json') -Encoding UTF8
Say "version $Version"

# ---- pack -----------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$zip = Join-Path $Out 'rocky-package.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }

$stage = Join-Path $env:TEMP ("rocky-stage-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($d in 'webext','bin','bundles','agent') {
  $p = Join-Path $src $d
  if (Test-Path $p) { Copy-Item $p $stage -Recurse -Force }
  else { New-Item -ItemType Directory -Force -Path (Join-Path $stage $d) | Out-Null }
}
Copy-Item (Join-Path $src 'VERSION.json') $stage -Force
if (Test-Path (Join-Path $src 'README.txt')) { Copy-Item (Join-Path $src 'README.txt') $stage -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

# the bootstrap is fetched separately by the CSE, so publish it alongside the zip
Copy-Item (Join-Path $src 'bin\rocky-bootstrap.ps1') $Out -Force

$size = '{0} KB' -f [math]::Round((Get-Item $zip).Length / 1024)
Say "packed: $zip  -  $size"
$bootOut = Join-Path $Out 'rocky-bootstrap.ps1'
Say "publish alongside it: $bootOut"
