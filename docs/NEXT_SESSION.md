# Resume after Mac update

User approved extending the Courier/tunnel model detail across the whole game. That work is saved locally on `codex/v8.12-full-detail-pass`; see `docs/versions/V8_12_FULL_DETAIL_PASS.md`. Pre-change and post-change bundles are in ignored `backups/`. Do not deploy or submit without a new request. Public Render still runs `db36668` (the approved recorded music release with Chase).

## Restart local playtesting

Project folder: `/Users/wes/Documents/ChatGPT/Handshake Multiplayer game`.
Run `npm start` from this folder, then open `http://localhost:4173/`. The Mac restart will stop the current local server; the saved code and assets persist.

## Next focus — performance, latency and loading speed

Start with measurements, retaining the bright style, detail and gameplay. Establish cold/warm loading on a phone and PC, frame time during a four-player race across the six maps, memory/resource cleanup over map switches/replays, input response and actual multiplayer round-trip time/jitter. Distinguish Render's free-service wake-up delay from downloads, asset decoding, scene construction, rendering and network delay.

The avatar library currently preloads all 24 GLBs. The detail pass increases character geometry and transfer bytes; investigate selected-map/lazy loading, shared material textures and geometry/draw budgets after measuring. Music is selected-map loaded and capped at 90 seconds per local recording. Preserve artist credits and the user's selected tracks. Optimize based on the bottleneck, verify the complete race flow again, then let the user test locally before considering deployment.

## Capacity baseline completed

Local measurements and the repeatable loopback-only tool are on `codex/capacity-baseline`. Read `docs/CAPACITY_BASELINE.md` before tuning limits. The app server and gameplay were not changed. Results include default-limit ramps to 100 racers, burst arrivals, concurrent asset downloads, test-only 200/400-racer exploration, and a 90-second repeated-race run. These are Mac measurements, not Render capacity guarantees. Current hard limits remain 25 rooms / 128 sockets; the historical baseline used four sockets and one room per demo viewer. The new browser-only demo uses neither. Steady 100-racer JSON output was about 6.6 MB/s.

Run the tool with `npm run test:capacity -- --profile=baseline --seconds=20`. No external target is accepted; it launches and removes its own loopback server. Raw JSON reports are in `artifacts/performance/`.

The user asked whether a monitoring dashboard would help. Recommended adding lightweight server and client monitoring before optimizing, so changes can be evaluated against actual bottlenecks. The dashboard is now implemented locally (see below); no paid monitoring, hosting upgrade or public load test was set up. Remaining work includes selected-map loading/cache/CDN, recovery, and measured room-aware scaling. Keep changes local unless deployment is explicitly requested.

## Monitoring dashboard implemented locally

Branch `codex/monitoring-dashboard` contains the separate protected `/monitor` dashboard. Start with `npm run monitor` (local-only binding); access key is `.local/monitor-key.txt`, ignored by Git and Docker. See `docs/MONITORING.md`. The running local server is monitored; no deployment, hosting upgrade, external telemetry service or public load test occurred. Server/browser observations and bandwidth are now available. Next work is selected-map loading, caching and download delivery, using this dashboard to measure changes. Durable hosted monitoring, external uptime alerts, billing integration and multi-instance aggregation remain future work.

## Browser-only demo completed locally

Branch `codex/local-showcase-demo` moves Watch demo to the existing local race engine. See `docs/LOCAL_DEMO.md` for architecture, checks and raw measurement links. The server now needs zero rooms/sockets/race JSON for demo viewers (previously one room/four sockets/about 264 KB/s per viewer in the short local sample). Frame p95 remained in the <=16.8 ms histogram bucket on this Mac; phone validation remains. Close racing, early abilities, all six themed rosters, replay and hidden-tab freeze are covered. Existing rules/prices and real multiplayer are unchanged. Verified pre-change bundle: `backups/pre-local-demo-20261028.bundle`. Continue measuring selected-map loading, caching, recovery and real-race traffic next. Everything remains local; no push, deployment or submission.

## Selected-map loading/cache local trial

Branch `codex/map-loading-cache` builds on the browser-only demo checkpoint. See `docs/MAP_LOADING_CACHE.md`. Initial tunnel character bytes fall 83.2% (13.24 MB to 2.23 MB); exact content-version caching avoids repeat model/music/thumbnail downloads. The dashboard now has first-in-tab/in-memory switch timing by map and estimated mobile/desktop device, separately from controls. Local single-sample switches were <=500 ms, most revisits <=200 ms; this is a trial, not proof of negligible phone delays. Actual phone/network measurements remain pending. Watch slow-client multiplayer map readiness: the server countdown currently continues while any individual client is loading. Assets stay decoded in memory across visited maps. Preserve rules/prices/art/music credits. Run `npm run build:asset-versions` after changing any shipped model/music/thumbnail. No deployment/submission. Backups: `backups/pre-map-loading-cache-20261028.bundle` and post-change bundle when checkpointed.

### Phone follow-up captured

The user completed the races on a physical phone over the temporary Wi-Fi/LAN setup. See the follow-up in `docs/MAP_LOADING_CACHE.md` and `artifacts/performance/phone-wifi-20261028.json`. Retained mobile/touch reports: initial readiness <=1000 ms, first/repeat map p95 ceilings <=500 ms, 4,415 running frames with p95 <=25 ms and zero >50 ms, no reported graphics/browser errors. Two-minute expiry means frame evidence covers only the last two maps. Phone model/browser and cellular/multiplayer readiness remain untested. Temporary LAN server is running for the test; normal `npm run monitor` still binds to loopback. No deployment.

### Outstanding phone-loading issue

User reports first Orbital selection waited 5–7 seconds before the map appeared. This fails the latency target despite faster retained aggregates; do not treat phone loading as accepted. Diagnose end-to-end selection/presentation and preserve full-test bounded worst-case summaries; the current timer ends at draw submission and the monitor expires observations after two minutes. Root cause is not yet established. Keep trial local.

### Monitoring retention extended

Browser reports and server charts now cover up to 30 minutes (6,000 report / 1,800 one-second server-sample caps). Older server-chart points compact into ten-sample peak/average buckets; latest minute stays at one-second resolution. The dashboard warns on report-cap eviction. No gameplay timer, loading deadline or polling interval was changed. Restart clears memory; historical phone evidence remains in saved artifacts. The slow first Orbital load remains unresolved; extending retention alone does not close the end-to-end presentation measurement gap. LAN test setup remains temporary and local, no deployment.

### Latest phone retest saved

`artifacts/performance/phone-wifi-retest-20261028.json` captures all six maps under the extended 30-minute window, 21 mobile/touch/solo reports, 13,595 frames, p95 <=25 ms, two >50 ms frames and no reported errors. Asset-body output since restart was zero: this was a cached retest. Orbital preparation <=200 ms / revisit <=100 ms cannot establish that its earlier cold 5–7 second visible delay is fixed. Asked user whether that delay recurred; no loading optimization or presentation-timing fix has been implemented yet.
