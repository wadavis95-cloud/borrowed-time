# Borrowed Time · V2 preview

A browser escape runner for **solo practice or private races with 2–4 players**. Race through a crumbling Victorian railway tunnel toward daylight, dodge falling masonry, and spend your remaining seconds on abilities. Real opponents appear as translucent 3D runners; they cannot collide with you.

Version **2.0.0-preview.1** runs locally or on your LAN. **It has not been publicly deployed.** This is the first playable procedural art pass: the tunnel and avatars are built in code, and do not reproduce the final detail of the approved concept art. Physical mobile devices and broad performance compatibility have not been validated. See [V2 release status and limitations](docs/versions/V2_RELEASE.md).

## Run it

Install **Node.js 22 or newer**. In VS Code, choose **File → Open Folder**, open this project, then **Terminal → New Terminal**. Codex can use the same folder.

```sh
node --version
npm install
npm start
```

Open [http://localhost:4173](http://localhost:4173). Keep the terminal running; **Ctrl+C** stops the server. The dependencies are `ws` for server-side WebSockets and Three.js **0.180.0** for genuine 3D rendering through **WebGL 2**. The page needs a browser with WebGL 2 and graphics acceleration available. There is no frontend framework or build step; the Node server serves the graphics library locally, without a CDN.

## Race with someone

1. Open the game in two browser windows or browsers.
2. Create a private room. A guest name is assigned automatically; entering your own is optional.
3. In the other browser, join using the six-character room code.
4. The host starts the race once at least two players have joined.
5. A shared three-second countdown starts everyone on the same course.
6. After every run ends, the host can prepare a rematch.

The server assigns **Courier** or **Engineer** automatically. Four-player rooms can repeat these two avatars; each player has a distinct identifying color. Avatars and colors stay with you through rematches. Both avatars use the same movement and collision rules.

For another device on the same trusted Wi-Fi network, start with:

```sh
HOST=0.0.0.0 npm start
```

Open `http://YOUR-COMPUTER-LAN-IP:4173` on each device and use the same room code. This address is a placeholder: replace it with the host computer's local IP. A room code only works on the same running server; `localhost` on another device points to that device. Firewall or Wi-Fi isolation settings may affect LAN access.

## Play

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Switch lanes | Left / Right arrows or A / D | Swipe sideways or movement buttons |
| Free hop | Space, Up arrow, or W | Tap the course, swipe up, or Hop |
| Speed boost | 1 | Speed boost button |
| Long jump | 2 | Long jump button |
| Pause / resume solo | P or Escape | Pause button |

Start with **60 seconds**; reach the exit at **900 meters**. Boost costs **3 seconds**, long jump costs **2**, hits cost **3**, and checkpoints restore **5**. Hop rubble, long jump gaps, and move around tall barriers.

Amber ground markers warn where masonry will fall. Change lanes before impact: a hop cannot protect you underneath a falling chunk. After it lands, you can hop its rubble. Each chunk can penalize you only once, even if you encounter both its impact and aftermath. A hit also briefly slows you down.

Falling events follow elapsed race time, which everyone shares online. Buying an ability reduces your spendable countdown without moving the hazard schedule. Tunnel lighting follows your distance toward the exit.

Solo practice pauses when you leave the tab and repeats seed 42. A multiplayer race keeps running when you switch tabs. Disconnecting ends your participation; this preview cannot reconnect you to an active race. Other players' timers and ability details are private.

## Develop and learn

```sh
npm test              # Rules, hazards, rooms, interpolation and assets; sockets skipped
npm run test:network  # Real HTTP/WebSocket integration tests
npm run check         # JavaScript syntax
npm run dev           # Watch/restart the Node server
```

Save browser files and refresh the page to see edits. `npm run dev` does not reload the browser. Restarting Node discards all rooms.

For deployment preparation, the included `Dockerfile` packages the Node service and public game files. With Docker installed, use `docker build -t borrowed-time .` and `docker run --rm -p 4173:4173 borrowed-time`. The container listens on port 4173. This recipe has not been built in the current environment; choose a host that supports persistent WebSockets and HTTPS/WSS before an internet release.

Read [the beginner project guide](docs/PROJECT_GUIDE.md) for the stack, code-reading path, networking explanation, exercises, and design questions. The [V2 design](docs/versions/V2_DESIGN.md), [V2 release record](docs/versions/V2_RELEASE.md), and [changelog](CHANGELOG.md) track this preview. [V1 design](docs/versions/V1_DESIGN.md) and [V1 release notes](docs/versions/V1_RELEASE.md) preserve the multiplayer foundation; V1 is tagged `v1.0.0`.
