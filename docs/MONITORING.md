# Local operations dashboard

Open `http://localhost:4173/monitor`. Start the monitored game with `npm run monitor` from the project folder. This command binds the server to 127.0.0.1 and creates/reuses a random 43-character key in `.local/monitor-key.txt` with 0600 permissions. Paste that key into the dashboard. It stays in tab memory, is cleared from the input after unlocking, and is cleared when locking/leaving. Do not share it or put it in a URL. The file is excluded from both Git and Docker build contexts.

`npm start` still runs the game normally, with monitoring disabled unless a `MONITOR_TOKEN` of at least 32 characters is explicitly supplied. A future hosted setup should use a strong randomly generated secret through the host's secret settings and HTTPS. No hosted setting, deployment, paid service or external analytics was added here.

## What it measures

| Area | Measurements | Interpretation |
|---|---|---|
| Capacity | Current sockets / 128, rooms / 25, racing rooms, running connected racers, admission rejections | Online racers and lobby guests count as connections. The browser-only showcase demo uses no race sockets or server lobby. The capacity baseline documents the earlier server-backed demo. |
| Server | CPU relative to one core, process RSS, JS heap, event-loop p95/max, sampled simulation backlog, queued socket bytes | One-second samples; not total machine CPU or phone performance. Backlog is sampled, not an exhaustive trace. |
| HTTP | Recent completed-response p95, request count, 4xx/5xx counts, incomplete-response count | HTTP timing includes server streaming, not browser decoding or rendered readiness. |
| Bandwidth | Race JSON output/input; asset, code and page output; monitoring output separately; totals since boot; recent rates and per-current-connection estimate | Decimal MB/GB. Race bytes count queued JSON; successful HTTP bodies use declared Content-Length after response completion. No TLS, headers, WebSocket framing/control frames, failed sends or aborted partial bodies. These are not provider billing totals. |
| Projection | GB/hour if recent roughly 30-second rate continues | Weighted by sample interval, includes monitoring output. A scenario estimate, not a prediction or invoice. |
| Loading | Navigation-to-first-successful-render histogram | One sample per page navigation when telemetry initialization succeeds. Includes graphics/modules/assets and first draw, not an external cold-start measurement. |
| Frames | Visible running frame histogram, >50 ms frame fraction, long-task counts, context-loss counts | Does not measure hidden-tab or menu frame rate. Long-task availability varies by browser. |
| Network / controls | Application echo RTT, snapshot-arrival gaps, input-to-server-acknowledgment histogram | RTT and acknowledgment exclude rendered-frame/interpolation delay. Acknowledgment means processed input sequence, not necessarily a successful purchase or move. Expected update gap is about 50 ms. |
| Browser stability | Error, graphics-initialization/draw failure and disconnect counts | Counts only; no exception messages or stack traces. |
| Segments | Recent frame observations by map, touch/keyboard controls and solo/demo/online mode | Fixed, non-identifying labels. These are observations, not unique players or active-browser counts. |

## Live data, bounds and missing data

The server retains up to 180 one-second history points. Totals reset on process restart. Browser reports cover a rolling two-minute window, capped at 1,200 retained reports and 600 ingress attempts per minute. Reports have a fixed schema, maximum body size 2,048 bytes and bounded numeric values. Browser reporting is best effort: roughly every 30 seconds, on first render and at visibility/context transitions when observations exist. Requests time out and failed samples are dropped without retry storms.

Histograms are fixed buckets. The displayed p95 is a bucket ceiling, not an exact percentile. The last bucket has no upper bound and is displayed as greater than the preceding bucket's upper bound. Missing observations display a dash, never an invented zero latency/FPS. Frame and network observations exclude hidden-tab periods; browser errors/long-task counts are broader diagnostic observations. Browser reports are untrusted and can be falsified by a client; they never influence game state or admission decisions.

Signals currently flag occupancy at 80%, CPU above 80% of one core for ten samples, sustained event-loop p95 >50 ms or sampled simulation backlog >100 ms, rejected reports, and browser error observations. They are provisional visual signals, not calibrated production SLOs. The dashboard backs off failed polls and explicitly shows stale data. Server history can be empty briefly after startup.

## Access and privacy

- `/ops/metrics`: GET with `Authorization: Bearer <key>`. Disabled without a valid configured key; incorrect keys return 401. Valid monitoring polling is capped separately. No token is returned in data, logged by this app, placed in browser storage or embedded in a link.
- `/ops/config`: public enable/disable boolean only.
- `/ops/client`: same-origin POST of aggregate diagnostics only; validates Origin, schema, length and volume. Origin validation is not authentication; aggregate browser data is explicitly untrusted.
- `/monitor`: public dashboard shell; operational data requires the key. The private key file and server source remain outside the HTTP allowlist.
- No names, lobby codes, player IDs, IP addresses, user agents, page URLs or stack traces are collected in monitoring records. Normal race messages still contain the existing game data needed by players; the monitor stores only their byte counts.

There is no external uptime monitor, durable history, alert delivery or billing integration in this first local dashboard. An open dashboard detects stale responses, but an outage while it is closed requires an external health monitor. Multi-instance aggregation will be needed before moving beyond the current single-instance architecture.

## Implementation and verification

- `src/server/monitoring.js`: bounded aggregation, authenticated read API and validated ingestion.
- `src/telemetry.js`: fixed aggregate browser diagnostics; disabled automatically if server monitoring is off.
- `src/network.js`: echo RTT and private sequence acknowledgment timing. Probe replies do not mask a stalled race feed from the existing watchdog.
- `monitor/`: responsive separate UI; no game HUD changes or external libraries.
- `scripts/local-monitor.mjs`: local-only launcher and ignored key file.

Gameplay, prices, map rules and movement are unchanged. Acknowledgment sequence and a lightweight probe are additive protocol diagnostics. The release checker now verifies all 83 public assets and that metrics are protected or disabled. Unit/network checks cover disabled/missing/wrong-key access, fixed-schema/size/origin rejection, rolling expiry, bandwidth classification, histogram overflow, private acknowledgment fields and multiplayer regression. Browser checks verified live downloads, race traffic, first-render/frame/network/input reports, map/control/mode segmentation and no console errors.
