# Selected-map loading and cache trial

Approved scope: load only the current map roster, version immutable assets, measure map selection through first completed draw, separate mobile/desktop estimates from controls; preserve rules and visuals; local only. Keep backup. Phone measurements are required before accepting phone latency; desktop emulation is not proof.

Approach: per-avatar promise/cache rather than rebuilding a second asset pipeline; content-hash URLs for models, music and thumbnails, leaving HTML/modules no-store; bounded aggregate first-in-tab/in-memory map timings with device estimates. This avoids service-worker invalidation complexity and speculative downloads. Browser cache can be evicted; all misses use normal loading. Loaded characters stay in memory for this trial, so visiting every map still grows memory.

1. Tests first: requested roster only, concurrent reuse, partial failure retry; preparation cannot draw early, latest selection wins, timing ends after draw, hidden/cancelled samples excluded.
2. Add per-ID loader and selected initial roster. Coordinate map switches, votes, menu returns, demos and portraits; loading gates drawing/inputs. Multiplayer clocks retain authority and can continue during loading.
3. Generate committed SHA-256 version manifest for model/music/thumbnail bytes. Client uses versions; server grants immutable caching only on exact known versions. Stale/unversioned URLs and HTML/modules remain no-store. Test manifest freshness and real response headers including gzip/HEAD.
4. Add bounded first/repeat switch histograms and coarse estimated device class; aggregate by map/device/controls and expose on dashboard. No raw user agents or identities collected. Test schema and reports.
5. Full default/network/asset checks; actual browser cold/repeat/map switching and race. Record local bytes/timing with explicit hardware/cache limits, save screenshots. Leave phone results pending until actual phone tests. Local checkpoint and verified post-change bundle; do not deploy.

Ledger: started at a13e283. No separate design approval needed: user approved the preceding detailed approach and explicitly requested execution. Use existing repository branch/workspace to preserve the running local setup; no unrelated work is modified.

## Execution ledger

Tasks 1–4 complete: tests observed red then green; per-character cache, selection coordinator, content hashes and bounded device/switch metrics implemented. Default suite: 184 pass / 15 gated skips; network suite: 48 pass; release check: 84 assets plus race flow. Browser proof and raw aggregate reports saved.

Fresh review found hidden cancellation reactivated by pending completion, keyboard input behind the loading overlay, progress cache omitting percentage, and tablet hints misclassified. All verified against code; pending-cancel and tablet cases observed red then fixed, UI guards/progress corrected, full suite green. No rule/price change.

Ruling: retain server-owned countdown behavior in this local trial rather than silently expanding the multiplayer protocol. Local inputs/drawing are gated, but slow-phone asset readiness needs explicit testing before rollout. Cost if wrong: a slow client could miss part of an online race; documented as an acceptance limitation, not declared solved.

Ruling: retain in-memory models for visited maps; no eviction or speculative prefetch. This isolates selective loading/cache effects and preserves shared geometry ownership. Cost: all-map browsing can grow memory, to be evaluated on actual phones.

Measurement acceptance: first downloads shrink 83.2%, cached return assets download zero bytes. Local switches <=500 ms; some exceed proposed <=200 ms, so phone acceptance remains pending and no deployment is performed.
