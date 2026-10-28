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

## Latest public rollout — October 28, 2026

User authorized deployment to remove the Mac from hosting the phone test, then approved protected hosted monitoring. Render is live at runtime `aaac5d5` with the approved model/detail passes, browser-only demo, selected-map loading, versioned caching and 30-minute diagnostics. See `docs/versions/PUBLIC_PERFORMANCE_PLAYTEST_2026_10_28.md`. Public game: https://borrowed-time.onrender.com/ ; public dashboard: https://borrowed-time.onrender.com/monitor#experience . Hosted key is private ignored `.local/render-monitor-key.txt`; local/LAN key remains separate. Public assets/race/cache/auth/browser reporting checks passed. Keep the first-Orbital latency investigation open; physical-phone public/cellular tests have not yet been measured, and Render Free wake-up can delay first-page access independently of map loading. No competition submission. This latest rollout supersedes earlier local-only/no-push instructions for the already deployed work; future new changes still need their own deployment authorization.

## October 28 — local compact race + browser code build

Approved loading/bandwidth steps 1 and 2 implemented locally on
codex/compact-race-build. Not deployed. See docs/LOADING_BANDWIDTH.md for protocol,
build workflow, measured 59.4% race-traffic reduction and code compression figures.
Backups/pre-wire-build-20261028.bundle preserves the prior version. Rebuild with
npm run build:client after browser source edits and restart the local server.
The current local server uses the generated compressed/hashed build. Runtime
still sends movement at 20Hz. Render remains Free and the public game unchanged.

### Latest: compact/download optimizations are now deployed

User approved publication after the local pass. Public runtime is 926fb6d,
Render dep-dbh50divcj2c73f8dl30 (live October 28, 3:43:35 PM EDT). Public Docker,
compressed/cache headers, compact multiplayer lifecycle and protected monitoring
verified. Existing public monitoring key unchanged; dashboard receives reports.
Pre/post aggregate snapshots and public verification artifact saved under
artifacts/performance. Ask existing testers to refresh the game before testing.
Continue evaluating real phone loading, frames, RTT/input delay, bandwidth and
server pressure; do not treat the local 100-racer benchmark as Render capacity.

## Submission readiness check completed October 28

See docs/SUBMISSION_READINESS.md.198 regular tests and 56 network checks passed,
plus public release/two-client check, a bounded four-client voting/purchase/host
migration check, six public map/demo smoke checks and a public two-browser race,
results, rematch and host-refresh migration. No product source changed or deployed.
Fresh screenshots, regression outputs and aggregate monitoring are preserved in
artifacts/readiness; submission draft now references current public 926fb6d and
includes 397-character DESCRIPTION.txt plus a fresh unedited preview image. Old
video remains optional/older. User must physically test phone UI/audio/loading,
app switching and a phone+Mac lobby; no other testers required. Handshake sign-in
is required before the actual form limits/Showcase setting/eligibility can be
checked. No terms accepted, form filled, upload, entry or submission performed.
Final monitoring snapshot has 51 desktop reports, 16,792 frames, p95 frame <=16.8 ms,
no browser/graphics errors; WAN gap p95 bucket <=100 ms, echo <=500 ms, input acknowledgment <=150 ms
(only 3 acknowledgments). Treat these as limited samples, not a phone or public capacity claim.
All test lobbies/sockets cleaned up. Ready for phone test and later explicit
manual-submission authorization. Earlier Orbital 5–7 second report remains a cold
phone investigation if it recurs; desktop cached checks do not close it.

### Owner accepted mobile feel

User reports "mobile feels clean just played". Captured mobile/touch/solo sample
in artifacts/readiness/phone-owner-test-20261028.json:27 reports across all six
maps,19,884 frames,p95 frame bucket <=25 ms,5 frames >50 ms,zero browser/graphics
errors/context losses/disconnect reports. Initial ready sample <=2,000 ms;five
first map switches <=500 ms (including Orbital),two revisits <=200 ms. Phone,
browser,network and cache condition unspecified. This is solo evidence;zero
online RTT/gap/input observations. Overall phone feel accepted. Physical phone
online latency remains unmeasured unless a later phone+Mac race is done. No entry
or submission; account eligibility/form sign-in/final authorization remain open.

### Phone and Mac multiplayer test completed with minor stutter finding

Real physical phone plus Mac Tunnel race: phone Station Guard won, Mac controls
untouched. User reports brief noticeable small skips, without interference. Saved
phone-mac-latency-* artifacts and live/results screenshots in artifacts/readiness.
p95 bounds: 28 phone input acknowledgments <=100 ms; combined 44 echoes <=100 ms;
4,543 update gaps <=60 ms. Rare/worst spikes and per-device network distributions
are not exposed by current API. Server race history recorded event-loop max about
79–101 ms and sampled backlog <=32 ms, zero send backlog. Root cause not proven;
current two-snapshot 50 ms interpolation/hold can reveal late updates as skips.
Do not call online smoothness fully cleared. Network/phone details unspecified.
Test sampler completed, lobby and sockets cleaned up; no code change or submission.
User now discussing anti-stutter strategies; keep changes pending their instruction.

## Latest local spike and movement buffer update

