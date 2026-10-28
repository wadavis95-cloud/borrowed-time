# V8.1 local polish plan

User approved obstacle readability and movement feedback across all six maps; gameplay and ability prices must remain identical. Do not deploy or push. Preserve V8 in a verified complete-history bundle before editing.

- [x] Shared readable hazard art: contrast pads, low single-chevron hop cues, tall double-chevron amber cues, dark gaps with clear near/far edges. Preserve themed silhouettes and rule geometry.
- [x] Timed-impact warning art: high-contrast footprint, non-color-only warning icon and countdown ring driven by existing server times, reduced-motion support. Landed hazards become readable low obstacles.
- [x] Local movement feedback: bounded map-specific footstep, takeoff, landing and hit particles; subtle landing contact response; no added camera shake, no lane banking, no opponent private effects. Preserve jump height and movement timing.
- [x] Tests for semantic cue categories/bounds, warning time state, immutable simulation state, feedback lifecycle, pause/reset/reduced motion and lane posture. Verify existing physics, course generation and all six network flows unchanged.
- [x] Browser-test each map, a real local demo, manual controls, phone-size layout; capture proof, document changes and commit locally for user testing.

Approach: separate data-only feedback tracker and original procedural readable geometry from renderer coordination. Existing rules/config/assets remain untouched. No new dependencies or external artwork. Version 8.1 local; public V8 remains runtime 8f9552f.


Execution record: verified backup of baseline 60566eb; local branch codex/v8.1-local-polish. Meaningful RED→GREEN checks for cue modules, lane banking and hidden gap rims. Independent review's exposed-rim finding fixed and pinned with raycasts. Final syntax/diff checks pass, 130 unit tests and 37 network checks pass, localhost checker verifies 60 assets. Browser checks cover all six maps, manual controls, the snow/ship demos, and 390px layout. Core gameplay/network/map/audio files unchanged. No push or deployment.
