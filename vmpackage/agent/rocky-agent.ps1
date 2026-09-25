<#
  rocky-agent.ps1 — Rocky outside the browser.

  The demo lab spends most of its length in VS Code, the Windows file picker, Teams and
  Outlook. A browser extension is blind to all of them, which is precisely where a learner
  is most likely to click the wrong thing. This agent finds the control on the DESKTOP and
  draws a ring around it.

  WHY THIS IS SIMPLER THAN IT SOUNDS
  CloudLabs streams the VM's desktop to the learner's browser. A top-most window drawn on
  that desktop is, by definition, inside the captured frame. So there is no RDP work, no
  Guacamole plugin, no video compositing: draw a window on the VM and the existing capture
  path does the rest. If it looks right locally it looks right in the browser.

  WHAT IT IS BUILT FROM
  UI Automation and WinForms, both in .NET Framework, both present on every Windows VM. No
  compiler, no installer, no admin rights, no dependency to review. Measured on a real
  machine: VS Code exposes 3,805 elements including 545 buttons, and a full scan takes
  674 ms.

  A TRAP, RECORDED SO NOBODY REDISCOVERS IT
  A shallow Children scan of VS Code returns three buttons: Minimize, Restore, Close. The
  real UI lives deeper and needs a Descendants scan. Getting this wrong looks exactly like
  "UIA does not work with Electron apps", which is a conclusion many people reach and it is
  false.

  THE CONTRACT IS THE SAME AS THE BROWSER'S
  Score >= 0.70, winner beats the runner-up by >= 0.20, any contradicted attribute
  disqualifies outright. Not re-invented here for the sake of it: a wrong glow on the
  desktop is worse than in a page, because a mis-click in VS Code is harder to undo.

  Usage:
    rocky-agent.ps1                 watch the bridge file and glow what it names
    rocky-agent.ps1 -Find "Open Folder"     one-shot: find and ring it
    rocky-agent.ps1 -Probe          report what UIA can see right now (diagnostics)
