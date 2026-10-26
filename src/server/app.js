import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createRoomManager } from './rooms.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
// This allowlist keeps server code, repository files, and secrets off HTTP.
const publicFiles = new Set([
  '/index.html', '/styles.css', '/favicon.svg', '/src/main.js', '/src/game.js',
  '/src/renderer.js', '/src/network.js',
  '/src/avatars.js', '/src/hazards.js', '/src/graphics/avatars.js', '/src/graphics/tunnel.js',
]);
// These are the only dependency files exposed to the browser. The module imports
// ./three.core.js, so both public URLs live beside one another.
const vendorFiles = new Map([
  ['/vendor/three.module.js', 'node_modules/three/build/three.module.js'],
  ['/vendor/three.core.js', 'node_modules/three/build/three.core.js'],
]);

async function serveFile(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  let pathname;
  try { pathname = new URL(request.url, 'http://localhost').pathname; } catch {
    response.writeHead(400);
    response.end('Invalid request');
    return;
  }
  if (pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : 'ok');
    return;
  }
  const file = pathname === '/' ? '/index.html' : pathname;
  if (!publicFiles.has(file) && !vendorFiles.has(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(resolve(root, vendorFiles.get(file) || '.' + file));
    response.writeHead(200, {
      'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Could not load the game file. Check the terminal.');
  }
}

export function createGameServer({
  now = Date.now, roomOptions = {}, maxConnections = 128, heartbeatMs = 30000,
} = {}) {
  const rooms = createRoomManager({ ...roomOptions, now });
  const server = createServer(serveFile);
  const sockets = new Map();
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  let closing = false;
  let closePromise;

  function send(socket, message) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message), (error) => { if (error) socket.terminate(); });
  }

  function broadcast() {
    for (const [id, socket] of sockets) {
      const snapshot = rooms.snapshot(id);
      if (snapshot) send(socket, snapshot);
    }
  }

  function rejectUpgrade(socket, status, message) {
    socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => socket.destroy());
    let path;
    try { path = new URL(request.url, 'http://localhost').pathname; } catch {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    if (path !== '/race') {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (request.headers.origin) {
      let origin;
      try { origin = new URL(request.headers.origin); } catch { /* Rejected below. */ }
      if (!origin || !['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.host) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }
    }
    if (closing || sockets.size >= maxConnections) {
      rejectUpgrade(socket, 503, 'Service Unavailable');
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket);
    });
  });

  websocketServer.on('connection', (socket) => {
    // Identity belongs to this socket; messages cannot choose another player.
    const id = randomUUID();
    let alive = true;
    let messageTimes = [];
    rooms.connect(id);
    sockets.set(id, socket);
    socket.on('pong', () => { alive = true; });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      sockets.delete(id);
      rooms.disconnect(id);
      if (!closing) broadcast();
    });
    socket.checkHeartbeat = () => {
      if (!alive) { socket.terminate(); return; }
      alive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    };
    socket.on('message', (raw, binary) => {
      const time = now();
      messageTimes = messageTimes.filter((timestamp) => time - timestamp < 1000);
      if (messageTimes.length >= 60) {
        socket.close(1008, 'Too many messages');
        return;
      }
      messageTimes.push(time);
      if (binary) {
        send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Send text JSON messages.' });
        return;
      }
      let message;
      try { message = JSON.parse(raw.toString()); } catch {
        send(socket, { type: 'error', code: 'INVALID_JSON', message: 'That message was not valid JSON.' });
        return;
      }
      const result = rooms.handle(id, message);
      if (!result.ok) {
        send(socket, { type: 'error', code: result.code, message: result.message });
      } else if (message.type === 'leave') {
        send(socket, { type: 'left' });
        broadcast();
      } else if (message.type !== 'input') {
        // Lobby changes appear immediately; movement uses the regular 20Hz feed.
        broadcast();
      }
    });
    send(socket, { type: 'connected', version: 1 });
  });

  const simulationTimer = setInterval(() => {
    for (const notice of rooms.tick(now())) {
      const socket = sockets.get(notice.id);
      if (socket) {
        send(socket, { type: 'error', code: 'ROOM_EXPIRED', message: 'The idle room expired. Create or join a new room.' });
        send(socket, notice.message);
      }
    }
  }, 1000 / 60);
  const snapshotTimer = setInterval(broadcast, 50);
  const heartbeatTimer = setInterval(() => {
    for (const socket of sockets.values()) socket.checkHeartbeat();
  }, heartbeatMs);

  function close() {
    if (closePromise) return closePromise;
    closing = true;
    clearInterval(simulationTimer);
    clearInterval(snapshotTimer);
    clearInterval(heartbeatTimer);
    for (const socket of sockets.values()) socket.terminate();
    closePromise = Promise.all([
      new Promise((resolve) => websocketServer.close(resolve)),
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
    ]).then(() => undefined);
    return closePromise;
  }

  return { server, close, rooms };
}
