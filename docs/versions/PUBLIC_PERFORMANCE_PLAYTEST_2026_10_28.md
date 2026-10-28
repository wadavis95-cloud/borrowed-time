# Public performance playtest — October 28, 2026

Game: https://borrowed-time.onrender.com/
Protected operations dashboard: https://borrowed-time.onrender.com/monitor#experience

Runtime commit: `aaac5d5e5fa93558c5589af0ba0dfeb964a1f206`. Render service `srv-dbfpmdss728c73cgrqu0`, one existing Free Docker instance in Virginia. Final configuration deploy: https://dashboard.render.com/web/srv-dbfpmdss728c73cgrqu0/deploys/dep-dbh0vum7bikc73875ijg — service logs confirmed live October 28 at 11:09:21 AM EDT. The user authorized deployment and separately approved protected hosted monitoring. No competition submission, hosting upgrade or extra instance was created.

## Included changes

The public game now includes the approved brighter lighting/model-detail passes, browser-only four-racer demo, selected-map character loading, versioned model/music/thumbnail caching, bounded aggregate diagnostics and 30-minute monitoring retention. Gameplay rules and ability prices remain unchanged. The page badge reads PLAYTEST. Music tracks and credits remain intact.

## Verification

- Existing code checks: 187 default passes (15 network-gated skips), 51 real-network passes; syntax/whitespace and all 36 asset-version hashes passed before rollout.
- Public release smoke passed on this runtime code: health, all 84 public assets, Unity fallback headers, metrics access protection, two-player same-origin WebSockets, movement, purchaser-only boost/long jump, shared hazards, standings and cleanup. The test used one disposable lobby, not a load test.
- Public version-manifest bytes matched local; exact versioned model/music/thumbnail HEAD responses advertised immutable caching.
- After applying monitoring configuration, `/ops/config` returned enabled; unauthenticated metrics returned 401, the approved key returned 200, and the live window was 1,800 seconds. Real public browser readiness/map-switch reports reached the dashboard with no observed console errors. No credentials are included in reports, source or documentation.
- Public Orbital demo rendered successfully. Hosted phone measurements remain the next test, rather than a claimed resolution of the earlier first-load delay.

## Private monitoring access

The approved hosted key is stored locally in ignored `.local/render-monitor-key.txt` with owner-only permissions and as `MONITOR_TOKEN` in Render. The local/LAN server retains its separate `.local/monitor-key.txt`; those dashboards measure different server processes. Keys are never embedded in URLs, committed to Git, copied into Docker build contexts, or retained by the dashboard after locking. The hosted dashboard's local-setup hint describes the local launcher; for hosted access use the hosted key above. No credential value should be copied into documentation or chat.

The initial environment entry did not enable monitoring; the editor value was corrected and the already approved key was retained. A proposed key replacement was blocked by approval review; no replacement was applied to Render. Final API and browser verification used the approved configured key.

## Phone test and interpretation

Use the public HTTPS game URL on the actual phone, visit each map once, revisit maps and run full races. Inspect the public dashboard's mobile/touch segment rather than localhost. First-in-tab preparation can use browser-cached bytes; a repeat test alone cannot reproduce a cold download. The reported earlier Orbital 5–7 second delay and the possibility of Mac sleep remain hypotheses to test, not bugs declared fixed. Draw submission still differs from confirmed visible presentation.

Render's dashboard warns that the Free service can spin down when idle and that waking may delay requests by 50 seconds or more. That first-page wait must be distinguished from map-switch time once the game is open. This deployment removes the Mac's sleep state from hosting but does not remove free-host wake-up delays. Thirty-minute records are bounded and memory-only; restarts/spin-downs can reset them. Capture important results promptly.

Rollback: previous public runtime `db366689e2e910720e6c518d97678f42f0bb6292` remains in Git/Render history. Pre-deploy bundle `backups/pre-public-loading-deploy-20261028.bundle` preserves that revision and the tested checkpoint. Keep the approved key private when returning to older code without monitoring.

Post-deploy proof: `artifacts/performance/public-performance-verification-20261028.json` records real public browser reports, 9,360 demo-frame observations, zero race sockets/rooms and no reported browser/graphics errors. This is a functional verification, not a phone or capacity benchmark. Screenshots: `docs/images/public-performance-game.png` and `docs/images/public-performance-monitor.png`.
