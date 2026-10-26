# Borrowed Time: understand V1 end to end

The game asks one question: **does buying an advantage save more time than it costs?** You run forward automatically, choose a lane, and spend countdown seconds on boosts or long jumps. V1 adds private races with real people while preserving solo practice.

The building collapse is a visual setting and countdown, not a structural physics simulation. The multiplayer implementation is local/LAN; public hosting is still outstanding.

## Start in your editor

In VS Code, choose **File → Open Folder**, select this project, and choose **Terminal → New Terminal**. Codex can edit and run the same files.

```sh
node --version
npm install
npm start
```

Use Node 22 or newer, then open `http://localhost:4173`. Stop the server with **Ctrl+C**. `npm` comes with Node and runs the shortcuts in `package.json`. Unlike the original solo prototype, V1 installs the `ws` package.

Save edits and refresh the browser. `npm run dev` restarts watched server code but does not refresh the browser. `PORT=4174 npm start` selects a different port. See the [README](../README.md) for two-player and LAN setup.

## What each technology contributes

A framework supplies a predefined application structure. This project uses platform features directly, making the whole program small enough to trace.

| Technology | Responsibility | Why it fits |
| --- | --- | --- |
| HTML + CSS | Controls, status panels, layout, styling | Standard browser UI around the scene. |
| JavaScript ES modules | Imports, rules, inputs, coordination | Explicit file boundaries, no compilation step. |
| Canvas 2D | Corridor, runner, obstacles, transparent opponents | A compact animated scene without an external game engine. |
| Node.js | File serving, multiplayer simulation, tests | Runs JavaScript outside the browser and reuses the rules. |
| `ws` | Server-side WebSocket connections | One small networking dependency; browsers already have a WebSocket API. |

**HTTP** delivers the page and its files in request/response exchanges. **WebSocket** keeps a connection open so input and state updates can travel both ways during a race. Both use the same Node server; the WebSocket endpoint is `/race`.

The frontend is what runs in each browser. The backend is the shared Node process. Solo rules run locally in the browser; multiplayer rules run on the backend. Merely editing your browser's timer cannot give your server-owned racer more time.

## A useful code-reading order

| File | What to look for |
| --- | --- |
| `src/game.js` | State, tuning constants, ability purchases, movement, collisions, finishing. |
| `src/main.js` | Keyboard/touch handling, solo versus multiplayer flow, HUD updates. |
| `src/renderer.js` | Projection, drawing, and other runners' transparent models. |
| `src/network.js` | WebSocket messages, connection state, interpolation between snapshots. |
| `src/server/rooms.js` | Membership, host, countdown, authoritative races, results. |
| `src/server/app.js` | HTTP serving, WebSocket connections, simulation and broadcast scheduling. |
| `server.js` | Starts the service using `HOST` and `PORT`. |
| `index.html`, `styles.css` | Page structure, controls, styling. |
| `tests/game.test.js`, `tests/server.test.js`, `tests/network.test.js` | Executable examples of game rules, rooms, sockets, and browser interpolation. |

The HUD, or heads-up display, is your timer, distance, and ability status. It displays state; it does not decide what a purchase costs.

## Follow one purchase through the system

In solo, pressing **1** reaches `main.js`, which asks `buyAbility` in `game.js` to buy a boost. In multiplayer, the browser instead sends an intention such as:

```js
{ type: 'input', action: 'boost', seq: 7, roundId: '…' }
```

The server identifies the player from the connection, validates the round and sequence number, and calls the same rules. On an accepted purchase:

```js
game.timeLeft -= ability.cost;
game.timeSpent += ability.cost;
```

It activates the boost and cooldown, then sends an updated snapshot. The browser updates your HUD and draws the world.

```text
Your button → browser input → WebSocket → server validation
             → game rules → updated state → snapshot
             → browser HUD and Canvas drawing
```

This is **server authority**: clients request actions; the server decides their effects. Clients do not submit trusted balances, positions, winners, or another player's identity. Old round IDs and repeated sequence numbers are rejected. Authority is a useful foundation, not a claim that all possible cheating is solved.

A **snapshot** is a message describing current state. Your own snapshot includes your race details. Opponent data contains only identity, connection/phase information, and motion needed for rendering—not their timers, spending, boost flags, or jump type. Their visible motion can still reveal that they are moving faster or jumping.

## State, time, and collisions

A run's state is a plain object: phase, lane, distance, remaining time, effects, obstacles, and statistics. Game phases are `ready`, `running`, `paused`, `won`, and `lost`. Multiplayer room phases separately track `lobby`, `countdown`, `racing`, and `finished`.

The simulation advances in fixed 1/60-second steps. Solo uses a browser accumulator; multiplayer uses the server's loop. The browser draws at its display's animation rate. Inside `updateGame`, steps split at important events so a collision or expired effect is handled at its crossing time.

```js
game.elapsed += step;
game.distance += game.speed * step;
game.timeLeft = Math.max(0, game.timeLeft - step);
```

These lines mean elapsed time rises, distance equals speed multiplied by time, and the countdown never becomes negative.

