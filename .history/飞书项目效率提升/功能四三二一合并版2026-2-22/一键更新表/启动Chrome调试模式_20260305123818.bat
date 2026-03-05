@echo off
echo ============================================
echo Start Chrome Debug Mode
echo ============================================
echo.
echo This will start Chrome with debug mode enabled.
echo Please close Chrome first if it is running.
echo.
pause

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"

echo.
echo ============================================
echo Chrome Debug Mode Started!
echo Port: 9222
echo ============================================
echo.
echo Now you can run one_click_update.py
echo.
pause
