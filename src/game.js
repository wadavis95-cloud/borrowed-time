import { createFallingDebris } from './hazards.js';
import { AVATAR_IDS } from './avatars.js';

// All distances are metres; all durations and prices are seconds.
// Change these values to tune the game without touching the drawing code.
export const CONFIG = Object.freeze({
  initialTime: 60,
  courseLength: 1350,
  baseSpeed: 22,
  topSpeed: 32,
  accelerationDuration: 50,
  laneCount: 3,
  normalJumpDuration: 0.65,
  normalJumpHeight: 1.15,
  longJumpHeight: 3,
  barrierClearanceHeight: 2.2,
  hitTimePenalty: 3,
  stunDuration: 0.8,
  stunMultiplier: 0.45,
  hitFlashDuration: 0.45,
  checkpointBonus: 5,
  checkpointDistances: Object.freeze([450, 900]),
  firstObstacle: 90,
  encounterSpacing: 72,
  encounterVariation: 18,
  debrisImpactRadius: 2,
});

export const ABILITIES = Object.freeze({
  boost: Object.freeze({ cost: 3, duration: 4, cooldown: 7, multiplier: 1.85 }),
  longJump: Object.freeze({ cost: 2, duration: 1.4 }),
});

const EPSILON = 0.00000001;
const TIMERS = ['jumpRemaining', 'boostRemaining', 'boostCooldown', 'stunRemaining', 'hitFlash'];

function announce(game, text, kind = 'info') {
  game.eventSequence += 1;
  game.recentEvent = { id: game.eventSequence, text, kind };
}

// A seeded random generator makes Restart replay the same fair course.
function makeCourse(seed) {
  let value = seed >>> 0;
  const random = () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const obstacles = [];
  const types = ['rubble', 'barrier', 'gap'];
  let encounter = 0;
  for (let z = CONFIG.firstObstacle; z < CONFIG.courseLength - 70;) {
    const firstLane = Math.floor(random() * CONFIG.laneCount);
    const laneOrder = [firstLane, (firstLane + 1) % 3, (firstLane + 2) % 3];
    // At most two lanes are occupied; every encounter has an escape route.
    const obstacleCount = encounter > 1 && encounter % 3 === 2 ? 2 : 1;
    for (let index = 0; index < obstacleCount; index += 1) {
      const type = encounter === 0 ? 'rubble' : types[Math.floor(random() * types.length)];
      obstacles.push({
        id: `obstacle-${encounter}-${index}`,
        z,
        lane: laneOrder[index],
        type,
        length: type === 'gap' ? 8 : 2,
      });
    }
    encounter += 1;
    z += CONFIG.encounterSpacing + Math.floor(random() * CONFIG.encounterVariation);
  }
  return obstacles;
}

export function createGame({
  seed = 42, course, debris,
  avatarId = AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)],
  playerColor = '#65ead3',
} = {}) {
  const obstacles = course === undefined ? makeCourse(seed) : course;
  const events = debris ?? (course === undefined ? createFallingDebris(seed, obstacles, CONFIG) : []);
  return {
    phase: 'ready',
    avatarId,
    playerColor,
    elapsed: 0,
    timeLeft: CONFIG.initialTime,
    distance: 0,
    lane: 1,
    speed: 0,
    jumpRemaining: 0,
    jumpDuration: CONFIG.normalJumpDuration,
    jumpKind: null,
    boostRemaining: 0,
    boostCooldown: 0,
    stunRemaining: 0,
    hitFlash: 0,
    hits: 0,
    timeSpent: 0,
    finishTime: null,
    debris: events.map(event => ({ ...event })),
    debrisProgress: Object.fromEntries(events.map(event => [event.id, { impactChecked: false, resolved: false }])),
    // Copy fixtures so one run can never change another run's course.
    obstacles: obstacles.map((obstacle, index) => ({
      ...obstacle,
      id: obstacle.id ?? `obstacle-${index}`,
      resolved: false,
    })).sort((a, b) => a.z - b.z),
    checkpoints: CONFIG.checkpointDistances.map((z) => ({ z, passed: false })),
    eventSequence: 0,
    recentEvent: null,
  };
}

function speedMultiplier(game) {
  const boost = game.boostRemaining > 0 ? ABILITIES.boost.multiplier : 1;
  const stumble = game.stunRemaining > 0 ? CONFIG.stunMultiplier : 1;
  return boost * stumble;
}

function baseSpeedAt(elapsed) {
  const progress = Math.min(1, elapsed / CONFIG.accelerationDuration);
  return CONFIG.baseSpeed + (CONFIG.topSpeed - CONFIG.baseSpeed) * progress;
}

