@echo off
REM Safety net for the live plant-a-bug example (see docs\DEMO_MASTER_SCRIPT.md, Act 3).
REM Restores the planted file to its committed state. Run this if you lose track mid-demo,
REM then click "Rescan live" once on the Fleet page - the count must return to its baseline.
if "%REAL_LABS_DIR%"=="" set "REAL_LABS_DIR=C:\Users\ManojGowda\OneDrive - Spektra Systems LLC\Desktop\Labs"
cd /d "%REAL_LABS_DIR%\CAF-Infra-Security"
git checkout -- 00-lab-intro.md
git status --porcelain
echo.
echo [revert] 00-lab-intro.md restored to committed state (empty status above = clean).
echo [revert] Now click "Rescan live" on the Fleet page (Act 3) - the count returns to baseline.
pause
