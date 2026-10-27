# Three Maps Implementation Plan

**Goal:** Local V7 preview with Tunnel Escape, The Last Voyage, and Volcanic Jungle; four original characters per setting, thumbnail selection, multiplayer lobby voting. Do not deploy.

**Architecture:** Existing Three.js renderer and shared Node/browser rules remain. A map registry owns metadata, rosters, hazard labels and style. Server owns lobby votes and map resolution; selected map + seeded course travel in snapshots. Common collision categories keep movement and ability prices unchanged. Each environment and hazard presentation uses map-specific geometry.

**Constraints:** Current behind-runner camera; volcano ahead visibly erupting; current tunnel preserved; random distinct characters; 4-player races; Boost 5s and long jump 4s; no production changes.

**Backup:** Verified full Git bundle backups/pre-three-maps-20261027.bundle, baseline fa121b174e9468ab4d67b3e381ba431991516ba1. Clean tracked working tree before backup.

**Decisions:** Solo chooses directly. Lobby thumbnails double as one-vote-per-player buttons with visible counts, changeable until start. Plurality wins, server breaks ties randomly, no votes falls back to initial map. Host starts as today. Disconnected lobby votes removed. All racers use resolved map and four unique assigned themed avatars; rematches reopen votes. Ship has large deck/hull/rigging, side-entering cannonballs, cargo, barrels and broken deck. Jungle has trees, ferns, volcano ahead, erupting lava/smoke, falling hot rock, trunks and lava cracks. Warning/impact times remain authoritative.

## Tasks
- [x] Registry, deterministic map courses and map-scoped avatars; test invalid IDs, legacy tunnel, playable routes.
- [x] Server vote validation, resolution, map-scoped assignments and rematch/disconnect behavior; client and demo propagation; test shared state and tie cases.
- [x] Eight reproducible skinned character GLBs with distinctive themed equipment; retain original four and animation style.
- [x] Separate ship and jungle environments, map-specific hazards and lifecycle cleanup; preserve camera and tunnel rendering.
- [x] Responsive illustrated thumbnail picker with lobby vote counts, chosen-map label and minimal copy.
- [x] Full syntax, unit and network checks; real local solo and multiplayer browser checks for all maps, screenshots and version documentation. No push/deploy.

## Review focus
Unknown/malformed map votes rejected without changing state; joiners inherit room map; votes stop at countdown; departing votes removed; tied maps resolved once; no mixed-map geometry/course in client; repeated map switching releases owned resources; all maps retain a free-hop escape route; camera/volcano readability on phone.


## Execution record

Completed locally on `codex/v7-three-maps`. Later user steering added lobby voting and automatic role names; removed the name field and made server role names update on a changed winning map. Original assets preserved byte-for-byte. Unit checks observed failing before map implementation, automatic names, and UV regression fixes, then passing.

Independent whole-change review found a missing-UV batching issue; corrected by preserving existing UVs and adding placeholders only for untextured leaves, with regression coverage. No vote/name/map consistency issues found. Final checks: syntax and diff checks, 123 unit passes (10 network skips), 33 real-network passes, local release checker, desktop/phone-width browser checks and screenshots. No deployment or remote push.
