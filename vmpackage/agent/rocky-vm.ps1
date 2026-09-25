<#
  rocky-vm.ps1 — Rocky on the Windows lab VM: the buddy in the corner.

  WHAT THIS IS FOR. A CloudLabs lab opens as a web page with the guide down one side and the
  Windows VM streamed into the other. Before the learner opens a single application there is
  nobody to greet them, nobody to say what this lab is, and nobody to read out the prerequisites —
  the browser extension cannot help because there is no portal open yet, and the desktop agent
  cannot help because it only rings controls it can already see.

  So this sits in the bottom-right corner of the VM desktop and talks. It welcomes the learner,
  says what the lab is, walks them through the prerequisites in the guide's own words, and then
  gets out of the way the moment a browser appears — because from there the extension is better
  at the job than anything running out here.

  HOW IT KNOWS THE LAB, AND WHY THERE IS NO BRIDGE. CloudLabs renders its guide from public raw
  GitHub URLs listed in the lab's masterdoc.json. So this script fetches the SAME guide the
  learner is reading, directly, over HTTPS. No message from the browser extension, no relay, no
  API, no credentials. It also means Rocky knows ALL the pages from the first second, not only the
  page on screen — which the extension, reading one rendered pane, never does.

  WHAT IT DRAWS. One small top-most card, bottom-right, that never takes focus (WS_EX_NOACTIVATE).
  CloudLabs streams the VM's desktop, so a window drawn here is inside the captured frame and the
  learner sees it with no plumbing at all. The same trick rocky-agent.ps1 uses for its ring.

  WHAT IT WILL NOT DO. It will not click anything, it will not read the learner's keystrokes, and
  it will not claim a step is finished. It says what the guide says and what it can see, which is
  the same contract the browser half keeps.

  Usage:
    rocky-vm.ps1 -Masterdoc <url>     fetch that lab's guide and greet the learner
    rocky-vm.ps1 -SelfTest            no VM needed: fetch, parse and print. For rehearsal.
    rocky-vm.ps1 -Masterdoc <url> -NoUi   parse and print only, no window
