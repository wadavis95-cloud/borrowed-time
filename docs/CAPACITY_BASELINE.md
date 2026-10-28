# Capacity baseline — October 28, 2026

## Scope and conclusion

The actual race server maintained its normal approximately 20 Hz feed at the current 25-room / 100-racer configuration in these local runs. No unexpected disconnects, input-confirmation timeouts or game error messages were observed in the baseline scenarios. The configured admission limits, not an observed CPU ceiling, are currently the first hard barrier. A separate disposable configuration also handled 200 and 400 racers in short local runs; this is not a recommendation to raise production limits.

No production game logic, prices, hosting settings or deployment changed. The app revision tested is `2270c3dfaa8d40af8f375ce633ef7bb2c113371c`. The harness is on branch `codex/capacity-baseline`.

## Method

- Actual server in a separate Node process, ephemeral loopback port; load driver in its own process on the same Mac. No public URL accepted by the tool.
- Host: Apple M5 Pro, 18 logical CPUs, 25.8 GB memory, v24.21.0. Production Docker uses Node 22 and different hardware.
- Four real WebSocket clients per room. Rooms rotate through all six maps as room count increases. Clients use legal demo decisions and real timers; no simulation shortcuts.
- Each regular measurement lasts 20 seconds after arrival and a 3.3-second countdown/warmup. The initial room/connection population is separate from the measured steady window. The burst case opens 25 room hosts concurrently, then joins each room's guests.
- Mixed workload: 100 racers plus 20 simulated cold-client visitors, four visitors concurrently, each retrieving the complete current preload asset set with at most six requests concurrently. Bodies are consumed; gzip transfer bytes use Content-Length. No browser decoding or Internet bandwidth shaping.
- CPU percentages are relative to one CPU core, from half-second samples. RSS is server process memory. Snapshot gap is arrival spacing (target 50 ms), not end-to-end latency. Lane confirmation measures command send to a snapshot showing its target lane; it excludes rendered-frame delay. Protocol ping RTT is recorded separately.
- Bounded sample reservoirs retain a deterministic full-window sample when more than 100,000 events occur; percentile estimates are marked by `truncated: true`. Actual event count and maximum remain recorded. Baseline 20-second measurements did not hit the sample limit.

## Results

| Racers | Workload | Updates/sec/client | p95 update gap ms | p95 lane confirmation ms | p95 server CPU | Peak RSS MB | Unexpected disconnects |
|---|---|---:|---:|---:|---:|---:|---:|
| 4 | steady | 19.8 | 51.3 | 45.3 | 6.7% | 79.8 | 0 |
| 20 | steady | 19.8 | 51.6 | 47.6 | 13.6% | 82.4 | 0 |
| 60 | steady | 19.8 | 51.9 | 51.1 | 24.0% | 92.6 | 0 |
| 100 | steady | 19.8 | 52.0 | 43.1 | 27.6% | 95.5 | 0 |
| 100 | burst | 19.7 | 52.0 | 46.2 | 28.0% | 98.1 | 0 |
| 100 | 20 download visitors | 19.8 | 52.0 | 54.5 | 26.6% | 156.4 | 0 |
| 200 | steady | 19.7 | 52.1 | 53.6 | 30.4% | 117.1 | 0 |
| 400 | steady | 19.7 | 51.8 | 56.9 | 43.2% | 156.3 | 0 |

The mixed case completed 580 HTTP requests with zero failures and transferred 334.6 MB of encoded response bodies, based on Content-Length. Loopback visitor completion times are not real phone load times; the OS file cache was likely warm. Server memory peaked at 156.4 MB in this case.

A separate 90-second repeated-race run retained 100 connected racers, automatically rematching as rooms finished. It recorded 176 client round-ID transitions, no unexpected disconnects, no lane-confirmation timeouts and a peak server RSS of 118.8 MB. Active racer count varies during finish/countdown transitions; this is not 100 continuously racing clients every second, nor a long-duration memory-leak certification.

## Hard limits verified

- Creating lobby 26 returns `SERVER_FULL`.
- Opening socket 129 is rejected with HTTP 503.
- Test lobbies are removed after the clients disconnect.
- Production defaults are unchanged. The exploration worker alone uses 256 rooms / 1,024 socket limits.

## Main bottleneck candidates

1. **Admission and demo amplification.** Each demo viewer consumes four sockets and a room. Twenty-five simultaneous demo viewers can occupy the current lobby capacity without 100 separate visitors.
2. **Outbound race data.** At 100 racers, the steady case delivered about 6.58 MB/s of application JSON, approximately 23.7 GB per hour if sustained. This excludes static downloads, TLS and framing overhead. A representative seeded four-player tunnel snapshot is about 2.7 KB; roof schedules alone are about 1.1 KB and are repeated, even when unchanged. Those schedules can change dynamically, so an optimization must send revisions rather than assume they are permanently static.
3. **Loading pressure.** The current character preload fetches all 24 models; serving static assets and simulating races share a process. The mixed test increased memory; real network bandwidth and browser decoding remain unmeasured.
4. **Single-instance availability and unknown hosted capacity.** No result proves Render free-instance capacity, geographic latency, phone frame rate or cold-start behavior. No hard compute ceiling was found within these bounded local scenarios.

## Next steps

Add lightweight observability before optimization: server CPU/RSS/event-loop lag, simulation backlog, room/socket occupancy, admissions/rejections, snapshot bytes and disconnects; client load time, frame time, errors, round-trip time and update gaps. Keep the metrics endpoint access-controlled and use aggregate data. Set alerts after observing healthy target-host behavior; local numbers are not production alert thresholds.

Then proceed to selected-map loading and versioned caching / CDN separation; isolate demos from multiplayer admission; improve recovery; introduce room-aware multi-server routing only when measurements justify it. A target-host staging load test, approved resource/bandwidth budget and longer soak remain necessary before making a public concurrency commitment.

## Reproduction

- `npm run test:capacity -- --profile=smoke --seconds=5`
- `npm run test:capacity -- --profile=baseline --seconds=20`
- `npm run test:capacity -- --profile=explore --seconds=20` (disposable raised limits only)
- `npm run test:capacity -- --profile=soak --seconds=90`

Raw reports: `artifacts/performance/capacity-baseline-1793190221947.json`, `artifacts/performance/capacity-explore-1793190553045.json`, `artifacts/performance/capacity-soak-1793190454050.json`. They contain hardware context, percentiles, message/error counts, bytes, and explicit limitations. Older exploratory runs are superseded by the report named here.

## Verification

The final tooling passes its safety/percentile checks within the 176 passing unit tests (11 optional network skips), the syntax checks, and the existing 40 real-network regression checks. A final smoke run verifies the renamed benchmark command, worker lifecycle, capacity guards and room cleanup. The benchmark filename intentionally avoids Node's automatic `*-test.mjs` discovery pattern so normal unit tests do not launch a load test.
