# Pacing update: faster start, more room between sets

The goal is more forward momentum with less back-to-back obstacle clustering. Changes affect spacing between whole sets, not the lane arrangements inside a set.

| Setting | Previous | Updated |
| --- | --- | --- |
| Starting speed | 22m/s | 24m/s |
| Top speed | 32m/s | 32m/s |
| Acceleration ramp | 50s | 50s |
| Ordinary spacing controls | 44→30m | 60→46m |
| Spacing variation | 0–5m | 0–5m |
| Reserved roof-fall gaps | 76–81m | 88–93m |
| Debris builder interval | Every eligible gap | Alternate eligible gaps |

The roof-debris interval avoids filling every newly widened space with another hazard. Because the reserved gaps occur every fourth row and the debris iteration starts at index one, all reserved wide gaps are still eligible. Roof panels retain the same breakaway presentation and shared approach timing.

For seed 42, the course changes from 25 sets / 56 ground obstacles / 13 roof falls to 19 sets / 42 ground obstacles / nine falls. Ordinary gaps are now 50–63m on this sample, previously 32–47m. Mean unboosted time between ordinary set centers rises from 1.443s to 2.008s: about 39% more breathing room despite the faster start. These measurements describe this sample, not a guaranteed reaction time on every device.

The timer, 1,350m track, ability effects and prices are unchanged: Boost costs five seconds and Long jump four. With the new acceleration, clean travel is `24t + 0.08t²` before the speed cap. A completely unobstructed escape takes about 48.43 seconds, previously 50 seconds.

## Verification

- 112 standard tests pass; all 29 network tests pass separately.
- Ground-pattern checks cover 64 seeds, connected routes, repeated hops, no permanently safe lane and a minimum of 1.15 seconds of clear space after a whole obstacle set at the unboosted speed cap.
- A free-route controller clears all 128 test courses without purchases or hits.
- Physics test fixtures now target the same intended collision/jump/impact moments using the new independent distance equation. Exact clock-expiry, pause, boost/stun integration and large-frame equivalence checks remain in place.
- Local browser demo checks the visual spacing and the faster motion. Public verification is recorded after deployment.
