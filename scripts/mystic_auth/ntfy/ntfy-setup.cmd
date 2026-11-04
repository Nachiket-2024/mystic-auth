@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ntfy-setup.ps1" %*
exit /b %ERRORLEVEL%
