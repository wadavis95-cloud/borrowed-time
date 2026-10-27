import { randomBytes, randomUUID } from 'node:crypto';
import { ABILITIES, CONFIG, buyAbility, createGame, jump, moveLane, startGame, updateGame } from '../game.js';
import { AVATARS } from '../avatars.js';
import { getMap, isMapId, resolveMapVote } from '../maps.js';
import { scheduleApproachingDebris } from '../hazards.js';

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
  random = Math.random,
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
      delete room.votes[id];
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

  function addPlayer(room, id) {
    const usedColors = new Set([...room.players.values()].map((player) => player.color));
    const color = COLORS.find(candidate => !usedColors.has(candidate));
    const usedAvatars = new Set([...room.players.values()].map(player => player.avatarId));
    const candidates = getMap(room.mapId).avatars.filter(avatarId => !usedAvatars.has(avatarId));
    const avatarId = candidates[Math.floor(random() * candidates.length)];
    room.players.set(id, {
      id, name: AVATARS[avatarId].name, color, avatarId,
      connected: true, lastSeq: 0, game: createGame({ seed: room.seed, mapId: room.mapId, avatarId, playerColor: color }),
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
      if (message.type === 'create') {
        if (rooms.size >= maxRooms) return error('SERVER_FULL', 'All rooms are busy. Try again shortly.');
        if (message.mapId !== undefined && !isMapId(message.mapId)) return error('INVALID_MAP', 'Choose an available map.');
        let code;
        do { code = makeCode(); } while (rooms.has(code));
        const created = {
          code, phase: 'lobby', hostId: id, roundId: makeId(), seed: makeSeed(),
          mapId: getMap(message.mapId).id, votes: {},
          winnerId: null, countdownEnd: null, lastStepAt: null, raceElapsed: 0,
          lastActivity: now(), players: new Map(),
        };
        rooms.set(code, created);
        addPlayer(created, id);
        if (message.mapId !== undefined) created.votes[id] = created.mapId;
      } else {
        if (typeof message.code !== 'string' || message.code.length > 20) {
          return error('INVALID_CODE', 'Enter the six-character room code.');
        }
        const target = rooms.get(message.code.trim().toUpperCase());
        if (!target) return error('ROOM_NOT_FOUND', 'That room was not found. Check its code.');
        if (target.phase !== 'lobby') return error('ROUND_ACTIVE', 'This room has already started. Wait for a rematch.');
        if (target.players.size >= 4) return error('ROOM_FULL', 'This room already has four players.');
        addPlayer(target, id);
      }
      return { ok: true };
    }
    if (message.type === 'leave') {
      leave(id);
      return { ok: true };
    }
    if (!room) return error('NOT_IN_ROOM', 'Create or join a room first.');
    if (message.type === 'vote') {
      if (room.phase !== 'lobby') return error('VOTING_CLOSED', 'Voting closes when the countdown begins.');
      if (!isMapId(message.mapId)) return error('INVALID_MAP', 'Choose an available map.');
      room.votes[id] = message.mapId;
      room.lastActivity = now();
      return { ok: true };
    }
    if (message.type === 'start') {
      if (room.hostId !== id) return error('HOST_ONLY', 'Only the host can start the race.');
      if (room.phase !== 'lobby') return error('ROUND_ACTIVE', 'This round has already started.');
      if (room.players.size < 2) return error('NEED_PLAYERS', 'Invite at least one other runner to start.');
      const selected = resolveMapVote(Object.values(room.votes), room.mapId, random);
      if (selected !== room.mapId) {
        room.mapId = selected;
        const candidates = [...getMap(selected).avatars];
        for (const player of room.players.values()) {
          player.avatarId = candidates.splice(Math.floor(random() * candidates.length), 1)[0];
          player.name = AVATARS[player.avatarId].name;
          player.game = createGame({ seed: room.seed, mapId: selected, avatarId: player.avatarId, playerColor: player.color });
        }
      }
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
      room.votes = {};
      room.winnerId = null;
      room.countdownEnd = null;
      room.lastStepAt = null;
      room.raceElapsed = 0;
      room.lastActivity = now();
      for (const [playerId, player] of room.players) {
        if (!player.connected) {
          room.players.delete(playerId);
        } else {
          player.game = createGame({ seed: room.seed, mapId: room.mapId, avatarId: player.avatarId, playerColor: player.color });
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
        const racers = [...room.players.values()].map(player => player.game);
        for (const game of racers) scheduleApproachingDebris(game.debris, racers, CONFIG, ABILITIES.boost.multiplier);
        room.raceElapsed += 1 / 60;
        for (const player of room.players.values()) {
          updateGame(player.game, 1 / 60, true);
          // Different collisions split simulation steps differently. Keep the
          // surviving racers on one clock despite floating point roundoff.
          if (player.game.phase === 'running') player.game.elapsed = room.raceElapsed;
        }
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
    const { obstacles, debris, debrisProgress, ...ownGame } = player.game;
    // Finish order is authoritative. Distance alone cannot distinguish runners
    // once they all reach the exit. Unfinished runners follow in course order.
    const ordered = [...room.players.values()].sort((a, b) => {
      const group = p => p.game.phase === 'won' ? 0 : p.game.phase === 'lost' ? 2 : 1;
      return group(a) - group(b)
        || (a.game.phase === 'won' ? a.game.finishTime - b.game.finishTime
          : b.game.distance - a.game.distance);
    });
    const racing = ['racing', 'finished'].includes(room.phase);
    return {
      type: 'snapshot', serverTime: now(),
      room: {
        code: room.code, phase: room.phase, hostId: room.hostId,
        roundId: room.roundId, seed: room.seed, mapId: room.mapId, votes: { ...room.votes }, winnerId: room.winnerId,
        raceElapsed: room.raceElapsed,
        countdown: room.phase === 'countdown' ? Math.max(0, Math.ceil((room.countdownEnd - now()) / 1000)) : 0,
      },
      you: { id, name: player.name, game: structuredClone(ownGame) },
      debris: player.game.debris.map(({ id, lane, z, warnAt, fallAt, impactAt }) => ({ id, lane, z, warnAt, fallAt, impactAt })),
      standings: ordered.map((other, index) => ({
        id: other.id,
        position: racing && other.game.phase !== 'lost' ? index + 1 : null,
        status: other.game.phase === 'won' ? 'escaped'
          : !other.connected ? 'disconnected' : other.game.phase === 'lost' ? 'dnf'
            : racing ? 'racing' : 'ready',
      })),
      // Explicitly list public fields: never spread another player's game state.
      players: [...room.players.values()].map((other) => ({
        id: other.id, name: other.name, color: other.color, avatarId: other.avatarId, connected: other.connected,
        phase: other.game.phase, lane: other.game.lane, distance: other.game.distance,
        jumpRemaining: other.game.jumpRemaining, jumpDuration: other.game.jumpDuration,
      })),
    };
  }

  return { rooms, connect, handle, disconnect, tick, snapshot };
}
