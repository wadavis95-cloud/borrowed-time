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
