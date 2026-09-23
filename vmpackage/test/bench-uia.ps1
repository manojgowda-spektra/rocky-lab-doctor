<#
  bench4.ps1 — the decisive measurement: UIA events vs polling, and cross-process cost.

  bench3 showed File Explorer at 1,887 ms for SIXTY-FOUR elements, while Chrome managed 470
  elements in 1,016 ms. Per element, the "native, simple" app was far worse. That kills the
  tree-size theory and points at the real cost: every UIA property read is a cross-process COM
  call, and the price is paid per CALL, not per element.

  Two things decide the architecture, and neither was measurable from PowerShell alone:

    1. EVENT LATENCY. A companion that polls is paying that cost forever. A companion that
       subscribes pays nothing while the learner reads the guide. PowerShell has no message
       pump for UIA callbacks, so this needs real compiled code with an STA thread.

    2. FOCUS-SCOPED READS. Nobody needs the whole tree. They need the focused element and its
       siblings. If that is a few milliseconds, the in-VM agent should be event-driven and
       focus-scoped, never a scanner.
#>
$ErrorActionPreference = 'Stop'

$cs = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Windows.Automation;

public static class Bench {
  public static List<double> EventLatencies = new List<double>();
  static long mark = 0;
  static AutomationFocusChangedEventHandler h;

  public static void Subscribe() {
    h = new AutomationFocusChangedEventHandler(delegate(object s, AutomationFocusChangedEventArgs e) {
      long m = Interlocked.Read(ref mark);
      if (m != 0) {
        double ms = (Stopwatch.GetTimestamp() - m) * 1000.0 / Stopwatch.Frequency;
        lock (EventLatencies) { EventLatencies.Add(ms); }
      }
    });
    Automation.AddAutomationFocusChangedEventHandler(h);
  }
  public static void Mark() { Interlocked.Exchange(ref mark, Stopwatch.GetTimestamp()); }
  public static void Unsubscribe() { try { Automation.RemoveAllEventHandlers(); } catch {} }

  // What an event-driven agent actually does when something changes: look at the focused
  // element and the controls around it. NOT a tree scan.
  public static double FocusedElementCost(int n) {
    var times = new List<double>();
    for (int i = 0; i < n; i++) {
      var sw = Stopwatch.StartNew();
      try {
        var el = AutomationElement.FocusedElement;
        if (el != null) { var x = el.Current.Name; var y = el.Current.ControlType; var r = el.Current.BoundingRectangle; }
      } catch {}
      sw.Stop(); times.Add(sw.Elapsed.TotalMilliseconds);
    }
    times.Sort(); return times[times.Count / 2];
  }

  // The sibling sweep: the focused element's parent's children. This is the realistic
  // "what can I click near here" query.
  public static double SiblingSweep(int n, out int count) {
    count = 0;
    var times = new List<double>();
    for (int i = 0; i < n; i++) {
      var sw = Stopwatch.StartNew();
      try {
        var el = AutomationElement.FocusedElement;
        var parent = TreeWalker.ControlViewWalker.GetParent(el);
        if (parent != null) {
          var kids = parent.FindAll(TreeScope.Children, Condition.TrueCondition);
          count = kids.Count;
          foreach (AutomationElement k in kids) { try { var x = k.Current.Name; } catch {} }
        }
      } catch {}
      sw.Stop(); times.Add(sw.Elapsed.TotalMilliseconds);
    }
    times.Sort(); return times[times.Count / 2];
  }

  // Prove the cross-process theory: cost of ONE property read, repeated.
  public static double SinglePropertyRead(int n) {
    var el = AutomationElement.FocusedElement;
    var times = new List<double>();
    for (int i = 0; i < n; i++) {
      var sw = Stopwatch.StartNew();
      try { var x = el.Current.Name; } catch {}
      sw.Stop(); times.Add(sw.Elapsed.TotalMilliseconds);
    }
    times.Sort(); return times[times.Count / 2];
  }
}
'@

Add-Type -TypeDefinition $cs -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase -ErrorAction Stop

Write-Host ""
Write-Host "=== THE NUMBERS THAT DECIDE THE ARCHITECTURE ===" -ForegroundColor Cyan
Write-Host ""

$one = [Bench]::SinglePropertyRead(200)
"  single UIA property read (cross-process COM)     {0,7:N2} ms" -f $one
"     -> 470 elements x 3 props would cost ~{0:N0} ms at this rate" -f ($one * 470 * 3)
Write-Host ""

$foc = [Bench]::FocusedElementCost(100)
"  focused element + 3 properties                   {0,7:N2} ms" -f $foc

$cnt = 0
$sib = [Bench]::SiblingSweep(30, [ref]$cnt)
"  focused element's siblings ({0,3} controls)        {1,7:N2} ms" -f $cnt, $sib
Write-Host ""

# --- event latency, with a real STA pump ---------------------------------------------------
Write-Host "  measuring focus-change event latency..." -ForegroundColor DarkGray
[Bench]::Subscribe()
Start-Sleep -Milliseconds 400

$shell = New-Object -ComObject WScript.Shell
$procs = @(Get-Process | Where-Object { $_.MainWindowTitle -and $_.ProcessName -ne 'powershell' } | Select-Object -First 3)
if ($procs.Count -ge 2) {
  for ($i = 0; $i -lt 8; $i++) {
    [Bench]::Mark()
    $null = $shell.AppActivate($procs[$i % $procs.Count].Id)
    Start-Sleep -Milliseconds 350
  }
}
[Bench]::Unsubscribe()

$lat = @([Bench]::EventLatencies)
if ($lat.Count) {
  $s = $lat | Sort-Object
  "  focus-change EVENT delivery                      {0,7:N1} ms  (median of {1})" -f $s[[int]($s.Count/2)], $s.Count
  Write-Host "     -> 0 ms/frame while nothing happens" -ForegroundColor DarkGray
} else {
  Write-Host "  no events captured" -ForegroundColor Yellow
}
Write-Host ""
