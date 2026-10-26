# Changelog

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
