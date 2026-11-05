@echo off
setlocal
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
where py >nul 2>nul
if not errorlevel 1 (set "PYTHON=py -3") else (
  where python >nul 2>nul
  if errorlevel 1 (echo Python 3 was not found. Install Python 3 from https://www.python.org/downloads/ and select Add Python to PATH.& pause& exit /b 1)
  set "PYTHON=python"
)
if not exist ".venv\Scripts\python.exe" (
  echo First launch setup: creating virtual environment...
  %PYTHON% -m venv ".venv"
  if errorlevel 1 (echo Failed to create .venv.& pause& exit /b 1)
)
set "VENV_PY=.venv\Scripts\python.exe"
set "SETUP_HASH="
for /f %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 requirements.txt).Hash" 2^>nul') do set "SETUP_HASH=%%H"
set "OLD_HASH="
if exist ".setup_hash" set /p OLD_HASH=<".setup_hash"
if not exist ".venv\Scripts\streamlit.exe" set "OLD_HASH="
if not "%SETUP_HASH%"=="%OLD_HASH%" (
  echo Installing or updating CodeMind AI dependencies...
  "%VENV_PY%" -m pip install -r "requirements.txt"
  if errorlevel 1 (echo Dependency installation failed. Check your network connection.& pause& exit /b 1)
  >".setup_hash" echo %SETUP_HASH%
)
netstat -ano | findstr /R /C:":8501 .*LISTENING" >nul
if not errorlevel 1 (
  echo CodeMind AI appears to be running already. Opening the existing application.
  start "" "http://localhost:8501"
  exit /b 0
)
echo Starting CodeMind AI at http://localhost:8501
start "" "http://localhost:8501"
".venv\Scripts\python.exe" -m streamlit run "app.py" --server.address localhost --server.port 8501 --server.headless true --browser.gatherUsageStats false
if errorlevel 1 (echo CodeMind AI stopped with an error. Review the message above.& pause& exit /b 1)
endlocal
