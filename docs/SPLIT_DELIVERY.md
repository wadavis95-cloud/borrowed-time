# Local static delivery and race service split

This local experiment follows the selected HLD. Nothing has been deployed or
submitted. The public game still runs ee90384. Local code also retains the
previous bounded prediction experiment (624ce9a); gameplay and prices unchanged.

## What runs where

`npm run dev:split` starts two independent Node.js processes:

- Port 4173: HTML, hashed browser code, models, thumbnails and music. It has no
  simulation timer, rooms, WebSocket connections, monitoring key or ops API.
- Port 4174: authoritative races, WebSockets and protected monitoring. It returns
  404 for game files/music. Only the monitoring page's files are served here.

Mac game: http://localhost:4173/
Phone on same Wi-Fi: http://192.168.0.104:4173/
Mac dashboard: http://localhost:4174/monitor#experience

The Mac must stay awake. The LAN address may change. `LOCAL_GAME_HOST` overrides
address discovery. Runtime configuration contains only the public race origin;
it never contains a monitoring key. The game automatically uses that origin for
WebSockets and browser telemetry. The dashboard uses its own race-service origin.
Its key remains the existing ignored .local/monitor-key.txt and is kept in the
unlocked tab's memory. No credentials were created or rotated.

`GAME_ROLE=assets` requires `RACE_ORIGIN`. `GAME_ROLE=race` uses exact
`ALLOWED_ORIGINS` for browser WebSockets and telemetry CORS. No wildcard or
credentialed cross-origin access is added. Same-origin clients remain supported.
Defaults remain combined mode for compatibility with the existing public server.
Stop the split launcher before starting the combined server on port 4173.

## Timing measurements

Periodic snapshots carry optional monotonic scheduledAt and sentAt values.
ScheduledAt is the previous callback time plus 50ms, clamped to callback entry
for slightly early timers. SentAt is sampled immediately before JSON serialization
and socket enqueue. It measures application sends, not physical packet departure.
The server also samples complete broadcast-work duration. Event-driven snapshots
are marked separately and do not affect periodic send interval measurements.

The dashboard's Update delivery timing cards show p99 and recorded maxima:

- scheduleLag: application send timestamp minus scheduled callback timestamp;
  includes callback lateness and snapshot preparation before serialization.
- sendGap: interval between consecutive periodic application sends.
- arrivalExcess: positive part of arrival interval minus send interval. No clock
  synchronization is needed. This includes network, buffering and browser
  scheduling; it does not isolate one-way network latency or measure absolute
  transit time. Negative excess (catch-up) becomes zero.
- latest server schedule/broadcast work: server-side callback lateness and the
  time spent building/queuing the whole broadcast, independent of client reports.

Metadata is backward compatible with compact and legacy snapshots. Visibility
changes, reconnects and server-clock reversal reset interval comparisons. Metrics
use fixed numeric schemas, 2048-byte reports, original rate/retention bounds,
exact coarse-timestamp maxima and device/control/map/play-mode breakdowns.
Instrumented snapshots add a small per-update bandwidth cost while monitoring
is enabled. The race dashboard measures race-origin traffic only; CDN/static
traffic needs that host's own metrics and is not reported as total game traffic.

## Static-host/CDN export (prepared, not deployed)

Run `npm run build`, then set RACE_ORIGIN to the intended HTTPS race origin and
run `npm run export:static`. This creates a new build/static-* directory using
only allowlisted public files and hashed browser output, with public runtime
configuration. The local validation export is build/static-Q1z9L6 (HTTP LAN
configuration; rebuild for production). No .local keys, repository files, server
source or monitoring page is exported. The optional _headers file describes
immutable hashed code and uncached HTML/config; apply equivalent headers if the
chosen provider uses different configuration. Existing credits remain included.
No vendor account, CDN service or DNS has been configured. Production will need
separate static hosting plus exact frontend origin configuration on the race
service. Two processes on one Mac do not demonstrate CDN or free-host gains.

## Verification and evidence

227 regular checks passed (21 gated network skips), 60 network checks passed,
syntax/whitespace and compressed 10-file browser build passed. Tests include
cross-origin WebSocket rejection/acceptance, browser telemetry ingestion,
private-file exclusion from static export, race-only denial of game assets,
optional wire metadata, interval math/reset and worst-case telemetry body size.
Review reproduced and fixed malformed absolute-URL HTTP targets crashing both
wrappers (isolated child-process RED then 400 GREEN), and early timers causing
false send gaps (scheduled time normalization). Fresh review found no remaining
important correctness finding.

A real two-browser split-origin race rendered and accepted boost plus long jump
at their unchanged 5s/4s prices. Screenshot local-split-race.png. The initial
browser smoke snapshot local-split-smoke-20261028.json predates final server
early-timer normalization; its sendGap results are not a valid performance
baseline. Existing browser reports can flush after a server restart; capture a
fresh baseline before comparing the next owner test.

Final runtime raw timing check (four seconds, disposable lobby, not injected into
browser monitoring): 79 periodic packets, zero early-invalid metadata, maximum
send interval 51.80ms, schedule/preparation delay 1.95ms, excess arrival 0.40ms.
Saved in artifacts/readiness/local-split-final-timing-20261028.json. This is a tiny
local check, not physical-phone/WAN or scale evidence. Screenshots include the
new protected dashboard and waiting local lobby. Phone acceptance remains open.

Backups: backups/pre-split-delivery-20261028.bundle (verified complete Git history)
and backups/pre-split-workspace-20261028.zip (existing uncommitted evidence).

## Owner phone + Mac local race completed

Snapshot artifacts/readiness/local-split-phone-after-20261028.json: mobile group
has3 reports (no mobile group in pre-test baseline),1495 running frame samples,
aggregate running-frame max26ms and no frames>50ms. All23 phone input
acknowledgments <=64ms;9 echo RTTs <=11ms.983 periodic scheduling samples
max2.29ms;982 periodic send intervals max51.95ms. Phone session includes lobby
waiting:984 update gaps max421ms,27>100ms; excess arrival max370.69ms. Largest
421ms peak timestamp predates first racing server history sample, so it must
not be called the largest in-race freeze. Zero completed buffer holds and zero
underruns reported in captured totals; no browser/graphics errors/context loss.
Racing server history event-loop max13.48ms, no queued outbound bytes.

Interpretation: application sends were regular while phone delivery/dispatch
was uneven. This locates the observed interval excess after application send,
without separating Wi-Fi, TCP/OS buffering and browser dispatch. Zero reported
holds is encouraging but is not subjective acceptance or proof all freezes are
fixed; user has only said the race finished. This local split+prediction setup
cannot be causally compared to the earlier public8-hold race. Phone feel and
later authorized public test remain pending. No deploy/submission occurred.
