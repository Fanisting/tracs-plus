// Dev hot reload: watches the extension files and tells the unpacked extension to reload itself.
// Zero dependencies. Usage: node dev/watch.js   (port 35729, override with PORT=...)
// Pairs with src/dev-reload.js, which only runs for unpacked installs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 35729);
const ROOT = path.resolve(__dirname, '..');
const WATCH = ['manifest.json', 'src', 'guide', 'icons'];
const clients = new Set();

function frame(text) {
  const payload = Buffer.from(text);
  if (payload.length > 125) throw new Error('message too long');
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function broadcast(text) {
  for (const socket of clients) socket.write(frame(text));
}

const server = http.createServer((_req, res) => res.end(`tracs-plus dev reload: ${clients.size} client(s)\n`));
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1')
    .update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(socket);
  console.log(`[watch] extension connected (${clients.size})`);
  socket.on('data', (buf) => { if ((buf[0] & 0x0f) === 0x8) socket.end(); }); // close frame
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
});

// Server-to-client messages every 20 s keep the MV3 service worker alive (Chrome 116+).
setInterval(() => broadcast('ping'), 20000);

let timer;
for (const entry of WATCH) {
  fs.watch(path.join(ROOT, entry), { recursive: true }, (_event, file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[watch] ${entry}${file && entry !== 'manifest.json' ? '/' + file : ''} changed, reloading ${clients.size} client(s)`);
      broadcast('reload');
    }, 150);
  });
}

server.listen(PORT, '127.0.0.1', () => console.log(`[watch] listening on ws://127.0.0.1:${PORT}, watching ${WATCH.join(', ')}`));
