import { ABILITIES, CONFIG, createGame, getJumpHeight } from './game.js';
import { connectRace } from './network.js';

const NAMES = ['Demo · Ash', 'Demo · Briar', 'Demo · Cleo', 'Demo · Drew'];
const PREFERRED_LANES = [0, 1, 2, 1];
// Each runner spends its own clock on a different plan. Ash is the camera's
// viewpoint: an early breakaway lets rivals fall behind before their later
// purchases bring them back. These are inputs, never forced race positions.
const BOOST_PLANS = [
  [10.5, 31, 42], // Ash: early burst, recover, then push for the exit.
  [16, 34],       // Briar: patient chaser with a longer recovery between bursts.
  [20, 28, 36],   // Cleo: save for repeated mid-race sprints.
  [24, 40],       // Drew: conserve time, then make two late pushes.
];
const RECOVERABLE_ERRORS = new Set(['ACTION_UNAVAILABLE', 'NOT_RACING', 'STALE_INPUT', 'STALE_ROUND']);

// Predict only the runner's own motion to time ordinary inputs. This does not
// change or simulate any authoritative state, and never reads another balance.
function travelDistance(game, duration) {
  const boundaries = [0, duration];
  for (const time of [game.boostRemaining, game.stunRemaining, CONFIG.accelerationDuration - game.elapsed]) {
    if (time > 0 && time < duration) boundaries.push(time);
  }
  boundaries.sort((a, b) => a - b);
  const speed = time => CONFIG.baseSpeed + (CONFIG.topSpeed - CONFIG.baseSpeed)
    * Math.min(1, (game.elapsed + time) / CONFIG.accelerationDuration);
  let distance = 0;
  for (let i = 1; i < boundaries.length; i += 1) {
    const start = boundaries[i - 1], end = boundaries[i], middle = (start + end) / 2;
    const boost = game.boostRemaining > middle ? ABILITIES.boost.multiplier : 1;
    const stun = game.stunRemaining > middle ? CONFIG.stunMultiplier : 1;
    distance += (speed(start) + speed(end)) / 2 * (end - start) * boost * stun;
  }
  return distance;
}

// Every strategy uses the same rules and reacts to its own hazards first.
// Different spending times create natural separation, catches and overtakes.
export function chooseDemoAction(game, index) {
  if (game.phase !== 'running') return null;
  const preferred = PREFERRED_LANES[index % PREFERRED_LANES.length];
  if (game.elapsed < .5 && game.lane !== preferred) return game.lane < preferred ? 'right' : 'left';
  if (index === 3 && game.elapsed >= .3 && game.elapsed < .6 && !game.jumpRemaining) return 'jump';

  const debris = game.debris ?? [];
  const overhead = lane => debris.some(event => {
    const until = event.impactAt - game.elapsed;
    return event.lane === lane && until >= 0 && until <= 1.1
      && Math.abs(game.distance + travelDistance(game, until) - event.z) < 6;
  });
  const obstacles = [...(game.obstacles ?? []), ...debris
    .filter(event => event.impactAt <= game.elapsed)
    .map(event => ({ ...event, type: 'rubble' }))]
    .filter(obstacle => obstacle.z > game.distance + .05)
    .sort((a, b) => a.z - b.z);
  const dodge = () => {
    const lanes = [0, 1, 2].filter(lane => lane !== game.lane && !overhead(lane)
      && !obstacles.some(obstacle => obstacle.lane === lane && obstacle.type !== 'rubble'
        && obstacle.z - game.distance < travelDistance(game, .25)));
    lanes.sort((a, b) => Math.abs(a - game.lane) - Math.abs(b - game.lane)
      || (index % 2 ? b - a : a - b));
    return lanes.length ? (lanes[0] < game.lane ? 'left' : 'right') : null;
  };
  if (overhead(game.lane)) return dodge();
  // Read one encounter at a time. Dense courses can occupy all three lanes;
  // the low rubble in those rows is a free-hop route, not a dead end.
  const first = obstacles[0];
  const row = first ? obstacles.filter(obstacle => Math.abs(obstacle.z - first.z) < .01) : [];
  const denseRow = row.length >= 2 && first.z - game.distance <= travelDistance(game, 1.05);
  if (denseRow) {
    const distance = first.z - game.distance;
    const current = row.find(obstacle => obstacle.lane === game.lane);
    // Check the future arc at crossing, including boost/stun boundaries.
    let low = 0, high = 1.1;
    for (let i = 0; i < 16; i += 1) {
      const middle = (low + high) / 2;
      if (travelDistance(game, middle) < distance) low = middle; else high = middle;
    }
    const remaining = game.jumpRemaining - high;
    const clearsCurrent = !current || (remaining > .03 && (current.type === 'rubble'
      || game.jumpKind === 'long' && (current.type === 'gap'
        || getJumpHeight({ jumpDuration: game.jumpDuration, jumpRemaining: remaining }) >= CONFIG.barrierClearanceHeight)));
    if (!clearsCurrent) {
      // Ash and Cleo sometimes buy an alternative through a full-width row;
      // conserving runners deliberately move to its free-hop route instead.
      if (row.length === 3 && current.type !== 'rubble' && index % 2 === 0
        && !game.jumpRemaining && game.timeSpent < 4 && game.timeLeft > ABILITIES.longJump.cost + 5) {
        if (distance > travelDistance(game, .8)) return null;
        if (distance >= travelDistance(game, .42)) return 'longJump';
      }
      const candidates = [0, 1, 2].filter(lane => !overhead(lane)
        && (!row.some(obstacle => obstacle.lane === lane)
          || row.some(obstacle => obstacle.lane === lane && obstacle.type === 'rubble')));
      candidates.sort((a, b) => {
        const cost = lane => (row.some(o => o.lane === lane) ? 1 : 0) + Math.abs(lane - game.lane) * .25;
        return cost(a) - cost(b) || (index % 2 ? b - a : a - b);
      });
      const lane = candidates[0];
      if (lane !== undefined && lane !== game.lane) return lane < game.lane ? 'left' : 'right';
      if (current.type === 'rubble' && !game.jumpRemaining && distance <= travelDistance(game, .32)) return 'jump';
      return null;
    }
  }
  const obstacle = obstacles.find(candidate => candidate.lane === game.lane);
  if (obstacle && !denseRow) {
    const distance = obstacle.z - game.distance;
    if (obstacle.type === 'barrier' || obstacle.type === 'gap') {
      if (distance <= travelDistance(game, .82)) {
        if (game.jumpKind === 'long' && game.jumpRemaining > 0) {
          const clearance = obstacle.type === 'barrier' ? .37 : .05;
          if (distance > travelDistance(game, Math.max(0, game.jumpRemaining - clearance))) return dodge();
        } else if (game.timeLeft > ABILITIES.longJump.cost + 3 && game.timeSpent < 14
          && (obstacle.type === 'gap' || distance > travelDistance(game, .52))) {
          return 'longJump';
        } else return dodge();
      }
    } else if (distance <= travelDistance(game, .38)) {
      if (!game.jumpRemaining) return 'jump';
      if (distance > travelDistance(game, Math.max(0, game.jumpRemaining - .03))) return dodge();
    }
  }
  if (!game.boostCooldown && !game.stunRemaining && game.timeLeft > ABILITIES.boost.cost + 5
    && BOOST_PLANS[index % BOOST_PLANS.length].some(start => game.elapsed >= start
      && game.elapsed < start + 1.35)) {
    return 'boost';
  }
  return null;
}

