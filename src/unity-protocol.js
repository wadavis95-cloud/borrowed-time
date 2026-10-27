// Presentation only: the JavaScript rules/server remain the source of truth.
import { CONFIG, getJumpHeight } from './game.js';

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function movement(player, speed = player.speed) {
  const duration = finite(player.jumpDuration, CONFIG.normalJumpDuration);
  const remaining = finite(player.jumpRemaining);
  return {
    id: String(player.id ?? 'local'), avatarId: player.avatarId ?? '',
    color: player.playerColor ?? player.color ?? '#65ead3', phase: player.phase ?? 'ready',
    distance: finite(player.distance), lane: clamp(finite(player.lane, 1), 0, 2),
    speed: Math.max(0, finite(speed)), jumpHeight: getJumpHeight(player),
    jumpProgress: remaining > 0 && duration > 0 ? clamp(1 - remaining / duration, 0, 1) : -1,
    jumpDuration: duration,
  };
}

export function createUnityProtocol() {
  let epoch = 1, sequence = 0, courseRef = null, debrisRef = null;
  let previousGhosts = new Map();
  function reset() {
    epoch++; sequence = 0; courseRef = null; debrisRef = null; previousGhosts.clear();
  }
  function sample(game, dt, opponents = [], reducedMotion = false) {
    let course = null;
    if (courseRef !== game.obstacles || debrisRef !== game.debris) {
      // A changed round also resets C# history even if the caller missed reset().
      if (courseRef !== null) reset();
      courseRef = game.obstacles; debrisRef = game.debris;
      course = {
        version: 1, epoch, courseLength: CONFIG.courseLength,
        obstacles: (game.obstacles ?? []).map(({ id, type, lane, z, length }) => ({ id, type, lane, z, length })),
        debris: (game.debris ?? []).map(({ id, lane, z, warnAt, fallAt, impactAt }) => ({ id, lane, z, warnAt, fallAt, impactAt })),
        checkpoints: CONFIG.checkpointDistances.map(z => ({ z })),
      };
    }
    const elapsed = finite(game.raceElapsed ?? game.elapsed);
    const nextGhosts = new Map();
    const visible = opponents.filter(p => p.connected !== false && p.phase !== 'won' && p.phase !== 'lost'
      && p.distance - game.distance >= -18 && p.distance - game.distance <= 255).slice(0, 3);
    const ghosts = visible.map(p => {
      const previous = previousGhosts.get(p.id);
      const delta = previous ? elapsed - previous.elapsed : 0;
      // Speed is inferred from public position samples. No private ability data.
      const speed = p.phase !== 'running' ? 0 : delta > 0
        ? clamp((p.distance - previous.distance) / delta, 0, 80) : previous?.speed ?? 0;
      nextGhosts.set(p.id, { elapsed, distance: p.distance, speed });
      return movement(p, speed);
    });
    previousGhosts = nextGhosts;
    return { course, frame: {
      version: 1, epoch, sequence: ++sequence, phase: game.phase, elapsed,
      dt: game.phase === 'paused' ? 0 : clamp(finite(dt), 0, .1), reducedMotion,
      player: { ...movement(game), boosting: game.phase === 'running' && game.boostRemaining > 0,
        hitFlash: finite(game.hitFlash), stunned: game.stunRemaining > 0 },
      opponents: ghosts,
    } };
  }
  return { sample, reset };
}
