# Borrowed Time submission readiness

October 28, 2026. Public game https://borrowed-time.onrender.com/ passed desktop and functional
network checks. The owner subsequently reported that mobile feels clean; a saved
mobile/touch sample covers solo play across all six maps.
Nothing has been submitted. No new product code or public deployment was needed.

## Completed checks

- [x] Regular regression suite: 198 passed, 17 network-gated skips.
- [x] Real-network suite: 56 passed, no skips; includes four racers and map votes on
  all six maps, character choices, session wins, host departure, countdown departure,
  rematches, expired lobbies, rejected stale inputs and compact/legacy coexistence.
- [x] Syntax checks and 36 current model/music/thumbnail content hashes match.
- [x] Public release check: 85 assets, fresh HTML, hashed Brotli code/CSS caching,
  protected monitoring and a temporary two-player race; purchases remained private,
  hazards and standings agreed, and the empty test lobby was removed.
- [x] Public four-client check: four votes, selected-map start, separate boost/leap
  purchases, host disconnect and migration, and removal of the empty lobby. Maximum
  four test sockets; functional check, not a load or capacity test.
- [x] Public browser: all six maps reached ready state; each demo reached running
  after countdown; screenshots saved. Orbital first selection/revisit in this
  session completed quickly, which does not reproduce a cold physical-phone test.
- [x] Public browser solo: A/D/W input sequence, Q boost and E leap with visible
  minus-five/minus-four spending; pause/resume, CPU race and results. (You) and CPU
  winner/session-win labels appeared correctly.
- [x] Public browser online: two tabs finished a race, results identified (you),
  Back to voting reset votes and clock, and a host refresh transferred the lobby
  to the guest. Both test browsers exited; server confirmed zero test rooms/sockets.
- [x] In-game guidance explains time as currency and gives both ability prices;
  all six map music selections have title, artist, source and CC0 credit data.
- [x] Six official music source pages still identify the recordings as CC0.
- [x] Submission draft updated to current deployed runtime. A 397-character
  description and fresh unedited gameplay image are saved locally.
- [x] Existing designed cover reviewed: solo/multiplayer, player count, map count
  and ability prices remain accurate. Optional old video is labeled as older.

Network evidence: ../artifacts/readiness/public-four-player.json. Browser evidence:
../artifacts/readiness/browser.json and demo-*.png. Public regression assets/race
were checked with scripts/check-deployment.mjs against the public origin.

## Monitoring evidence

The initial saved recent aggregate sample has 34 desktop/keyboard reports and
8,497 visible running frames, no sampled frames over 50 ms, no browser/graphics
errors or context losses, and p95 frame bucket at or below 16.8 ms. Five first-map
switch samples fall at or below 1,000 ms at p95; eight revisits at or below 500 ms.
These are histogram bucket limits, not exact timings. Some maps have only a few
running frames from the opening demo smoke check. Seventeen long tasks are
recorded across the sample; they are not proof every loading phase was smooth.
The sample is cached desktop evidence, not a cold-phone or cellular benchmark.

The saved server sample has no active test lobbies/sockets, no send/simulation
backlog, no HTTP errors, no rate-limit/admission/slow-client rejections and no
rejected telemetry. One HTTP abort was recorded; it does not identify a user-facing
failure. Ordinary close counters include the deliberate test departures.
Final snapshot: 51 reports, 16,792 visible frames, no browser/graphics errors,
7,164 movement-gap observations (p95 bucket at or below 100 ms), 67 application
echoes (p95 bucket at or below 500 ms), and three input acknowledgments (at or below
150 ms). These WAN samples include gaps beyond the 50 ms target and are too limited
to establish phone experience; the echo sample includes substantial variability.
No disconnect reports, HTTP failures or rejected telemetry occurred. See ../artifacts/readiness/monitoring.json and monitoring-final.json.
Report retention is up to 30 minutes in process memory; export after the phone
session before samples expire or the service sleeps/restarts.

## Credits and provenance

Music source license links:
- Outrunners: https://opengameart.org/content/outrunners
- Pirate Indenture: https://opengameart.org/content/pirate-indenture
- Bamboo Blitz: https://opengameart.org/content/bamboo-blitz
- Black Diamond: https://opengameart.org/content/black-diamond
- Chase: https://opengameart.org/content/chase-2
- Desert Loop: https://opengameart.org/content/desert-loop

