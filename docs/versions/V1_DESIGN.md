# Version 1 — multiplayer foundation

Date: October 25, 2026. Status: implemented; local verification is recorded in [V1 release notes](V1_RELEASE.md).

## Intent and scope

Turn the solo runner into an end-to-end multiplayer learning project. Preserve the current graphics and lane-switching/time-purchase mechanics. Render real opponents as translucent character models in their relative positions, with no opponent timers, stats, or ability effects. Ghosts cannot collide with players. A runner who falls behind the camera naturally leaves view; no artificial rubber-banding or fake opponents.

V1 includes solo practice; private room creation and six-character codes; 2–4 players; guest names; host start; a shared three-second countdown and course; server-owned movement, collisions, purchases, timers, and finishing; other-runner interpolation; a finish/result state; host rematch after all runs end; leaving and host transfer; explicit disconnected state; automated room/network tests; and a versioned beginner guide. A closed multiplayer tab does not pause the shared race.

V1 excludes accounts, persistent leaderboards, matchmaking, payment, chat, simulated structural destruction, and an art overhaul. Local and LAN operation plus deployable server configuration are in scope. A public hosted release requires a selected hosting account; a local URL is not a competition submission URL.

## Architecture and choices

Retain browser JavaScript modules, HTML, CSS, and Canvas 2D. Retain Node.js >=22. Add the `ws` package for server-side WebSockets; the browser uses its built-in WebSocket API. Reuse `src/game.js` on the server. A single Node process serves the frontend, hosts rooms in memory, runs simulations at 60 fixed steps per simulated second, and broadcasts snapshots at 20Hz. Graphics update at the browser's animation rate with short interpolation between snapshots. Clients send button intentions, never positions or balances.

Alternatives considered: HTTP polling is simpler to transport but adds repeated requests and delay to a race; a hosted realtime database adds services without replacing authoritative game simulation; a small WebSocket server fits the existing stack and makes the whole path inspectable. The WebSocket choice is an implementation assumption, based on the user's request to build iteratively.

Room state is intentionally ephemeral. Restarting the process loses rooms. Disconnected racers are marked out and removed from rendering; the remaining race continues. Rejoining an active race is deferred. Host ownership transfers to another connected player. Rematches are allowed only after the round ends. Limit four players per room, 25 rooms, 128 connections; cleanup empty/stale rooms. These are safeguards, not verified capacity claims.

## Protocol contract

Connect to `/race` using ws locally or wss under HTTPS. Server creates a connection-owned ID. Browser messages:

- `{type:'create',name}` / `{type:'join',code,name}`
- `{type:'start'}` / `{type:'rematch'}` / `{type:'leave'}`
- `{type:'input',action:'left'|'right'|'jump'|'boost'|'longJump',seq,roundId}`

Responses: `{type:'connected',version}`, `{type:'left'}`, `{type:'error',message,code}`, and `{type:'snapshot',serverTime,room,you,players}`.

`room`: `{code,phase:'lobby'|'countdown'|'racing'|'finished',hostId,roundId,seed,countdown,winnerId}`. `you`: `{id,name,game}`. Own `game` includes the existing game's state except obstacles; the browser regenerates the shared course from `room.seed`. `players`: `[{id,name,color,connected,phase,lane,distance,jumpRemaining,jumpDuration}]`. No other-player time, costs, boost status, or jump type is sent. Coarse jump motion is enough for the ghost model. Results may identify the winner without exposing private race details.

Messages are size/rate limited. Reject invalid actions, stale round IDs, repeated sequence numbers, non-host start/rematch, full-room joins, and joins mid-race. Handle heartbeat, socket errors, and slow-client backpressure. Guest names are rendered with textContent. Use a fixed allowlist for static public files.

## Users and scale: assumptions to revisit

Current measured user count: unknown; there is no production analytics or registered-user database. Known use is development/playtesting. Concurrent players matter more to this design than total registrations.

| Planning horizon | Illustrative monthly players | Peak connected players | Action |
| --- | ---: | ---: | --- |
| V1 playtest | Invite-only small group | 2–4 per room | Prove a shared race and measure latency |
| 3 months | 100 | 20 | One server, health checks, measure actual demand |
| 6 months | 1,000 | 100 | Load-test target; inspect CPU, memory, event-loop delay and network |
| 12 months | 10,000 | 500 | Reassess room routing and multiple server processes |

These numbers are design scenarios, not company forecasts or measured capacity. Plan for room-level partitioning if needed. Add a database for saved results only when that feature is requested. Redis could later help find which server owns a room; it is not needed for today's single-process version. Hosted TLS, process restart, and logs can be provided by a WebSocket-capable host such as Render. Provider availability and costs must be checked when selecting a deployment.

## Acceptance

Two independent browsers join the same room, see a synchronized countdown, move independently, see each other as translucent models, spend only their own time, and reach server-owned results. Refresh/disconnect must not pause or crash the other player's race. Invalid input cannot change another player or create free abilities. Solo practice still works. All checks and limits, including lack of public hosting, are recorded in the V1 release notes.

References: [ws documentation](https://github.com/websockets/ws), [Node HTTP](https://nodejs.org/api/http.html), [Render WebSocket hosting](https://render.com/docs/websocket).
