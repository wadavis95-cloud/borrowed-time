# Changelog

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
