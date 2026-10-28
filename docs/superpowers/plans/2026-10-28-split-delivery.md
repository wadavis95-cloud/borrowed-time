# Separate static delivery and race timing

User authorizes local split of file/music delivery and server update timing, backup, no deploy/submission. Existing selected architecture: static origin serves game; race origin owns WebSockets and protected metrics; do not change rules/prices/prediction. Keep combined default compatibility.

Builder choices: local assets :4173 and race :4174; explicit configured race origin runtime JS (no key), strict allowed browser origins for WS and telemetry CORS. No wildcard origins/credentials; monitoring authorization remains Bearer key and is served on race origin. Static export copies only existing public allowlist plus hashed browser files and compressed variants; excludes private/server/repository data. No CDN vendor setup yet. This local separation is a rehearsal, not evidence of distributed/CDN performance.

Timing: optional snapshot metadata with monotonic scheduledAt/sentAt and periodic marker. Browser observes server callback/snapshot preparation delay, server send interval, and positive excess arrival interval over send interval; no clock-synchronized one-way latency claims. Missing metadata/old packet and visibility/reconnect reset safely. Fixed numeric aggregate histograms, bounded reports/retention, no per-player identity. Display in dashboard with device summaries.

Tasks (inline execution, TDD, fresh final review):
- Backup and inspect existing public file boundary.
- RED/GREEN role routing, runtime endpoints, CORS/WS allowlist, safe static export.
- RED/GREEN wire preservation, timing math/reset, telemetry validation/size.
- Verify combined and split network/browser flow; full tests/build; save local metrics and instructions.
- Local processes ready; no remote mutations or submission.

Completed: backups, role/export/CORS/WS and timing test-first checks, actual split browser race/purchases, review fixes, full verification and dashboard proof. Review findings RED/GREEN: malformed absolute request crash and slightly early callback filtering. Final source validated; local-only. 227 regular/60 network passed. CDN remains prepared export, not provisioned. See docs/SPLIT_DELIVERY.md for limits and next test.