#>
param(
  # The lab's masterdoc.json — the file CloudLabs itself uses to render the guide.
  [string]$Masterdoc = "",
  # A friendlier name for the lab, if the masterdoc's own is long.
  [string]$LabName = "",
  [switch]$SelfTest,
  [switch]$NoUi,
  [int]$PollMs = 1500,
  # The browser half. Rocky opens Edge himself so the extension is certainly loaded: Edge ignores
  # --load-extension for a profile that is already running, so a learner who opens the ordinary
  # Edge icon gets a browser with no Rocky in it and no way to tell.
  [switch]$NoBrowser,
  [string]$StartUrl = "https://purview.microsoft.com",
  # Which guide page to hand to the extension. A VM browser has no guide pane and no second tab,
  # so without this the pilot has nothing to guide from. 0 means the WHOLE guide, and that is the
  # default: handing over a single page leaves Rocky holding it for the rest of the lab, because
  # nothing inside the VM tells him the learner has moved on.
  [int]$Page = 0,
  [string]$Root = "$env:ProgramData\Rocky"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# The Zava Purview lab, so the demo needs no argument. Any other lab passes -Masterdoc.
$DEFAULT_MASTERDOC = "https://raw.githubusercontent.com/manojgowda-spektra/" +
  "know-your-data-discover-classify-and-protect-sensitive-information-with-microsof/" +
  "refs/heads/main/LabGuidePackage/Lab%20Guide/masterdoc.json"

function Say-Console([string]$m, [string]$c = "Gray") { Write-Host "  $m" -ForegroundColor $c }

# ---- 1. the guide ---------------------------------------------------------------------------

<#
  Fetch the masterdoc and every page it lists. Pages are markdown, exactly as the CloudLabs
  renderer receives them, so what Rocky reads and what the learner reads cannot drift.
#>
function Get-LabGuide([string]$url) {
  Say-Console "reading the lab guide..." "DarkGray"
  $md = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
  $doc = $md.Content | ConvertFrom-Json
  if ($doc -is [array]) { $doc = $doc[0] }

  $pages = New-Object System.Collections.ArrayList
  foreach ($f in ($doc.Files | Sort-Object Order)) {
    try {
      $r = Invoke-WebRequest -Uri $f.RawFilePath -UseBasicParsing -TimeoutSec 30
      $text = $r.Content
      $title = ""
      foreach ($l in ($text -split "`r?`n")) {
        if ($l -match '^\s*#\s+(.+?)\s*$') { $title = $Matches[1]; break }
      }
      [void]$pages.Add([pscustomobject]@{
        Order = $f.Order
        Title = if ($title) { $title } else { "Page $($f.Order)" }
        Text  = $text
      })
    } catch {
      Say-Console "could not read page $($f.Order): $($_.Exception.Message)" "DarkYellow"
    }
  }
  return [pscustomobject]@{ Name = $doc.Name; Pages = $pages }
}

<#
  CloudLabs substitutes <inject key="..."> at render time; the raw markdown still carries the
  token. Rocky must never read a token aloud as though it were a value, so each becomes a plain
  description of where the learner will actually find it.
#>
function Clean-Line([string]$s) {
  $t = $s
  $t = [regex]::Replace($t, '<inject\s+key="AzureAdUserEmail"\s*/?>(</inject>)?', 'the username on the Environment tab')
  $t = [regex]::Replace($t, '<inject\s+key="AzureAdUserPassword"\s*/?>(</inject>)?', 'the password on the Environment tab')
  $t = [regex]::Replace($t, '<inject\s+key="[^"]*"\s*/?>(</inject>)?', 'the value on the Environment tab')
  # A bare <https://...> is a LINK, not a tag, and it carries the address the learner must visit.
  # Unwrap it BEFORE stripping tags, or "browse to <https://portal.office.com/...>" becomes
  # "browse to ." - measured on page 1 of the real guide.
  $t = [regex]::Replace($t, '<(https?://[^>]+)>', '$1')
  $t = [regex]::Replace($t, '\[([^\]]+)\]\(([^)]*)\)', '$1 ($2)')
  $t = [regex]::Replace($t, '<[^>]+>', '')
  $t = $t -replace '\*\*', '' -replace '`', '' 
  return $t.Trim()
}

<#
  The prerequisites, in the guide's own words. Taken from the numbered list under a
  "Prerequisites" heading on the first page — which is where every CloudLabs guide in this house
  style puts "open Edge, sign in, check your licence". Nothing is invented: if the page has no
  such section, Rocky says so rather than making something up.
#>
function Get-Prerequisites($page) {
  $out = New-Object System.Collections.ArrayList
  if (-not $page) { return $out }
  $inSection = $false
  foreach ($raw in ($page.Text -split "`r?`n")) {
    $l = $raw.TrimEnd()
    if ($l -match '^\s*#{1,6}\s*Prerequisites\s*$') { $inSection = $true; continue }
    if ($inSection -and $l -match '^\s*#{1,6}\s+') { break }        # the next heading ends it
    if (-not $inSection) { continue }
    if ($l -match '^\s*(\d+)\.\s+(.*\S)\s*$') {
      $clean = Clean-Line $Matches[2]
      if ($clean.Length -gt 12) { [void]$out.Add($clean) }
      continue
    }
    # An indented bullet under a numbered step belongs to it. "Sign in when prompted with the
    # assigned lab account:" is useless without the two bullets that follow naming the username
    # and the pass, so they are folded into the step rather than dropped.
    if ($l -match '^\s+[-*]\s+(.*\S)\s*$' -and $out.Count -gt 0) {
      $sub = Clean-Line $Matches[1]
      if ($sub.Length -gt 3) { $out[$out.Count - 1] = $out[$out.Count - 1] + " " + $sub }
    }
  }
  return $out
}

# The challenge pages, for "this lab has N challenges" and for naming what is coming.
function Get-Challenges($guide) {
  return @($guide.Pages | Where-Object { $_.Title -match '^\s*Challenge\b' })
}

# ---- 2. the card ------------------------------------------------------------------------------

$script:Ui = $null

<#
  A borderless top-most card that NEVER takes focus. WS_EX_NOACTIVATE is the whole trick: without
  it, showing the window steals the caret from whatever the learner is typing into, which is the
  fastest way to make a helper hated.
#>
function New-Buddy {
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  if (-not ([System.Management.Automation.PSTypeName]'Rocky.NoFocusForm').Type) {
    Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System;
using System.Windows.Forms;
namespace Rocky {
  public class NoFocusForm : Form {
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {
      get {
        CreateParams p = base.CreateParams;
        p.ExStyle |= 0x08000000;   // WS_EX_NOACTIVATE
        p.ExStyle |= 0x00000080;   // WS_EX_TOOLWINDOW - keep it out of Alt+Tab
        return p;
      }
    }
  }
}
"@
  }

  $W = 400; $H = 186
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $f = New-Object Rocky.NoFocusForm
  $f.FormBorderStyle = 'None'
  $f.ShowInTaskbar = $false
  $f.TopMost = $true
  $f.StartPosition = 'Manual'
  $f.Size = New-Object System.Drawing.Size($W, $H)
  $f.Location = New-Object System.Drawing.Point(($screen.Right - $W - 24), ($screen.Bottom - $H - 24))
  $f.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#0D1426")

  # Rocky, drawn rather than shipped: one less file to get onto the VM, and he matches the
  # browser half's palette.
  $face = New-Object System.Windows.Forms.Panel
  $face.Size = New-Object System.Drawing.Size(56, 56)
  $face.Location = New-Object System.Drawing.Point(18, 20)
  $face.BackColor = $f.BackColor
  $face.Add_Paint({
    param($s, $e)
    $g = $e.Graphics
    $g.SmoothingMode = 'AntiAlias'
    $halo = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#1E2A4A"))
    $g.FillEllipse($halo, 0, 0, 54, 54)
    $body = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#FFCF5A"))
    $g.FillEllipse($body, 7, 7, 40, 40)
    $eye = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#0D1426"))
    $g.FillEllipse($eye, 19, 22, 6, 9)
    $g.FillEllipse($eye, 31, 22, 6, 9)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml("#0D1426")), 2
    $g.DrawArc($pen, 20, 30, 16, 10, 20, 140)
  })
  $f.Controls.Add($face)

  $name = New-Object System.Windows.Forms.Label
  $name.Text = "Rocky"
  $name.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#FFCF5A")
  $name.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  $name.Location = New-Object System.Drawing.Point(88, 18)
  $name.Size = New-Object System.Drawing.Size(290, 20)
  $name.BackColor = $f.BackColor
  $f.Controls.Add($name)

  $body = New-Object System.Windows.Forms.Label
  $body.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#EEF2FF")
  $body.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
  $body.Location = New-Object System.Drawing.Point(88, 40)
  $body.Size = New-Object System.Drawing.Size(294, 92)
  $body.BackColor = $f.BackColor
  $f.Controls.Add($body)

  $hint = New-Object System.Windows.Forms.Label
  $hint.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#8FA3C8")
  $hint.Font = New-Object System.Drawing.Font("Segoe UI", 8)
  $hint.Location = New-Object System.Drawing.Point(88, 140)
  $hint.Size = New-Object System.Drawing.Size(294, 32)
  $hint.BackColor = $f.BackColor
  $f.Controls.Add($hint)

  $f.Show()
  $script:Ui = [pscustomobject]@{ Form = $f; Name = $name; Body = $body; Hint = $hint }
  return $script:Ui
}

