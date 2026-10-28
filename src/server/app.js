import {ASSET_VERSIONS} from '../asset-versions.js';
import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {MUSIC_TRACKS} from '../music.js';
import { MAP_IDS } from '../maps.js';
import { ALL_AVATAR_IDS } from '../avatars.js';
import {createMonitoring} from './monitoring.js';
import { createRoomManager } from './rooms.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8',
  '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.data': 'application/octet-stream',
};
// This allowlist keeps server code, repository files, and secrets off HTTP.
const publicFiles = new Set([
  '/src/asset-versions.js', '/src/racer-ai.js', '/src/telemetry.js', '/monitor/index.html', '/monitor/dashboard.js', '/monitor/dashboard.css',
  '/src/music.js', '/assets/music/CREDITS.txt', ...Object.values(MUSIC_TRACKS).map(track=>track.src),
  '/index.html', '/styles.css', '/favicon.svg', '/src/main.js', '/src/game.js',
  '/src/renderer.js', '/src/network.js', '/src/movement-feedback.js', '/src/race-presentation.js', '/src/race-ui.js', '/src/loading.js', '/src/finish-destinations.js', '/src/graphics/finish.js', '/src/graphics/readability.js', '/src/graphics/motion-effects.js', '/src/maps.js', '/src/graphics/worlds.js', '/src/graphics/map-obstacles.js',
  ...MAP_IDS.map(id => `/assets/maps/${id}.svg`),
  '/src/graphics/expansion-worlds.js', '/src/graphics/world-utils.js',
  ...ALL_AVATAR_IDS.map(id => `/assets/characters/${id}.glb`),
  '/src/unity-renderer.js', '/src/unity-protocol.js',
  '/src/avatars.js', '/src/hazards.js', '/src/graphics/avatars.js', '/src/graphics/tunnel.js',
  '/src/session-scores.js', '/src/graphics/portraits.js', '/src/solo-race.js', '/src/demo.js', '/src/audio.js', '/src/audio-scene.js', '/src/graphics/atmosphere.js', '/src/input.js', '/src/ability-coach.js',
  '/docs/character-preview.html',
  '/assets/characters/courier.glb', '/assets/characters/engineer.glb',
  '/assets/characters/guard.glb', '/assets/characters/runner.glb',
  // Exported runtime files only. Never expose the Unity project or arbitrary
  // files under assets/unity. Plain equivalents also support local exports.
  '/assets/unity/v5/Race.loader.js',
  '/assets/unity/v5/Race.framework.js', '/assets/unity/v5/Race.framework.js.gz',
  '/assets/unity/v5/Race.data', '/assets/unity/v5/Race.data.gz',
  '/assets/unity/v5/Race.wasm', '/assets/unity/v5/Race.wasm.gz',
]);
// These are the only dependency files exposed to the browser. The module imports
// ./three.core.js, so both public URLs live beside one another.
const vendorFiles = new Map([
  ['/vendor/three.module.js', 'node_modules/three/build/three.module.js'],
  ['/vendor/three.core.js', 'node_modules/three/build/three.core.js'],
  ['/vendor/loaders/GLTFLoader.js', 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'],
  ['/vendor/utils/BufferGeometryUtils.js', 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'],
  ['/vendor/utils/SkeletonUtils.js', 'node_modules/three/examples/jsm/utils/SkeletonUtils.js'],
]);

export function createStaticFileHandler({ publicRoot = root } = {}) {
  return async function serveFile(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; } catch {
      response.writeHead(400);
      response.end(request.method === 'HEAD' ? undefined : 'Invalid request');
      return;
    }
    if (pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : 'ok');
      return;
    }
    const file = pathname === '/' ? '/index.html' : pathname === '/monitor' || pathname === '/monitor/' ? '/monitor/index.html' : pathname;
    if (!publicFiles.has(file) && !vendorFiles.has(file)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end(request.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    let handle;
    try {
      const path = resolve(publicRoot, vendorFiles.get(file) || '.' + file);
      let encoded = false;
      const acceptsGzip = String(request.headers['accept-encoding'] || '').split(',').some(token => {
        const [name, ...params] = token.trim().toLowerCase().split(';');
        if (name.trim() !== 'gzip') return false;
        const quality = params.find(param => param.trim().startsWith('q='));
        const weight = quality === undefined ? 1 : Number(quality.trim().slice(2));
        return Number.isFinite(weight) && weight > 0 && weight <= 1;
      });
      if (file.endsWith('.glb') && acceptsGzip) {
        try { handle = await open(path + '.gz', 'r'); encoded = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      handle ??= await open(path, 'r');
      const stats = await handle.stat();
      if (!stats.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end(request.method === 'HEAD' ? undefined : 'Not found');
        return;
      }
      const compressed = file.endsWith('.gz');
      const extension = extname(compressed ? file.slice(0, -3) : file);
      response.writeHead(200, {
        'Content-Type': types[extension] || 'application/octet-stream',
        'Content-Length': stats.size,
        ...((compressed || encoded) ? { 'Content-Encoding': 'gzip' } : {}),
        ...(file.endsWith('.glb') ? { Vary: 'Accept-Encoding' } : {}),
        'Cache-Control': ASSET_VERSIONS[file] && new URL(request.url,'http://localhost').search === '?v='+ASSET_VERSIONS[file] ? 'public, max-age=31536000, immutable' : 'no-store', 'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') response.end();
      // Backpressure keeps concurrent large Web builds from being buffered in
      // memory. Pipeline also closes the file if a browser cancels its download.
      else await pipeline(handle.createReadStream(), response);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      response.writeHead(missing ? 404 : 500, { 'Content-Type': 'text/plain' });
      response.end(request.method === 'HEAD' ? undefined : missing
        ? 'Not found' : 'Could not load the game file. Check the terminal.');
    } finally {
      await handle?.close();
    }
  };
}

export function createGameServer({
  now = Date.now, roomOptions = {}, maxConnections = 128, heartbeatMs = 30000, monitorToken = process.env.MONITOR_TOKEN || '',
} = {}) {
  const rooms = createRoomManager({ ...roomOptions, now });
  const sockets = new Map();
  const monitor=createMonitoring({token:monitorToken,now,state:()=>{
    const list=[...rooms.rooms.values()];
    return {sockets:sockets.size,maxConnections,rooms:list.length,maxRooms:roomOptions.maxRooms??25,racingRooms:list.filter(r=>r.phase==='racing').length,
      racingPlayers:list.reduce((sum,r)=>sum+[...r.players.values()].filter(p=>p.connected&&p.game.phase==='running').length,0),
      bufferedBytes:[...sockets.values()].reduce((sum,s)=>sum+s.bufferedAmount,0),
      simulationBacklogMs:Math.max(0,...list.filter(r=>r.phase==='racing').map(r=>now()-r.lastStepAt))};
  }});
  const serve=createStaticFileHandler();
  const server=createServer((request,response)=>{if(monitor.handle(request,response))return;monitor.http(request,response);return serve(request,response);});
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  let closing = false;
  let closePromise;

  function send(socket, message) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) {
      monitor.count('slowClients');socket.terminate();
      return;
    }
    const payload=JSON.stringify(message);monitor.count('messagesOut');monitor.count('bytesOut',Buffer.byteLength(payload));if(message.type==='snapshot')monitor.count('snapshots');
    socket.send(payload, (error) => { if (error) socket.terminate(); });
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
      monitor.count('connectionRejects');rejectUpgrade(socket, 503, 'Service Unavailable');
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
    monitor.count('connections');rooms.connect(id);
    sockets.set(id, socket);
    socket.on('pong', () => { alive = true; });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      monitor.count('disconnects');sockets.delete(id);
      rooms.disconnect(id);
      if (!closing) broadcast();
    });
    socket.checkHeartbeat = () => {
      if (!alive) { socket.terminate(); return; }
      alive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    };
    socket.on('message', (raw, binary) => {
      monitor.count('messagesIn');monitor.count('bytesIn',raw.length);
      const time = now();
      messageTimes = messageTimes.filter((timestamp) => time - timestamp < 1000);
      if (messageTimes.length >= 60) {
        monitor.count('rateLimits');
        socket.close(1008, 'Too many messages');
        return;
      }
      messageTimes.push(time);
      if (binary) {
        monitor.count('invalidMessages');
        send(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Send text JSON messages.' });
        return;
      }
      let message;
      try { message = JSON.parse(raw.toString()); } catch {
        monitor.count('invalidMessages');
        send(socket, { type: 'error', code: 'INVALID_JSON', message: 'That message was not valid JSON.' });
        return;
      }
      if(message?.type==='probe'&&Number.isFinite(message.at)){send(socket,{type:'probe',at:message.at});return;}
      const result = rooms.handle(id, message);
      if (!result.ok) {
        if(result.code==='RATE_LIMIT')monitor.count('rateLimits');
        if(result.code==='SERVER_FULL')monitor.count('roomRejects');
        if(['INVALID_MESSAGE','INVALID_INPUT','INVALID_ACTION','INVALID_AVATAR','INVALID_MAP'].includes(result.code))monitor.count('invalidMessages');
        send(socket, { type: 'error', code: result.code, message: result.message });
      } else if (message.type === 'leave') {
        send(socket, { type: 'left' });
        broadcast();
      } else if (message.type !== 'input') {
        // Lobby changes appear immediately; movement uses the regular 20Hz feed.
        broadcast();
      }
    });
    send(socket, { type: 'connected', version: 1, telemetry:monitor.enabled });
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
    closing = true;monitor.dispose();
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

  return { server, close, rooms, monitor };
}