All six local files and artist names match assets/music/CREDITS.txt, src/music.js
and the source manifest tests. The UI shows the selected map's music credit.
The current default 24 character models are original procedural geometry per the
asset manifest/build source. The optional Unity export retains Snow and Poly Haven
provenance in assets/unity/CREDITS.md and the in-game Art credits. Preserve those
credits while distributing the optional export. The general Art credit wording
still refers to that earlier study rather than distinguishing the default models;
clarifying this wording is optional polish, not a missing attribution.

## Owner phone test

- [ ] Open https://borrowed-time.onrender.com/ in a private tab to reduce browser
  cache reuse. Keep Wi-Fi on first; note any initial Render wake-up wait separately.
- [ ] Visit all six maps and run a short stretch on each. For Orbital, time the wait
  from tapping its thumbnail to seeing the ready course. Revisit it once.
- [ ] Check both movement directions, hop, boost and leap. Confirm thumb reach,
  legible red/blue buttons, no accidental page movement, and readable obstacles.
- [ ] Finish one full solo race, inspect results/(you), then replay. Listen for
  music after the first tap, mute/unmute, and clock urgency near zero.
- [ ] Switch apps during a solo run and return: verify it pauses/resumes cleanly.
- [ ] Optional if cellular service is available: turn Wi-Fi off and repeat Orbital
  loading plus a short run. Cellular coverage can vary; report network type.
- [ ] With the phone and this Mac, create/join one shared lobby yourself. Test a
  race with the phone as a racer. Online races continue during app switches; a tab
  refresh exits the session rather than restoring the active race.

Report phone/browser, Wi-Fi or cellular, any map/load wait, missed buttons,
stuttering/audio issues, and approximate test time. No other testers are required.
The Mac browser's viewport override did not change its measured 609 CSS-pixel
viewport, so neither 390-pixel layout nor touch behavior was marked verified.

## Final manual submission checks

- [ ] Confirm Handshake account eligibility and access to its email.
- [ ] Sign in and inspect the real entry form: exact description/image limits and
  any Showcase entry option remain unchecked because sign-in was required.
- [ ] Review the final image/description, phone results and any necessary fixes.
- [ ] Confirm the version to submit and preserve a final backup.
- [ ] User explicitly authorizes manual entry and accepts any required terms.
- [ ] User submits and saves the confirmation. No automated entry.

The official PDF deadline is October 30, 2026 at 11:59 PM Pacific; plan around this
earlier date rather than the public overview's October 31 wording.
Official rules:
https://go.joinhandshake.com/rs/390-ZTF-353/images/%5BAI_Skills_Studio_Challenge%5D_Contest_Official_Rules.pdf?version=0

Readiness does not establish fresh-player comprehension or public peak capacity.
Render remains one Free instance with ephemeral rooms and sleeping behavior.

## Owner phone test result

The owner reported "mobile feels clean just played". Snapshot saved in
../artifacts/readiness/phone-owner-test-20261028.json before retention expiry.
All 27 retained reports are estimated mobile/touch and solo mode, with running
frames on all six maps. Reports are not unique people or completed race counts.

- 19,884 visible running frames; p95 frame bucket at or below 25 ms.
- Five frames exceeded 50 ms (approximately 0.025 percent).
- No reported browser/graphics errors, context losses or disconnects.
- One initial ready-view sample at or below 2,000 ms.
- Five first-in-tab map-switch samples at or below 500 ms, including Orbital.
- Two repeat-switch samples at or below 200 ms.

These are histogram bounds from this session; browser cache state, exact phone,
browser and Wi-Fi/cellular network are unspecified. The earlier Orbital 5–7 second
wait did not appear in the captured preparation samples, but these samples do not
establish the cause of that earlier wait. General mobile feel is accepted by the
owner. Specific audio/app-switch/orientation checks have not been individually
confirmed. No online phone samples were captured: network RTT, update gaps and
input acknowledgments have zero observations. A phone-to-Mac race remains the
focused optional follow-up for physical-phone online latency. No submission.
