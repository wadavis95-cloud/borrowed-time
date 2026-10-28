# V8.3 Audio and atmosphere implementation plan

> Execute inline with superpowers:executing-plans. Final independent review before completion.

Goal: Complete the user's selected audio and atmosphere polish, locally, preserving V8.2 and every gameplay rule.
Architecture: Web Audio procedural surface cues, sparse original musical bed and map-specific warning sounds. Three.js bounded cosmetic atmosphere, existing sail/foliage animation, no new dependencies/assets or external services.

User scope is the two proposals immediately preceding approval. Ruling: use the existing renderer/audio pipeline and subtle original procedural music; no framework migration or additional menu. Sound remains opt-in/muted, hidden/paused/reset/dispose stop voices. Visual effects respect reduced motion and never become hazard cues or cover lanes. Keep 5s/4s, physics, room authority and maps unchanged. Backup verified at backups/pre-v8.3-audio-atmosphere-20261027.bundle (ff0bb29 baseline).

- [x] Write meaningful tests for surface profiles, authoritative near-hazard audio, dedup/reset, bounded resources and atmosphere lane exclusion/reduced motion/disposal.
- [x] Implement pure audio scene observer, integrate map footsteps/landings, danger warning/impact, gentle ambience and sparse tonal musical sequence. Clock budget affects musical urgency only, never hazards.
- [x] Add bounded ambient presentation on all six maps, animate existing sails/crowns and improve expansion particle drift. Retain obstacle readability and camera.
- [x] Syntax/unit/network/local release checks, browser all maps/sound toggle/replay, responsive screenshot. Independent review; fix material findings.
- [x] Record V8.3 local notes, preserve public version, commit locally; no push/deploy.

Execution record: audio-scene and atmosphere tests first failed for missing modules, then passed after implementation. Audio graph test checks real update scheduling and resource lifecycle with a mocked AudioContext. Independent whole-branch review found reversed optical flow; a regression reproduced failure, then passed after reversing the particle travel term and fixing station beacons to authored support positions. Unit suite:143 pass/11 network skips; network:37 pass; local checker:64 assets and shared race flows pass. Browser:all maps start with audio enabled, pause/mute, no console errors; 390×844 fits with abilities visible. Tone and physical-phone performance remain user playtest judgments. No production access, push or deployment.
