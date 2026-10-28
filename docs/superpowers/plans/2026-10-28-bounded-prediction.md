# Bounded movement prediction implementation plan

Goal: reduce occasional freeze/catch-up during public update gaps. User chose bounded prediction plus smoother corrections; keep local, backup, no deployment/submission.

Architecture: retain authoritative snapshots/HUD. Extend render cursor at most 120ms beyond latest snapshot. Estimate forward velocity from two confirmed positions, capped by game maximum speed and latest declared speed when present. Do not predict lanes, purchases, collisions, results or jump starts. Advance existing jump countdown and visual elapsed/hazard time consistently, clamp distance before finish. Smooth prediction residuals with time-based correction, reset immediately on phase/round/map/identity/visibility or large discontinuities.

Approaches: larger buffer rejected due extra latency; full local simulation rejected due complexity/false authority. Chosen short render-only prediction covers limited delivery gaps; unseen collisions can still require correction. Builder choices: 120ms cap, ~100ms correction decay, 6m hard correction threshold, <=300ms correction lifetime.

Tasks (execute inline using executing-plans; TDD):
- [x] Backup committed source plus unstaged/untracked evidence.
- [x] Add failing tests: forward continuation/cap; unchanged authority; collision recovery without snap; end/reset/hidden safety.
- [x] Implement buffer timeline extension and per-racer visual correction.
- [x] Run regression tests and compare controlled delivery schedules against ee90384.
- [x] Fresh whole-change review, fix evidenced problems, full tests/build, local browser race.
- [x] Document results/limits; restart LAN server with same monitoring key; leave local test ready.

Constraints: rules/prices/render design/server tick unchanged; no push/deploy/submission. No new dependencies. Existing monitoring hold now measures actual cap-exhausted visual holds. Diagnostics expose predicted samples and largest prediction/correction for controlled comparison. Test long gaps, hidden tab, finish/phase, zero prediction reference mode, malformed speeds, lane/jump continuity.

Execution ledger: backup validated; prediction continuation RED->GREEN; gap-landing rewind RED->GREEN; stale visibility prediction RED->GREEN. Existing reference tests use maxPredictionMs:0 to preserve authority-only coverage. Fresh review /root/review_prediction found no important issue. No source changes to backend rules or transport. Initial defaults settled at 120ms horizon, 300ms smoothstep, 6m snap threshold. No new dependencies. Physical phone/WAN improvement remains unproven.
