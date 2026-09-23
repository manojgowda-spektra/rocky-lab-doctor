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
  [switch]$Once
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

# ---- watch the bridge --------------------------------------------------------------------------
# The extension writes the current step here; the agent glows it when the surface is the
# desktop. A plain file, because a socket or a native-messaging host would need registering
# and reviewing for no benefit.
Write-Host "Rocky agent watching $Bridge (Ctrl+C to stop)" -ForegroundColor Cyan
$lastSeen = ""
while ($true) {
  try {
    if (Test-Path $Bridge) {
      $raw = [IO.File]::ReadAllText($Bridge, [Text.Encoding]::UTF8)
      if ($raw -ne $lastSeen) {
        $lastSeen = $raw
        $step = $raw | ConvertFrom-Json
        if ($step.surface -and $step.surface -ne 'browser' -and $step.label) {
          $r = Resolve-Control $step.label $step.app
          if ($r.status -eq 'resolved') {
            Show-Ring $r.rect.x $r.rect.y $r.rect.w $r.rect.h $step.label
            Write-Host "  glowing '$($r.name)' for step: $($step.label)"
          } else {
            Hide-Ring
            Write-Host "  cannot find '$($step.label)' on the desktop ($($r.status)) - saying so rather than guessing"
          }
        } else { Hide-Ring }
      }
    }
  } catch { }
  if ($Once) { break }
  Start-Sleep -Milliseconds $PollMs
}
