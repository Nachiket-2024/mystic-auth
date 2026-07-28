@echo off
setlocal

rem Command Prompt wrapper for the PowerShell dev-up helper.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-up.ps1"
exit /b %ERRORLEVEL%