export function createDemoRace({ onStatus, onError, onSnapshot, connect = connectRace }) {
  const runners = NAMES.map(name => ({ name, connection: null, snapshot: null, roundId: null, course: null }));
  let closed = false;
  let timer = null;
  let guestsStarted = false;
  let startedRound = null;

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    timer = null;
    for (const runner of runners) {
      // One damaged socket must not prevent the remaining clients from closing.
      try { runner.connection?.close(); } catch { /* continue cleanup */ }
      runner.snapshot = null;
    }
  }
  function fail(message, code) {
    if (closed) return;
    close();
    try { onError(message, code); } finally { onStatus('disconnected'); }
  }
  function open(index, initialMessage) {
    if (closed) return;
    const runner = runners[index];
    try {
      const connection = connect({
        initialMessage,
        onStatus(status) {
          if (closed) return;
          if (status === 'disconnected') fail('A demo runner disconnected. Start the demo again to reconnect.');
          else if (index === 0) onStatus(status);
        },
        onError(message, code) {
          if (closed || RECOVERABLE_ERRORS.has(code)) return;
          fail(message, code);
        },
        onSnapshot(snapshot) {
          if (closed) return;
          runner.snapshot = snapshot;
          if (runner.roundId !== snapshot.room.roundId) {
            runner.roundId = snapshot.room.roundId;
            runner.course = createGame({ seed: snapshot.room.seed });
          }
          if (index !== 0) return;
          onSnapshot(snapshot);
          if (closed) return;
          if (!guestsStarted) {
            guestsStarted = true;
            for (let guest = 1; guest < runners.length; guest += 1) {
              open(guest, { type: 'join', code: snapshot.room.code, name: runners[guest].name });
            }
          }
          if (snapshot.room.phase === 'lobby' && snapshot.players.length === 4
            && snapshot.players.every(player => player.connected) && startedRound !== snapshot.room.roundId) {
            startedRound = snapshot.room.roundId;
            if (!runner.connection?.send({ type: 'start' })) fail('The demo could not start. Please try again.');
          }
        },
      });
      runner.connection = connection;
      if (closed) connection.close();
    } catch (error) {
      fail(error.message || 'The demo could not connect. Please try again.');
    }
  }

  open(0, { type: 'create', name: NAMES[0] });
  if (!closed) timer = setInterval(() => {
    if (closed) return;
    for (const [index, runner] of runners.entries()) {
      if (!runner.snapshot || runner.snapshot.room.phase !== 'racing') continue;
      const game = { ...runner.snapshot.you.game, obstacles: runner.course.obstacles, debris: runner.course.debris };
      const action = chooseDemoAction(game, index);
      if (action && !runner.connection.input(action)) {
        fail('A demo runner could not send its move. Start the demo again to reconnect.');
        break;
      }
    }
  }, 150);

  return {
    close,
    send(message) {
      if (closed) return false;
      if (message?.type === 'leave') { close(); return true; }
      return runners[0].connection?.send(message) ?? false;
    },
  };
}
