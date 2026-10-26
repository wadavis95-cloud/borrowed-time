// A chunk lands in one lane, leaving the other two lanes open.
// Its clock is race time, never the runner's spendable time balance.
export function createFallingDebris(seed, obstacles, {
  baseSpeed = 22, topSpeed = 32, accelerationDuration = 50,
} = {}) {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  const random = () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const distances = [...new Set(obstacles.map(obstacle => obstacle.z))].sort((a, b) => a - b);
  const events = [];
  // Only every third gap gets a chunk. Stay clear of each ordinary encounter,
  // including the far edge of a gap, so encounters cannot block every lane.
  for (let index = 1; index < distances.length - 1; index += 3) {
    const previousEnd = Math.max(...obstacles.filter(obstacle => obstacle.z === distances[index])
      .map(obstacle => obstacle.z + (obstacle.length ?? 2)));
    const next = distances[index + 1];
    if (next - previousEnd < 60) continue;
    const z = (previousEnd + next) / 2;
    const acceleration = (topSpeed - baseSpeed) / accelerationDuration;
    const rampDistance = (baseSpeed + topSpeed) * accelerationDuration / 2;
    const impactAt = z <= rampDistance
      ? 2 * z / (baseSpeed + Math.sqrt(baseSpeed * baseSpeed + 2 * acceleration * z))
      : accelerationDuration + (z - rampDistance) / topSpeed;
    events.push({
      id: `debris-${events.length}`, lane: Math.floor(random() * 3), z,
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

