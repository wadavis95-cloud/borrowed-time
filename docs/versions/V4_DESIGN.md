# V4 design — public friend playtest

The user authorized V4 to deploy Borrowed Time so they can play on their phone and race friends. Keep V3.1 gameplay, the four-player room system and the independent demo strategies.

## Delivery

- Host the current Node/`ws` service and browser assets together on one Render Free web service, with HTTPS and same-origin WSS. One process owns every in-memory room; do not scale to multiple instances.
- Keep source in a private GitHub repository. The public game URL exposes only the server's existing public-file allowlist. Publishing the game does not require publishing source code.
- Use the existing Dockerfile, correct its excluded character-preview file, and record a reproducible Render blueprint and deployment smoke command.
- Fit the course, countdown, abilities and movement controls on portrait and short landscape phone viewports. Respect safe areas, show touch controls for coarse pointers and improve mobile input sizing.
- Validate the live HTTPS/WSS endpoint, a real multiplayer room and browser phone-sized layouts. Give the user a short actual-phone/friend test procedure. Do not label browser emulation as physical-phone testing.

## Decisions and limits

Render Free is the implementation choice because it supports the existing persistent WebSocket process without a backend rewrite. It may sleep after inactivity and take about a minute to wake. Restarts and deploys discard rooms. Select the free instance, no paid upgrades, custom domain or payment setup. If account or repository authorization needs the user, prepare everything else and request only that access step.

Keep the JavaScript / Three.js / Node 22 / `ws` stack. No database, accounts, matchmaking, reconnect system, new abilities or art overhaul in this version. A room code continues to work only on its originating server. Public hosting and actual phone compatibility are reported separately, with precise verified status.

References: [Render Free](https://render.com/docs/free), [WebSockets](https://render.com/docs/websocket), [Docker](https://render.com/docs/docker).