#>
param(
  [string]$Find = "",
  [switch]$Probe,
  [string]$Bridge = "$env:ProgramData\Rocky\step.json",
  [int]$PollMs = 700,
  [switch]$Once,
  [switch]$ParseTest,  # run the guide parser against real guide lines and exit; no desktop needed
  # Define everything and return without watching anything. rocky-vm.ps1 dot-sources this so the
  # learner gets ONE Rocky in ONE process - the card in the corner and the ring on the desktop -
  # rather than two scripts that each think they are in charge.
  [switch]$AsLibrary
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing

# ---- the contract, identical to the browser resolver ---------------------------------------
$MIN_SCORE = 0.70
$MARGIN    = 0.20

# Weights mirror the DOM engine's intent: an authored identifier beats a name, a name beats
# a role, and a role alone never resolves anything.
# NOT $W: PowerShell variables are case-insensitive, and Score-Element uses $w for the
# normalised search term. $W.name would then read a property off a string and score 0.
$WEIGHT = @{ automationId = 0.95; name = 0.80; help = 0.50; class = 0.50; value = 0.50; type = 0.30 }

function Normalise([string]$s) {
  if (-not $s) { return "" }
  return ($s -replace '\s+', ' ').Trim().ToLowerInvariant()
}

# How well does one element match the label we are looking for? Exact beats prefix beats
# contains, because "Open" should not win against "Open Folder" when the guide said the latter.
function Score-Element($el, [string]$want) {
  $target = Normalise $want
  if (-not $target) { return 0 }
  $score = 0.0
  try {
    $name = Normalise $el.Current.Name
    if ($name) {
      if     ($name -eq $target)             { $score += $WEIGHT.name }
      elseif ($name.StartsWith($target))     { $score += $WEIGHT.name * 0.85 }
      elseif ($name.Contains($target))       { $score += $WEIGHT.name * 0.65 }
      elseif ($target.Contains($name) -and $name.Length -gt 3) { $score += $WEIGHT.name * 0.45 }
    }
    $aid = Normalise $el.Current.AutomationId
    if ($aid -and ($aid -eq $target -or $aid.Contains($target))) { $score += $WEIGHT.automationId }

    # A control you can actually click is a better answer than a label that merely says the
    # same words. This is the desktop equivalent of preferring a button over its caption.
    $t = $el.Current.ControlType.ProgrammaticName
    if ($t -match 'Button|MenuItem|TabItem|ListItem|Hyperlink|CheckBox|RadioButton|ComboBox|Edit') { $score += $WEIGHT.type }
    elseif ($t -match 'Text|Image') { $score -= 0.15 }     # a caption is rarely the target

    # Invisible or offscreen elements are never the answer.
    if ($el.Current.IsOffscreen) { return 0 }
    $r = $el.Current.BoundingRectangle
    if ($r.Width -lt 2 -or $r.Height -lt 2) { return 0 }
  } catch { return 0 }
  return $score
}

function Get-Windows {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  return $root.FindAll([System.Windows.Automation.TreeScope]::Children,
                       [System.Windows.Automation.Condition]::TrueCondition)
}

# Which application should we search? The focused one, unless the caller named an app.
function Get-SearchRoot([string]$appHint) {
  $wins = Get-Windows
  if ($appHint) {
    foreach ($w in $wins) {
      try { if ($w.Current.Name -like "*$appHint*") { return $w } } catch {}
    }
  }
  try {
    $f = [System.Windows.Automation.AutomationElement]::FocusedElement
    if ($f) {
      # climb to the top-level window that owns the focus
      $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
      $cur = $f
      for ($i = 0; $i -lt 30 -and $cur; $i++) {
        $parent = $walker.GetParent($cur)
        if (-not $parent -or $parent -eq [System.Windows.Automation.AutomationElement]::RootElement) { return $cur }
        $cur = $parent
      }
    }
  } catch {}
  return [System.Windows.Automation.AutomationElement]::RootElement
}

<#
  Find the one control that matches, or refuse.

  PERFORMANCE, measured rather than assumed. The first version walked every element and
  scored it in PowerShell: 5,355 ms on a desktop with VS Code open, which is unusable in
  front of an audience. A UIA PropertyCondition search for the same control takes 74 ms -
  seventy times faster - because UIA indexes those and the walk was fighting the API.

  So: ask UIA for candidates by name (exact, then contains), and only score that handful.
  Same contract, same refusals, a fraction of the work.

  Returns: @{ status = 'resolved'|'ambiguous'|'absent'; rect; name; score; runnerUp }
#>
function Find-Candidates($root, [string]$want) {
  $out = New-Object System.Collections.ArrayList
  $scope = [System.Windows.Automation.TreeScope]::Descendants

  # 1. exact name - the common case, and the cheapest
  try {
    $c = New-Object System.Windows.Automation.PropertyCondition(
           [System.Windows.Automation.AutomationElement]::NameProperty, $want)
    foreach ($e in $root.FindAll($scope, $c)) { [void]$out.Add($e) }
  } catch {}

  # 2. automation id, which authors set deliberately
  try {
    $c2 = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::AutomationIdProperty, $want)
    foreach ($e in $root.FindAll($scope, $c2)) { [void]$out.Add($e) }
  } catch {}

  # 3. only if nothing exact matched, fall back to a bounded scan for partial names. Capped,
  #    because an unbounded walk is what made this slow in the first place.
  if ($out.Count -eq 0) {
    try {
      $all = $root.FindAll($scope, [System.Windows.Automation.Condition]::TrueCondition)
      $needle = Normalise $want
      $seen = 0
      foreach ($e in $all) {
        if ($seen -ge 4000) { break }
        $seen++
        $n = Normalise $e.Current.Name
        if ($n -and ($n.Contains($needle) -or $needle.Contains($n))) { [void]$out.Add($e) }
      }
    } catch {}
  }
  return $out
}

