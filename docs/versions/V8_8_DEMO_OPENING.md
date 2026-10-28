# V8.8 demo opening

Watch demo now demonstrates paid abilities immediately: the camera racer buys Boost at 0.6 seconds, a nearby rival buys Long jump at 0.9 seconds, and the camera racer buys Long jump around 5.1 seconds. Existing hazard reactions take precedence, so the exact leap timing can vary by course. Later strategy timings remain varied.

The showcase flag is passed only by the four-connection demo controller. Solo computer players keep their existing strategy. Purchases use ordinary inputs, consume the normal personal timer budget, and obey cooldowns and collisions. No positions or effects are forced.

Verified with a new regression test for early purchases and unchanged default behavior, 164 passing unit tests (11 network skips), and a seeded shared-hazard simulation on all six maps with all four racers finishing. Local browser confirmed early paid ability status and time spending. No deployment or submission.


## Close-race and sound follow-up

The demo now answers the opening Boost with staggered rival purchases around 1–2 seconds. During later chase windows, drivers use public racer positions to decide whether to spend their own time closing a gap or contesting a nearby rival. Own-budget limits, obstacle reactions and ordinary cooldowns remain in force. No teleports or extra speed; solo AI is unchanged.

A six-map seed-42 regression verifies a nearby racer stays visible for most of the run, multiple place exchanges happen, all actions are legal, and all four racers escape. A separate 30-run sample across five seeds and six maps confirmed all racers finish; closeness varies naturally by course.

Sound now defaults on, unlocking on the first interaction. A speaker icon/slashed-speaker icon replaces the text. Footsteps, shared hazard sounds and ambient/music layers are removed. Local Boost and Long jump have distinct launch cues; local collision/hop/landing/finish sounds remain. A mechanical tick/tock follows only the local remaining budget, from one second down to about 0.22 seconds at zero. Pauses, hidden tabs, mute and disposal silence it without replaying missed ticks.

The camera/rear-destruction experiment was rejected and fully reverted before these changes. Nothing deployed or submitted.

Final verification: 168 unit tests passed (11 network tests skipped), syntax/whitespace checks passed, browser speaker/mute icons toggled correctly, and the updated real four-connection demo ran without browser errors. The local game is ready for listening/playtesting.


## Thematic background audio

Added six original procedural ambience/motif palettes: low tunnel echoes, ship waves/wood creaks with a light melody, jungle rumble/percussive notes, summit wind/chimes, station hum/synth notes, and canyon wind/plucked tones. No music files or external services are downloaded. Fixed background ambience is separate from opponent activity; footsteps and shared hazard-event audio remain absent.

Backgrounds play only during the local run, below clock/action feedback, and soften during Boost/jumps or low remaining time. All share the speaker toggle and 24-voice ceiling, stop on pause/hide/finish/mute, reset on replay/map changes, and dispose normally. Syntax checks and 169 unit tests passed (11 network skips).

## Demo spacing

Demo followers now choose a clear adjacent lane when another racer is within five metres ahead in their lane. Hazard reactions and ability timing take priority. A candidate lane must have no nearby racer, no approaching overhead impact, and no ground obstacle within the next 1.4 seconds of projected travel. The initial grid stays stable; this begins after the opening 1.2 seconds. Narrow safe routes can still bunch racers briefly.

Only demo inputs change; no fake avatar offsets, extra lanes, collisions, prices or solo AI changes. The all-six-map close-race regression now includes public lane data, verifying proximity, overtakes, legal actions and all four racers escaping. All 170 unit tests passed (11 network skips).
