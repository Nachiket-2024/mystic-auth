@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-backup-encryption.ps1" %*
exit /b %ERRORLEVEL%
