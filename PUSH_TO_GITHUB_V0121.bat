@echo off
setlocal
cd /d "%~dp0"

git --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a Git repository.
  echo Put these files into your cloned moon-web repository and run this BAT there.
  pause
  exit /b 1
)

git add -A
git commit -m "Moon v0.12.1 calls routes moderation profile fixes" || echo Nothing new to commit.
git push origin main
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo.
echo Moon v0.12.1 pushed to GitHub.
echo IMPORTANT: run supabase\MIGRATE_V0.12.1.sql once in Supabase SQL Editor if you have not done it yet.
pause
