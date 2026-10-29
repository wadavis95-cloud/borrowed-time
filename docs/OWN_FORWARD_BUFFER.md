# Own-player forward reserve

Online races with local lane anticipation now target a fixed 125ms reserve of confirmed own-player forward movement. The general opponent movement buffer is unchanged. The own cursor still uses its existing bounded rate adjustment and retained confirmed history; the only new target is `estimated simulation time - 125ms`. Startup builds the reserve gradually when history is not yet available.

The prediction tail remains capped at 120ms. This is confirmed-history buffering, not a larger prediction allowance. Lanes still use the latest confirmed lane plus pending local intentions. Forward distance, confirmed jump pose and debris/race clock use the buffered own timeline together. Boost feel, timer balances and ability charges retain the latest authoritative state. Server collision and terminal authority still interrupt presentation; visibility suspension, new rounds and very long gaps retain their existing safety behavior.

Tradeoff: ordinary forward course/jump presentation can be roughly125ms behind the estimated present; steering remains immediate. Collisions still reanchor immediately and long gaps can still exhaust reserve and prediction. This does not change the wire update frequency, game rules, movement speeds, prices or results. Fixed reserve only for this first experiment; no adaptive reserve or fade-to-stop behavior added.

The pure presenter defaults to zero reserve for explicit legacy/reproduction use; production `createRaceView({anticipateLocalLanes:true})` supplies125ms. The configurable local reserve is bounded0–150ms. Diagnostics expose the reserve and prediction cap without adding remote telemetry fields; existing render-state-age, own-hold, input-render and forward-excess measurements remain available.

Regression checks reproduce the previous holds for219/230/239ms delivery interruptions with reserve disabled and verify continuous own movement with production settings. They also cover capped longer interruptions, bounded recovery, latest balances, immediate lanes, identical opponent views and immutable authority. These are software checks, not evidence of improved real Wi-Fi phone/tablet play.

Backup: `backups/pre-own-forward-buffer-20261029.zip` (verified ZIP). Public release must be tested on the same Tunnel map over Wi-Fi, keeping the Mac host connection unchanged. Test phone and tablet sequentially for clean separate monitoring captures, or label a simultaneous mobile capture as combined.
