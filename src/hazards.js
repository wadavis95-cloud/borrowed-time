// A chunk lands in one lane, leaving the other two lanes open.
// Its clock is race time, never the runner's spendable time balance.
export function createFallingDebris(seed, obstacles, {
  baseSpeed = 22, topSpeed = 32, accelerationDuration = 50, debrisEvery = 3, debrisMinimumGap = 60,
} = {}) {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  const random = () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const distances = [...new Set(obstacles.map(obstacle => obstacle.z))].sort((a, b) => a - b);
  const events = [];
  // Use only gaps wide enough to keep a ceiling fall separate from the ground
  // row (including a gap's far edge). Current rules allow more of these gaps;
  // the two-argument API retains its original sparse schedule.
  const interval = Number.isInteger(debrisEvery) && debrisEvery > 0 ? debrisEvery : 3;
  for (let index = 1; index < distances.length - 1; index += interval) {
    const previousEnd = Math.max(...obstacles.filter(obstacle => obstacle.z === distances[index])
      .map(obstacle => obstacle.z + (obstacle.length ?? 2)));
    const next = distances[index + 1];
    if (next - previousEnd < debrisMinimumGap) continue;
    const z = (previousEnd + next) / 2;
    const acceleration = (topSpeed - baseSpeed) / accelerationDuration;
    const rampDistance = (baseSpeed + topSpeed) * accelerationDuration / 2;
    const impactAt = z <= rampDistance
      ? 2 * z / (baseSpeed + Math.sqrt(baseSpeed * baseSpeed + 2 * acceleration * z))
      : accelerationDuration + (z - rampDistance) / topSpeed;
    let lanes = [0, 1, 2];
    if (next - previousEnd < 60) {
      // In tighter gaps, don't drop onto the connecting free route. Players
      // still see more falls, while a required hop or lane change stays viable.
      const route = distance => {
        const row = obstacles.filter(obstacle => obstacle.z === distance);
        return [0, 1, 2].find(lane => !row.some(o => o.lane === lane))
          ?? row.find(o => o.type === 'rubble')?.lane;
      };
      const before = route(distances[index]), after = route(next);
      lanes = lanes.filter(lane => lane !== before && lane !== after);
    }
    events.push({
      id: `debris-${events.length}`, lane: lanes[Math.floor(random() * lanes.length)], z,
      warnAt: Math.max(0, impactAt - 2.4), fallAt: impactAt - .45, impactAt,
    });
  }
  return events;
}

export function getDebrisPhase(event, elapsed) {
  if (elapsed < event.warnAt) return 'waiting';
  if (elapsed < event.fallAt) return 'warning';
  if (elapsed < event.impactAt) return 'falling';
  return 'landed';
}

