# Local movement buffer and spike measurements

October 28, 2026. Implemented on codex/spike-movement-buffer. Local only, with a
verified backup at backups/pre-spike-buffer-20261028.bundle of commit 0785696.
The public game remains at 926fb6d. No deployment, hosting change or submission.

## What changed

Online rendering now queues up to 32 real server snapshots instead of retaining
only two. A server-time timeline separates simulation state from uneven arrival
times. Playback starts with 100ms target delay, adapts within 75–150ms based on the
last 40 arrival gaps, and moves its cursor monotonically with gentle speed changes
(0.85 to 1.1 times normal playback). No simulation/prediction runs in the renderer,
and it never advances beyond the newest received state. Longer outages still hold.
The target delay is not a guarantee of maximum visible latency: missing updates
and rebuilding the reserve can make actual delay larger.

The HUD uses current authoritative state so prices, purchases, phases and timer
remain current. Visual distance, lanes, jump arcs and the hazard clock share the
buffered timeline. Membership changes, finished racers and latest authoritative
hazard schedules apply immediately. Round/map/identity changes and server clock
reversal reset the queue. Hidden-tab/long rendering suspension reanchors playback
without reporting the suspended interval as an ongoing visible buffer hold.

The monitor now includes p99 histogram bounds, exact recorded maxima, threshold
counts, and approximate timestamps rounded to 100ms. Frame, update gap, RTT, input
acknowledgment and buffer-hold peaks are bounded to one peak per metric per report.
It shows up to 24 recent report peaks and 24 independently measured server-pause
samples. Device/control/mode/map summaries now include network timing and buffer
statistics. The current dashboard breakdown rows still show p95; device-specific
p99/max remain available in the protected metrics response and timestamped report
peak list. Client clocks may differ from server clocks; temporal proximity is not
proof of cause. Old reports remain valid but cannot supply missing exact maxima.

The existing 2048-byte ingress cap, fixed schema, key protection, report-count cap,
30-minute in-memory retention and 30-second browser reporting period are unchanged.
Added reports contain no identifiers, raw device strings, URLs or error messages.
Measurements exclude final display/presentation delay. Underruns count depleted
buffers; recovered hold durations exclude pauses between render samples over 250ms
and explicit visibility suspension. Ongoing holds may have no completed duration.

Local HTTP starts muted by default during testing. The speaker button can enable
sound. Public HTTPS retains its existing default-on policy. Rules, ability prices,
20Hz movement broadcast, maps, graphics and music files are unchanged.

## Controlled replay evidence

Run npm run test:movement-buffer. The script compares the real pre-change view
from commit 0785696 with the new view using the same timed snapshot stream: 20Hz
source, 60Hz rendering, 30m/s movement, 30ms nominal one-way delivery. It requires that
baseline commit in local Git history and creates no sockets.

| Scenario | Held frames before | Held frames after | Worst forward step before | After | p95 visual buffer before | After |
|---|---:|---:|---:|---:|---:|---:|
| Steady arrivals |0|0|0.50m|0.50m|50ms|75ms|
| Uneven arrivals |55|0|0.79m|0.50m|70ms|95ms|
|150ms batched delivery every 2s |50|14|6.00m|0.54m|87ms|180ms|
|100ms server pauses every 2s |25|3|3.10m|0.50m|50ms|150ms|
| One 500ms outage |31|27|16.50m|0.55m|50ms|487ms|

These are deterministic synthetic observations, not a physical-phone improvement
claim or Render performance result. They demonstrate the tradeoff: fewer visible
holds and gentler catch-up, with added visual delay. It cannot hide long outages.
Full evidence: artifacts/performance/movement-buffer-20261028.json.

## Verification

213 regular tests pass (18 gated network skips); 57 local network checks pass.
Tests cover batched/duplicate arrivals, bounded queues, no reverse/projection beyond
received state, stale sockets, round/phase changes, authoritative hazard schedules,
jump takeoff/landing continuity, hidden-tab measurement suppression, exact rare
peaks, p99, fixed-schema rejection, real HTTP ingestion, expiry and bounded lists.
A report-size check retains the 2048-byte limit. The compressed client build, syntax,
whitespace and local release checker passed with 87 public source/fallback assets.

A real local two-browser race rendered with unchanged purchases; the monitor
received 12 reports including 4,757 gap observations. It surfaced a 111.5ms gap that
p99 alone did not show (p99 bucket<=60ms), with zero reported buffer underruns and
no browser/graphics errors. This loopback sample reuses cached assets and does not
reproduce WAN/free-host timing. Saved before final muted-build restart:
artifacts/performance/local-spike-buffer-smoke-20261028.json. The final fresh local
page displayed Enable sound / Sound muted and no browser console errors.

Independent whole-change review found two important issues; regression tests
reproduced and fixed both: jump-arc rewind from mixing current/buffered countdowns,
and hidden-tab time becoming a false buffer-hold peak. One minor deferred display
item is the per-device p99/max row presentation described above.

## Local playtest

Mac: http://localhost:4173/
Phone on the same Wi-Fi: http://192.168.0.104:4173/
Private local dashboard: http://localhost:4173/monitor#experience

Keep the Mac awake. Use the local URL on both devices, create a fresh lobby and
join its code. Exercise lanes, hop, boost and leap. Judge smoothness and whether
the extra visual delay feels acceptable. Solo/demo do not use the online buffer.
The local address can change after reconnecting Wi-Fi. Monitoring key stays in
.local/monitor-key.txt; do not share it. Dashboard history reset on the final local
restart; earlier smoke evidence is saved. No local fixture data was posted into
the user's live dashboard. A public WAN retest requires a separately authorized
deployment after local acceptance.

## Physical phone + Mac local test — October 28

