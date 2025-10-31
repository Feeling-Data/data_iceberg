const osc = require('osc');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const open = require('open');

// Create WebSocket server first (so OSC handler can use it)
const WS_PORT = 8080;
const wss = new WebSocket.Server({ port: WS_PORT });

// Create UDP server for OSC
const OSC_PORT = 6448;
const udpPort = new osc.UDPPort({
  localAddress: '0.0.0.0',
  localPort: OSC_PORT,
  metadata: true
});

udpPort.on('message', (oscMsg, timeTag, info) => {
  try {
    // Convert OSC message to JSON format
    const jsonMessage = {
      address: oscMsg.address,
      args: oscMsg.args.map(arg => arg.value !== undefined ? arg.value : arg),
      timestamp: Date.now()
    };

    // Broadcast to all connected WebSocket clients
    const jsonString = JSON.stringify(jsonMessage);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(jsonString);
      }
    });

    console.log(`OSC: ${oscMsg.address} -> [${jsonMessage.args.join(', ')}]`);
  } catch (error) {
    console.error('Error processing OSC message:', error);
  }
});

udpPort.on('error', (err) => {
  console.error('UDP server error:', err);
});

// Start OSC server
udpPort.open();
console.log(`OSC server listening on UDP port ${OSC_PORT}`);

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log(`WebSocket server listening on port ${WS_PORT}`);
console.log(`Bridge ready: OSC (UDP ${OSC_PORT}) <-> WebSocket (${WS_PORT})`);

// Create HTTP server to serve static files
const HTTP_PORT = 3000;
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const httpServer = http.createServer((req, res) => {
  // Remove query string and normalize path
  let filePath = '.' + req.url.split('?')[0];

  // Default to index.html if root
  if (filePath === './') {
    filePath = './index.html';
  }

  // Security: prevent directory traversal
  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');

  const extname = String(path.extname(safePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(safePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on http://localhost:${HTTP_PORT}`);
  console.log(`\n📱 Open your browser to: http://localhost:${HTTP_PORT}`);

  // Automatically open browser
  const url = `http://localhost:${HTTP_PORT}`;
  open(url).catch(err => {
    console.log(`\n⚠️  Could not automatically open browser. Please navigate to: ${url}`);
  });
});