function Say([string]$text, [string]$hint = "", [string]$who = "Rocky") {
  Say-Console $text "White"
  if ($hint) { Say-Console "   $hint" "DarkGray" }
  if ($script:Ui) {
    $script:Ui.Name.Text = $who
    $script:Ui.Body.Text = $text
    $script:Ui.Hint.Text = $hint
    [System.Windows.Forms.Application]::DoEvents()
  }
}

function Pump([int]$ms) {
  $until = (Get-Date).AddMilliseconds($ms)
  while ((Get-Date) -lt $until) {
    if ($script:Ui) { [System.Windows.Forms.Application]::DoEvents() }
    Start-Sleep -Milliseconds 80
  }
}

# ---- 2b. the desktop half, loaded into this same process --------------------------------------

<#
  ONE ROCKY, ONE PROCESS. rocky-agent.ps1 holds the UI Automation resolver and the ring, under the
  same 0.70 / 0.20 contract the browser half keeps. Running it as a second script would give the
  learner two Rockys that cannot see each other: one announcing a step while the other rings a
  control for a different one. Dot-sourced with -AsLibrary, its functions become ours and the card
  and the ring are decided in one place.

  If it cannot be loaded, Rocky carries on WITHOUT the ring rather than failing to start. A buddy
  who greets you and reads the guide is worth having even when he cannot point.
