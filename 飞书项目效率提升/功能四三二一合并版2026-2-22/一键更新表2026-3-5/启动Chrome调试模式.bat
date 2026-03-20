@echo off
echo ============================================
echo Start Chrome Debug Mode
echo ============================================
echo.
echo This will start Chrome in debug mode.
echo User data saved in system temp folder.
echo.
pause

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome_feishu_debug" --no-first-run --no-default-browser-check

echo.
echo ============================================
echo Chrome Started!
echo Port: 9222
echo ============================================
echo.
echo IMPORTANT: First time use - please login to Feishu!
echo After login, run 'run_script.bat'
echo.
pause
