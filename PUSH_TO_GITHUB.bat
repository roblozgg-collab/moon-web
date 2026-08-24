@echo off
setlocal
cd /d "%~dp0"

git --version >nul 2>&1
if errorlevel 1 (
  echo Git is not installed or not in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 git init

git branch -M main

git remote get-url origin >nul 2>&1
if errorlevel 1 git remote add origin https://github.com/roblozgg-collab/moon-web.git

git add -A
git commit -m "Moon v0.11.3 cloud auth fix"
git push -u origin main

pause
