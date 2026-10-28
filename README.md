# Borrowed Time · V8.4 polished six-map release

**V8.8 local playtest:** Long jump now has a shorter/lower arc and a brief 1.9× forward burst, with a forward-reaching pose. Still costs 4 seconds; Boost remains 5 seconds. Try it at http://localhost:4173/. [Forward-leap tuning](docs/versions/V8_8_FORWARD_LEAP.md). Not deployed or submitted; public V8.4 is unchanged.

**V8.7 local preview:** optional map-specific character portraits/choice and first-place session totals are ready at http://localhost:4173/. All characters have identical stats. Totals show in lobby/results; the cover now says solo + multiplayer, 1–4 players. [Character/session notes](docs/versions/V8_7_CHARACTERS_SESSION.md). Public V8.4 is unchanged; nothing submitted.

**V8.6 local preview:** solo now races three computer opponents on all six maps. Choose **Race computers** at http://localhost:4173/. CPU role labels, (you), live standings/results, whole-race pause and immediate replay are included. No server connection is needed for the solo race. [Solo racer notes](docs/versions/V8_6_SOLO_RIVALS.md). Public V8.4 and unsubmitted presentation drafts are unchanged.

**V8.5 local preview:** stable multiplayer starting lanes and immediate first-snapshot placement remove the opening lane shuffle. A cover, silent gameplay video and submission-description draft are in [artifacts/submission](artifacts/submission/SUBMISSION_DRAFT.md). Nothing submitted or deployed; the public link remains V8.4.

**V8.4 phone playtest:** clearer obstacle and movement feedback, confirmed ability debits, countdown/result polish, map-specific sound and atmosphere, rescue destinations, visible “(you)” labels and better loading/join recovery. Boost remains 5 seconds and Long jump 4 seconds. [Public release record](docs/versions/V8_4_PUBLIC_PLAYTEST.md).

Six escape maps for solo practice and private races with 2–4 players: **Tunnel Escape, The Last Voyage, Volcanic Jungle, Frozen Summit, Orbital Escape, and Sandstorm Canyon**. Pick a thumbnail or vote with friends in the lobby. Your character defaults automatically from the map's four-person cast; the local V8.7 preview also offers an optional cosmetic choice.

Your countdown is also your ability budget. Spend five seconds on Boost or four on Long jump, dodge danger, and escape before zero. All maps retain the same behind-runner camera, controls, pace and prices. Real opponents appear as translucent runners at their actual relative positions.

