@echo off
setlocal

rem Command Prompt wrapper for the PowerShell local-prod-up helper.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-prod-up.ps1" %*
exit /b %ERRORLEVEL%
