@echo off
setlocal

rem The folder path reaches PowerShell through an environment variable (it may contain non-ASCII characters).
set "VOCAB_ROOT=%~dp0"
rem Get-Item expands a short (8.3) path, so the match works however the script was invoked.
set "ROOT=$r = (Get-Item -LiteralPath $env:VOCAB_ROOT).FullName;"
rem Only this folder's processes: VocabApp.Api.exe built here and the vocab-client ng serve.
set "API_FILTER=$_.Name -eq 'VocabApp.Api.exe' -and $_.ExecutablePath -like ($r + '*')"
set "CLIENT_FILTER=$_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $r + 'vocab-client*ng.js*serve*')"

if /i "%~1"=="stop" goto stop
if /i "%~1"=="restart" goto restart
if /i "%~1"=="status" goto status
if not "%~1"=="" if /i not "%~1"=="start" goto help

echo Starting VocabApp backend and frontend...
cd /d "%~dp0VocabApp.Api"
start "VocabApp API (HTTP :5152)" cmd /k "dotnet run --launch-profile http"
cd /d "%~dp0vocab-client"
start "VocabApp Angular (HTTP :4200)" cmd /k "npm start"
echo Backend:  http://localhost:5152
echo Frontend: http://localhost:4200
echo.
echo To stop both services, run: start-dev.bat stop
goto end

:stop
echo Stopping VocabApp backend and frontend...
rem Stops them even if they were not started by this script.
powershell -NoProfile -ExecutionPolicy Bypass -Command "%ROOT% Get-CimInstance Win32_Process | Where-Object { (%API_FILTER%) -or (%CLIENT_FILTER%) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
rem Close the windows opened by start.
taskkill /fi "WINDOWTITLE eq VocabApp API (HTTP :5152)" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq VocabApp Angular (HTTP :4200)" /t /f >nul 2>&1
echo Done.
goto end

:restart
call "%~f0" stop
call "%~f0" start
goto end

:status
powershell -NoProfile -ExecutionPolicy Bypass -Command "%ROOT% if (Get-CimInstance Win32_Process | Where-Object { %API_FILTER% }) { 'Backend: running' } else { 'Backend: stopped' }"
powershell -NoProfile -ExecutionPolicy Bypass -Command "%ROOT% if (Get-CimInstance Win32_Process | Where-Object { %CLIENT_FILTER% }) { 'Frontend: running' } else { 'Frontend: stopped' }"
goto end

:help
echo Usage: %~nx0 [start^|stop^|restart^|status]
goto end

:end
endlocal