Owner completed lobby UNWM3J and reported a noticeable reduction in stuttering,
with one visible stutter. Saved snapshot:
artifacts/readiness/local-phone-buffer-after-20261028.json. No deployment.

The captured local session includes lobby waiting plus the race, not only racing.
Mobile: 2,258 running-frame samples; one frame >50ms (56ms exact maximum).
Across mobile session network observations: 2,337 snapshot gaps; p95 bucket <=60ms,
p99 <=100ms; maximum 300ms. All 28 input acknowledgments were <=58ms and
23 RTT echoes were <=21ms. These acknowledgments do not measure visual response.
Buffer target reached 150ms (p95 bucket <=150ms); target is not actual maximum
visual latency. Three mobile buffer holds were recorded across lobby and race,
two >50ms, maximum 150ms. A mobile 300ms update gap and 150ms hold share the
reported timestamp 21:53:30.9 UTC during racing. This is a candidate for the
visible stutter, not a confirmed match without an owner timestamp. A separate
56ms running-frame spike occurred at 21:53:22.5 UTC.

Server racing history: maximum event-loop sample 14.11ms, no queued outbound
bytes; approximately 39.5–40 snapshots/second across two connections (20Hz each).
No browser/graphics errors or context losses. Browser-reported disconnects zero;
server totals record one disconnect after the race window. Mac running-frame
coverage was only 54 frames, so this is primarily a phone rendering observation.

Promising local acceptance, supported by owner perception and measured remaining
peaks. Prior phone test used public Render/WAN, whereas this uses the Mac/LAN;
there is no controlled physical-phone before/after percentage or proof of public
performance improvement. Next step is a separately authorized deployed retest
when desired. Gameplay and source unchanged during this measurement.

## Public phone retest — noticeable lag remains

Deployed ee90384 to Render Free, deploy dep-dbh6vgvb9u1s73amgb00; owner
reported "Noticeable lag" after public lobby Q9YEY3 started. Snapshot saved in
artifacts/readiness/public-buffer-lag-20261028.json. Mobile reports include lobby
and racing, so aggregate gap/hold totals are not race-only. 2,102 running frame
samples, max 27ms, zero frames >50ms. Mobile session: 1,365 gaps, 14 >100ms,
max 327ms (timestamp precedes first racing server sample); eight buffer holds,
seven >50ms, max 150ms. A 270ms gap and 150ms hold were also reported during
the racing server history interval. Target smoothing delay reached 150ms.
25 input acknowledgments <=88ms; 13 RTT echoes <=45ms. Neither measures full
input-to-screen response. Server racing event-loop samples peak 86.31ms with
zero send backlog. No browser/graphics errors. No measured >50ms render stalls
points toward update delivery/buffer behavior rather than a graphics freeze,
but does not isolate server, Wi-Fi, mobile scheduling, or transport root cause.
Local test is not a comparable public before/after benchmark. Need owner to
distinguish continuous sluggish controls from intermittent pauses/catch-up.
No further source changes, redeploy, or competition submission made.

## Local bounded prediction follow-up — October 28

User chose short visual prediction plus smooth correction after public freezes.
Backups: backups/pre-prediction-20261028.bundle (verified complete history) and
backups/pre-prediction-workspace-20261028.zip (11 existing modified/untracked
files, including previous test evidence). Local branch codex/bounded-prediction.
Public stays ee90384; no push/deployment/competition submission.

Render cursor can now continue at most 120ms beyond the newest server timestamp.
Forward speed derives from the last two confirmed distances, limited to game max
60.8m/s and latest own speed when available. Existing jump arcs and visual clocks
continue along that timeline. Lane changes and jump starts still need received
updates. The HUD, purchases, collisions, remaining time, standings and results
remain authoritative. Rendered running distance stays below the finish until
the server confirms it. No extra buffer latency added to steady delivery.

When a recovery changes the predicted position, residual differences <=6m ease
to the confirmed timeline with a 300ms smoothstep. Larger changes snap to
authority. New round/map/identity, server clock reversal and visibility changes
clear correction state. Hidden/long render resumes cannot start predicting again
until fresh data arrives. Existing hold metrics now count holds after the
prediction tail is exhausted; diagnostics add predictedSamples, maxPredictionMs,
correctionCount and maxCorrectionMeters. These diagnostics are local replay/API
values, not new dashboard charts or predicted-versus-real collision decisions.

Test-first evidence: missing-update continuation initially failed; jump landing
across an update gap initially rewound its arc; hidden resume initially restarted
prediction on stale data. All were reproduced and fixed. Reference interpolation
tests explicitly disable prediction. Landing now follows elapsed time through
the last confirmed interval instead of stretching the arc across lost updates.

Identical synthetic schedules compared with deployed ee90384 at 30m/s, 20Hz
snapshots and 60Hz rendering: 150ms batched delivery held frames 14->0; 250ms
40->6; 500ms 67->65. Worst hold for 250ms schedule fell about 217->100ms,
500ms 467->350ms. The long-outage profile still visibly holds and needs time
to recover its buffer. These are deterministic replay observations, not evidence
of actual phone or public improvement. Full output:
artifacts/performance/prediction-20261028.json.

Fresh review found no important correctness defect. 222 regular tests passed
(18 gated skips), 57 local network checks passed. Controlled prediction tests
cover capped travel, collision correction/convergence, zero speed, no fabricated
lanes/jumps/results, finish cap, jump recovery, hidden resume and clock reset.
Local build/release check and physical phone acceptance recorded separately.

Tradeoffs: known velocity can be wrong after an unseen hit. Correction can be
visible, large discrepancies snap, and long outages remain visible. No local
input prediction was added, so this targets brief freeze/catch-up rather than
input response. Public verification requires a later explicitly authorized deploy.
