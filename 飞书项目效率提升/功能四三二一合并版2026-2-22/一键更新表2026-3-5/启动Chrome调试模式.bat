@echo off
echo ============================================
echo Start Chrome for Automation
echo ============================================
echo.
echo This will start a NEW Chrome instance for automation.
echo Your current Chrome will NOT be affected.
echo.
pause

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%~dp0chrome_automation"

echo.
echo ============================================
echo Chrome Started!
echo Port: 9222
echo ============================================
echo.
echo IMPORTANT: First time use - please login to Feishu in the new Chrome window!
echo After login, you can run one_click_update.py
echo.
pause
