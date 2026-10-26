# V2 preview — Into the Light

**Version:** `2.0.0-preview.1` · **Verified:** October 26, 2026

This is the first playable V2 build: original procedural 3D art, the existing multiplayer race, and falling masonry with authoritative collision rules. It runs locally; there is no public deployment. V1 remains available at Git tag `v1.0.0`. V2 development is on `codex/v2-tunnel-escape`.

## What changed

- Three.js replaces the Canvas 2D renderer. The tunnel has stone arches, rails, ironwork, lamps, shadows, dust, a daylight exit, and a clock-tower vista. Lighting follows course distance.
- Courier and Engineer have different builds, hair, clothing, and articulated animations. Avatars are assigned automatically. Four-player races remain supported with repeated avatars and distinct colors; rematches preserve those assignments.
- Falling stone shows a landing warning, descends, impacts, and remains as jumpable rubble. The warning begins 2.4 seconds before impact, including a 0.6-second fall. Impact within two course meters costs three seconds and slows the runner, even during a jump. The same chunk cannot penalize one player twice.
- All racers share a seeded debris schedule and simulated race clock. Spending time does not change the schedule. Browsers interpolate the clock alongside player positions.
- Guest names are optional. Existing keyboard, pointer/swipe and movement-button controls remain available. Opponents stay transparent and their timers and purchases remain private.
- Three.js is pinned to `0.180.0` and served locally through two explicit public routes. There is no CDN dependency or frontend build step.

The three lanes, 900m finish, ability prices, checkpoint bonuses, Node/ws backend, and room flow continue from V1. No accounts, matchmaking, new abilities, or character-selection screen were added.

## Verification record

| Check | Observed result |
| --- | --- |
| `npm test` | 54 passed; six socket/HTTP checks intentionally skipped in this command. |
| `npm run test:network` | 24 passed, none skipped. Includes the six integration checks plus 18 repeated room tests: **60 distinct tests passed across both commands**. |
| `npm run check` | All 11 application modules passed syntax checks. |
| `git diff --check` | No whitespace errors. |
| Debris behavior | Automated warning/impact boundaries, jumping landed rubble, single-hit resolution, pause, fatal hits, checkpoint ordering, and large/small update equivalence. |
| Real four-client sockets | Shared start and clock, four unique player colors, two balanced avatar designs, and stable identities through rematches. |
| Actual browser graphics | Both avatars, dark tunnel, sunlit approach, warning ring, falling stone, and remaining rubble rendered. No warnings/errors appeared in checked normal-play console logs. |
| Solo playthrough | Reached 900m: 50.9s run, two hits, no purchases, 13.1s remaining. Separately exercised lane changes, pause/resume, boost, and long jump. |
| Falling impact in browser | Deliberately stood under the first seed-42 chunk; observed `Falling masonry · −3s` and one recorded hit. |
| Two-browser race | Live transparent rival, online movement and paid abilities, results, and a second countdown after rematch. Assigned Courier/Engineer remained stable. |
| Narrow layout | Checked a 390×844 browser viewport; no horizontal overflow. Movement, hop and boost buttons operated while the scene stayed visible. This is desktop browser resizing, not a physical-phone test. |
| Independent code review | Reviewed simulation, assignments, privacy, interpolation, and app/renderer integration. Fixed missing propagation of reduced-motion preference to avatars. |

Screenshots are actual running-game captures, not concept art:

- [Multiplayer avatars](../images/v2-multiplayer.png)
- [Falling stone](../images/v2-falling-stone.png)
- [Daylight approach](../images/v2-daylight.png)
- [Narrow controls](../images/v2-mobile.png)

## Run and understand it

```sh
npm install
npm start
```

Open `http://localhost:4173`. If a V1 server is already running, stop it first: its in-memory HTTP allowlist will not know the new asset routes until restarted. For friends on the same trusted LAN, follow the README's `HOST=0.0.0.0` instructions. Room codes work only on the same server and port.

Read the [beginner guide](../PROJECT_GUIDE.md) for the stack and data flow, or the [V2 design](V2_DESIGN.md) for scope and contracts. Start new graphics exploration in `src/renderer.js`, then `src/graphics/tunnel.js` and `src/graphics/avatars.js`. Hazard scheduling lives in `src/hazards.js`; collision decisions remain in `src/game.js`.

## Limits of this preview

The geometry and animations are a first procedural art pass. They are not finished production character assets or a match for the detail of the approved concept images. The collapse is staged scenery and timed hazards, not structural physics.

WebGL 2 is required. Resolution is capped and repeated architecture is instanced, but no measured performance budget, physical phone, Safari/device matrix, or thermal/battery test has been completed. The graphics recovery message is implemented; forced context-loss and unsupported-WebGL scenarios were not browser-tested. Reduced motion is passed through in code; OS-level preference switching was not exercised.

Rooms and results live in one Node process. There are no accounts, reconnects, persistence, public hosting, or measured production capacity. LAN access and the existing Docker recipe were not revalidated on another device in this pass. Gaps retain V1's front-edge jump check. These are explicit follow-up areas, not additional V2 features promised by this build.
