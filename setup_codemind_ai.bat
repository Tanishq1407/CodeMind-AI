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
  echo Creating CodeMind AI virtual environment...
  %PYTHON% -m venv ".venv"
  if errorlevel 1 (echo Failed to create .venv.& pause& exit /b 1)
)
echo Installing required packages...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (echo Could not upgrade pip. Check your internet connection.& pause& exit /b 1)
".venv\Scripts\python.exe" -m pip install -r "requirements.txt"
if errorlevel 1 (echo Dependency installation failed. Check your internet connection and requirements.txt.& pause& exit /b 1)
echo Setup complete. You can now double-click run_codemind_ai.bat.
pause
exit /b 0
