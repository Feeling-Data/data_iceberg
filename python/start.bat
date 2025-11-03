@echo off
REM Script to start the body tracking Python script on Windows
REM Activates virtual environment if it exists, otherwise uses system Python

cd /d "%~dp0"

REM Check if .venv exists and activate it
if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
) else (
    echo No virtual environment found, using system Python...
)

REM Determine Python command
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
) else (
    echo Error: Python not found. Please install Python 3.
    exit /b 1
)

echo Starting body tracking script with %PYTHON_CMD%...
%PYTHON_CMD% bodytrack.py

