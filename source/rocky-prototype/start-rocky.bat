@echo off
REM One-click launcher for Rocky (Windows). Double-click this file, or run it from a terminal.
chcp 65001 >nul
cd /d "%~dp0"
echo Starting Rocky...  (type /help for commands, /quit to exit)
echo.
node chat.js
echo.
echo Rocky has exited.
pause
