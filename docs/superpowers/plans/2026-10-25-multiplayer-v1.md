# Multiplayer Version 1 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the implementation workflow. Independent renderer and backend work can be delegated under the current user request.

**Goal:** Run a real room-based race with translucent opponents and beginner-readable version documentation.

**Architecture:** Single Node HTTP/WebSocket process owns room simulations. Browser renders private player state and interpolated public opponent transforms. Keep solo practice.

**Tech Stack:** JavaScript ES modules, Canvas 2D, Node >=22, ws, node:test.

**Spec:** `docs/versions/V1_DESIGN.md`

## Global constraints

- Four players maximum per room, at least two to start, three-second shared countdown.
- Opponent models only: no stats, ability effects, collisions, or invented rivals.
- Preserve current art and `src/game.js` gameplay.
- No persistence or production-scale claims. Version documentation distinguishes local operation from public deployment.

## Review focus

- A disconnect or hidden browser cannot freeze another racer; backend test and two-browser test.
- Inputs from old rounds, invalid or duplicate messages cannot spend/reset state; room tests.
- Only room host starts/rematches, and only after valid phase/player count; room tests.
- Client can lose connection during countdown/race/result and recover to playable UI; manual checks.
- Each snapshot reveals full state only to its owning connection; network/privacy assertion.

## Tasks

- [x] Backend: own `src/server/rooms.js`, `src/server/app.js`, `server.js`, and `tests/server.test.js`. Write failing tests for create/join limits, start/countdown, authoritative input and purchases, isolation, no opponent stats, disconnect, host transfer, rematch, cleanup. Implement the spec's JSON protocol. Export `createGameServer()` for ephemeral-port network integration tests, returning `{server,close}`; close cleans timers/sockets. Run `npm test`.
- [x] Renderer: extend `createRenderer().draw(state,animationTime,dt,opponents=[])` in `src/renderer.js`, consuming opponent objects from the protocol. Position models by opponent distance minus local distance; use existing model shapes with translucent color, no effect indicators. Integrate with depth order and hide disconnected/finished/out-of-view players. Reset interpolation cache with renderer.reset(). Inspect browser output.
- [x] Client/UI: create `src/network.js` for socket lifecycle and interpolation. Extend `src/main.js`, HTML and CSS with lobby/create/join/start/rematch/leave flows. Browser inputs go to server in multiplayer and existing engine in solo. Render server snapshots and own HUD, freeze feedback upon disconnect, protect against stale socket events. Manually verify two independent clients.
- [x] Release: update package to1.0.0, install locked ws dependency, add deployment configuration, README, V1 notes, changelog, and update learning guide explaining frontend/backend authority and growth assumptions. Run tests/checks, network integration, browser controls and responsive checks. Preserve evidence and clearly report deployment status.

Execution proceeds under the user's explicit request to build the backend iteratively; no additional design-approval round is needed.

## Execution and verification record

- Implemented all four tasks in the existing local project; no repository commit or public deployment was requested.
- Frontend/backend protocol and renderer draw signature matched the documented contracts. Interpolation lives entirely in `src/network.js`; no separate race-view module is needed.
- Independent review completed. Fixed ended ghosts with a failing-then-passing regression test; fixed ordinary unavailable-move feedback to use a temporary toast and checked it in the browser.
- Final tests: 35 passed with 4 intentional socket skips; network suite 18/18 passed, covering those four socket cases plus 14 repeated room cases. Syntax checks passed. Total unique tests: 39.
- Browser checks: two real connections, countdown, independent lanes and purchases, ghost visibility, results, rematch, host departure, continued race, disconnect recovery, solo purchase/pause, mobile viewport/buttons.
- Local server remains available on port 4173. Physical-device LAN, Docker image build, public deployment, and capacity benchmarking remain unverified; these limits are explicit in release notes.
