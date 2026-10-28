# Resume after Mac update

User approved extending the Courier/tunnel model detail across the whole game. That work is saved locally on `codex/v8.12-full-detail-pass`; see `docs/versions/V8_12_FULL_DETAIL_PASS.md`. Pre-change and post-change bundles are in ignored `backups/`. Do not deploy or submit without a new request. Public Render still runs `db36668` (the approved recorded music release with Chase).

## Restart local playtesting

Project folder: `/Users/wes/Documents/ChatGPT/Handshake Multiplayer game`.
Run `npm start` from this folder, then open `http://localhost:4173/`. The Mac restart will stop the current local server; the saved code and assets persist.

## Next focus — performance, latency and loading speed

Start with measurements, retaining the bright style, detail and gameplay. Establish cold/warm loading on a phone and PC, frame time during a four-player race across the six maps, memory/resource cleanup over map switches/replays, input response and actual multiplayer round-trip time/jitter. Distinguish Render's free-service wake-up delay from downloads, asset decoding, scene construction, rendering and network delay.

The avatar library currently preloads all 24 GLBs. The detail pass increases character geometry and transfer bytes; investigate selected-map/lazy loading, shared material textures and geometry/draw budgets after measuring. Music is selected-map loaded and capped at 90 seconds per local recording. Preserve artist credits and the user's selected tracks. Optimize based on the bottleneck, verify the complete race flow again, then let the user test locally before considering deployment.

## Capacity baseline completed

Local measurements and the repeatable loopback-only tool are on `codex/capacity-baseline`. Read `docs/CAPACITY_BASELINE.md` before tuning limits. The app server and gameplay were not changed. Results include default-limit ramps to 100 racers, burst arrivals, concurrent asset downloads, test-only 200/400-racer exploration, and a 90-second repeated-race run. These are Mac measurements, not Render capacity guarantees. Current hard limits remain 25 rooms / 128 sockets; demos use four sockets and one room per viewer. Steady 100-racer JSON output was about 6.6 MB/s.

Run the tool with `npm run test:capacity -- --profile=baseline --seconds=20`. No external target is accepted; it launches and removes its own loopback server. Raw JSON reports are in `artifacts/performance/`.

The user asked whether a monitoring dashboard would help. Recommended adding lightweight server and client monitoring before optimizing, so changes can be evaluated against actual bottlenecks. No dashboard, paid monitoring, hosting upgrade or public load test has been set up. Remaining order: monitoring, selected-map loading/cache/CDN, demo admission/recovery, and measured room-aware scaling. Keep changes local unless deployment is explicitly requested.
