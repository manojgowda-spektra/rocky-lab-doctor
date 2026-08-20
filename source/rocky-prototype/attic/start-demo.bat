@echo off
REM ============================================================
REM  DEMO-DAY LAUNCHER — starts the server, runs the preflight
REM  readiness check (warms the LLM cache), then opens the demo.
REM  Keep the "Rocky Server" window open for the whole demo —
REM  the warmed cache lives inside that process.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
echo [1/3] Starting Rocky server in its own window...
start "Rocky Server - KEEP OPEN" cmd /k node web\server.js
timeout /t 4 /nobreak >nul
echo [2/3] Running preflight checks + warming the cache (takes ~30-60s, live LLM calls)...
node preflight.js
if errorlevel 1 (
  echo.
  echo *** PREFLIGHT FAILED - fix the failures above before demoing. ***
  pause
  exit /b 1
)
echo [3/3] Opening the demo (Lab Doctor first, Rocky in a second tab)...
start "" http://localhost:5173/labdoctor.html
start "" http://localhost:5173/?demo=1
echo.
echo Ready. Demo tabs are open; the server window stays running with a warm cache.
pause
