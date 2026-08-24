@echo off
rem Launch logAnalystic dev environment.
rem Double-click this file, or run: start-dev.cmd [-SkipInstall]

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1" %*

if errorlevel 1 (
    echo.
    echo Launch failed. See the error messages above.
    pause
)