**[Play Borrowed Time](https://borrowed-time.onrender.com)** on a phone or computer. No account or installation. A sleeping free host may take about a minute to wake. First play preloads the 24 characters (about 9.9 MB compressed); actual phone loading time and frame rate need playtesting. [V8 release and verification](docs/versions/V8_SIX_MAPS.md). Earlier versions are preserved in Git and verified backup bundles.

## Run it

Install **Node.js 22 or newer**. In VS Code, choose **File → Open Folder**, open this project, then **Terminal → New Terminal**. Codex can use the same folder.

```sh
node --version
npm install
npm start
```

Open [http://localhost:4173](http://localhost:4173). Keep the terminal running; **Ctrl+C** stops the server. The game uses `ws` for server-side WebSockets and Three.js with twenty-four original GLB characters for graphics. WebGL 2 and graphics acceleration are required. The old Unity tunnel study remains archived under `assets/unity/v5`; its comparison renderer does not implement the six-map release.

The app preloads the characters before enabling play. A failed asset load or unavailable graphics produces a recovery message and a **Reload game** button.

## Race or watch

1. Open the game in two browser windows or browsers.
2. Choose a map and create a private room. Your role name is assigned automatically.
3. In the other browser, join using the six-character room code.
4. Vote using the thumbnail cards. Most votes wins, ties are random, and the host starts after at least two players join. Voting locks at the shared three-second countdown.
5. Once every run ends, the host can prepare a rematch.

Each map has four distinct characters, named by role: Captain, Courier, Botanist, and so on. All use identical rules. Local V8.7 offers optional map-only character choices and honors the winning map's remembered preference. Automatic defaults remain available, duplicate explicit choices use different player colors, and rematches preserve identities and session wins. There is no name-entry step.

Choose **Watch four-player demo** to watch four simulated runners with role names. The demo opens four real WebSocket clients, joins a normal private room, and sends ordinary movement and purchase inputs. The displayed opponents come from server snapshots. It starts automatically, supports rematches, and closes every demo connection when you exit or a connection fails. Human private-room play remains available separately.

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
| Free hop | W or Up arrow | Tap the course, swipe up, or Hop |
| Speed boost | Q (or 1) | Speed boost button |
| Long jump | E (or 2) | Long jump button |
| Pause / resume solo | P or Escape | Pause button |

Start with **60 seconds** and reach the escape point before the clock runs out. Boost costs **5 seconds**, long jump costs **4**, hits cost **3**, and time pickups restore **5**. Hop small rubble, use a paid long jump for gaps or a well-timed barrier clearance, or change lanes. Jumping too early or too late can still hit a tall barrier.

Fresh solo runs and restarts randomize obstacle and roof-debris placements. Multiplayer races share one fresh server-generated course.

Controls adapt to keyboard/mouse or touch input, including hybrid devices. Keyboard uses A/D, W, Q and E; Space does not hop. The HUD emphasizes remaining time, ability prices and availability, movement controls, and hazard feedback. Gameplay and results omit distance, sectors, hit counts, spending totals, and elapsed-run statistics. The simulation keeps those measurements internally.

Sound is enabled by default and starts after the first click, tap or key press. Use the speaker icon in the header to mute or enable it. Only your runner’s hops, landings, Boost, Long jump, collisions and finish cues are audible; footsteps and other racers’ action/hazard sounds are removed. Each map has a quiet original background motif and ambience that softens during abilities and low time. A mechanical clock tick speeds up as your remaining time drops. Hidden tabs stay silent; no audio assets or service are downloaded.

Amber markers warn of roof collapses, cannon strikes or volcanic rocks, depending on the map. Change lanes before impact: even a paid jump cannot protect you underneath a falling chunk. After landing, its rubble can be hopped. A chunk can penalize each runner only once; a hit also briefly slows you down.

Falling events follow elapsed race time. Buying an ability reduces your spendable countdown without changing the hazard schedule. Solo practice pauses when you leave the tab and generates a fresh seed for each new run. Multiplayer keeps running when you switch tabs. Disconnecting ends your participation; this preview cannot reconnect you to an active race. Other players' timers and ability details remain private.

## Develop and learn

```sh
npm test              # Rules, hazards, rooms, interpolation, demo and asset tests
npm run test:network  # Real HTTP/WebSocket integration tests
npm run check         # JavaScript syntax
npm run dev           # Watch/restart the Node server
npm run build:avatars # Regenerate all twenty-four original GLB character assets
npm run check:deployment -- http://localhost:4173 # Verify the local release
```

Socket tests are skipped in the ordinary test command. Save browser files and refresh the page to see edits. `npm run dev` does not reload the browser. Restarting Node discards all rooms.

Internal tuning is a **1,350m course**, with base speed increasing from **22 to 32m/s over 50 elapsed running seconds**. An unobstructed, unboosted run reaches the exit at 50 seconds. V6 ordinary rows begin roughly 43–48m apart and tighten to about 31–36m; reserved 76–81m intervals contain their own ceiling-fall encounter. +5s time gates sit at 450m and 900m internally. These distances are developer tuning values, not player HUD readouts. The [project guide](docs/PROJECT_GUIDE.md) explains exact movement integration, shared jump height, and collision timing.

The default visual pipeline is `src/renderer.js`, `src/graphics/tunnel.js` and `src/graphics/avatars.js`, with original characters generated by `scripts/build-avatars.mjs`. These graphics files and assets match the V4 release. The included `unity/` project and its C# receiver are preserved for the optional comparison. Read [art credits](assets/unity/CREDITS.md) and the [beginner Unity guide](docs/UNITY_GUIDE.md) for that version.

Open [the Unity comparison](http://localhost:4173/?graphics=unity) to revisit that visual experiment. The plain game URL and `?graphics=classic` use the restored V4 presentation. The isolated Unity preview also remains separate. Physical-phone performance needs actual-device testing; a desktop narrow viewport is not a phone benchmark.

The included `Dockerfile` packages the Node service and public assets. With Docker installed, use `docker build -t borrowed-time .` and `docker run --rm -p 4173:4173 borrowed-time`. The container defaults to port 4173 and honors the host's `PORT` environment variable. The live Render Free service uses one Docker instance in Virginia and `/health`, as recorded in `render.yaml`. It deploys from `main` in the private [GitHub repository](https://github.com/wadavis95-cloud/borrowed-time). Keep one instance because rooms live in memory; restarts or deploys end active rooms. An idle free service can take about a minute to wake.

Read the [Unity integration guide](docs/UNITY_GUIDE.md), [V5 release record](docs/versions/V5_RELEASE.md), [beginner project guide](docs/PROJECT_GUIDE.md), [V4 design](docs/versions/V4_DESIGN.md), [V4 release record](docs/versions/V4_RELEASE.md), and [changelog](CHANGELOG.md). [V3.1](docs/versions/V3_1_RELEASE.md), [V3](docs/versions/V3_RELEASE.md), [V2](docs/versions/V2_RELEASE.md) and [V1](docs/versions/V1_RELEASE.md) remain preserved in their release tags.
