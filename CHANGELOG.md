# Changelog

## 6.0.0-preview.1 — Difficulty playtest (local, in progress)

- Closed the tunnel roof through the exit approach and increased sample-course roof falls from six to 13, preserving warnings and viable routes.
- Added a live multiplayer leaderboard with server-ranked positions, escaped/DNF results, rematch resets and final standings.
- Raised boost price from 3s to 6s and long jump from 2s to 4s for a stricter ability-budget playtest; effects stay the same.
- Restored the brighter pre-Unity V4 graphics as the default at the user's request. Retained V6 difficulty and ability UI; Unity remains available at `?graphics=unity`. Restore point: `pre-v4-visual-return-20261027`.

- Target a substantially harder run based on feedback that V5 felt about 3/10; the desired 7.5/10 needs player assessment.
- Increased the practice course from 15 rows / 20 obstacles to 25 rows / 56 obstacles, plus six ceiling-fall encounters.
- Blocked two lanes on ordinary rows, moved the open route between rows, and added repeated full-width encounters with a free-hop route.
- Tightened later encounter spacing while reserving separate spaces for readable ceiling falls.
- Updated demo navigation to recognize full-width hop routes and use the same rules as players.
- Preserved the V5 checkpoint, Unity motion, timer budget, running speed and ability prices. See [V6 playtest notes](docs/versions/V6_PLAYTEST.md).
- Added a one-click pre-run ability briefing, clearer ability benefits/prices, explicit survival-and-time-currency copy, and purchase feedback beside the clock. See [UI update notes](docs/versions/V6_UI_UPDATE.md).


## 5.0.0-preview.1 — Unity game integration (local)

V5 is complete as a local checkpoint, including the approved final running style in solo play, private multiplayer and the demo. Saved as `v5.0.0-preview.1`; the public deployment remains V4.

- Integrated the approved rear-camera runner, silhouette, run/jump/landing/lane animation and tunnel into solo practice and the real multiplayer game.
- Kept JavaScript rules, time purchases, HUD/input, audio, WebSocket snapshots and server authority. Unity consumes presentation data only.
- Replaced the study's scripted obstacles with the actual seeded course, shared-clock falling masonry, time pickups and a final exit.
- Added translucent public-movement opponents, four jacket palettes on the approved body, and local-only boost/hit effects.
- Added a compressed Unity Web build, streaming binary serving, load progress, and a retained classic renderer at `?graphics=classic`.
- Preserved the pre-integration source archive and Git bundle. The isolated Unity preview and public V4 deployment remain separate.

See [V5 release details](docs/versions/V5_RELEASE.md), [Unity guide](docs/UNITY_GUIDE.md), and [art credits](assets/unity/CREDITS.md).

### Running-style follow-up — 2026-10-27 (local)

- Reworked the Unity game's arm swings and stride into a continuous, stylized run with a slight forward lean.
- Removed sideways torso banking and turning during lane changes; the running cycle continues across lanes.
- Smoothed animation cadence and limited it during boosts; retained the rear camera and all race rules.
- Preserved a full source/build backup before editing. See the [motion update and verification record](docs/versions/V5_RUNNING_UPDATE.md).

## 4.0.0-preview.1 — Public friend playtest

