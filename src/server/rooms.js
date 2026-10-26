import { randomBytes, randomUUID } from 'node:crypto';
import { buyAbility, createGame, jump, moveLane, startGame, updateGame } from '../game.js';

const STEP_MS = 1000 / 60;
const COLORS = ['#65ead3', '#d4b3ff', '#ffc482', '#9ac9ff'];
const ACTIONS = new Set(['left', 'right', 'jump', 'boost', 'longJump']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const error = (code, message) => ({ ok: false, code, message });

function makeCode() {
  return [...randomBytes(6)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

// The room rules have no sockets or timers, so they can be checked with a clock.
export function createRoomManager({
  now = Date.now,
  makeId = randomUUID,
  makeSeed = () => randomBytes(4).readUInt32LE(),
  maxRooms = 25,
  idleTimeoutMs = 5 * 60 * 1000,
} = {}) {
  const rooms = new Map();
  const connections = new Map();

  function connect(id) {
    if (connections.has(id)) return false;
    connections.set(id, { roomCode: null, inputTimes: [] });
    return true;
  }

  function finishRound(room) {
    const finishers = [...room.players.values()]
      .filter((player) => player.game.phase === 'won')
      .sort((a, b) => a.game.finishTime - b.game.finishTime);
    room.winnerId = finishers[0]?.id ?? null;
    if ([...room.players.values()].every((player) => ['won', 'lost'].includes(player.game.phase))) {
      room.phase = 'finished';
      room.lastActivity = now();
    }
  }

  function leave(id) {
    const connection = connections.get(id);
    const room = rooms.get(connection?.roomCode);
    if (!room) return;
    connection.roomCode = null;
    const player = room.players.get(id);
    if (room.phase === 'lobby') {
      room.players.delete(id);
    } else {
      player.connected = false;
      // A completed result stays valid; an unfinished departing runner is out.
      if (player.game.phase === 'ready' || player.game.phase === 'running') {
        player.game.phase = 'lost';
        player.game.speed = 0;
      }
    }
    const connected = [...room.players.values()].filter((member) => member.connected);
    if (connected.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === id) room.hostId = connected[0].id;
    room.lastActivity = now();
    if (room.phase === 'racing' || room.phase === 'countdown') finishRound(room);
  }

  function disconnect(id) {
    leave(id);
    connections.delete(id);
  }

  function addPlayer(room, id, name) {
    const usedColors = new Set([...room.players.values()].map((player) => player.color));
    room.players.set(id, {
      id, name, color: COLORS.find((color) => !usedColors.has(color)),
      connected: true, lastSeq: 0, game: createGame({ seed: room.seed }),
    });
    connections.get(id).roomCode = room.code;
    room.lastActivity = now();
  }

  function handle(id, message) {
    const connection = connections.get(id);
    if (!connection) return error('NOT_CONNECTED', 'Connect before joining a room.');
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      return error('INVALID_MESSAGE', 'Send a JSON message with a type.');
    }
    const room = rooms.get(connection.roomCode);
    if (message.type === 'create' || message.type === 'join') {
      if (room) return error('ALREADY_IN_ROOM', 'Leave this room before joining another.');
      if (typeof message.name !== 'string' || message.name.length > 80) {
        return error('INVALID_NAME', 'Use a guest name of up to 20 characters.');
      }
      const name = message.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) || 'Runner';
      if (message.type === 'create') {
        if (rooms.size >= maxRooms) return error('SERVER_FULL', 'All rooms are busy. Try again shortly.');
        let code;
        do { code = makeCode(); } while (rooms.has(code));
        const created = {
          code, phase: 'lobby', hostId: id, roundId: makeId(), seed: makeSeed(),
          winnerId: null, countdownEnd: null, lastStepAt: null,
          lastActivity: now(), players: new Map(),
        };
        rooms.set(code, created);
        addPlayer(created, id, name);
      } else {
        if (typeof message.code !== 'string' || message.code.length > 20) {
          return error('INVALID_CODE', 'Enter the six-character room code.');
        }
        const target = rooms.get(message.code.trim().toUpperCase());
        if (!target) return error('ROOM_NOT_FOUND', 'That room was not found. Check its code.');
        if (target.phase !== 'lobby') return error('ROUND_ACTIVE', 'This room has already started. Wait for a rematch.');
        if (target.players.size >= 4) return error('ROOM_FULL', 'This room already has four players.');
        addPlayer(target, id, name);
      }
      return { ok: true };
    }
    if (message.type === 'leave') {
      leave(id);
      return { ok: true };
    }
    if (!room) return error('NOT_IN_ROOM', 'Create or join a room first.');
    if (message.type === 'start') {
      if (room.hostId !== id) return error('HOST_ONLY', 'Only the host can start the race.');
      if (room.phase !== 'lobby') return error('ROUND_ACTIVE', 'This round has already started.');
      if (room.players.size < 2) return error('NEED_PLAYERS', 'Invite at least one other runner to start.');
      room.phase = 'countdown';
      room.countdownEnd = now() + 3000;
      room.lastActivity = now();
      return { ok: true };
    }
    if (message.type === 'rematch') {
      if (room.hostId !== id) return error('HOST_ONLY', 'Only the host can prepare a rematch.');
      if (room.phase !== 'finished') return error('ROUND_ACTIVE', 'Wait until every runner has finished.');
      room.phase = 'lobby';
      room.roundId = makeId();
      const seed = makeSeed();
      room.seed = seed === room.seed ? (seed + 1) >>> 0 : seed;
      room.winnerId = null;
      room.countdownEnd = null;
      room.lastStepAt = null;
      room.lastActivity = now();
      for (const [playerId, player] of room.players) {
        if (!player.connected) {
          room.players.delete(playerId);
        } else {
          player.game = createGame({ seed: room.seed });
          player.lastSeq = 0;
        }
      }
      return { ok: true };
    }
    if (message.type !== 'input') return error('INVALID_MESSAGE', 'Unknown message type.');
    const time = now();
    connection.inputTimes = connection.inputTimes.filter((timestamp) => time - timestamp < 1000);
    if (connection.inputTimes.length >= 30) return error('RATE_LIMIT', 'Please slow down your inputs.');
    connection.inputTimes.push(time);
    if (!ACTIONS.has(message.action)) return error('INVALID_ACTION', 'That action is not available.');
    if (!Number.isSafeInteger(message.seq) || message.seq < 1) return error('INVALID_INPUT', 'Input sequence must be a positive integer.');
    if (message.roundId !== room.roundId) return error('STALE_ROUND', 'That input belongs to an older round.');
    const player = room.players.get(id);
    if (message.seq <= player.lastSeq) return error('STALE_INPUT', 'That input has already been handled.');
    if (room.phase !== 'racing' || player.game.phase !== 'running') return error('NOT_RACING', 'Wait until your race is running.');
    player.lastSeq = message.seq;
    room.lastActivity = time;
    let result;
    if (message.action === 'left' || message.action === 'right') {
      result = { ok: moveLane(player.game, message.action === 'left' ? -1 : 1) };
    } else if (message.action === 'jump') {
      result = { ok: jump(player.game) };
    } else {
      result = buyAbility(player.game, message.action);
    }
    return result.ok ? { ok: true } : error('ACTION_UNAVAILABLE', result.reason ?? 'That move is not available right now.');
  }

  function tick(time = now()) {
    const notices = [];
    for (const room of rooms.values()) {
      if (time - room.lastActivity >= idleTimeoutMs && room.phase !== 'racing' && room.phase !== 'countdown') {
        for (const player of room.players.values()) {
          const connection = connections.get(player.id);
          if (connection?.roomCode === room.code) {
            connection.roomCode = null;
            notices.push({ id: player.id, message: { type: 'left' } });
          }
        }
        rooms.delete(room.code);
        continue;
      }
      if (room.phase === 'countdown' && time >= room.countdownEnd) {
        room.phase = 'racing';
        room.lastStepAt = room.countdownEnd;
        for (const player of room.players.values()) {
          if (player.connected) startGame(player.game);
        }
      }
      if (room.phase !== 'racing') continue;
      // Bound each timer callback's work; any backlog is picked up on the next tick.
      const steps = Math.min(120, Math.floor((time - room.lastStepAt + 1e-6) / STEP_MS));
      for (let step = 0; step < steps; step += 1) {
        for (const player of room.players.values()) updateGame(player.game, 1 / 60);
        room.lastStepAt += STEP_MS;
        finishRound(room);
        if (room.phase === 'finished') break;
      }
    }
    return notices;
  }

  function snapshot(id) {
    const room = rooms.get(connections.get(id)?.roomCode);
    if (!room) return null;
    const player = room.players.get(id);
    const { obstacles, ...ownGame } = player.game;
    return {
      type: 'snapshot', serverTime: now(),
      room: {
        code: room.code, phase: room.phase, hostId: room.hostId,
        roundId: room.roundId, seed: room.seed, winnerId: room.winnerId,
        countdown: room.phase === 'countdown' ? Math.max(0, Math.ceil((room.countdownEnd - now()) / 1000)) : 0,
      },
      you: { id, name: player.name, game: structuredClone(ownGame) },
      // Explicitly list public fields: never spread another player's game state.
      players: [...room.players.values()].map((other) => ({
        id: other.id, name: other.name, color: other.color, connected: other.connected,
        phase: other.game.phase, lane: other.game.lane, distance: other.game.distance,
        jumpRemaining: other.game.jumpRemaining, jumpDuration: other.game.jumpDuration,
      })),
    };
  }

  return { rooms, connect, handle, disconnect, tick, snapshot };
}
