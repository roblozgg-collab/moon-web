@echo off
setlocal
cd /d "%~dp0"
if not exist ".github\workflows" mkdir ".github\workflows"
if exist "deploy-pages.yml" (
  copy /Y "deploy-pages.yml" ".github\workflows\deploy-pages.yml" >nul
  echo [OK] Created .github\workflows\deploy-pages.yml
) else (
  echo [ERROR] deploy-pages.yml not found next to this BAT file.
)
pause
