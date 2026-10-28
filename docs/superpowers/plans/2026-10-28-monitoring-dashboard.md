# Local monitoring dashboard

Authorized scope: monitoring for capacity, bandwidth, responsiveness, loading and stability. No gameplay/pricing/visual changes, external analytics vendor, hosting purchase or deployment.

- Bounded server counters and one-second CPU/RSS/event-loop/backlog history. Count rooms/sockets, admissions, messages, snapshots, slow clients, disconnects, HTTP status/body bytes by fixed category. Distinguish asset bodies from race JSON and mark startup totals/rate projections honestly.
- Aggregate opt-in-by-server browser diagnostics: navigation-to-first-render time, visible running frame histogram, long tasks, application RTT, update gaps and fixed error counters. No names, codes, IDs, IPs, URLs, stack traces or persistent browser tracking. Bounded payloads/rate caps/rolling windows; explicitly label observations rather than unique users.
- Same-origin protected metrics API with strong environment key and timing-safe comparison. No key in URLs or storage. Metrics disabled without configuration. Public telemetry ingestion strictly validates fixed schema, Origin, size and volume; client observations are untrusted and cannot affect game state.
- Separate responsive /monitor UI, accessible charts/cards, stale/missing states, restrained provisional alerts. One-second server history, dashboard polls every two seconds. HTTP monitoring must exclude its own polling traffic from game bandwidth.
- A local launcher creates an ignored 0600 key file and starts the game with monitoring enabled. Tests cover auth/disabled access, bounded aggregation, malformed telemetry, and isolation from gameplay. Verify real local browser and multiplayer flow, document limits and usage.
