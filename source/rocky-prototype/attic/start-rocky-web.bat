@echo off
REM One-click launcher for Rocky Web (Windows). Double-click to start the server and open the browser.
chcp 65001 >nul
cd /d "%~dp0"
echo Starting Rocky Web ...  (a browser tab will open at http://localhost:5173)
echo Close this window or press Ctrl+C to stop Rocky.
echo.
start "" http://localhost:5173
node web\server.js
echo.
echo Rocky Web stopped.
pause
