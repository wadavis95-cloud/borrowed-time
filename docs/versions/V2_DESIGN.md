# V2 — escape into daylight

Status: first playable preview implemented and locally verified, October 26, 2026. See [V2 release record](V2_RELEASE.md). V1 is preserved at tag `v1.0.0`.

## Agreed direction

- Keep the existing three-lane race, time purchases, solo practice and private multiplayer.
- Replace the flat corridor presentation with a stylized 3D Victorian railway tunnel. Begin in cool shadow and approach warm daylight and a London-inspired clock-tower skyline. Lighting follows course distance, not the spendable countdown.
- Add visible falling masonry with a clear warning, a fall, an impact and ground rubble. Dangerous debris slows and penalizes players through the server-owned rules.
- Two distinct starting avatars: Courier (brown-skinned woman, curly ponytail, burgundy/ivory jacket and satchel) and Engineer (broader man, copper hair, gold work shirt, charcoal overalls and goggles).
- Assign avatars automatically. No character-selection menu or required name entry. Keep assignments through rematches.
- User explicitly chose to retain four-player rooms for this first V2 build. Avatars can repeat; player colors remain distinct. Additional characters are deferred.

## Implementation decisions

Use Three.js 0.180.0 with the existing browser ES modules and Node/ws backend. Serve its two browser modules locally with an explicit allowlist; no CDN or frontend build step is required. Keep the renderer's `createRenderer(canvas)` / `draw(state, animationTime, dt, opponents)` interface. Original articulated procedural 3D models and a modular tunnel provide a playable starting point; the approved concept images are art references, not production meshes or a promise of identical fidelity.

Alternatives considered: continuing Canvas 2D would preserve a small dependency footprint but makes real geometry, lighting and expressive avatars harder; a new full game-engine project would replace too much of the learning project. Three.js adds 3D rendering while preserving the current readable architecture. This technical choice is the implementer's decision under the user's instruction to begin V2.

## Shared contracts

- `src/avatars.js` exports `AVATAR_IDS` and metadata for `courier` and `engineer`. `game.avatarId` identifies the local model; public players include `avatarId` and their existing color. The server ignores client attempts to select an avatar.
- `src/hazards.js` exports `createFallingDebris(seed, obstacles)` and `getDebrisPhase(event, elapsed)`. An event has `{id, lane, z, warnAt, fallAt, impactAt}`. Phases are `waiting`, `warning`, `falling`, `landed`. Schedules are deterministic per course and evaluated using the authoritative simulated race clock.
- `createGame` stores `debris`, `avatarId`, and per-player resolution information. Custom test courses default to no debris unless explicitly supplied. Online views regenerate immutable geometry/schedules from the shared seed and use the interpolated race clock for presentation.
- `src/graphics/avatars.js` exports `createAvatar(avatarId, {ghost, color})`, returning `{group, update(state, dt), dispose()}`. Feet are y=0; nominal height is 1.8 world units; the character faces -Z; animations do not change race rules. Three lanes are x=-2.4, 0, 2.4.
- `src/renderer.js` owns Three.js camera, scene and renderer; `src/graphics/tunnel.js` owns environment geometry. World forward is -Z. Relative depth is obstacle distance minus player distance. Rendering must not mutate authoritative state.

## Gameplay and fairness

Keep 60 seconds, a 900m course, boost cost 3s, long-jump cost 2s, and existing hit response (3s and a brief slowdown). Falling impact cannot be avoided by hopping underneath it; landed rubble can be hopped. Each chunk can penalize one player at most once, including impact plus aftermath. Events are sparse single-lane hazards spaced between regular encounters. Keep an open route and adequate warning at boosted speed. Large timesteps must not skip impacts. Pause freezes solo hazards; online races continue when a tab is hidden. Rematches reset events while preserving avatar assignments.

## Presentation and scope

Show articulated avatars, translucent opponents with stable identifying accents, stone arches, rails, lamps, dust, readable hazards and a visible exit. Restrict expensive shadows and cap rendering resolution. Maintain keyboard and touch controls and reduced-motion behavior. Report unsupported WebGL clearly without breaking room cleanup. Do not add accounts, matchmaking, character selection, new abilities, public hosting or a structural physics simulation.

## Acceptance

Verify dark/middle/daylight views, both avatars, warning/fall/impact/aftermath, actual slowdown, two independent browser clients and four-client protocol capacity, avatar stability through rematches, solo pause, mobile layout and no normal-play console errors. Automated tests cover collision timing, seeded schedule consistency, avatar assignment and snapshot privacy. Record real results and remaining art/device limits in `V2_RELEASE.md`.
