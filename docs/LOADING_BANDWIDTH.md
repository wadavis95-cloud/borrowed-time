# Local bandwidth optimization — October 28, 2026

Status: local only, not deployed. Gameplay, prices, art, music, simulation and the
50 ms movement broadcast interval are unchanged.

## Multiplayer wire cache

New browsers request snapshotVersion 2 on create/join. Each connection receives a
complete initial baseline, then dynamic movement/timer/ability state at 20 Hz.
Room metadata, public roster, private event text, standings and authoritative
falling-debris schedules are sent only when their content changes. Debris timing
can change during a race; the protocol compares actual schedules rather than
assuming the seed makes them static. New room/round/map receives a fresh baseline.
Sequence gaps or incomplete baselines produce a reconnect error instead of stale
hazard rendering. Existing clients that omit the option receive full snapshots.
The browser decoder restores the existing canonical snapshot shape before the HUD
and interpolation use it. Other racers' private game state is never included.

A bounded local test used 25 rooms / 100 racers for 20 seconds per format:

| Measurement | Legacy | Compact |
|---|---:|---:|
| Outbound JSON bodies | 6.53 MB/s | 2.65 MB/s |
| Updates per racer per second | 19.60 | 19.60 |
| p95 update gap | 52.52 ms | 52.45 ms |
| p95 server CPU, percentage of one core | 24.14% | 25.31% |
| Unexpected disconnects | 0 | 0 |

Traffic fell 59.4%. CPU is not a demonstrated improvement: median fell, p95 rose
slightly. Cache comparison still costs CPU, and canonical snapshots are still
constructed. These sequential runs use independently randomized races, share the
Mac with the driver and are not a Render capacity or WAN latency guarantee.
Source evidence: artifacts/performance/capacity-compare-1793209834259.json.
Repeat with `node scripts/measure-capacity.mjs --profile=compare --seconds=20`.
No public load test was performed.

## Browser downloads

`npm run build:client` bundles/minifies browser JavaScript and CSS with pinned
esbuild, retains dynamic graphics imports and shared modules, gives code files
content-derived names and writes gzip/Brotli copies in ignored build/client.
HTML points to the current hashes and remains no-store. Only validated manifest
entries are public and immutable for one year; the manifest and build internals
are not served. Source/vendor routes remain available without long-term caching.
Accept-Encoding negotiation supports gzip, Brotli and identity, including quality
weights and exclusions. HEAD lengths describe the selected encoded representation.
All compression happens at build time, without per-download compression CPU.

Full game code graph, excluding the operations dashboard, music and models:

| Representation | Bytes |
|---|---:|
| Original source inputs | 2,485,364 |
| Minified split JS + CSS | 815,136 |
| Gzip | 229,357 |
| Brotli | 192,853 |

Brotli is 92.2% smaller than that original code graph. This measures file bodies,
not a cold page's complete transfer or a guaranteed loading-time reduction. Each
browser only fetches the chunks it needs; cache hits can avoid later downloads.
Music/model optimization and attribution are unchanged.

Build before restarting the local server; the server captures one build manifest
at startup. Rebuild after source edits, or remove the ignored build directory to
return to the original source development routes. The Dockerfile builds bundles
in a separate stage and installs only production dependencies in the runtime.
Docker itself was unavailable locally; the builder script and actual local HTTP
responses were verified. A future deployment must verify the container build.
Old tabs loading an old lazy chunk after a deployment may need a reload; durable
cross-deploy asset retention is not implemented. Caching does not remove Render
Free's sleeping/wake-up behavior or the single-instance in-memory-room limit.

## Deployment verification — October 28, 2026

The user subsequently authorized deployment. Commit 926fb6d is now public through
Render deploy dep-dbh50divcj2c73f8dl30, live at 3:43:35 PM EDT. Render successfully
built the multi-stage Docker image, including ten hashed gzip/Brotli browser files;
this resolves the earlier local Docker-verification limitation.

Public release checks passed for 85 source/fallback assets, hashed entry/CSS
Brotli and immutable headers, fresh HTML and a temporary compact two-player race
(shared countdown, movement, private ability purchases, hazards, standings and
cleanup). Protected metrics returned 401 without a key and 200 with the existing
approved key. Browser graphics/demo loaded without console errors and readiness
reports reached the dashboard. This is release verification, not proof of phone
performance or production peak capacity. Pre-deployment aggregate metrics were
saved before the process restart. Monitoring still retains up to 30 minutes in
memory and resets when the service restarts or sleeps. No plan or key change.

Evidence: artifacts/performance/public-compact-verification-20261028.json,
pre-compact-deploy-20261028.json and post-compact-deploy-20261028.json;
docs/images/public-compact-monitor.png and public-compact-deploy.png.
