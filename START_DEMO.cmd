@echo off
REM ============================================================
REM  Rocky - Demo launcher (demo day: double-click this)
REM  1) starts the server if it isn't running
REM  2) runs the readiness check (must be ALL GREEN)
REM  3) opens ONE window: the demo home (the act map)
REM  Script: docs\DEMO_MASTER_SCRIPT.md   Rescue: CHECK_READY.cmd / DEMO_REVERT_BUG.cmd
REM ============================================================
setlocal
cd /d "%~dp0source\rocky-prototype"

REM -- 1) server up?
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing http://localhost:5173/ -TimeoutSec 2)|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
  echo [demo] starting Rocky server on :5173 ...
  start "rocky-server" /min cmd /c "node web\server.js"
  timeout /t 3 /nobreak >nul
) else (
  echo [demo] server already running on :5173
)

REM -- 2) readiness check
node "%~dp0check-ready.js"
echo.

REM -- 3) open the demo home (the act map). Press F11 once it opens; share the ENTIRE screen.
start "" msedge --new-window "http://localhost:5173/"

echo [demo] One window opened: the act map. "Start the demo" walks Acts 1-6 in order.
echo [demo] Optional: print the Q+A sheet from /qa.html and keep it next to the keyboard.
echo [demo] Video track (recording only): /rail.html + /presenter.html
pause