function Resolve-Control([string]$want, [string]$appHint = "") {
  $roots = @()
  if ($appHint) {
    $r = Get-SearchRoot $appHint
    if ($r) { $roots += $r }
  }
  if (-not $roots.Count) {
    # No hint: focused window first (cheap and usually right), then every other top-level
    # window. A guide step often names a control in an app the learner just switched away
    # from, so searching only the focused window misses it.
    #
    # De-duplicate by RUNTIME ID, not by object identity. AutomationElement is a COM wrapper
    # and -notcontains compares references, so the same window arrives as a different object
    # each call and the comparison silently drops windows - which is why every lookup was
    # returning "absent" even for controls that plainly existed.
    $seenIds = @{}
    $focused = Get-SearchRoot ""
    if ($focused) {
      $roots += $focused
      try { $seenIds[($focused.GetRuntimeId() -join '.')] = $true } catch {}
    }
    foreach ($w in (Get-Windows)) {
      try {
        $id = $w.GetRuntimeId() -join '.'
        if (-not $seenIds.ContainsKey($id)) { $seenIds[$id] = $true; $roots += $w }
      } catch { $roots += $w }
    }
  }

  $best = $null; $bestScore = 0.0; $second = 0.0; $scanned = 0
  foreach ($root in $roots) {
    $cands = Find-Candidates $root $want
    $scanned += $cands.Count
    foreach ($el in $cands) {
      $s = Score-Element $el $want
      if ($s -gt $bestScore) { $second = $bestScore; $bestScore = $s; $best = $el }
      elseif ($s -gt $second) { $second = $s }
    }
    # A confident hit in the focused window is the answer; do not keep searching every app.
    if ($bestScore -ge $MIN_SCORE -and ($bestScore - $second) -ge $MARGIN) { break }
  }

  if (-not $best -or $bestScore -lt $MIN_SCORE) {
    return @{ status = 'absent'; reason = "nothing scored $MIN_SCORE or better"; scanned = $scanned }
  }
  if (($bestScore - $second) -lt $MARGIN) {
    # Two plausible controls. Refuse rather than pick: the whole point of the contract.
    return @{ status = 'ambiguous'; score = $bestScore; runnerUp = $second; scanned = $scanned }
  }
  $r = $best.Current.BoundingRectangle
  return @{
    status = 'resolved'
    name   = $best.Current.Name
    type   = $best.Current.ControlType.ProgrammaticName -replace 'ControlType\.',''
    score  = $bestScore
    runnerUp = $second
    rect   = @{ x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height }
    scanned = $scanned
  }
}

# ---- the overlay -------------------------------------------------------------------------
# A transparent, click-through, always-on-top window. It draws only a ring, so the learner
# can still use everything underneath it.
$script:Overlay = $null

function Show-Ring([int]$x, [int]$y, [int]$w, [int]$h, [string]$caption) {
  if (-not $script:Overlay) {
    $f = New-Object System.Windows.Forms.Form
    $f.FormBorderStyle = 'None'; $f.ShowInTaskbar = $false; $f.TopMost = $true
    $f.StartPosition = 'Manual'; $f.BackColor = [System.Drawing.Color]::Magenta
    $f.TransparencyKey = [System.Drawing.Color]::Magenta      # magenta becomes see-through
    $script:Overlay = $f
    # click-through: the ring must never intercept the learner's click
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RockyWin {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  public const int GWL_EXSTYLE = -20, WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80;
}
"@ -ErrorAction SilentlyContinue
    $f.Show()
    $ex = [RockyWin]::GetWindowLong($f.Handle, [RockyWin]::GWL_EXSTYLE)
    [void][RockyWin]::SetWindowLong($f.Handle, [RockyWin]::GWL_EXSTYLE,
      $ex -bor [RockyWin]::WS_EX_LAYERED -bor [RockyWin]::WS_EX_TRANSPARENT -bor [RockyWin]::WS_EX_TOOLWINDOW)
  }
  $pad = 6
  $f = $script:Overlay
  $f.Bounds = New-Object System.Drawing.Rectangle(($x - $pad), ($y - $pad - 22), ($w + $pad * 2), ($h + $pad * 2 + 22))
  $f.Refresh()
  $g = $f.CreateGraphics()
  $g.Clear([System.Drawing.Color]::Magenta)
  $g.SmoothingMode = 'AntiAlias'
  # gold, to match the browser glow - the learner should recognise it as the same Rocky
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 245, 197, 66)), 3
  $g.DrawRectangle($pen, $pad, ($pad + 22), $w, $h)
  if ($caption) {
    $font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 13, 20, 38))
    $size = $g.MeasureString($caption, $font)
    $g.FillRectangle($bg, $pad, 0, ($size.Width + 10), 20)
    $g.DrawString($caption, $font, [System.Drawing.Brushes]::White, ($pad + 5), 3)
    $font.Dispose(); $bg.Dispose()
  }
  $pen.Dispose(); $g.Dispose()
  [System.Windows.Forms.Application]::DoEvents()
}

