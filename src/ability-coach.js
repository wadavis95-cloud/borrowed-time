import { ABILITIES, CONFIG, getJumpHeight, projectTravel } from './game.js';

// Predict only the local runner's travel, including boost/stun endpoints.
const travel=(game,seconds,buyBoost=false)=>projectTravel(game,seconds,buyBoost?'boost':null);
function arrival(game, distance, horizon = ABILITIES.longJump.duration) {
  const proposed={...game,jumpKind:'long',jumpRemaining:ABILITIES.longJump.duration};
  if (distance > projectTravel(proposed, horizon)) return Infinity;
  let low = 0, high = horizon;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    if (projectTravel(proposed, mid) < distance) low = mid; else high = mid;
  }
  return high;
}

function opportunity(game, used) {
  if (game.phase !== 'running' || game.elapsed < .75 || game.stunRemaining > 0 || game.jumpRemaining > 0) return null;
  const ahead = (game.obstacles || []).filter(o => !o.resolved && o.z > game.distance);
  const inLane = ahead.filter(o => o.lane === game.lane).sort((a, b) => a.z - b.z);
  const overhead = (game.debris || []).some(e => e.lane === game.lane && e.impactAt >= game.elapsed
    && e.impactAt - game.elapsed <= 1.6 && (Math.abs(e.z - game.distance - travel(game, e.impactAt - game.elapsed)) < 8
      || Math.abs(e.z-game.distance-projectTravel(game,e.impactAt-game.elapsed,'longJump'))<8));
  if (overhead) return null; // An ability doesn't protect against a roof impact.
  const next = inLane[0];
  if (!used.longJump && game.timeLeft > ABILITIES.longJump.cost + 8 && next && ['barrier', 'gap'].includes(next.type)) {
    const time = arrival(game, next.z - game.distance);
    const height = t => getJumpHeight({jumpDuration:ABILITIES.longJump.duration,jumpRemaining:ABILITIES.longJump.duration-t});
    const clear = next.type === 'barrier'
      ? time >= .55 && height(time) >= CONFIG.barrierClearanceHeight && height(time - .15) >= CONFIG.barrierClearanceHeight
      : time >= .4 && time <= 1 && arrival(game, next.z + (next.length || 8) - game.distance) < ABILITIES.longJump.duration - .05;
    if (clear) return { ability: 'longJump', label: 'Jump now', key: next.id };
  }
  if (!used.boost && game.timeLeft > ABILITIES.boost.cost + 10 && !game.boostCooldown
    && !game.boostRemaining && CONFIG.courseLength - game.distance > 200) {
    // A clear immediate sprint gives time to notice the button and steer next.
    const reach = travel(game, 1.1, true) + 6;
    const ground = inLane.some(o => o.z - game.distance <= reach);
    const roof = (game.debris || []).some(e => e.lane === game.lane && e.z > game.distance && e.z - game.distance <= reach);
    if (!ground && !roof) return { ability: 'boost', label: 'Clear stretch', key: `stretch-${next?.id ?? 'exit'}` };
  }
  return null;
}

export function createAbilityCoach() {
  let used, shown, active;
  function reset() {
    used = { boost: false, longJump: false };
    shown = { boost: { count: 0, at: -Infinity, key: null }, longJump: { count: 0, at: -Infinity, key: null } };
    active = null;
  }
  reset();
  return {
    reset,
    update(game, enabled = true) {
      if (game.boostRemaining > 0) used.boost = true;
      if (game.jumpKind === 'long') used.longJump = true;
      const next = enabled ? opportunity(game, used) : null;
      if (!next) { active = null; return null; }
      const previous = shown[next.ability];
      if (active?.ability === next.ability && active.key === next.key && game.elapsed < active.until) return next;
      active = null;
      if (previous.count >= 2 || previous.key === next.key || game.elapsed - previous.at < 10) return null;
      previous.count++; previous.at = game.elapsed; previous.key = next.key;
      active = { ...next, until: game.elapsed + 2.2 };
      return next;
    },
  };
}
