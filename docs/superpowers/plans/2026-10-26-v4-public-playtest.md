# V4 Public Playtest Implementation Plan

> For agentic workers: implement the authorized V4 scope in disjoint files, then review and verify the integrated deployment. Existing user authorization covers deployment; account-access steps remain separate when required.

**Goal:** Deliver one HTTPS game link that works for phone and friend races.

**Architecture:** A single Render Docker web service hosts the existing frontend and authoritative Node WebSocket rooms. The browser derives WSS from the same URL. Private GitHub source supports repeatable deployments.

**Tech Stack:** JavaScript ES modules, Three.js 0.180.0, Node 22+, ws 8.22.0, Docker and Render Free.

**Spec:** `docs/versions/V4_DESIGN.md`.

**Live playtest:** [borrowed-time.onrender.com](https://borrowed-time.onrender.com). Render's first Docker deployment succeeded at runtime revision `c3f4749`; the [release record](../../versions/V4_RELEASE.md) tracks evidence. Physical-phone validation remains a user playtest step.

## Global constraints

- Preserve gameplay, privacy, four-player capacity and avatar assignments.
- One server instance; no shared-state rewrite, new dependencies or paid upgrades.
- No secrets in source or logs. Public assets remain allowlisted.
- Record actual evidence; do not claim physical-phone validation from resizing.

## Review focus

1. Docker context must contain every copied runtime file, including the developer preview.
2. Public proxy routing must preserve same-origin WSS and reject mismatched origins.
3. Short or rotated phone layouts must keep abilities and movement controls reachable.
4. Connection failure and free-service waking must be understandable without pretending reconnection exists.
5. All rooms disappear on restart; deploy/restart limitations must accompany the shared link.

## Task 1 — deployment package and smoke probe

Files: `.dockerignore`, `Dockerfile` if needed, `render.yaml`, `scripts/check-deployment.mjs`.

- [x] Correct the Docker context and configure a single free service with `/health`.
- [x] Add a bounded smoke CLI accepting an HTTPS origin (localhost HTTP allowed for development), checking assets and a two-client room through real WebSockets.
- [x] Run locally, then run against the actual public endpoint. Retain useful failure messages and clean up clients.

## Task 2 — phone layout

Files: `styles.css`; `src/main.js` only for a demonstrated pointer/orientation issue.

- [x] Add safe-area padding, usable mobile input sizes and coarse-pointer movement controls.
- [x] Add compact short-portrait and landscape layouts without disturbing desktop.
- [x] Browser-check 390×844, 375×667, 844×390 and desktop; exercise controls and rotation. Fix measured problems.

## Task 3 — publish and validate

Files: package version/lock, `index.html`, README, guide, changelog, V4 release record.

- [x] Update V4 labels and document deployment and phone/friend play instructions.
- [x] Create/reuse the private source repository and configure the free Render service with the tested revision.
- [x] Run full tests, real network checks, syntax/whitespace checks and independent review.
- [x] Confirm the public build, HTTPS/WSS, multi-client race and browser console; save evidence and share the live link.
- [x] Save a local release commit/tag only when its status is accurately documented (`v4.0.0-preview.1`).