| Rule | Current value |
| --- | --- |
| Start / finish | 60 seconds; exit at 900 meters; base speed 18 meters/second. |
| Free hop | 0.65 seconds; clears rubble. |
| Boost | Costs 3 seconds; 1.85× speed for 4 seconds; 7-second cooldown from activation. |
| Long jump | Costs 2 seconds; lasts 1.4 seconds; clears rubble and gaps. |
| Collision | Costs 3 seconds; speed becomes 45% for 0.8 seconds. |
| Checkpoints | +5 seconds at 300 and 600 meters. |

Purchases require strictly more time than their price. A long jump can upgrade a normal hop but cannot extend an active long jump. `timeSpent` records purchases, not countdown or collision losses.

An obstacle resolves once when you reach its distance. Its lane and your jump determine the outcome. Tall barriers require a lane change. A gap checks for a long jump at its front edge; V1 does not simulate continuous flight across its full length. Missing a gap applies the normal penalty. Reach the exit to win your run; running out of time first loses. Reaching the exit exactly as time expires counts as escaping.

Solo restart uses seed 42. A seed makes generated randomness repeatable. Multiplayer gives everyone the same round seed, then chooses a new seed for a rematch. Every encounter leaves at least one lane clear.

## Rooms and visible opponents

A guest creates a room and shares its six-character code. Up to four people join; the host needs at least two to start. A shared three-second countdown precedes the race. Mid-round joins are rejected. Players finish individually, and the room finishes after all runs end; the earliest successful finish determines the winner. If everyone fails, there is no winner.

The host can then prepare a rematch. Leaving transfers host ownership to another connected player. A disconnected racer is marked out, removed from drawing, and cannot resume that run. Other racers continue. Switching away from the tab pauses solo practice only.

The server simulates at 60 steps per second and broadcasts at 20 updates per second. **Interpolation** blends neighboring snapshots to smooth motion between messages. That adds a small display delay; it does not grant the client authority.

Opponent ghosts are actual connected racers at relative positions. They have no collision, statistics overlay, or ability effects. A racer who falls behind your camera disappears naturally. There is no rubber-banding to keep them visible.

The scene is **pseudo-3D**. Canvas draws 2D shapes smaller as their distance increases:

```js
const scale = 1 / (1 + Math.max(-8, z) / 44);
```

Near shapes cover far shapes; motion toward the camera creates depth. The renderer visualizes state without changing the rules.

## Ask the system-design questions first

These are the kinds of scope and scale questions used in an Alex Xu-style system-design discussion; the answers below describe this project, not a forecast.

| Question | V1 answer |
| --- | --- |
| Who uses it, and how many use it now? | Known use is development/playtesting. Production users and measured demand are unknown. |
| What must work? | Private 2–4-player rooms, a shared course/start, fair purchases, visible opponents, results, and leaving. |
| What matters besides features? | Consistent authoritative rules, responsive motion, private opponent statistics, bounded resource use. |
| What can wait? | Accounts, matchmaking, reconnects, saved leaderboards, chat, and multiple server processes. |
| Where does data live? | In one process's memory. Restarting Node loses rooms and results. |

| Horizon | Illustrative monthly players | Illustrative peak connected players |
| --- | ---: | ---: |
| 3 months | 100 | 20 |
| 6 months | 1,000 | 100 |
| 12 months | 10,000 | 500 |

These are planning scenarios, not predictions or tested capacity. V1 permits at most 25 rooms and 128 connections; raising a limit is not proof of capacity. Empty rooms disappear immediately; idle lobbies and finished rooms expire after five minutes. Measure latency, CPU, memory, event-loop delay, and network traffic before changing architecture. At larger measured demand, keep each room on one server and route clients to that server. Add a database when saved results become a feature. Public hosting also needs a WebSocket-capable service and HTTPS/WSS; a local URL is not a submission URL.

## Learn through small changes

1. **Understand:** change a boost price in `ABILITIES`, predict its effect, and compare solo runs on the same seed.
2. **Improve:** change `CONFIG.encounterSpacing` or add a small rule, update its tests, and explain the result. Three lanes are assumed in several places; `laneCount` alone cannot redesign the course.
3. **Operate:** verify two real clients, measure latency, then deploy on a chosen host and document the actual limits.

Use `npm test` for rules and rooms, `npm run test:network` for real HTTP/WebSocket integration, and `npm run check` for syntax. Socket tests are skipped in the ordinary test command. Browser playtesting still matters for controls and visual clarity. Keep documentation and initial HTML fallback text aligned with configuration changes.

Explain these before presenting the project: Why separate rules from drawing? Why fixed steps? What does a sequence number prevent? Why is your opponent's private timer absent? What disappears after a server restart? How would you measure whether one server is enough?

Résumé draft, once verified and understood:

> Built an AI-assisted JavaScript/Canvas multiplayer game with server-authoritative WebSocket rooms, timer-based ability purchases, and automated rule/network tests.

Adjust the wording to your own contribution and demonstrated verification. Only claim public deployment, user counts, or production scale once those exist.