- Deployed [Borrowed Time](https://borrowed-time.onrender.com) with public HTTPS and same-origin secure WebSockets, backed by the private GitHub repository.
- Added a single-instance Render Free Docker configuration and a reusable public HTTP/WebSocket smoke check.
- Fixed the Docker context to include the character preview and started Node directly so shutdown signals reach the server.
- Added phone safe-area padding, larger input text, touch controls independent of narrow screen width, and a compact landscape course/HUD arrangement.
- Documented physical-phone and friend playtesting. Deployment evidence and the remaining actual-device checks are recorded in the [V4 release record](docs/versions/V4_RELEASE.md).

### Included demo follow-up — independent strategies

- Replaced the demo's nearly simultaneous boosts with four different purchase plans so runners can pull ahead, fall out of view and catch up through normal gameplay.
- Preserved the authoritative race, ability prices, visibility limits, opening falling-debris encounter, rematches and cleanup. Only demo input choices change; human-player rules remain the same.
- Updated demo regressions to check separation and catch-up rather than requiring the runners to stay clustered.
- Browser verification completed a full four-player race without console errors; actual captures show the [early breakaway](docs/images/demo-boost-breakaway.png) and [later catch-up](docs/images/demo-boost-catchup.png).

## 3.1.0-preview.1 — Character and motion refinement

V3.1 refines presentation while retaining V3's rules, difficulty, timer, abilities, hazards and multiplayer protocol. See the [V3.1 design](docs/versions/V3_1_DESIGN.md) and [release record](docs/versions/V3_1_RELEASE.md) for measurements, verification and limitations. V3 remains available at `v3.0.0-preview.1`.

### Changed

- Refined all four original character assets: tapered limbs, shaped hands and boots, more distinct faces and hair, layered clothing, and clearer cloth/leather/metal materials. Their 24-bone rigs and four animation clips retain the existing asset interface.
- Smoothed visual boost transitions, lane and camera movement, landing reactions and finish poses; made pause and replay reset presentation state consistently. Opponent effects still reveal no private ability or timer information.
- Refined tunnel stonework, rails, pipes, railway details and daylight around the clock-tower exit, while keeping the three lanes and falling-debris warnings clear.
- Extended the developer character study with boost, quarter-speed playback and a frozen-pose view for reviewing animation.
- Updated the beginner guide to explain the asset-to-screen pipeline and the separation between game rules and presentation.

### Limitations

These remain original procedural GLBs, not Blender-authored production character art. Browser visual checks and resource counts do not establish performance on phones. Public deployment and physical-phone validation remain V4 work.

## 3.0.0-preview.1 — A faster, cleaner escape

V3 keeps solo practice and private 2–4-player races while updating the rules, presentation, character assets, and demo. See the [V3 design](docs/versions/V3_DESIGN.md) and [V3 release record](docs/versions/V3_RELEASE.md) for scope, actual verification, and limitations. V2 remains preserved at `v2.0.0-preview.1`.

### Added

- Optional sound toggle, muted initially, with local footsteps, ability and impact cues generated through the browser's Web Audio API.
- Four automatically assigned characters: Courier, Engineer, Station Guard, and Rooftop Runner. A room has no duplicate characters; character and color assignments survive rematches.
- Four original locally served GLB assets with 24-bone skins and idle, run, jump, and stumble clips. `npm run build:avatars` reproduces them from `scripts/build-avatars.mjs` using Node and Three.js.
- Asynchronous character preloading before play, with a visible reload/recovery state on asset or graphics failure. Avatar instances have independent rigs and materials while sharing cached geometry safely.
- A developer character study at `/docs/character-preview.html`, with no gameplay character-selection function.
- A one-click watch demo using four real WebSocket clients and explicitly labeled simulated runners. Ordinary inputs drive a normal authoritative room, including automatic starts, rematches, and cleanup of all clients on exit or failure.
- Focused coverage for acceleration and event boundaries, timed barrier clearance, four unique identities, asset loading/disposal, demo lifecycle, and demo playthroughs.

### Changed

- The gameplay HUD emphasizes time, ability prices/availability, movement controls, and hazard feedback. Distance, sectors, hits, spending totals, and elapsed-run statistics are absent from gameplay and results; internal measurements remain available to the rules.
- The starting clock remains 60 seconds. The internal course is 1,350m, base speed rises from 22 to 32m/s over 50 elapsed running seconds, and exact integration handles acceleration, boosts, stuns, collisions, time gates, and finishing consistently across update sizes.
- Ordinary encounters are spaced 72–89m apart. Time gates grant +5s at internal distances of 450m and 900m and appear as time pickups.
- Paid jumps reach a 3m apex and can clear tall barriers above the shared 2.2m clearance threshold, approximately 0.37–1.03s into a jump. Free hops peak at 1.15m and still clear small rubble. Local and opponent visuals use the same public jump-height function as barrier collisions.
- Falling masonry follows accelerated nominal arrival times, with a 2.4s warning lead and a 0.45s descent. Overhead impacts remain dangerous during either jump, and landed rubble can still be hopped.
- Characters, materials, run animation, tunnel variation, lighting, dust, impact feedback, and boost/camera presentation have received a further procedural art pass. Browser dependency and asset routes remain explicitly allowlisted.

### Limitations

The GLBs are original code-generated assets, not Blender-authored or artist-sculpted models. Final art refinement, physical-device testing, and broader graphics-performance validation remain. Private rooms are in memory, with no authentication, reconnect, persistence, or public deployment. Test totals, browser observations, and screenshots belong in the V3 release record.

## 2.0.0-preview.1 — Escape into daylight

The first playable V2 art pass, running locally or on a LAN. See [V2 design](docs/versions/V2_DESIGN.md) and [V2 release status](docs/versions/V2_RELEASE.md) for the agreed scope, verification record, and limitations. V1 remains preserved at tag `v1.0.0`.

### Added

- A genuine 3D Victorian railway tunnel with stone arches, rails, lamps, dust, and a daylight exit with a clock-tower skyline. Lighting changes with course distance.
- Original articulated Courier and Engineer avatars, with distinct silhouettes, clothing, running and jumping animation, and translucent opponent variants.
- Automatic avatar assignment and optional guest names. Four-player rooms remain supported, with repeated avatars distinguished by stable player colors; assignments survive rematches.
- Seeded falling masonry: a warning, visible fall, impact, and leftover rubble, scheduled against the shared elapsed race clock.
- Authoritative impact and rubble rules: impacts require moving out of the lane, landed rubble can be hopped, and one chunk cannot penalize the same player twice.
- Separate hazard and avatar metadata modules, procedural graphics modules, and coverage for hazard timing, assignments, snapshot privacy, and allowed browser assets.

### Changed

- Three.js 0.180.0 renders the scene through WebGL 2. Its two required browser modules are served locally through an explicit file allowlist.
- Plain JavaScript ES modules, Node.js, and `ws` remain the application stack, with no frontend framework or build step.
- The presentation has a graphics-unavailable state, bounded rendering resolution, and reduced-motion handling.
- The 60-second countdown, 900-meter course, ability prices, hit penalties, checkpoints, solo pause, and private room flow retain their existing rules.

### Limitations

The procedural models and environment are a playable starting point, not final concept-art fidelity. Physical mobile-device behavior and broad graphics performance have not been validated. There is no public deployment, authentication, reconnect, persistence, or character-selection menu. Actual verification outcomes belong in the V2 release record.

## 1.0.0 — Multiplayer foundation

Release verification is tracked in [V1 release notes](docs/versions/V1_RELEASE.md). No public deployment is claimed.

### Added

- Private 2–4-player rooms with guest names, room codes, host start, shared countdown, results, rematches, and host transfer.
- A Node WebSocket backend that owns multiplayer movement, purchases, collision rules, clocks, and finishing.
- Browser transport and snapshot interpolation.
- Real translucent opponent models without opponent timers, statistics, or ability effects.
- Room/protocol tests and a separate real HTTP/WebSocket integration-test command.
- Versioned design/release documentation and an expanded beginner guide.

### Changed

- Added the `ws` dependency; fresh setup now includes `npm install`.
- Node now hosts shared races in addition to serving frontend files.
- Multiplayer continues when a player changes tabs; solo practice retains pause behavior.

### Limitations

In-memory rooms, no authentication/reconnect/persistence, and no public hosting. Verification results remain in the release record.

## 0.1.0 — Solo prototype

- Three-lane escape runner using HTML, CSS, JavaScript modules, and Canvas 2D.
- Countdown currency, paid speed boost and long jump, obstacles, checkpoints, win/loss, pause, and restart.
- Repeatable seed-42 practice course, keyboard/touch controls, and responsive HUD.
- Dependency-free Node static server, game-rule tests, and introductory documentation.
