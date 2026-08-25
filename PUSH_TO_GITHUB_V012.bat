@echo off
setlocal
cd /d "%~dp0"

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This folder is not a Git repository.
  echo Put these files into your cloned moon-web repository and run this BAT there.
  pause
  exit /b 1
)

git add -A
git commit -m "Moon v0.12.0 voice roles admin profiles" || echo Nothing new to commit.
git push origin main
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo.
echo MoonLobby v0.12.0 pushed to GitHub.
pause
