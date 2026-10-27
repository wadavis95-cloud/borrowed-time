# V6 public friend playtest

Version: `6.0.0-preview.1`.

Play: https://borrowed-time.onrender.com/

Release prepared October 27, 2026. Public verification is recorded after deployment completes.

## Included changes

- Brighter pre-Unity Three.js visuals with four separate avatars.
- Harder terrain, an accelerating pace and more roof-fall encounters.
- Roof sections crack and detach, exposing sky. Shared collapse timing follows approaching racers and accounts for boosts.
- Boost costs six seconds; long jump costs four seconds.
- Live race positions and escaped/DNF results.
- Fresh randomized solo runs and server-generated shared courses for each multiplayer race/rematch.
- Less on-screen text and lime/purple ability buttons.
- Input-aware controls: A/D movement, W/up hop, Q boost, E long jump on keyboard; swipe hints, movement buttons and abilities on touch. Hybrid devices follow actual input.

## Hosting and preservation

The existing Render Free Docker service remains `srv-dbfpmdss728c73cgrqu0`, one instance in Virginia, with automatic deployment from the private repository's `main` branch. HTTP and WebSocket traffic reach the same process. Deploying restarts that process and ends any active rooms.

Previous public revision: `6176c4a54cf4c05b338fdba66491f03ac0e0ec90`, preserved in history and at rollback tag `pre-v6-public-20261027`. The standalone Unity experiment remains optional, and its editable source remains preserved.

## Pre-deployment checks

- Syntax check passed.
- Standard suite: 107 passed, nine opt-in socket checks skipped.
- Network suite: 29 passed, none skipped.
- Local deployment smoke passed: page, 25 assets including adaptive-input code, build headers, two real same-origin WebSocket clients, room creation/join/countdown, shared seed/roof schedule, live standings, six-second boost, four-second long jump, movement/privacy and cleanup.
- Desktop browser exercised keyboard controls and the compact UI; automated tests cover touch/hybrid input detection. Physical-phone touch feel and performance await the user's playtest.

## Phone playtest

1. Open the public URL in Safari or Chrome. If the free service is asleep, allow about a minute to wake.
2. Tap Play solo. Try swipes, the left/hop/right buttons and both colored abilities. Check portrait and landscape.
3. To race friends, create a room and share the same URL plus its six-character code. Two to four players can race; the host starts.
4. Keep the game open during an online race. Switching apps does not pause the server. A rematch creates a new shared course.
