@echo off
REM ============================================================
REM  Rocky - Guided Demo launcher (demo day: double-click this)
REM  1) starts the server if it isn't running
REM  2) runs the readiness check
REM  3) opens the guided demo + Wingman + the sample-guides folder
REM ============================================================
setlocal
cd /d "%~dp0source\rocky-prototype"

REM -- 1) server up?
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing http://localhost:5173/demo.html -TimeoutSec 2)|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
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

REM -- 3) open: the guided demo (share this window), Wingman (hide behind), sample guides
start "" msedge --new-window "http://localhost:5173/demo.html"
timeout /t 2 /nobreak >nul
start "" msedge --new-window "http://localhost:5173/wingman.html"
start "" explorer "%~dp0Demo-Uploads"

echo [demo] Open on screen:
echo        - demo.html      -^> the window you SHARE (F11). One flow: Select - Diagnose - Fix - Verify
echo        - wingman.html   -^> click "Start listening", then hide BEHIND the demo (answers on phone)
echo        - Demo-Uploads   -^> extra guides to drag in if the audience wants "one more"
echo.
echo [demo] Script: docs\DEMO_MASTER_SCRIPT.md   Rescue: CHECK_READY.cmd / DEMO_REVERT_BUG.cmd
echo [demo] (Hands-free video mode still exists at /rail.html + presenter.html)
pause
