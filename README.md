# Borrowed Time · V1

A browser escape runner for **solo practice or private races with 2–4 players**. Escape a collapsing building, switch lanes around debris, and spend your remaining seconds on abilities. Real opponents appear as transparent runner models; they cannot collide with you.

V1 runs locally or on your LAN. **It has not been publicly deployed.** See [release status and limitations](docs/versions/V1_RELEASE.md).

## Run it

Install **Node.js 22 or newer**. In VS Code, choose **File → Open Folder**, open this project, then **Terminal → New Terminal**. Codex can use the same folder.

```sh
node --version
npm install
npm start
```

Open [http://localhost:4173](http://localhost:4173). Keep the terminal running; **Ctrl+C** stops the server. This version adds one dependency, `ws`, for server-side WebSockets. There is no frontend framework or build step.

## Race with someone

1. Open the game in two browser windows or browsers.
2. Enter a guest name and create a private room.
3. In the other browser, join using the six-character room code.
4. The host starts the race once at least two players have joined.
5. A shared three-second countdown starts everyone on the same course.
6. After every run ends, the host can prepare a rematch.

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

Solo practice pauses when you leave the tab and repeats seed 42. A multiplayer race keeps running when you switch tabs. Disconnecting ends your participation; V1 cannot reconnect you to an active race. Other players' timers and ability details are private.

## Develop and learn

```sh
npm test              # Game rules and room behavior; socket tests skipped by default
npm run test:network  # Real HTTP/WebSocket integration tests
npm run check         # JavaScript syntax
npm run dev           # Watch/restart the Node server
```

Save browser files and refresh the page to see edits. `npm run dev` does not reload the browser. Restarting Node discards all rooms.

For deployment preparation, the included `Dockerfile` packages the Node service and public game files. With Docker installed, use `docker build -t borrowed-time .` and `docker run --rm -p 4173:4173 borrowed-time`. The container listens on port 4173. This recipe has not been built in the current environment; choose a host that supports persistent WebSockets and HTTPS/WSS before an internet release.

Read [the beginner project guide](docs/PROJECT_GUIDE.md) for the stack, code-reading path, networking explanation, exercises, and design questions. [V1 design](docs/versions/V1_DESIGN.md), [release notes](docs/versions/V1_RELEASE.md), and [changelog](CHANGELOG.md) distinguish the prototype, current version, and future work.
