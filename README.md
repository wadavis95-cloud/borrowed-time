# Borrowed Time · V6 difficulty playtest

A browser escape runner for **solo practice or private races with 2–4 players**. Race through a crumbling Victorian railway tunnel, dodge falling masonry, and spend your remaining seconds on abilities. Real opponents appear as translucent 3D runners and cannot collide with you.

Version **6.0.0-preview.1** tests a much harder course following feedback that V5 felt about 3/10. The target is roughly 7.5/10, to be judged through playtesting. Most rows block two lanes, the open route moves, and occasional full-width rows require a hop or a paid long-jump alternative. Encounters tighten as the race progresses. See the [V6 playtest notes](docs/versions/V6_PLAYTEST.md).

V6 keeps V5's Unity visuals and approved running style across solo practice, private multiplayer races and the four-player demo. The completed V5 checkpoint is preserved as `v5.0.0-preview.1`. The public deployment remains V4. See the [Unity guide](docs/UNITY_GUIDE.md) and [V5 release record](docs/versions/V5_RELEASE.md).

**[Play the public V4 game](https://borrowed-time.onrender.com)** on your phone or computer. Create a room, send friends the same link and six-character room code, and start when 2–4 players have joined. No installation or account is needed. The free host can take about a minute to wake after inactivity. Physical-phone performance and touch feel still need actual-device testing.

## Run it

Install **Node.js 22 or newer**. In VS Code, choose **File → Open Folder**, open this project, then **Terminal → New Terminal**. Codex can use the same folder.

```sh
node --version
npm install
npm start
```

Open [http://localhost:4173](http://localhost:4173). Keep the terminal running; **Ctrl+C** stops the server. The game uses `ws` for server-side WebSockets and an exported Unity 6000.6.7f1 / URP 17.6 Web build for graphics. WebGL 2, WebAssembly and graphics acceleration are required. The compressed build is included under `assets/unity/v5`; playing it requires Node, not an installed Unity Editor. The server streams those files with the appropriate gzip and binary headers.

The app loads the Unity scene before enabling play and shows download progress. A failed asset load or unavailable graphics produces a recovery message and a **Reload game** button.

## Race or watch

1. Open the game in two browser windows or browsers.
2. Create a private room. A guest name is assigned automatically; entering your own is optional.
3. In the other browser, join using the six-character room code.
4. The host starts after at least two players join. A shared three-second countdown starts everyone on the same course.
5. Once every run ends, the host can prepare a rematch.

The server randomly assigns **Courier**, **Engineer**, **Station Guard**, and **Rooftop Runner** without duplicates in a room. Each player also receives a distinct color. Identities and colors stay with their players through rematches; all four use the same rules. The Unity integration currently uses one refined body and four jacket palettes. The previous four distinct models remain available with the classic renderer. There is no character-selection screen.

Choose **Watch four-player demo** to watch four explicitly labeled simulated runners. The demo opens four real WebSocket clients, joins a normal private room, and sends ordinary movement and purchase inputs. The displayed opponents come from server snapshots. It starts automatically, supports rematches, and closes every demo connection when you exit or a connection fails. Human private-room play remains available separately.

The runners use different boost plans: an early burst, a delayed chase, repeated sprints and a late push. Watch the field separate as someone spends time, then close again when another runner boosts. Rivals can fall behind the camera and return when they catch up; the demo never moves them artificially to keep them on screen.

For another device on the same trusted Wi-Fi network, start with:

```sh
HOST=0.0.0.0 npm start
```

Open `http://YOUR-COMPUTER-LAN-IP:4173` on each device and use the same room code. Replace the placeholder with the host computer's local IP. A room code works only on the same running server; `localhost` on another device points to that device. Firewall or Wi-Fi isolation settings may affect LAN access.

## Play

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Switch lanes | Left / Right arrows or A / D | Swipe sideways or movement buttons |
| Free hop | Space, Up arrow, or W | Tap the course, swipe up, or Hop |
| Speed boost | 1 | Speed boost button |
| Long jump | 2 | Long jump button |
| Pause / resume solo | P or Escape | Pause button |

Start with **60 seconds** and reach daylight before the clock runs out. Boost costs **3 seconds**, long jump costs **2**, hits cost **3**, and time pickups restore **5**. Hop small rubble, use a paid long jump for gaps or a well-timed barrier clearance, or change lanes. Jumping too early or too late can still hit a tall barrier.

The HUD emphasizes remaining time, ability prices and availability, movement controls, and hazard feedback. Gameplay and results omit distance, sectors, hit counts, spending totals, and elapsed-run statistics. The simulation keeps those measurements internally.

Sound starts muted. Use **Sound off / Sound on** in the header to toggle subtle procedural footsteps, jumps, landings, boosts, collisions, and an escape chime. Audio starts only after that click and stays silent in hidden tabs; no audio assets or service are downloaded.

Amber markers warn where masonry will land. Change lanes before impact: even a paid jump cannot protect you underneath a falling chunk. After landing, its rubble can be hopped. A chunk can penalize each runner only once; a hit also briefly slows you down.

Falling events follow elapsed race time. Buying an ability reduces your spendable countdown without changing the hazard schedule. Solo practice pauses when you leave the tab and repeats seed 42. Multiplayer keeps running when you switch tabs. Disconnecting ends your participation; this preview cannot reconnect you to an active race. Other players' timers and ability details remain private.

## Develop and learn

```sh
npm test              # Rules, hazards, rooms, interpolation, demo and asset tests
npm run test:network  # Real HTTP/WebSocket integration tests
npm run check         # JavaScript syntax
npm run dev           # Watch/restart the Node server
npm run build:avatars # Regenerate the four original GLB character assets
npm run check:deployment -- https://borrowed-time.onrender.com # Check the live service
```

Socket tests are skipped in the ordinary test command. Save browser files and refresh the page to see edits. `npm run dev` does not reload the browser. Restarting Node discards all rooms.

Internal tuning is a **1,350m course**, with base speed increasing from **22 to 32m/s over 50 elapsed running seconds**. An unobstructed, unboosted run reaches the exit at 50 seconds. V6 ordinary rows begin roughly 43–48m apart and tighten to about 31–36m; reserved 76–81m intervals contain their own ceiling-fall encounter. +5s time gates sit at 450m and 900m internally. These distances are developer tuning values, not player HUD readouts. The [project guide](docs/PROJECT_GUIDE.md) explains exact movement integration, shared jump height, and collision timing.

The current visual pipeline lives in the included `unity/` project. Its C# receiver accepts course and movement JSON from `src/unity-protocol.js`. The model is adapted from Blender Studio's Snow, with original wardrobe and procedural pose work. Read [art credits](assets/unity/CREDITS.md) and the [beginner Unity guide](docs/UNITY_GUIDE.md).

For comparison or a lightweight fallback, open [the classic renderer](http://localhost:4173/?graphics=classic). The original Three.js assets and `npm run build:avatars` pipeline are preserved. The isolated Unity preview also remains separate from this game build. Physical-phone performance of Unity needs actual-device testing; a desktop narrow viewport is not a phone benchmark.

The included `Dockerfile` packages the Node service and public assets. With Docker installed, use `docker build -t borrowed-time .` and `docker run --rm -p 4173:4173 borrowed-time`. The container defaults to port 4173 and honors the host's `PORT` environment variable. The live Render Free service uses one Docker instance in Virginia and `/health`, as recorded in `render.yaml`. It deploys from `main` in the private [GitHub repository](https://github.com/wadavis95-cloud/borrowed-time). Keep one instance because rooms live in memory; restarts or deploys end active rooms. An idle free service can take about a minute to wake.

Read the [Unity integration guide](docs/UNITY_GUIDE.md), [V5 release record](docs/versions/V5_RELEASE.md), [beginner project guide](docs/PROJECT_GUIDE.md), [V4 design](docs/versions/V4_DESIGN.md), [V4 release record](docs/versions/V4_RELEASE.md), and [changelog](CHANGELOG.md). [V3.1](docs/versions/V3_1_RELEASE.md), [V3](docs/versions/V3_RELEASE.md), [V2](docs/versions/V2_RELEASE.md) and [V1](docs/versions/V1_RELEASE.md) remain preserved in their release tags.
