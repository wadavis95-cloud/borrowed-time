# V8.1 · Obstacle readability and movement feedback

Local playtest, October 27, 2026. **Not pushed or deployed.** Public V8 remains runtime `8f9552f43f276c75e2d55c6c155ca500e4b6f2c8`.

## Try it

Open http://localhost:4173/ and refresh an older local tab. Select any map, then Play solo or Watch demo. The existing A/D, W/up, Q and E controls remain. Boost costs 5 seconds, Long jump costs 4.

What to judge:
- Can you distinguish a low obstacle from a tall barrier early enough, particularly against snow or sand?
- Do the near/far edges make a gap's extent clear?
- Do impact warnings clearly communicate where to dodge and how soon the object will arrive?
- Do takeoff, landing, running and hit recovery feel more connected to the surface without distracting effects?

## What changed

All six maps retain their themed obstacle models. Low obstacles receive a dark contrast backing and one white chevron. Tall obstacles receive two amber chevrons. Gaps retain their map's interior color but get a dark depth silhouette, clear near/far rims and a double-chevron approach cue. The markers are visual aids, not collision objects or mandatory route instructions: switching lanes remains an alternative.

Timed impacts use an outlined ground marker and a shrinking countdown ring driven by the existing warning/impact times. The marked lane still needs to be dodged before impact; no jump grants protection. After landing, the wreckage has the low-obstacle cue. Reduced motion disables pulsing and optional particles while keeping the warning information readable.

The local runner gets a bounded 48-particle contact pool: restrained takeoff, footstep, landing and hit bursts, colored to suit stone, wood, jungle soil, ice, station surfaces or sand. A small landing ripple and contact-shadow response reinforce ground contact. Existing optional sounds remain unchanged. No effects are generated from opponents' private boost/hit state.

The forward running style and original jump arc remain. Additional procedural lane banking is removed from torso/head orientation; flexible equipment may still trail movement, and the authored gait's small natural motion remains. Landing compression is slightly stronger. High-frequency hit camera shake is removed; the camera's existing position, field of view and lane/jump following are retained.

## Gameplay unchanged

Compared with the saved V8 baseline, these files are byte-for-byte unchanged:

- `src/game.js` — physics, speed, prices, jumps, collisions, penalties and bonuses.
- `src/hazards.js` — placement, warning schedules and approach-triggered timing.
- `src/server/rooms.js` — voting, authority, players and race order.
- `src/network.js`, `src/demo.js`, `src/maps.js`, `src/audio.js`.

No new assets, libraries, map content, difficulty changes or additional abilities. Static serving only adds the three presentation modules to the existing allowlist.

## Code overview

- `src/graphics/readability.js`: original chevron geometry, contrast/depth cues and a read-only warning presentation calculation.
- `src/movement-feedback.js`: read-only local event detector for takeoff, contact, steps and hits. Suppresses stale/rewound states and respects pause/reset/reduced motion.
- `src/graphics/motion-effects.js`: one reusable local particle/ripple pool, released on renderer disposal.
- `src/renderer.js`: integrates cues and local feedback; authoritative positions, heights and hazard times remain untouched.
- `src/graphics/avatars.js`: keeps forward torso posture and refines existing landing compression.

## Backup

V8 baseline including its verification docs: `60566eb61e94b90bae8bc9b56d211a7f8eb135a8`. A complete-history bundle was created and verified before edits at `backups/pre-v8.1-polish-20261027.bundle`. Existing V8/V7/V6 checkpoints and backups remain available. Work is on `codex/v8.1-local-polish`.

## Verification

- Syntax and whitespace checks passed.
- 130 unit tests passed; the default run skips 11 real-network tests.
- 37 real HTTP/WebSocket checks passed, including all six maps.
- Local release checker passed all 60 assets, movement, private purchases, shared hazards, countdown, standings and cleanup.
- New checks cover cue categories, state immutability, warning timing, the bounded effect pool, pause/reset/reduced motion and forward posture during lane switches.
- Independent review found an occluded gap-rim issue on ship/jungle; the fix positions cue strips above existing art. A vertical raycast regression verifies both boundaries remain exposed on all five themed obstacle factories.
- Browser controls and both purchased abilities tested on all six maps, with 5s/4s deductions unchanged and zero console errors. Four-player snow demo completed with all four racers escaped; ship demo inspected after the gap fix.
- 390×844 responsive check passed without horizontal overflow. This is a browser-size check, not a physical touch-device or audio-quality assessment.

Screenshots are in `docs/images/v81-*.png`. No production requests, pushes or deployment were used for this playtest.