#>
$script:CanRing = $false

function Load-DesktopHalf {
  $local = Join-Path $PSScriptRoot "rocky-agent.ps1"
  $path = $local
  if (-not (Test-Path $path)) {
    # Installed by the one-liner, which fetches only this file: pull its other half the same way.
    $path = Join-Path $env:TEMP "rocky-agent.ps1"
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -OutFile $path `
        -Uri "https://raw.githubusercontent.com/manojgowda-spektra/rocky-lab-doctor/main/vmpackage/agent/rocky-agent.ps1"
    } catch {
      Say-Console "desktop pointing unavailable ($($_.Exception.Message)); carrying on without it" "DarkYellow"
      return $false
    }
  }
  try {
    . $path -AsLibrary
    return $true
  } catch {
    Say-Console "desktop pointing unavailable ($($_.Exception.Message)); carrying on without it" "DarkYellow"
    return $false
  }
}

# Which application is in front right now, in words a learner would use.
function Get-ForegroundApp {
  try {
    if (-not ([System.Management.Automation.PSTypeName]'Rocky.Fg').Type) {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace Rocky {
  public class Fg {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    public static int Pid() { int p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
  }
}
"@
    }
    $proc = Get-Process -Id ([Rocky.Fg]::Pid()) -ErrorAction SilentlyContinue
    if (-not $proc) { return $null }
    $friendly = switch -Regex ($proc.ProcessName) {
      '^(msedge|chrome|firefox)$'   { "the browser" }
      '^Code$'                      { "VS Code" }
      '^(powershell|pwsh|WindowsTerminal|cmd)$' { "PowerShell" }
      '^notepad$'                   { "Notepad" }
      '^explorer$'                  { "File Explorer" }
      default                       { $proc.ProcessName }
    }
    return [pscustomobject]@{ Name = $proc.ProcessName; Friendly = $friendly }
  } catch { return $null }
}

<#
  Ring a control the guide names, if it is on the desktop in front of the learner. Browser steps
  are the extension's job, so this deliberately does nothing while a browser is in front: two
  things pointing at once is worse than one.
#>
<#
  EVERY CANDIDATE LABEL COSTS A UI AUTOMATION SCAN, so the search must be bounded or Rocky goes
  quiet. Measured: a full scan is ~670 ms, and the first version of this walked every target on
  all five guide pages - minutes of silence per loop, which is precisely the "stuck" a learner
  reads as broken. The labels are therefore collected ONCE, capped, and searched under a deadline;
  whatever is not found in that budget is simply not found this time round.
#>
$script:RingLabels = $null
$RING_MAX_LABELS = 12
$RING_BUDGET_MS = 1500

function Get-RingLabels($guide) {
  if ($script:RingLabels) { return $script:RingLabels }
  $seen = @{}
  $out = New-Object System.Collections.ArrayList
  foreach ($page in ($guide.Pages | Sort-Object Order)) {
    foreach ($raw in ($page.Text -split "`r?`n")) {
      $line = Clean-Line $raw
      if ($line.Length -lt 12 -or $line.Length -gt 300) { continue }
      # Desktop work only. A browser step is the extension's job and scanning for it out here
      # wastes the whole budget on something Rocky must not point at anyway.
      if ($line -notmatch '(?i)\b(VS Code|Visual Studio Code|PowerShell|Notepad|File Explorer|desktop|terminal|command prompt)\b') { continue }
      $targets = @()
      try { $targets = @(Parse-GuideLine $line) } catch { continue }
      foreach ($t in $targets) {
        if (-not $t.label -or $seen[$t.label]) { continue }
        $seen[$t.label] = $true
        [void]$out.Add([pscustomobject]@{ Label = $t.label; Line = $line })
        if ($out.Count -ge $RING_MAX_LABELS) { $script:RingLabels = $out; return $out }
      }
    }
  }
  $script:RingLabels = $out
  return $out
}

function Try-Ring($guide, $app) {
  if (-not $script:CanRing -or -not $app -or $app.Friendly -eq "the browser") {
    try { Hide-Ring } catch { }
    return $null
  }
  $deadline = (Get-Date).AddMilliseconds($RING_BUDGET_MS)
  foreach ($c in (Get-RingLabels $guide)) {
    if ((Get-Date) -gt $deadline) { break }
    $r = $null
    try { $r = Resolve-Control $c.Label } catch { continue }
    if ($r -and $r.rect) {
      try { Show-Ring $r.rect.x $r.rect.y $r.rect.w $r.rect.h $c.Label } catch { }
      return $c
    }
  }
  try { Hide-Ring } catch { }
  return $null
}

# ---- 2c. the browser half: the extension, and the guide handed to it --------------------------

<#
  Approximate what the guide looks like as RENDERED text, because that is what the extension's
  parser is built for: CloudLabs renders this markdown and the learner sees headings and bullets
  as plain lines, with bold and code spans as styling rather than characters. Handing over raw
  markdown would give the extension asterisks and hashes it has never been asked to read.
#>
function Render-Markdown([string]$text) {
  $out = New-Object System.Collections.ArrayList
  $fence = $false
  foreach ($raw in ($text -split "`r?`n")) {
    if ($raw -match '^\s*```') { $fence = -not $fence; continue }
    if ($fence) { continue }
    $l = $raw -replace '^\s{0,3}#{1,6}\s+', ''
    $l = $l -replace '^\s*([-*+]|\d+\.)\s+', ''
    $l = $l -replace '^\s*>\s*(\[!\w+\]\s*)?', ''
    $l = Clean-Line $l
    if ($l) { [void]$out.Add($l) }
  }
  return $out
}

