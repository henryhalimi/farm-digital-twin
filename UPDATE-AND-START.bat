@echo off
title Farm Digital Twin
cd /d "%~dp0"
echo Pulling latest code from GitHub...
git pull
echo Installing any new dependencies...
npm install
echo.
echo When ready open your browser to:
echo http://localhost:5173/farmnew-1a/
echo.
npm run dev
pause
