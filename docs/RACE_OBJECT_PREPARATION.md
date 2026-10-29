# Preparing race graphics before play

The previous renderer constructed obstacle groups when they first came within 255 meters, debris groups when their warning became visible, and opponent rigs on first appearance. Those factories allocate geometry, materials, sign textures, skeletons and animation mixers during a run.

The renderer now owns a prepared current-course cache. Setup/countdown creates all course obstacles and debris, including events whose warnings have not started. The current course has roughly 42 obstacles and nine debris events. Drawing only looks up and animates those groups. Opponent rigs are prepared from the roster and kept when racers leave view. Rematches reconcile the new course, reusing matching visual types and lengths, removing obsolete entries, and rebuilding lane-specific roof slabs when necessary. Map changes clear the prior map's cache.

This moves resource construction into setup and uses more memory earlier. It does not remove all per-frame JavaScript allocations, all GPU uploads, or shader compilation. The existing Tunnel shader warmup remains enabled. Gameplay rules, ability prices, camera and movement prediction are unchanged.

`renderObjectCreates` counts prepared hazard groups and avatar rigs (not individual meshes). `renderObjectMisses` flags a requested visual missing from the prepared cache. Monitor by phase: normal multiplayer racing should create zero groups/rigs and have zero misses. First joining/resuming an already-progressing view can still require setup before its first draw; it must not falsely be presented as a smooth public phone test.

Backup: `backups/pre-race-object-preparation-20261029.zip`. Local changes only; no competition submission. Tests exercise all six maps, 40 rematch seeds, opponent reuse, roof slab lane changes and ownership cleanup. Public phone performance remains unverified until deployment and a real multiplayer retest.