<#
  Put the extension on this VM and hand it the guide. Fetched as the repository's own zipball:
  one download, and it is the same tree the laptop runs, so the two halves cannot drift.
#>
function Install-BrowserHalf($guide, $pageNo) {
  $ext = Join-Path $Root "webext"
  try {
    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    if (-not (Test-Path (Join-Path $ext "manifest.json"))) {
      Say-Console "installing the browser half..." "DarkGray"
      $zip = Join-Path $env:TEMP "rocky-repo.zip"
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -OutFile $zip `
        -Uri "https://github.com/manojgowda-spektra/rocky-lab-doctor/archive/refs/heads/main.zip"
      $tmp = Join-Path $env:TEMP "rocky-repo"
      if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
      Expand-Archive -Path $zip -DestinationPath $tmp -Force
      <#
        PICK THE EXTENSION BY WHAT IS IN IT, NOT BY ITS NAME. The repository carries two folders
        called webext: the real one under vmpackage (30 content scripts) and a stale one at the
        root (3). Taking the first match installed the stale one, whose manifest listed scripts
        that were not there - Edge loaded an extension that did nothing.
      #>
      $src = Get-ChildItem $tmp -Recurse -Directory -Filter "webext" |
             Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
             Sort-Object @{ Expression = {
               try { (Get-Content (Join-Path $_.FullName "manifest.json") -Raw | ConvertFrom-Json).content_scripts[0].js.Count }
               catch { 0 }
             }; Descending = $true } |
             Select-Object -First 1
      if (-not $src) { throw "the repository zip carried no webext folder" }
      if (Test-Path $ext) { Remove-Item $ext -Recurse -Force -ErrorAction SilentlyContinue }
      <#
        COPY THE FOLDER, NOT ITS CONTENTS. "Copy-Item <dir>\* <dest> -Recurse" into an existing
        destination silently left content\ EMPTY - 0 of 30 content scripts - so the extension
        installed, declared itself in the manifest, and did nothing at all. Copying the directory
        itself is the form that actually recurses.
      #>
      Copy-Item -LiteralPath $src.FullName -Destination $Root -Recurse -Force

      # AND CHECK. A half-copied extension is worse than none: Edge loads it, the learner sees a
      # browser with no Rocky, and nothing anywhere says why.
      $want = 0
      try { $want = (Get-Content (Join-Path $ext "manifest.json") -Raw | ConvertFrom-Json).content_scripts[0].js.Count } catch { $want = 0 }
      $have = @(Get-ChildItem (Join-Path $ext "content") -Filter *.js -ErrorAction SilentlyContinue).Count
      if ($want -lt 1 -or $have -lt $want) {
        throw "the extension copied incompletely ($have of $want content scripts)"
      }
      Say-Console "extension installed: $have content scripts" "Green"
    }
  } catch {
    Say-Console "browser half unavailable ($($_.Exception.Message)); the desktop card still works" "DarkYellow"
    return $null
  }

  <#
    THE WHOLE GUIDE, NOT ONE PAGE, and the reason is that nothing ever revises this.
    On a laptop the extension re-reads the guide pane whenever the learner turns the page. Inside
    the VM there is no pane to re-read, so whatever is handed over here is what Rocky holds until
    the lab ends. Hand over page 1 and he spends Challenge 03 still reciting the prerequisites.

    Measured on the Purview lab: the five pages yield 3, 2, 1, 4 and 5 steps separately and 15
    together - the same fifteen, in guide order, none lost and none invented - parsed in 3.6 ms.
    So the pilot's existing "first step I have not seen finished" walk carries the learner all the
    way through, and Rocky is neither silent nor stuck on a page they left an hour ago.
  #>
  try {
    if ($pageNo -gt 0) {
      $page = $guide.Pages | Where-Object { $_.Order -eq $pageNo } | Select-Object -First 1
      if (-not $page) { $page = $guide.Pages | Sort-Object Order | Select-Object -First 1 }
      $lines = @(Render-Markdown $page.Text)
      $title = $page.Title
      $what = "page $($page.Order)"
    } else {
      $lines = @()
      foreach ($pg in ($guide.Pages | Sort-Object Order)) { $lines += @(Render-Markdown $pg.Text) }
      $title = if ($LabName) { $LabName } else { $guide.Name }
      $what = "all $($guide.Pages.Count) pages"
    }
    $payload = [ordered]@{ title = $title; page = $pageNo; lines = @($lines) }
    $payload | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $ext "labguide.json") -Encoding UTF8
    Say-Console "handed the extension $($what): $($lines.Count) lines" "Green"
  } catch {
    Say-Console "could not hand over the guide ($($_.Exception.Message))" "DarkYellow"
  }
  return $ext
}

function Start-RockyBrowser([string]$ext, [string]$url) {
  $edge = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $edge -or -not $ext) { return $false }
  $prof = Join-Path $Root "edge-profile"
  New-Item -ItemType Directory -Force -Path $prof | Out-Null
  try {
    Start-Process -FilePath $edge -ArgumentList @(
      "--user-data-dir=$prof"
      "--load-extension=$ext"
      "--no-first-run"
      "--no-default-browser-check"
      "--disable-features=DisableLoadExtensionCommandLineSwitch"
      "--force-renderer-accessibility"
      "--start-maximized"
      $url
    ) | Out-Null
    return $true
  } catch {
    Say-Console "could not start Edge ($($_.Exception.Message))" "DarkYellow"
    return $false
  }
}

# ---- 3. is a browser open yet? ------------------------------------------------------------------

<#
  The handover signal. Rocky out here is a stand-in until the learner reaches a browser, because
  in there the extension can see the DOM and this cannot see anything but window titles.
#>
function Get-BrowserWindow {
  try {
    $procs = Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle -and ($_.ProcessName -match '^(msedge|chrome|firefox)$') }
    foreach ($p in $procs) { return $p }
  } catch { }
  return $null
}

# ---- 4. the walk ---------------------------------------------------------------------------------

function Start-Rocky($guide) {
  $chal = Get-Challenges $guide
  $first = $guide.Pages | Sort-Object Order | Select-Object -First 1
  $pre = Get-Prerequisites $first
  # A lab title is usually "Short Name - the long marketing subtitle". The card has room for the
  # short name and the learner already knows what they signed up for, so keep the part before the
  # dash rather than truncating mid-word.
  $labName = if ($LabName) { $LabName } else { $guide.Name }
  if ($labName -match '^(.{6,60}?)\s+[-–—]\s+') { $labName = $Matches[1] }
  if ($labName.Length -gt 72) { $labName = $labName.Substring(0, 69).TrimEnd() + "..." }

  if (-not $NoUi) { [void](New-Buddy) }
  if (-not $NoUi) { $script:CanRing = Load-DesktopHalf }

  Say "Hello — I'm Rocky, and I'll be with you for this lab." `
      "I have read all $($guide.Pages.Count) pages of the guide."
  Pump 3800

  if ($chal.Count) {
    Say "This is $labName. There are $($chal.Count) challenges, and I know what each one asks for." `
        "Take your time. I am not going anywhere."
  } else {
    Say "This is $labName. I have the guide in front of me, same as you." `
        "Take your time. I am not going anywhere."
  }
  Pump 4200

  if ($pre.Count) {
    Say "Before the first challenge there are $($pre.Count) things to set up. I'll take them one at a time." `
        "These come straight from the guide's Prerequisites."
    Pump 3600
    $n = 0
    foreach ($p in $pre) {
      $n++
      $line = $p
      if ($line.Length -gt 210) { $line = $line.Substring(0, 207) + "..." }
      Say $line "Prerequisite $n of $($pre.Count)"
      Pump 6500
      if (Get-BrowserWindow) { break }      # they are ahead of me; stop reading and hand over
    }
  } else {
    Say "The guide does not list prerequisites for this lab, so start with the first challenge when you are ready." ""
    Pump 3500
  }

  <#
    ROCKY OPENS THE BROWSER HIMSELF, and this is not a flourish. Edge ignores --load-extension for
    a profile that is already running, so a learner who clicks the ordinary Edge icon gets a
    browser with no Rocky in it, no glow, and no sign that anything is missing. Opening it here is
    the only way the promise in the next sentence is true.
  #>
  if (-not $NoBrowser -and -not $NoUi) {
    Say "I'll open the browser for you, with me already in it." "Setting up..."
    Pump 1200
    $ext = Install-BrowserHalf $guide $Page
    if ($ext -and (Start-RockyBrowser $ext $StartUrl)) {
      Say "There you go - Edge is opening with me inside it. From here I can see the page and point at the actual controls." `
          $(if ($Page -gt 0) { "I have given that browser page $Page of the guide." }
            else { "That browser has the whole guide - all $($guide.Pages.Count) pages of it." })
    } else {
      Say "I could not open the browser myself, so please open Microsoft Edge when you are ready." `
          "I will still help with anything on the desktop."
    }
  } else {
    Say "Open Microsoft Edge when you are ready." "Waiting for a browser..."
  }

  # ---- wait for the browser, then hand over ------------------------------------------------
  $handed = $false
  while (-not $handed) {
    $b = Get-BrowserWindow
    if ($b) {
      Say "You're in the browser now. The page half of me takes over there - I'll stay here for the desktop." `
          "Look for Rocky in the bottom-right of the page."
      $handed = $true
      break
    }
    Pump $PollMs
  }

  Pump 5000

  <#
    THE RESTING LOOP, AND WHY IT IS NOT SILENT.
    Rocky stays on screen for the rest of the lab. He does two things: he rings a control when the
    guide names one that is actually in front of the learner outside the browser, and he keeps the
    card saying something true about where they are. He does NOT point while a browser is in
    front - that is the extension's job, and two Rockys pointing at once is worse than one.
  #>
  $lastSaid = ""
  $lastApp = ""
  while ($true) {
    # SAY FIRST, POINT SECOND. Working out what to say is instant; finding a control is not, and
    # a learner must never watch an empty card while Rocky thinks.
    $app = Get-ForegroundApp
    $where = if ($app) { $app.Friendly } else { "the desktop" }
    if ($where -ne $lastApp) {
      $resting = "I am here in the corner whenever you need me."
      Say $resting "You are in $where. I have all $($guide.Pages.Count) pages of the guide."
      $lastApp = $where
      # Remember what was just said, not nothing: setting this empty made the card repeat itself
      # one tick later, which reads as a stutter.
      $lastSaid = $resting
    }
    $hit = Try-Ring $guide $app

    if ($hit) {
      $msg = "That is " + $hit.Label + " - I have ringed it for you."
      $hint = $hit.Line
      if ($hint.Length -gt 120) { $hint = $hint.Substring(0, 117) + "..." }
    } elseif ($where -eq "the browser") {
      $msg = "You are in the browser, so I will let the page half of me take it from here."
      $hint = "I am still here for anything on the desktop."
    } elseif ($where -eq "PowerShell") {
      $msg = "PowerShell steps are typed, not clicked, so I will not point - run them as the guide prints them."
      $hint = "Tell me if a command errors and I will say what I know."
    } else {
      $msg = "I am here in the corner whenever you need me."
      $hint = "You are in $where. I have all $($guide.Pages.Count) pages of the guide."
    }

    # Only speak when something actually changed: a card that rewrites itself every two seconds
    # reads as noise, and the learner stops looking at it.
    if ($msg -ne $lastSaid) {
      Say $msg $hint
      $lastSaid = $msg
    }
    Pump 2000
  }
}

# ---- 5. run --------------------------------------------------------------------------------------

Write-Host ""
Write-Host "Rocky — Windows lab VM companion" -ForegroundColor Cyan
Write-Host ""

$url = if ($Masterdoc) { $Masterdoc } else { $DEFAULT_MASTERDOC }
try {
  $guide = Get-LabGuide $url
} catch {
  Write-Host "  could not read the lab guide: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Rocky needs the guide to be useful, so he will not pretend otherwise. Check the URL and the VM's internet access." -ForegroundColor DarkGray
  exit 1
}

Say-Console "lab: $($guide.Name)" "Green"
Say-Console "pages: $($guide.Pages.Count)" "Green"
foreach ($p in ($guide.Pages | Sort-Object Order)) { Say-Console "   $($p.Order). $($p.Title)" "DarkGray" }
$pre = Get-Prerequisites ($guide.Pages | Sort-Object Order | Select-Object -First 1)
Say-Console "prerequisites found on page 1: $($pre.Count)" "Green"
foreach ($p in $pre) { Say-Console "   - $($p.Substring(0, [Math]::Min(96, $p.Length)))" "DarkGray" }
Write-Host ""

if ($SelfTest) {
  $chal = Get-Challenges $guide
  Write-Host "  SELF TEST" -ForegroundColor Cyan
  Write-Host "    challenges detected : $($chal.Count)" -ForegroundColor Gray
  Write-Host "    prerequisites       : $($pre.Count)" -ForegroundColor Gray
  Write-Host "    inject tokens left  : $((($pre -join ' ') | Select-String -AllMatches '<inject').Matches.Count)" -ForegroundColor Gray
  $ok = ($guide.Pages.Count -ge 1) -and ($pre.Count -ge 1)
  Write-Host ""
  if ($ok) { Write-Host "  READY — Rocky can read this lab." -ForegroundColor Green; exit 0 }
  Write-Host "  NOT READY — the guide parsed but yielded nothing to say." -ForegroundColor Red
  exit 1
}

Start-Rocky $guide
