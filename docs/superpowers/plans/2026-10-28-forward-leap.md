# V8.8 forward long-jump playtest

User approved a lower, forward-oriented long jump that competes better with Boost. Local only; no deployment/submission. Backup: backups/pre-v8.8-forward-leap-20261028.bundle, baseline621b6d3.

First-pass tuning: keep cost4s, shorten paid airtime1.4→1.2s, lower apex3→2.6 (barrier threshold remains2.2), add1.9× forward speed only while paid jump is airborne. Boost remains1.85×/4s/cost5; simultaneous movement bonuses use max rather than multiplying, stun still applies. Free hop unchanged. Shared getJumpHeight stays collision/render authority; no invulnerability or fake position offsets. Add forward lunge pose/leg extension from public jump timing, retaining fixed side-to-side posture.

- [x] Tests first: independent distance/endpoint, stacking, pause, barrier/gap clearance, projected travel consistency, leap-aware hazard scheduling.
- [x] Implement physics plus shared travel projection, update CPU/coach anticipation and hazard arrival predictions; synchronize public pose and ability copy.
- [x] Run unit/network/demo/solo all-map checks, browser leap/landing and multiplayer samples; compare before/after, independent review.
- [x] Document tuning/evidence and commit locally. Prices/otherabilities unchanged, character/session features retained.

Execution: missing projection export failed the new tests before implementation. Implemented lower/quicker paid leap, actual speed and shared projections; updated fixtures to preserve their collision/timing intent.163 unit pass/11 default socket skips;40 network pass;70-asset local checker pass. Public paid pose regression passes; independent review found no actionable defects. Browser E/button purchase4s, relative lead/pose/restart inspected; no console errors. All6 maps' CPU diagnostic runs escaped without hits. No deployment/submission.
