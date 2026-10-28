# V8.10 — local lighting and shadow trial

Goal: reveal the existing characters and scenery as three-dimensional forms while retaining the bright, colorful game. No model, camera, gameplay, ability price, music or networking changes.

## Presentation changes

- Stronger directional key from above and to one side, with less uniform skylight and front fill. Snow retains extra skylight; Orbital gets cool fill.
- Gentle rear edge lighting to separate the runner from scenery. Warm outdoor edges and cool orbital/snow edges preserve map identity.
- One soft shadow map, with a wider local coverage area and adjusted bias: 2048 pixels for fine pointers, 1024 for coarse pointers. Fill and edge lights cast no additional shadows.
- A broader, lighter contact shadow grounds the runner while fading with jump height and responding to landings.
- Tunnel structural trim and rubble now cast local shadows. The solid roof does not cast an all-covering daylight shadow, preserving the stylized bright tunnel.

The existing physically lit scenery materials already respond to the new light direction; no expensive screen-space postprocessing was introduced. The painted sky and distant landmarks retain their authored art.

## Backup and status

Complete verified Git backup: `backups/pre-v8.10-lighting-20261028.bundle`, preserving deployed commit `db366689e2e910720e6c518d97678f42f0bb6292`. The trial lives on `codex/v8.10-lighting-depth`; nothing pushed or deployed.

## Review

All six maps opened in the local browser with no reported browser errors. Checked paid leap and lane input. Desktop screenshots show directional scenery shadows, readable runners and retained bright outdoor colors. Physical phone frame rate and the user's visual preference remain for playtesting; the lower touch shadow resolution is a budget choice, not a claim of measured phone performance.
