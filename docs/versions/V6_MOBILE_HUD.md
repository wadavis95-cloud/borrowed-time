# Local mobile HUD and contextual ability hints

Status: local only, branch `codex/v6-mobile-hud`. The public release remains runtime revision `4d53cc0` / tag `v6.0.0-preview.1`. No push or deployment is part of this update.

## Reference games

- [Mario Kart 8 official manual, Game Screen](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/wii_u_6/mario_kart_8/ElectronicManual_WiiU_MarioKart8_EN.pdf), page 23: compact information placed at the edges, including current position.
- [Gran Turismo 7 display settings](https://www.gran-turismo.com/us/gt7/manual/drivingoption/05): race information and the driver list have separate display settings.
- [Call of Duty: Mobile introductory training](https://blog.activision.com/call-of-duty/2019-09/Call-of-Duty-Mobile-Boot-Camp-Part-1-Getting-Started-in-the-Game): teaches controls through an interactive briefing and on-screen prompts. The particular button-glow behavior below is our adaptation, not a claim that we replicated its tutorial exactly.

## Leaderboard

The old `position: sticky` block could remain over the phone viewport while the player scrolled toward the ability controls. The new live list is an absolutely positioned child of the clipped course arena. It occupies a small upper-left corner, outside the central running path. It has no pointer events and cannot intercept taps on the canvas or controls. The current position appears above four compact names; escaped/DNF symbols have full accessible labels. During a race, redundant room text is collapsed to one line.

When the local racer finishes or loses, the same list moves into the results panel as normal content, above the rematch button. Full escaped/DNF labels appear there, including while other racers are still running. It does not float over that button.

## Abilities and contextual hints

Boost is red; long jump is blue. Both retain readable names, prices, keyboard badges, disabled and active states, so color alone is not the only cue.

`src/ability-coach.js` considers only the local player's game state. It tracks confirmed usage independently for each ability during the current run. Hints reset for a new run/rematch. It does not buy abilities, change costs or modify game state.

- Boost can be highlighted after the opening moment when a purchasable immediate sprint is clear in the current lane, the runner is grounded and unstunned, and there is enough clock buffer. The next obstacle may still require steering after that immediate clear stretch; the hint is not a promise of a hazard-free four-second boost.
- Long jump can be highlighted for an approaching barrier or gap in the current lane only inside a usable jump window. Barrier checks include a short reaction allowance; gap checks include its far edge. Low rubble is handled by the free hop and does not sell a paid jump.
- A roof impact in the near path suppresses these suggestions: neither skill protects against a falling slab.
- Only one button highlights at a time, with long-jump opportunities taking precedence. The short glow stays on the existing button with a tiny label. No modal, camera changes, pause, forced input, or blocking tutorial.
- Successful use stops that ability's hints for the run. Ignored cues expire; the same opportunity does not repeat, and each ability is limited to two separated opportunities per run. Reduced motion gets a steady outline.

## Verification

112 standard tests passed; all 29 network tests passed separately. Coach tests cover a safe boost, immediate dismissal after use, a usable barrier/gap purchase, insufficient clock, late jumps, free-hop rubble, roof danger, disabled/demo hints, expiry and repeat limits. Existing course, collision, privacy and socket checks remain passing.

Browser checks at 390×844 verified the live list is inside the arena, uses absolute positioning and `pointer-events: none`, and the boost button remains the hit target at its center. A two-player race displayed full DNF results inside the results panel. The opening contextual Boost hint appeared in a real solo run and disappeared immediately after a successful purchase. These are browser viewport checks; physical-phone testing of the revised local build remains pending.

The four-player live HUD also remained inside the arena with pointer events disabled. At 844×390 landscape, neither ability button overlapped the leaderboard and the page had no horizontal overflow. The local deployment smoke passed with 26 assets, two WebSocket clients, both ability purchases, standings and cleanup. Captures: [four-player corner HUD](../images/v6-local-mobile-hud.png), [contextual Boost hint](../images/v6-contextual-ability-hint.png), [normal-flow results](../images/v6-local-hud-results.png).