function refreshSpeed(game) {
  game.speed = game.phase === 'running' ? baseSpeedAt(game.elapsed) * speedMultiplier(game) : 0;
}

// Public motion fields suffice for both the local runner and private ghosts.
// Collision clearance uses this same arc, so a paid jump must visibly rise
// above the barrier instead of granting protection for its entire duration.
export function getJumpHeight(state) {
  if (!(state.jumpRemaining > 0) || !(state.jumpDuration > 0)) return 0;
  const progress = Math.max(0, Math.min(1, 1 - state.jumpRemaining / state.jumpDuration));
  const height = state.jumpDuration > CONFIG.normalJumpDuration ? CONFIG.longJumpHeight : CONFIG.normalJumpHeight;
  return Math.sin(progress * Math.PI) * height;
}

export function startGame(game) {
  if (game.phase !== 'ready') return false;
  game.phase = 'running';
  announce(game, 'The clock is running. Reach the exit.');
  refreshSpeed(game);
  return true;
}

export function pauseGame(game) {
  if (game.phase !== 'running') return false;
  game.phase = 'paused';
  refreshSpeed(game);
  return true;
}

export function resumeGame(game) {
  if (game.phase !== 'paused') return false;
  game.phase = 'running';
  refreshSpeed(game);
  return true;
}

export function moveLane(game, direction) {
  if (game.phase !== 'running' || (direction !== -1 && direction !== 1)) return false;
  const nextLane = Math.max(0, Math.min(CONFIG.laneCount - 1, game.lane + direction));
  if (nextLane === game.lane) return false;
  game.lane = nextLane;
  return true;
}

export function jump(game) {
  if (game.phase !== 'running' || game.jumpRemaining > 0) return false;
  game.jumpKind = 'normal';
  game.jumpDuration = CONFIG.normalJumpDuration;
  game.jumpRemaining = game.jumpDuration;
  return true;
}

export function buyAbility(game, abilityName) {
  if (game.phase !== 'running') return { ok: false, reason: 'Start or resume your run first.' };
  if (!Object.hasOwn(ABILITIES, abilityName)) return { ok: false, reason: 'Unknown ability.' };
  const ability = ABILITIES[abilityName];
  if (game.timeLeft <= ability.cost) return { ok: false, reason: 'Not enough time left.' };
  if (abilityName === 'boost' && game.boostCooldown > 0) {
    return { ok: false, reason: 'Speed boost is recharging.' };
  }
  if (abilityName === 'longJump' && game.jumpKind === 'long' && game.jumpRemaining > 0) {
    return { ok: false, reason: 'Long jump is already active.' };
  }

  game.timeLeft -= ability.cost;
  game.timeSpent += ability.cost;
  if (abilityName === 'boost') {
    game.boostRemaining = ability.duration;
    game.boostCooldown = ability.cooldown;
    announce(game, `Speed boost · −${ability.cost}s`, 'ability');
  } else {
    // A paid long jump may upgrade a normal hop, but cannot extend itself.
    game.jumpKind = 'long';
    game.jumpDuration = ability.duration;
    game.jumpRemaining = ability.duration;
    announce(game, `Long jump · −${ability.cost}s`, 'ability');
  }
  refreshSpeed(game);
  return { ok: true };
}

function takeHit(game, label = 'Hit debris') {
  game.hits += 1;
  game.timeLeft = Math.max(0, game.timeLeft - CONFIG.hitTimePenalty);
  game.stunRemaining = CONFIG.stunDuration;
  game.hitFlash = CONFIG.hitFlashDuration;
  announce(game, `${label} · −${CONFIG.hitTimePenalty}s`, 'warning');
}

// Return true if a fatal hit must stop processing before checkpoint awards.
function resolveDebris(game) {
  for (const event of game.debris) {
    const progress = game.debrisProgress[event.id];
    if (progress.resolved) continue;
    if (!progress.impactChecked && game.elapsed >= event.impactAt - EPSILON) {
      progress.impactChecked = true;
      // Falling masonry occupies the whole height of its landing footprint.
      // A jump helps with rubble afterward, but cannot dodge this impact.
      if (Math.abs(game.distance - event.z) <= CONFIG.debrisImpactRadius + EPSILON && game.lane === event.lane) {
        progress.resolved = true;
        takeHit(game, 'Falling masonry');
        if (game.timeLeft <= EPSILON) return true;
      }
      // Anyone already past the landing point has no rubble left to cross.
      if (game.distance >= event.z - EPSILON) progress.resolved = true;
    }
    if (progress.resolved) continue;
    if (progress.impactChecked && game.distance >= event.z - EPSILON) {
      progress.resolved = true;
      if (game.lane === event.lane && game.jumpRemaining <= 0) {
        takeHit(game);
        if (game.timeLeft <= EPSILON) return true;
      }
    } else if (game.distance >= event.z + CONFIG.debrisImpactRadius + EPSILON) {
      progress.resolved = true;
    }
  }
  return false;
}

