@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Moon Web - GitHub Pages build
where node >nul 2>nul || (echo Node.js not found. Install Node.js 22+ & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies...
  call npm install || (echo npm install failed & pause & exit /b 1)
)
echo Starting Moon locally at http://localhost:3000
start "" http://localhost:3000
call npm run dev
pause
