#!/bin/bash

# Kill any processes using ports 8080, 3000, or 6448

echo "Checking for processes on ports 8080, 3000, and 6448..."

for port in 8080 3000 6448; do
    pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "Killing process $pid on port $port"
        kill -9 $pid 2>/dev/null
    else
        echo "Port $port is free"
    fi
done

echo "Done!"



