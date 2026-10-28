# V8.8 demo opening

Watch demo now demonstrates paid abilities immediately: the camera racer buys Boost at 0.6 seconds, a nearby rival buys Long jump at 0.9 seconds, and the camera racer buys Long jump around 5.1 seconds. Existing hazard reactions take precedence, so the exact leap timing can vary by course. Later strategy timings remain varied.

The showcase flag is passed only by the four-connection demo controller. Solo computer players keep their existing strategy. Purchases use ordinary inputs, consume the normal personal timer budget, and obey cooldowns and collisions. No positions or effects are forced.

Verified with a new regression test for early purchases and unchanged default behavior, 164 passing unit tests (11 network skips), and a seeded shared-hazard simulation on all six maps with all four racers finishing. Local browser confirmed early paid ability status and time spending. No deployment or submission.
