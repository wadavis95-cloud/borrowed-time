# Capacity baseline — implementation and experiment plan

First step of the approved non-functional workstream. Measure before optimizing. No production traffic, hosting changes, fees, gameplay changes or deployments.

1. Add an isolated child-process server using the actual game server, default limits, ephemeral loopback port and bounded CPU/memory/event-loop/backlog sampling. No diagnostic endpoint in the game.
2. Add a loopback-only driver with real WebSockets, six-map four-racer rooms, ordinary demo inputs, bounded measurements, rematches, timeout and teardown. Record startup time, snapshot cadence, protocol RTT, lane-change confirmation, bytes, disconnects and server/driver pressure separately.
3. Exercise normal ramps of 1, 5, 15 and 25 rooms, burst arrivals and configured room/socket limit rejection. Add concurrent representative cold downloads as a separate mixed workload. Optional higher-limit exploration changes only the disposable child configuration.
4. Test percentile/config validation, local-only guard, metrics teardown and capacity rejection. Run game regression checks. Save machine-readable results and a concise report with hardware/workload/measurement limitations. Local tests do not establish Render capacity or phone frame rate.
5. Continue later steps using the evidence: selected-map loading/cache/CDN design, demo isolation/admission, recovery, then room-aware multi-server scaling. Paid hosting/public load tests need a separately agreed environment and budget.
