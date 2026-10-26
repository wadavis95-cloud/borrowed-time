# V4 preview — public friend playtest

**Version:** `4.0.0-preview.1` · **Status:** public playtest deployed; physical-phone validation pending.

**Play:** [borrowed-time.onrender.com](https://borrowed-time.onrender.com)

**Release tag:** `v4.0.0-preview.1`

V4 preserves V3.1's game rules and visuals, including the later independent demo strategies. Its focus is public HTTPS/WSS hosting and usable phone controls. The source repository is private: `wadavis95-cloud/borrowed-time`.

## Hosting model

One Render Free Docker web service serves both the browser game and `/race` WebSockets. The backend owns rooms in memory. HTTPS automatically selects WSS in the browser. The service uses `/health` for checks, listens on the platform's `PORT`, and binds to `0.0.0.0` inside the container.

Render reported the first Docker deployment **Live** on October 26, 2026 at 2:26 PM EDT, using runtime revision [`c3f4749`](https://github.com/wadavis95-cloud/borrowed-time/commit/c3f47491935bca52f843c554ba07aa4448db3543). The service is `srv-dbfpmdss728c73cgrqu0`, in Virginia, with one free instance. It automatically deploys from `main` in the private repository. Later documentation-only release commits can retain that same runtime code.

Do not add a second instance: its rooms would be separate. A restart or deploy ends current rooms. An idle free service may take about a minute to wake, so open the game before inviting friends. This is an initial playtest deployment, not measured production capacity.

## Phone changes

- Touch movement controls appear on coarse-pointer devices even in landscape.
- Short landscape views put the clock and abilities beside the course.
- Short portrait layouts reserve room for the HUD and movement buttons.
- Safe-area padding protects controls near notches and home indicators; mobile inputs use readable 16px text.

## Verification record

| Check | Verification result |
| --- | --- |
| `npm test` | 89 passed; six opt-in HTTP/socket tests skipped. |
| `npm run test:network` | 24 passed, none skipped; repeats 18 room tests and runs the six integration tests. 95 distinct tests passed across both commands. |
| Local deployment smoke | Health, home page, 22 public assets, two real WebSocket clients, create/join/countdown, movement, purchaser-only boost and room cleanup passed. |
| Syntax and whitespace | All checked modules passed; no diff whitespace errors. |
| Independent review | No actionable defects in packaging, host configuration, smoke checks or mobile CSS. |
| Browser layout | Local 390×844 and 375×667 portrait, plus rotation to 844×390 landscape: course and gameplay controls fit without horizontal overflow. Movement and paid-jump buttons operate. The public game also fits a 1280×720 desktop viewport without horizontal overflow. |
| Docker image | Render built the image, installed locked dependencies, started Node and reported the service live. Docker CLI is unavailable locally. |
| Public HTTPS/WSS | `npm run check:deployment -- https://borrowed-time.onrender.com` exited 0: health, home page and 22 public assets (including four GLBs); two same-origin WSS clients create/join/countdown into one race; movement, purchaser-only boost cost and lead, disconnect broadcast and empty-room cleanup passed. |
| Public browser race | Two browser tabs created and joined one room with distinct avatars, started through the host controls and raced after the countdown. The host's boost affected its own timer and status while the guest remained unboosted. The race completed, and the host prepared a rematch that reset both clocks in the same lobby. Neither tab logged console warnings or errors. |
| Physical phone | Pending the user's actual-device test. |

Actual captures: [public multiplayer race](../images/v4-public-multiplayer.png), plus local [portrait controls](../images/v4-phone-portrait.png) and [landscape controls](../images/v4-phone-landscape.png). Browser resizing is not a physical phone test.

## First test on a real phone

1. Open [Borrowed Time](https://borrowed-time.onrender.com) in Safari on iPhone or Chrome on Android. Allow the free host to wake if needed, then wait for the models to load.
2. Start solo practice. Check that all three lanes, the clock, both abilities and movement buttons remain visible in portrait and landscape.
3. Try swipe left/right, tap or swipe up to hop, and both paid ability buttons. Check for accidental page scrolling, delayed touch responses or visual glitches.
4. Enable sound once and check its volume. If the phone becomes hot or the animation stutters, note the phone model, browser, orientation and what was happening.
5. Return to the menu and create a room. Send friends the same public URL and the six-character room code. Up to four people can join; the host starts after at least two are present.
6. Finish a race, prepare a rematch and try again. Verify boosts affect only their purchaser and opponents move according to their real lead.

Keep the multiplayer tab open during a race: switching apps does not pause the server. This version cannot reconnect a disconnected player to an active race. If disconnected, leave and create a new room after the race. Test both same-Wi-Fi play and a phone on cellular data to check internet access.

## Reproducible checks

```sh
npm test
npm run test:network
npm run check
npm run check:deployment -- https://borrowed-time.onrender.com
```

The deployment command checks the public assets and creates a short two-client race before closing its sockets. Run it against your own service. `render.yaml` records the hosting settings; `Dockerfile` defines the runtime package.

## Limits

Physical-phone behavior is pending the user's actual-device test. Desktop browser checks do not establish Safari compatibility, battery use, thermal behavior, touch latency or phone GPU performance. Rooms have no accounts, persistence, reconnection or matchmaking. Free-host availability and resource limits are suitable for initial friend testing and must be measured before broader use.
