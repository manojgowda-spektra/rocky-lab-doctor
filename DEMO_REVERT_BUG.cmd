@echo off
REM Safety net for the live plant-a-bug example (see docs\demo_speaking_script.md).
REM Restores the planted file to its committed state. Run this if you lose track mid-demo,
REM then click "Rescan live" once on the Doctor page - the count must read 133 again.
cd /d "C:\Users\ManojGowda\OneDrive - Spektra Systems LLC\Desktop\Labs\CAF-Infra-Security"
git checkout -- 00-lab-intro.md
git status --porcelain
echo.
echo [revert] 00-lab-intro.md restored to committed state (empty status above = clean).
echo [revert] Now click "Rescan live" on the Doctor page - expect 133.
pause
