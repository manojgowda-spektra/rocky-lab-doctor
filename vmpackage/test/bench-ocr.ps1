<#
  bench-ocr.ps1 — what does Windows' built-in OCR actually cost?

  Windows.Media.Ocr ships in every Windows 10/11 image and Microsoft publishes NO latency
  figure for it anywhere. It is the obvious OCR fallback for the in-VM agent (no install, no
  model download, no licence question), so its real cost decides whether it belongs at the
  "hundreds of ms" tier or the "seconds" tier of the architecture.

  Also settles the documentation contradiction: the API reference says OcrEngine requires
  package identity, while Microsoft's own PowerToys page calls it from unpackaged PowerShell.
  Running it from an unpackaged process is the test.

  Measures, on a live capture of this screen:
    - full-screen OCR
    - a focused-window-sized region (what the agent would really send)
    - a small region (one dialog)
  and separates decode cost from recognition cost.
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, System.Runtime.WindowsRuntime

# WinRT async -> .NET Task bridge for Windows PowerShell 5.1
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime]

Write-Host ""
Write-Host "=== WINDOWS BUILT-IN OCR: MEASURED ===" -ForegroundColor Cyan
Write-Host ""

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { Write-Host "  no OCR engine for the profile language (install Language.OCR capability)" -ForegroundColor Yellow; exit 1 }
Write-Host ("  engine language: {0}   max image dimension: {1} px   unpackaged process: yes" -f $engine.RecognizerLanguage.LanguageTag, [Windows.Media.Ocr.OcrEngine]::MaxImageDimension)
Write-Host ""

function Capture([int]$x, [int]$y, [int]$w, [int]$h) {
  $bmp = New-Object Drawing.Bitmap($w, $h)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object Drawing.Size($w, $h)))
  $g.Dispose()
  $ms = New-Object IO.MemoryStream
  $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $ms.ToArray()
}

function ToSoftwareBitmap([byte[]]$png) {
  $ras = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $writer = New-Object Windows.Storage.Streams.DataWriter($ras)
  $writer.WriteBytes($png)
  $null = Await ($writer.StoreAsync()) ([uint32])
  $null = Await ($writer.FlushAsync()) ([bool])
  $null = $writer.DetachStream()   # returns the stream; unassigned it leaks into the function output
  $ras.Seek(0)
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
  Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
}

function Run($label, [int]$x, [int]$y, [int]$w, [int]$h, [int]$n) {
  $dec = @(); $rec = @(); $words = 0; $lines = 0
  for ($i = 0; $i -lt $n; $i++) {
    $png = Capture $x $y $w $h
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $sb = ToSoftwareBitmap $png
    $sw.Stop(); $dec += $sw.Elapsed.TotalMilliseconds
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Await ($engine.RecognizeAsync($sb)) ([Windows.Media.Ocr.OcrResult])
    $sw.Stop(); $rec += $sw.Elapsed.TotalMilliseconds
    # WinRT lists trip PowerShell member enumeration; force arrays before counting
    $lines = [int]@($r.Lines).Count
    $words = [int]0; foreach ($l in @($r.Lines)) { $words = $words + [int]@($l.Words).Count }
    $sb.Dispose()
  }
  $dec = $dec | Sort-Object; $rec = $rec | Sort-Object
  "  {0,-30} {1,5}x{2,-5}  decode {3,6:N0} ms   recognise {4,6:N0} ms   -> {5,3} lines / {6,4} words" -f `
    $label, $w, $h, $dec[[int]($dec.Count/2)], $rec[[int]($rec.Count/2)], $lines, $words
}

$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Run "full screen"            $b.X $b.Y $b.Width $b.Height 5
Run "focused-window region"  100 100 1200 800 5
Run "one dialog"             300 300 600 400 8
Write-Host ""
Write-Host "  (recognise = the OCR itself; decode = PNG -> SoftwareBitmap, avoidable with a direct pixel copy)" -ForegroundColor DarkGray
Write-Host ""
