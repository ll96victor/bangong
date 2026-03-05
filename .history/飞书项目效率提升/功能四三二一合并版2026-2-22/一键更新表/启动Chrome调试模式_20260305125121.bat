@echo off
echo ============================================
echo Start Chrome Debug Mode
echo ============================================
echo.
echo Step 1: Closing all Chrome processes...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul

echo Step 2: Starting Chrome with debug mode...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"

timeout /t 3 /nobreak >nul
echo.
echo ============================================
echo Chrome Debug Mode Started!
echo Port: 9222
echo ============================================
echo.
echo Now you can run one_click_update.py
echo.
pause
