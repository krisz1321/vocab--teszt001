@echo off
setlocal

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
taskkill /fi "WINDOWTITLE eq VocabApp API (HTTP :5152)" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq VocabApp Angular (HTTP :4200)" /t /f >nul 2>&1
echo Done.
goto end

:restart
call "%~f0" stop
call "%~f0" start
goto end

:status
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"VocabApp API (HTTP :5152)" >nul
if errorlevel 1 (echo Backend: stopped) else (echo Backend: running)
tasklist /v /fi "imagename eq cmd.exe" | findstr /i /c:"VocabApp Angular (HTTP :4200)" >nul
if errorlevel 1 (echo Frontend: stopped) else (echo Frontend: running)
goto end

:help
echo Usage: %~nx0 [start^|stop^|restart^|status]
goto end

:end
endlocal