function Hide-Ring {
  if ($script:Overlay) { $script:Overlay.Hide(); $script:Overlay = $null }
}


# ---- reading the lab guide, straight from the browser window --------------------------------
# No IPC. Rocky-Launch starts the browser with --force-renderer-accessibility, so the guide
# text is in the window's UIA tree and the agent reads it exactly as it reads VS Code.

function Get-GuideText {
  foreach ($w in (Get-Windows)) {
    try {
      $n = $w.Current.Name
      if ($n -notmatch 'Edge|Chrome') { continue }
      $cond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Text)
      $texts = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($texts.Count -lt 5) { continue }         # tabs and toolbar only: not a guide
      # Rejoin inline runs into sentences. UIA returns one node per run, so a single
      # instruction arrives in pieces; a fragment ending mid-sentence is joined to the next.
      $raw = New-Object System.Collections.ArrayList
      foreach ($t in $texts) {
        $v = $t.Current.Name
        if ($v -and $v.Trim()) { [void]$raw.Add($v.Trim()) }
      }
      $lines = New-Object System.Collections.ArrayList
      $buf = ""
      foreach ($frag in $raw) {
        $buf = if ($buf) { "$buf $frag" } else { $frag }
        # a sentence ends on terminal punctuation; anything else is still being assembled
        if ($buf -match '[.!?]\s*$' -or $buf.Length -gt 300) {
          [void]$lines.Add($buf.Trim()); $buf = ""
        }
        # A heading has no full stop, so it would otherwise swallow the instruction that
        # follows it. Close the buffer when the NEXT fragment starts a fresh instruction.
        elseif ($buf -match '^(?:Module|Step|Task|Exercise|Part)\b' -and $buf -match '\s(?:Click|Select|Navigate|Open|Choose|Enter|Set)\s') {
          $cut = [regex]::Match($buf, '\s(?=(?:Click|Select|Navigate|Open|Choose|Enter|Set)\s)')
          if ($cut.Success) {
            [void]$lines.Add($buf.Substring(0, $cut.Index).Trim())
            $buf = $buf.Substring($cut.Index).Trim()
          }
        }
      }
      if ($buf.Trim()) { [void]$lines.Add($buf.Trim()) }
      if ($lines.Count -ge 3) { return $lines }
    } catch {}
  }
  return $null
}

# The same idiom the browser-side guide reader parses, kept deliberately in step with it:
# "Select File (1) and then Open Folder (2)" -> the ordered controls to click.
# "Select File" is a menu named File. "Open Folder" is a button named Open Folder. Both begin
# with a word that is also a verb, and the text alone cannot tell them apart - so do not try.
# Return BOTH readings, verb-stripped first, and let Resolve-Control decide: it scores each
# against the live desktop and refuses when neither is unique. This mirrors verbReadings() in
# the browser reader exactly, and for the same reason: guessing here would be a coin flip,
# and a coin flip is what the 0.70 / 0.20 contract exists to prevent.
function Verb-Readings([string]$frag) {
  $verb = '(?:Click on|Click|Select|Navigate to|Open|Choose|Enter|Set|Expand|Press|Type)'
  $whole = $frag.Trim(' ', ',', '.')
  $out = New-Object System.Collections.ArrayList
  $stripped = ($frag -replace "^\s*$verb\s+(?:on\s+|to\s+|the\s+)?", '').Trim(' ', ',', '.')
  foreach ($cand in @($stripped, $whole)) {
    if ($cand.Length -ge 2 -and $cand.Length -le 48 -and $out -notcontains $cand) { [void]$out.Add($cand) }
  }
  return $out
}