Branch codex/spike-movement-buffer, based on 0785696. See docs/SPIKE_BUFFER.md.
Pre-change bundle backups/pre-spike-buffer-20261028.bundle verified. Adaptive queue
of real server snapshots, 75–150ms target delay (initial 100ms), no extrapolation;
HUD/rules/prices/20Hz broadcast unchanged. Local HTTP starts muted per user request;
public HTTPS remains default-on. Measurements add p99/exact maxima/coarse peak times,
device/mode network summaries, buffer holds and server-pause samples. Strict schema,
2048B ingress/private keys/30min retention unchanged. Two review findings fixed with
regressions: jump arc rewind, hidden-tab false holds. Minor deferred: per-device
p99/max in API but dashboard breakdown rows remain p95. 213 regular and 57 network
checks pass. Controlled replay improves short hitch behavior but adds visual delay;
not a phone/WAN claim. Real local browser race/monitor worked; artifacts/performance
contains both replay and local smoke evidence. User must judge smoothness versus
added lag in a local two-device lobby. Final server runs on 0.0.0.0:4173; phone same
Wi-Fi uses http://192.168.0.104:4173/ (Mac awake). Source-only development requires
rebuild and restart, as before. Public runtime stays 926fb6d. No deploy or submission.

## Buffer released for public phone retest — October 28, 5:58 PM EDT

User explicitly authorized deployment, not competition submission. Fast-forward
pushed ee90384481bbcc1585ce490733261ac72e049dba to origin/main. Render deployment
dep-dbh6vgvb9u1s73amgb00 succeeded in 38.1s; Free plan unchanged, existing
monitoring key unchanged. Tests freshly passed: 213 regular (18 gated skips),
57 network checks, syntax, 10-file compressed build. Public release checker
passed 87 assets and temporary two-client race/purchases; test room removed.
Live movement-buffer/network/metric-schema source matches local byte for byte.
Predeploy snapshot and public-buffer-baseline-20261028.json saved in
artifacts/readiness. Predeploy retained reports were zero, but earlier physical
phone/WAN baseline remains in phone-mac-latency-* artifacts. New metrics reset
on deployment. One desktop report existed at the post-check baseline; exclude
verification traffic when comparing owner phone test.

Public tab 7 reloaded to new build and muted on Mac for test. Created Tunnel
lobby Q9YEY3; waiting for phone, race not started. Phone must refresh public
https://borrowed-time.onrender.com/ before joining. Only online mode exercises
buffer (solo does not). Owner should use lanes/hop/both purchases and report
visible skips and perceived control delay. Keep tab 7 alive; code can expire.
No competition form or submission action performed. Local source/evidence edits
not included in deployed ee90384 remain in workspace; no extra documentation
push made (would trigger redundant deployment).

## Latest: local bounded prediction ready for owner test

Public remains ee90384. Local branch codex/bounded-prediction implements <=120ms
forward render prediction plus <=300ms correction for residuals <=6m. No rule,
price or transport changes. Backups pre-prediction-20261028.bundle and
pre-prediction-workspace-20261028.zip verified/saved before changes. See latest
docs/SPIKE_BUFFER.md and plan 2026-10-28-bounded-prediction.md.

Fresh verification: 222 regular tests (18 gated skips), 57 network checks, syntax,
whitespace, compressed client build, local 87-asset/two-client release check all
passed; reviewer found no important defect. Snapshot replay 150ms bursts held
frames 14->0, 250ms 40->6; long gaps still pause. These are synthetic, not phone
improvement proof. Server session 12770 runs 0.0.0.0:4173 using original local
monitor key. Local game tab 3 reloaded new build and muted; lobby GR9K6V waiting
for phone (race not started). Phone same Wi-Fi link http://192.168.0.104:4173/.
Mac awake; refresh phone to ensure new build. This local address may change.
No push, deployment or submission for prediction change. Public mode remains
previous buffer and user-reported lag remains unresolved until real retest.

## Latest local: split delivery and update timing

Branch codex/split-delivery-timing follows 624ce9a. See docs/SPLIT_DELIVERY.md.
Backups pre-split-delivery-20261028.bundle verified and
pre-split-workspace-20261028.zip saved before edits. No push/deploy/submission.
Public remains ee90384. Separate local assets :4173 / race+protected monitoring
:4174, two child processes launched by npm run dev:split (session 89807).
Game URL unchanged http://192.168.0.104:4173/ (same Wi-Fi, Mac awake).
Dashboard moved to http://localhost:4174/monitor#experience, tab4 unlocked with
existing local key; tab3 new build waiting lobby UPN432. Guest tab2 smoke ended
and old socket closed on restart. Lobby code expires after five idle minutes.

Browser runtime config carries only public race origin. Strict exact-origin
CORS/WS configuration; combined default retained. Static export ready in
build/static-Q1z9L6, LAN test config only; no real CDN provisioned. Timing adds
server schedule/preparation lag, periodic send gap and excess arrival interval
without clock synchronization; dashboard plus device breakdowns. Metrics still
protected/bounded. Race-origin download totals now exclude static traffic.

227 regular tests (21 gated skips),60 network checks,syntax/whitespace,10-file
compressed build and static export checks passed. Real two-browser race and
both purchases worked. Final raw79-packet timing sample max send gap51.8ms,
zero invalid early metadata. Local browser smoke before final timer fix is
marked non-baseline. Latest baseline local-split-baseline-20261028.json may
include stale browser flushes from prior process lifetime; next test compare
only new reports. Fresh review found malformed-request crash and early-timer
measurement bug, both reproduced/fixed, no remaining important findings.
Phone acceptance and public deployment remain pending explicit authorization.
