// Transport sends intentions; it never decides whether an ability or movement succeeds.
import { createGame } from './game.js';

export function connectRace({ initialMessage, onSnapshot, onStatus, onError }) {
  const url = new URL('/race', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  let closed = false;
  let sequence = 0;
  let roundId = null;
  let lastMessage = performance.now();
  const watchdog = setInterval(() => {
    if (performance.now() - lastMessage > 10000) {
      onError('The server stopped responding. Return to the menu to reconnect.');
      socket.close();
    }
  }, 2000);

  function send(message) {
    if (closed || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
  socket.addEventListener('open', () => {
    if (closed) return;
    onStatus('open');
    send(initialMessage);
  });
  socket.addEventListener('message', ({ data }) => {
    if (closed) return;
    let message;
    try { message = JSON.parse(data); } catch { return; }
    lastMessage = performance.now();
    if (message.type === 'snapshot') {
      if (roundId !== message.room.roundId) { roundId = message.room.roundId; sequence = 0; }
      onSnapshot(message);
    } else if (message.type === 'error') {
      onError(message.message, message.code);
    } else if (message.type === 'left') {
      // Idle-room expiry also removes membership; don't leave a stale lobby clickable.
      onStatus('disconnected');
      socket.close();
    }
  });
  socket.addEventListener('error', () => {
    if (!closed) onError('Could not reach the race server. Check your connection and try again.');
  });
  socket.addEventListener('close', () => {
    clearInterval(watchdog);
    if (!closed) onStatus('disconnected');
  });
  return {
    send,
    input(action) {
      if (roundId === null) return false;
      return send({ type: 'input', action, seq: ++sequence, roundId });
    },
    close() {
      send({ type: 'leave' });
      closed = true;
      clearInterval(watchdog);
      socket.close();
    },
  };
}

// Draw 50ms behind receipt time so two actual snapshots can be blended smoothly.
// No extrapolation: a broken connection must never invent another player's progress.
export function createRaceView() {
  let previous = null, latest = null, course = [];
  const blend = (a, b, t) => a + (b - a) * t;
  function motion(before, after, t) {
    if (!before || before.phase !== after.phase) return { ...after };
    const result = { ...after, distance: blend(before.distance, after.distance, t), lane: blend(before.lane, after.lane, t) };
    // A purchase starts a new jump arc; don't blend it with an unrelated old jump.
    if (after.jumpRemaining > 0 && before.jumpRemaining >= after.jumpRemaining && before.jumpDuration === after.jumpDuration) {
      result.jumpRemaining = blend(before.jumpRemaining, after.jumpRemaining, t);
    }
    return result;
  }
  return {
    push(snapshot, receivedAt) {
      const newRound = !latest || latest.snapshot.room.roundId !== snapshot.room.roundId;
      if (newRound) course = createGame({ seed: snapshot.room.seed }).obstacles;
      previous = newRound ? null : latest;
      latest = { snapshot, receivedAt };
    },
    sample(now) {
      if (!latest) return null;
      const after = latest.snapshot;
      const before = previous?.snapshot;
      const duration = previous ? latest.receivedAt - previous.receivedAt : 0;
      const t = duration > 0 ? Math.max(0, Math.min(1, (now - 50 - previous.receivedAt) / duration)) : 1;
      const game = motion(before?.you.game, after.you.game, t);
      game.obstacles = course;
      const opponents = after.players.filter(player => player.id !== after.you.id && player.connected && !['won', 'lost'].includes(player.phase))
        .map(player => motion(before?.players.find(old => old.id === player.id), player, t));
      return { game, opponents };
    },
  };
}
