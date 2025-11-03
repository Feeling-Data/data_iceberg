#!/usr/bin/env node

/**
 * Cross-platform startup script for the Data Iceberg project
 * This script:
 * 1. Kills any existing processes on required ports
 * 2. Starts the Python body tracking script
 * 3. Starts the Node.js server
 * 4. Opens the browser in fullscreen mode
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWindows = os.platform() === 'win32';
const projectRoot = __dirname;

console.log('🚀 Starting Data Iceberg Project...\n');

// Step 1: Kill existing processes
console.log('1️⃣  Cleaning up existing processes...');
const ports = [8080, 3000, 6448];

if (isWindows) {
  // Windows: Use netstat and taskkill
  ports.forEach(port => {
    exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
      if (stdout) {
        const lines = stdout.trim().split('\n');
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid) {
            console.log(`   Killing process ${pid} on port ${port}`);
            exec(`taskkill /F /PID ${pid}`, () => { });
          }
        });
      }
    });
  });
} else {
  // Unix/macOS: Use lsof and kill
  ports.forEach(port => {
    exec(`lsof -ti:${port}`, (error, stdout) => {
      if (stdout) {
        const pids = stdout.trim().split('\n').filter(Boolean);
        pids.forEach(pid => {
          console.log(`   Killing process ${pid} on port ${port}`);
          exec(`kill -9 ${pid}`, () => { });
        });
      }
    });
  });
}

// Wait a moment for processes to be killed
setTimeout(() => {
  // Step 2: Setup and start Python body tracking script
  console.log('\n2️⃣  Setting up Python environment...');
  const pythonDir = path.join(projectRoot, 'python');

  // Check if virtual environment exists
  const venvPath = isWindows
    ? path.join(pythonDir, '.venv', 'Scripts', 'python.exe')
    : path.join(pythonDir, '.venv', 'bin', 'python');
  const venvExists = fs.existsSync(venvPath);

  if (!venvExists) {
    console.log('   Virtual environment not found. Creating it...');

    // On macOS, ensure Homebrew Python 3.11 is installed, then use it
    if (!isWindows && os.platform() === 'darwin') {
      const homebrewPython311 = '/opt/homebrew/opt/python@3.11/bin/python3.11';

      // Check if Homebrew Python 3.11 exists
      if (!fs.existsSync(homebrewPython311)) {
        console.log('   Homebrew Python 3.11 not found. Installing it...');
        console.log('   Running: brew install python@3.11');

        const brewInstallProcess = spawn('brew', ['install', 'python@3.11'], {
          stdio: 'inherit',
          shell: false
        });

        brewInstallProcess.on('exit', (brewCode) => {
          if (brewCode !== 0) {
            console.error(`   ❌ Failed to install Python 3.11 via Homebrew. Exit code: ${brewCode}`);
            console.error('   Please install it manually:');
            console.error('   brew install python@3.11');
            process.exit(1);
          }

          console.log('   ✅ Python 3.11 installed via Homebrew');

          // Small delay to ensure Python is accessible
          setTimeout(() => {
            if (!fs.existsSync(homebrewPython311)) {
              console.error(`   ❌ Python 3.11 not found at ${homebrewPython311} after installation`);
              process.exit(1);
            }
            createVenvWithPython(homebrewPython311);
          }, 1000);
        });
      } else {
        console.log('   ✅ Homebrew Python 3.11 found');
        createVenvWithPython(homebrewPython311);
      }
    } else {
      // Windows or other platforms
      const systemPython = isWindows ? 'python' : 'python3';
      createVenvWithPython(systemPython);
    }

    function createVenvWithPython(pythonCmd) {
      // Step 1: Create virtual environment
      console.log(`   Creating virtual environment with ${pythonCmd}...`);
      const createVenvProcess = spawn(pythonCmd, ['-m', 'venv', '.venv'], {
        cwd: pythonDir,
        stdio: 'inherit',
        shell: isWindows
      });

      createVenvProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`   ❌ Failed to create virtual environment. Exit code: ${code}`);
          console.error('   Please create it manually:');
          console.error(`   ${pythonCmd} -m venv .venv`);
          process.exit(1);
        }

        console.log('   ✅ Virtual environment created');

        // Small delay to ensure venv is fully created (especially on Windows)
        setTimeout(() => {
          // Verify venv Python exists
          if (!fs.existsSync(venvPath)) {
            console.error(`   ❌ Virtual environment Python not found at ${venvPath}`);
            console.error('   Please try running manually:');
            console.error(`   ${pythonCmd} -m venv .venv`);
            process.exit(1);
          }

          // Step 2: Upgrade pip, setuptools, and wheel
          console.log('   Upgrading pip, setuptools, and wheel...');
          const upgradeProcess = spawn(venvPath, ['-m', 'pip', 'install', '-U', 'pip', 'setuptools', 'wheel'], {
            cwd: pythonDir,
            stdio: 'inherit',
            shell: isWindows
          });

          upgradeProcess.on('exit', (upgradeCode) => {
            if (upgradeCode !== 0) {
              console.error(`   ⚠️  Warning: Failed to upgrade pip/setuptools/wheel. Exit code: ${upgradeCode}`);
              console.error('   Continuing anyway...');
            } else {
              console.log('   ✅ Build tools upgraded');
            }

            // Step 3: Clean pip cache to free up space before installing
            console.log('   Cleaning pip cache to free up space...');
            const cacheCleanProcess = spawn(venvPath, ['-m', 'pip', 'cache', 'purge'], {
              cwd: pythonDir,
              stdio: 'inherit',
              shell: isWindows
            });

            cacheCleanProcess.on('exit', (cacheCode) => {
              // Continue even if cache clean fails (might not exist yet)
              if (cacheCode === 0) {
                console.log('   ✅ Pip cache cleaned');
              }

              // Step 4: Install requirements
              console.log('   Installing Python dependencies...');
              const requirementsPath = path.join(pythonDir, 'requirements.txt');

              if (!fs.existsSync(requirementsPath)) {
                console.error('   ❌ requirements.txt not found!');
                process.exit(1);
              }

              // Use --no-cache-dir to prevent caching during install (saves space)
              const pipProcess = spawn(venvPath, ['-m', 'pip', 'install', '--no-cache-dir', '-r', 'requirements.txt'], {
                cwd: pythonDir,
                stdio: 'inherit',
                shell: isWindows
              });

              pipProcess.on('exit', (pipCode) => {
                if (pipCode !== 0) {
                  console.error(`   ❌ Failed to install dependencies. Exit code: ${pipCode}`);
                  process.exit(1);
                }

                console.log('   ✅ Dependencies installed');
                console.log('\n   Starting Python body tracking script...');
                startPythonScript(pythonDir, venvPath);
              });
            });
          });
        }, isWindows ? 1000 : 500); // Longer delay on Windows
      });
    }
  } else {
    console.log('   ✅ Virtual environment found');

    // Check if dependencies are installed by testing if ultralytics is available
    console.log('   Checking if dependencies are installed...');
    const { execSync } = require('child_process');
    try {
      execSync(`${venvPath} -c "import ultralytics"`, {
        cwd: pythonDir,
        stdio: 'ignore',
        timeout: 5000
      });
      console.log('   ✅ Dependencies are installed');
      console.log('\n   Starting Python body tracking script...');
      startPythonScript(pythonDir, venvPath);
    } catch (error) {
      console.log('   ⚠️  Dependencies not found. Installing...');

      // Clean pip cache first
      console.log('   Cleaning pip cache to free up space...');
      const cacheCleanProcess = spawn(venvPath, ['-m', 'pip', 'cache', 'purge'], {
        cwd: pythonDir,
        stdio: 'inherit',
        shell: isWindows
      });

      cacheCleanProcess.on('exit', (cacheCode) => {
        // Upgrade pip, setuptools, and wheel first
        console.log('   Upgrading pip, setuptools, and wheel...');
        const upgradeProcess = spawn(venvPath, ['-m', 'pip', 'install', '-U', 'pip', 'setuptools', 'wheel'], {
          cwd: pythonDir,
          stdio: 'inherit',
          shell: isWindows
        });

        upgradeProcess.on('exit', (upgradeCode) => {
          if (upgradeCode !== 0) {
            console.error(`   ⚠️  Warning: Failed to upgrade pip/setuptools/wheel. Exit code: ${upgradeCode}`);
            console.error('   Continuing anyway...');
          } else {
            console.log('   ✅ Build tools upgraded');
          }

          // Install requirements
          console.log('   Installing Python dependencies...');
          const requirementsPath = path.join(pythonDir, 'requirements.txt');

          if (!fs.existsSync(requirementsPath)) {
            console.error('   ❌ requirements.txt not found!');
            process.exit(1);
          }

          const pipProcess = spawn(venvPath, ['-m', 'pip', 'install', '--no-cache-dir', '-r', 'requirements.txt'], {
            cwd: pythonDir,
            stdio: 'inherit',
            shell: isWindows
          });

          pipProcess.on('exit', (pipCode) => {
            if (pipCode !== 0) {
              console.error(`   ❌ Failed to install dependencies. Exit code: ${pipCode}`);
              process.exit(1);
            }

            console.log('   ✅ Dependencies installed');
            console.log('\n   Starting Python body tracking script...');
            startPythonScript(pythonDir, venvPath);
          });
        });
      });
    }
  }
}, 1000);

function startPythonScript(pythonDir, venvPython) {
  const pythonProcess = spawn(venvPython, ['bodytrack.py'], {
    cwd: pythonDir,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  console.log(`   Python script started (PID: ${pythonProcess.pid || 'unknown'})\n`);

  // Step 3: Wait a moment for Python to initialize
  setTimeout(() => {
    // Step 4: Start Node.js server
    console.log('3️⃣  Starting Node.js server...');
    process.env.FULLSCREEN = 'true';

    const serverProcess = spawn('node', ['server.js'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, FULLSCREEN: 'true' }
    });

    console.log(`   Server started (PID: ${serverProcess.pid || 'unknown'})\n`);

    // Step 5: Wait for server to be fully ready before opening browser
    console.log('4️⃣  Waiting for server to be ready...\n');

    // Wait a bit for server to initialize
    setTimeout(() => {
      // Check if server is responding
      const http = require('http');
      const checkServer = () => {
        const req = http.get('http://localhost:3000', (res) => {
          if (res.statusCode === 200) {
            console.log('   ✅ Server is ready');
          } else {
            // Retry
            setTimeout(checkServer, 500);
          }
        });
        req.on('error', () => {
          // Server not ready yet, retry
          setTimeout(checkServer, 500);
        });
        req.setTimeout(1000, () => {
          req.destroy();
          setTimeout(checkServer, 500);
        });
      };
      checkServer();
    }, 2000);

    // Cleanup on exit
    const cleanup = () => {
      console.log('\n🛑 Stopping all services...');
      try {
        if (pythonProcess && !pythonProcess.killed) pythonProcess.kill();
        if (serverProcess && !serverProcess.killed) serverProcess.kill();
      } catch (err) {
        // Ignore errors
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    console.log('✅ All services started!\n');
    console.log('📋 Process IDs:');
    console.log(`   Python body tracking: PID ${pythonProcess.pid || 'unknown'}`);
    console.log(`   Node.js server: PID ${serverProcess.pid || 'unknown'}\n`);
    console.log('🌐 Application should be running at: http://localhost:3000\n');
    console.log('Press Ctrl+C to stop all services...\n');

    // Keep process alive
    serverProcess.on('exit', () => {
      cleanup();
    });

    pythonProcess.on('exit', () => {
      console.log('\n⚠️  Python script exited');
    });

  }, 2000);
}

