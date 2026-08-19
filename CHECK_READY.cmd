@echo off
REM ============================================================
REM  Rocky - demo readiness check (run any time; morning-of especially)
REM  Verifies every moving part of the demo in ~15 seconds.
REM ============================================================
cd /d "%~dp0source\rocky-prototype"
node "%~dp0check-ready.js"
echo.
pause