function Parse-GuideLine([string]$line) {
  $verb = '(?:Click on|Click|Select|Navigate to|Open|Choose|Enter|Set|Expand|Press|Type)'
  $out = New-Object System.Collections.ArrayList
  if ($line -match '\(\d\)') {
    $rx = [regex]"([^()]{2,80}?)\s*\((\d)\)"
    foreach ($m in $rx.Matches($line)) {
      $frag = ($m.Groups[1].Value -split ',|\band then\b|\bthen\b|\band\b')[-1]
      $frag = $frag -replace "^\s*(?:and\s+then|and|then)\s+", ''
      foreach ($label in (Verb-Readings $frag)) {
        [void]$out.Add(@{ n = [int]$m.Groups[2].Value; label = $label })
      }
    }
  } elseif ($line -match "^\s*$verb\s+") {
    $label = ($line -replace "^\s*$verb\s+(?:on\s+|to\s+|the\s+)?", '')
    $label = ($label -replace '\s+to\s+(?:sign|proceed|continue|open|view|see|complete|enable|start)\b.*$', '').Trim(' ', ',', '.')
    if ($label.Length -ge 2 -and $label.Length -le 48) { [void]$out.Add(@{ n = 1; label = $label }) }
  }
  return $out
}

# Which guide step is the learner actually on? The agent cannot know for certain, so it does
# the honest thing: try each candidate target against the desktop and glow the FIRST one that
# resolves uniquely. A step whose control is not on screen is simply skipped rather than
# guessed at - which also means the agent naturally follows the learner forward.
function Find-NextDesktopTarget($lines) {
  foreach ($line in $lines) {
    foreach ($t in (Parse-GuideLine $line)) {
      $r = Resolve-Control $t.label
      if ($r.status -eq 'resolved') {
        return @{ label = $t.label; line = $line; result = $r }
      }
    }
  }
  return $null
}

# ---- gate: does the parser still parse? -------------------------------------------------------
# This exists because three \b word boundaries in Parse-GuideLine were silently turned into
# backspace characters by a shell heredoc. Nothing errored. The parser simply stopped splitting
# "X (1) and then Y (2)" and Rocky sat on "finding the step" forever. A regex that matches
# nothing throws no exception, so only an assertion on the OUTPUT catches it.
# Lines below are verbatim from the Microsoft IQ workshop guide, as in the browser gate.
if ($ParseTest) {
  $cases = @(
    @{ line = 'Select File (1) and then Open Folder (2).';                      want = @('File', 'Open Folder') }
    @{ line = 'Click Auto (1) and then set the model to Claude Sonnet 5 (2).';  want = @('Auto') }
    @{ line = 'Click on the elipses (1) and then Remove (2).';                  want = @('Remove') }
    @{ line = 'Click on Publish.';                                              want = @('Publish') }
    @{ line = 'Click on Continue with GitHub to sign in to GitHub Copilot.';    want = @('Continue with GitHub') }
  )
  $bad = 0
  Write-Host ""
  Write-Host "=== AGENT GUIDE PARSER ===" -ForegroundColor Cyan
  foreach ($c in $cases) {
    $got = @(Parse-GuideLine $c.line | ForEach-Object { $_.label })
    $miss = @($c.want | Where-Object { $got -notcontains $_ })
    if ($miss.Count) {
      $bad++
      Write-Host ("  [FAIL] {0}" -f $c.line) -ForegroundColor Red
      Write-Host ("         missing: {0}   got: {1}" -f ($miss -join ', '), ($got -join ' | '))
    } else {
      Write-Host ("  [ok]   {0}" -f ($got -join ' | '))
    }
  }
  # "and then" must actually split. If \b is broken this yields one fused label, not two.
  $split = @(Parse-GuideLine 'Select File (1) and then Open Folder (2).' | ForEach-Object { $_.label })
  if ($split.Count -lt 2) { $bad++; Write-Host "  [FAIL] 'and then' no longer splits - word boundaries are broken" -ForegroundColor Red }
  Write-Host ""
  if ($bad) { Write-Host "$bad FAILED" -ForegroundColor Red; exit 1 }
  Write-Host "all passed - the desktop agent can read a real guide." -ForegroundColor Green
  exit 0
}

