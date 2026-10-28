# Local spike measurements and adaptive movement buffer

Approved scope: back up current game; reveal rare spikes; queue and smooth real
server snapshots under uneven arrivals. Local only. Preserve authoritative game
rules, prices, 20Hz transport, graphics and audio. No prediction, deploy or entry.

Design: bounded queue on a server-time timeline, delay starts100ms and adapts within
75–150ms; render cursor advances monotonically with gentle speed adjustments.
Round/map/identity/clock discontinuity reset, immediate authoritative finish and
membership changes, latest hazard schedule, one buffered clock for motion/hazards.
No extrapolation past received state; a long outage still stops rendering progress.
Queue caps32 snapshots and arrival measurements40. Fixed50ms configuration retains
an explicit reference mode for existing interpolation assertions.

Measurements: keep existing histograms, add p99 bounds, exact maxima with coarse
client timestamps, per-device/per-mode network summaries, buffer delay/hold and
underrun counts. At most one peak per measured kind per report; dashboard lists up
to24 recent threshold-exceeding report peaks, not an exhaustive event log. Fixed
schema/caps/2048-byte ingress/30min retention/authentication unchanged. Old reports
remain valid; missing maxima remain missing. Add event-loop maximum to existing
server chart. Do not infer cause from client timestamps without clock alignment.

Execution:
1. Write failing jitter, ordering/phase/stall and bounded peak-ingestion tests.
2. Implement buffer and instrumentation, preserve current source routes/build.
3. Replay controlled real-snapshot arrivals against pre-change buffer; report held
   frames, worst step and render delay. This is not a physical phone benchmark.
4. Run regression/network tests, rebuild/restart local game, inspect game+monitor.
5. Fresh whole-change review, fix important findings, document local playtest,
   preserve checkpoint/backup. No push, deploy, hosting change or submission.

Ledger:
- Pre-change bundle verified; branch codex/spike-movement-buffer at0785696.
- RED→GREEN: deterministic batched arrivals exposed zero-duration interpolation;
  adaptive queue, stall/ordering/phase/reset tests now pass.
- RED→GREEN: peak/p99/schema/real-HTTP tests; bounded timestamps/server pauses visible.
- Controlled replay: held frames50→14 for network batches;25→3 for100ms server
  pauses; steady visual delay50→75ms, burst p95 delay87→180ms. Long outages still hold.
- Final review: fixed jump-arc rewind with monotonic-arc regression RED→GREEN,
  including landing kind reset. Fixed suspended hold timing with long/short
  visibility regression RED→GREEN. Full suite213 pass/18 gated skips; network57 pass.
- Final: minor (deferred): device/mode dashboard breakdown rows show p95; p99/max
  remain in protected API and recent per-device report peaks.
- User steering: local HTTP playtests muted by default; HTTPS default-on preserved.
- Local browser game/monitor verified, actual111.5ms gap surfaced with zero underruns;
  final muted page verified. Build/syntax/whitespace and87-asset local checker passed.
- Local branch is preserved for user testing. Nothing pushed, deployed or submitted.
