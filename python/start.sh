#!/bin/bash

# Script to start the body tracking Python script
# Activates virtual environment if it exists, otherwise uses system Python

cd "$(dirname "$0")"

# Check if .venv exists and use it
if [ -d ".venv" ]; then
    echo "Using virtual environment..."
    PYTHON_CMD=".venv/bin/python"
    if [ ! -f "$PYTHON_CMD" ]; then
        echo "Error: Virtual environment Python not found at $PYTHON_CMD"
        exit 1
    fi
else
    echo "No virtual environment found, using system Python..."
    # Determine Python command
    if command -v python3 &> /dev/null; then
        PYTHON_CMD=python3
    elif command -v python &> /dev/null; then
        PYTHON_CMD=python
    else
        echo "Error: Python not found. Please install Python 3."
        exit 1
    fi
fi

echo "Starting body tracking script with $PYTHON_CMD..."
$PYTHON_CMD bodytrack.py