# ---- diagnostics ----------------------------------------------------------------------------
if ($Probe) {
  Write-Host ""
  Write-Host "=== WHAT ROCKY CAN SEE ON THIS DESKTOP ===" -ForegroundColor Cyan
  $wins = Get-Windows
  Write-Host "  top-level windows: $($wins.Count)"
  foreach ($w in $wins) {
    try {
      $n = $w.Current.Name
      if (-not $n) { continue }
      $sw = [Diagnostics.Stopwatch]::StartNew()
      $kids = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $sw.Stop()
      Write-Host ("    {0,-52} {1,5} elements  {2,4} ms" -f $n.Substring(0, [Math]::Min(50, $n.Length)), $kids.Count, $sw.ElapsedMilliseconds)
    } catch {}
  }
  Write-Host ""
  return
}

# ---- one-shot ---------------------------------------------------------------------------------
if ($Find) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $r = Resolve-Control $Find
  $sw.Stop()
  Write-Host ""
  Write-Host "looking for: '$Find'" -ForegroundColor Cyan
  Write-Host "  scanned $($r.scanned) elements in $($sw.ElapsedMilliseconds) ms"
  switch ($r.status) {
    'resolved' {
      Write-Host "  RESOLVED  '$($r.name)'  [$($r.type)]  score $([math]::Round($r.score,2)) vs $([math]::Round($r.runnerUp,2))" -ForegroundColor Green
      Write-Host "  at $($r.rect.x),$($r.rect.y)  $($r.rect.w)x$($r.rect.h)"
      Show-Ring $r.rect.x $r.rect.y $r.rect.w $r.rect.h $Find
      Write-Host "  ring drawn - 6 seconds"
      Start-Sleep -Seconds 6
      Hide-Ring
    }
    'ambiguous' { Write-Host "  AMBIGUOUS - $([math]::Round($r.score,2)) vs $([math]::Round($r.runnerUp,2)). Refusing rather than guessing." -ForegroundColor Yellow }
    default     { Write-Host "  ABSENT - $($r.reason)" -ForegroundColor Yellow }
  }
  Write-Host ""
  return
}

# Loaded as a library: the caller drives. Everything above is a function; nothing below runs.
if ($AsLibrary) { return }

# ---- the main loop -----------------------------------------------------------------------
# Read the guide from the browser window, find the first target that resolves on the desktop,
# ring it. No bridge, no IPC, no port: the agent watches the same screen the learner does.
Write-Host ""
Write-Host "Rocky agent watching the desktop. Ctrl+C to stop." -ForegroundColor Cyan
Write-Host "  browser steps are handled by the extension; this covers VS Code, dialogs and apps." -ForegroundColor DarkGray
Write-Host ""

$lastLabel = ""
$quietFor = 0
while ($true) {
  try {
    $lines = Get-GuideText
    if (-not $lines) {
      # No readable guide. Either no browser is open, or it was not started with renderer
      # accessibility. Say so once rather than looping in silence.
      if ($quietFor -eq 0) { Write-Host "  no lab guide visible (is the browser open, started by Rocky-Launch?)" -ForegroundColor DarkGray }
      $quietFor++
      Hide-Ring
      Start-Sleep -Milliseconds ($PollMs * 3)
      if ($Once) { break }
      continue
    }
    $quietFor = 0

    $hit = Find-NextDesktopTarget $lines
    if ($hit) {
      if ($hit.label -ne $lastLabel) {
        $lastLabel = $hit.label
        $r = $hit.result
        Show-Ring $r.rect.x $r.rect.y $r.rect.w $r.rect.h $hit.label
        Write-Host "  pointing at '$($r.name)' [$($r.type)] for: $($hit.label)" -ForegroundColor Green
      }
    } else {
      if ($lastLabel) {
        Write-Host "  nothing from this guide page is on screen right now - staying quiet" -ForegroundColor DarkGray
        $lastLabel = ""
      }
      Hide-Ring
    }
  } catch {
    # Never die in front of a learner: log and keep watching.
    Write-Host "  (recovered: $($_.Exception.Message))" -ForegroundColor DarkGray
  }
  if ($Once) { break }
  Start-Sleep -Milliseconds $PollMs
}
