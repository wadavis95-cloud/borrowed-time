# V8.11 — Courier and tunnel detail study (local)

A focused model-detail trial layered over the V8.10 bright lighting pass. The Courier and the first four static tunnel sections are the study; the remaining 23 character assets and other maps are unchanged. Camera, animation clips, rules, prices and networking remain unchanged.

## Courier

Raised, thick shoulder yoke and hem, a central jacket seam, gathered waist geometry, rear pocket panels, elbow patches, rolled cuffs and heel stitching. A larger contoured leather mail pouch has an overlapping flap, gusset volume, closure straps and brass clasps. The existing diagonal strap has a shaped shoulder pad and adjustment loop.

The Courier now includes rest-space UV coordinates for two small deterministic surface-height textures: cloth weave and leather grain. They respond to the scene lights without baked-in shadows; each avatar owns and releases its textures. Transparent opponents retain their uncluttered tinted materials. Existing vertex colors preserve the bright palette.

The rig and clips are reused. Courier rises from 30,796 to 36,320 triangles, retaining six material draws and 24 bones. The raw GLB is 1,281,900 bytes; its served gzip is 611,150 bytes (previously 446,843). Regenerate only this model with `node scripts/build-avatars.mjs --avatar=courier`; this updates only its GLB, gzip and manifest entry. A full build reproduces the same refinement.

## Tunnel opening

The opening four sections add staggered raised masonry, recessed mortar joints, uneven block faces, shallow corner damage, pipe flange rings and fasteners, brackets, modeled shoulder drainage grates, inset maintenance hatches with hinges/handles, and scattered service-edge fragments. The detail uses existing instancing and materials, stays outside the playable lanes and does not overlay the collapsing roof holes. An independent deterministic decoration stream leaves the later tunnel dressing unchanged.

## Backup and review

Verified full-history backup: `backups/pre-character-tunnel-detail-20261028.bundle`, preserving the lighting checkpoint `9c8fdb27398c9823c656ac3a233f60ed36df6985`. Trial branch: `codex/v8.11-character-tunnel-detail`. No push, deployment or submission.

Local browser review: selected Courier, ran the tunnel opening, and checked a paid leap and lane change with no reported browser errors. Existing asset checks verify finite normalized skinned geometry and clips; a focused check covers Courier UVs and owned texture disposal. Physical phone performance and whether the added detail is substantial enough remain for user playtesting.
