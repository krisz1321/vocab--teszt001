@echo off
setlocal
cd /d "%~dp0VocabApp.Api"
start "VocabApp API (HTTP :5152)" cmd /k "dotnet run --launch-profile http"
cd /d "%~dp0vocab-client"
start "VocabApp Angular (HTTP :4200)" cmd /k "npm start"
endlocal