function resolveCrossings(game) {
  for (const obstacle of game.obstacles) {
    if (obstacle.resolved || obstacle.z > game.distance + EPSILON) continue;
    obstacle.resolved = true;
    if (obstacle.lane !== game.lane) continue;
    const airborne = game.jumpRemaining > 0;
    const cleared = (obstacle.type === 'rubble' && airborne)
      || (obstacle.type === 'gap' && airborne && game.jumpKind === 'long')
      || (obstacle.type === 'barrier' && game.jumpKind === 'long'
        && getJumpHeight(game) >= CONFIG.barrierClearanceHeight - EPSILON);
    if (cleared) continue;
    const label = obstacle.type === 'gap' ? 'Missed the gap' : 'Hit debris';
    takeHit(game, label);
    // A fatal hit ends the run before a checkpoint at the same position.
    if (game.timeLeft <= EPSILON) return;
  }
  if (resolveDebris(game)) return;
  for (const checkpoint of game.checkpoints) {
    if (checkpoint.passed || checkpoint.z > game.distance + EPSILON) continue;
    checkpoint.passed = true;
    game.timeLeft += CONFIG.checkpointBonus;
    announce(game, `Time pickup · +${CONFIG.checkpointBonus}s`, 'success');
  }
}

function checkRunEnd(game) {
  if (game.timeLeft <= EPSILON) game.timeLeft = 0;
  // Reaching the exit on the final tick still counts as escaping.
  if (game.distance >= CONFIG.courseLength - EPSILON) {
    game.distance = CONFIG.courseLength;
    game.phase = 'won';
    game.finishTime = game.elapsed;
    announce(game, 'You made it out.', 'success');
  } else if (game.timeLeft <= EPSILON) {
    game.timeLeft = 0;
    game.phase = 'lost';
    announce(game, 'Time ran out. Try another route.', 'warning');
  }
}

export function updateGame(game, dt) {
  if (game.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  let remaining = dt;
  resolveCrossings(game);
  checkRunEnd(game);

  // Split a frame at meaningful moments: a collision, checkpoint, effect
  // ending, exit, or timer expiry. Large frames behave like small frames.
  while (remaining > EPSILON && game.phase === 'running') {
    refreshSpeed(game);
    const acceleration = game.elapsed < CONFIG.accelerationDuration
      ? (CONFIG.topSpeed - CONFIG.baseSpeed) / CONFIG.accelerationDuration * speedMultiplier(game) : 0;
    // Solve d = vt + at²/2 using the stable positive root. Every step also
    // ends at the ramp cap and effect endpoints, keeping v and a exact here.
    const timeTo = (distance) => 2 * distance
      / (game.speed + Math.sqrt(game.speed * game.speed + 2 * acceleration * distance));
    let step = Math.min(remaining, game.timeLeft, timeTo(CONFIG.courseLength - game.distance));
    if (game.elapsed < CONFIG.accelerationDuration) {
      step = Math.min(step, CONFIG.accelerationDuration - game.elapsed);
    }
    for (const timer of TIMERS) {
      if (game[timer] > EPSILON) step = Math.min(step, game[timer]);
    }
    for (const obstacle of game.obstacles) {
      if (!obstacle.resolved && obstacle.z > game.distance + EPSILON) {
        step = Math.min(step, timeTo(obstacle.z - game.distance));
      }
    }
    for (const event of game.debris) {
      if (game.debrisProgress[event.id].resolved) continue;
      if (event.impactAt > game.elapsed + EPSILON) step = Math.min(step, event.impactAt - game.elapsed);
      if (event.z > game.distance + EPSILON) step = Math.min(step, timeTo(event.z - game.distance));
    }
    for (const checkpoint of game.checkpoints) {
      if (!checkpoint.passed && checkpoint.z > game.distance + EPSILON) {
        step = Math.min(step, timeTo(checkpoint.z - game.distance));
      }
    }

    game.elapsed += step;
    game.distance += game.speed * step + acceleration * step * step / 2;
    game.timeLeft = Math.max(0, game.timeLeft - step);
    for (const timer of TIMERS) {
      game[timer] = Math.max(0, game[timer] - step);
      if (game[timer] < EPSILON) game[timer] = 0;
    }
    if (game.jumpRemaining === 0) game.jumpKind = null;
    remaining -= step;
    resolveCrossings(game);
    checkRunEnd(game);
  }
  refreshSpeed(game);
}
