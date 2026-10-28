# V8.5 start grid and submission presentation

User approved fixing racers stacking in center then shooting outward, plus submission cover and short gameplay showcase. Local only; preserve backup and existing prices/physics. Execute inline with final independent review.

- [x] Reproduce initial-position issue in renderer and room tests. Assign stable starting lanes by room color slot [1,0,2,1], preserve on map changes/rematches; initialize local/camera positions immediately on first snapshot while retaining interpolation during actual movement.
- [x] Verify unit/network/local browser countdown and real four-player demo. Four racers share three lanes; no artificial longitudinal starting advantage.
- [x] Capture authentic local gameplay through a separate loopback-only capture utility, with real time/ability/standing reads, no injected game state. Export an illustrative screenshot-based cover, short silent gameplay showcase, and concise submission description. Keep capture tools/assets separate from served game.
- [x] Record output formats and limitations, review, save local checkpoint. No deploy or contest submission.

Ruling: keep host in center and align demo preferred lanes with the new grid, preserving the expected first left/right input while distributing rivals. Fourth player shares center because there are three lanes; no head start or false position.

Execution: renderer and room regressions reproduced both original problems, then passed. Server uses [1,0,2,1] by stable color slot; removed demo preferred-lane shuffling entirely. Existing unit tests updated for guest's new authoritative lane. 149 unit pass/11 default socket skips;38 real network pass. Independent review found no actionable start-grid defects. Cover exported from actual game; 54.48s silent recording transcoded to fast-start H.264 MP4 using a temporary PyPI ffmpeg utility (not a game dependency). Browser confirmed 1280×720 playback and no video error. User explicitly said DON'T SUBMIT; no contest interaction or deployment.
