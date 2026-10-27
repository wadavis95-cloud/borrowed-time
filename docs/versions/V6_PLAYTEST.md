# V6 difficulty playtest

Version **6.0.0-preview.1** · Local playtest in progress.

The user rated the existing difficulty about 3/10 and requested an aggressive move toward 7.5/10, with permission to dial it back. This number is a playtest target, not a measured difficulty score.

## Course changes

| Course property | V5 practice seed 42 | V6 practice seed 42 |
| --- | --- | --- |
| Ground encounter rows | 15 | 25 |
| Ground obstacles | 20 | 56 |
| Ceiling-fall encounters | 5 | 6 |
| Typical blocked lanes per row | 1, sometimes 2 | 2 |
| Full-width hop rows | 0 | 6 |
| Ordinary spacing | 72–89m | About 43–48m early, 31–36m late |

Most encounters leave one empty lane, and that lane moves left or right by one lane per row. Every fourth row blocks all three lanes but includes exactly one low-rubble route that a free hop clears. Tall barriers and gaps make paid long jump an alternative. Wider 76–81m intervals reserve a separate ceiling-fall encounter; their existing warning duration remains readable.

The initial countdown, 50-second nominal clean run, acceleration, collision penalties, time pickups remain as in V5. The greater pressure comes from more frequent decisions and fewer empty escape lanes. The default visuals have since returned to the pre-Unity V4 presentation.

The tuning controls live in `src/game.js`: `encounterSpacing`, `minimumEncounterSpacing`, `encounterVariation`, `debrisEncounterSpacing`, and `debrisEvery`, plus the generator's full-width-row interval. Increasing ordinary spacing or making full-width rows less frequent provides a straightforward way to dial this back.

## Ability price playtest

Following feedback that escaping still felt too forgiving, boost now costs **6 seconds** (previously 3), and long jump costs **4 seconds** (previously 2). Durations, speed effects, starting clock and time pickups are unchanged. Both solo and multiplayer use these shared prices. A boost trades more escape time for race position; repeated purchases should carry a noticeable survival cost. This tuning does not reduce the margin for a player who never buys abilities.

## Fairness and verification

- Generated courses remain deterministic from their seed. Solo and server-owned multiplayer use the same generator.
- Structural checks across 64 seeds verify route connectivity, at least 24 ground rows, repeated hop decisions, no permanent easy lane, and tightening later intervals.
- An input controller cleared 128 generated courses without hits using lane changes and free hops only, sending decisions at 150ms intervals. It made no purchases. For seed 42 it used 29 lane changes and six hops. This establishes a viable route under the game rules; it does not establish human difficulty or phone reaction time.
- The four demo strategies retain distinct purchase plans and use ordinary inputs. Their navigation now understands a full-width row's free-hop route.
- `npm run check` passed. `npm test`: 97 passed, nine socket checks skipped. `npm run test:network`: 27 passed. The local deployment smoke check passed.
- The harder four-player browser demo completed without browser runtime errors.

Next playtest: assess whether the terrain demands sustained attention, whether the required hops read clearly, and whether boosts feel rewarding at the tighter spacing. Adjust after the user's assessment.

## Preservation

V5 is preserved at tag `v5.0.0-preview.1`, commit `a1deba010747b0a4673ca0779ebd8186fdb4371f`. Its verified full Git bundle is in the task backup directory `backups/v5-complete-20261027/`. V6 work is isolated on `codex/v6-difficulty-playtest`. Public Render deployment remains V4.

V6 reuses the unchanged V5 Unity runtime files under `assets/unity/v5/`; their build manifest correctly continues to identify the V5 visual export. No Unity re-export is necessary for these course rules, because the browser sends the generated course to Unity as data.
