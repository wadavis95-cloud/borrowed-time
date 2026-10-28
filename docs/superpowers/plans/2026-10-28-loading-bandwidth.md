# Local loading and bandwidth optimization

Approved scope: compact multiplayer snapshots at unchanged 20 Hz; minified, hashed,
precompressed browser JavaScript/CSS. Preserve gameplay, prices, art and music.
No deployment or public load test.

1. Preserve verified pre-change bundle and branch. Test snapshot encoder/decoder
   against canonical room snapshots, including changed hazards, roster and rounds.
   Opt in new browsers; legacy clients keep full snapshots.
2. Build split browser bundles with esbuild, hash names, gzip/Brotli at build time.
   Serve only manifest-listed files, immutable hashed code and fresh HTML. Retain
   source routes for compatibility. Build inside Docker; no dev tool in runtime.
3. Verify local network lifecycle and browser, measure equivalent legacy/compact
   traffic and code transfer sizes, run regression checks and one fresh review.
4. Document evidence and limitations, preserve local checkpoint; user tests before
   deployment.

Ledger:
- Backup verified at backups/pre-wire-build-20261028.bundle; branch codex/compact-race-build.
- Snapshot test observed RED (missing encoder module), then GREEN on all maps;
  serialized roundtrip, skipped packet rejection and real mixed-client lifecycle covered.
- Build and HTTP tests observed RED (missing build module, then hashed route404),
  then GREEN for minification, compressed roundtrip, hash URLs, cache, HEAD and exclusions.
- Dashboard traffic classification test observed RED then GREEN for hashed admin bundles.
- 100-racer local comparison: 59.4% fewer wire bytes; 19.6Hz, zero disconnects both formats.
- Local build and browser demo verified; Docker executable unavailable, container build pending.
- Final verification: 198 regular tests pass (17 gated skips); 56 real-network
  checks pass; syntax and whitespace checks pass; local release checker validates
  85 source assets, hashed entry compression/cache and compact two-player race.
- Real browser: hashed entry confirmed in DOM, demo and two-browser race/results
  work with no console errors. Independent whole-branch review: no findings;
  reviewer could not bind sockets, so author-run network evidence is retained.
- Keeping the local branch/workspace for user testing; no push or deploy.
