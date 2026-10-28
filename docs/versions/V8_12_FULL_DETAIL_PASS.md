# V8.12 — full character and map detail pass (local)

Extends the approved Courier/tunnel detail study across all 24 characters and six maps. The V8.10 brighter lighting remains. Camera, movement clips, course generation, collision rules, prices, map voting, music and multiplayer protocol are unchanged. No deployment or submission.

## Characters

All casts now have shaped waist gathering, raised yokes, curved seams, cuffs or work straps, elbow patches, footwear finishing, shoulder tabs and fittings. Existing role silhouettes and colors remain: marine uniforms retain their hats/bandanas, expedition casts retain packs and medical markings, space casts retain their helmets/headsets. Existing packs receive straps, seams and closure hardware; snow casts carry a lashed mat roll, space packs get a vent panel. The Courier keeps the approved satchel refinement.

All models have rest-space surface coordinates. The same small cloth-weave and leather-grain height textures apply to local opaque avatars; transparent opponents stay clean. Avatar instances own and dispose their surface textures. The original rig and animation clips are reused. The reproducible authoring script rebuilds all GLBs, their gzip copies and the three manifests.

Current asset baseline for the next performance pass: 24 avatars, 13,236,334 bytes total compressed character files; largest character 40,692 triangles. These are asset measurements, not a phone performance result.

## Map detail

- Tunnel: full-course raised masonry and recessed joints, fittings, drain grates, hatches and shoulder fragments; independent decoration randomness preserves later scenery variation and roof holes.
- Pirate ship: individual deck planks with subtle grain/color variation, rail fasteners, cannon barrel bands and wheel spokes, rope coils.
- Volcanic jungle: palm trunk collars and frond ribs, tapered fern foliage, root buttresses, basalt shelves and surface relief; forward volcano stays in view.
- Frozen summit: irregular snow drifts, ice ridges, exposed rock fractures, snow-loaded low boughs and surface relief.
- Orbital escape: layered equipment housings, vent louvers, fasteners, small indicators, rail braces and fine metal surface relief.
- Sandstorm canyon: sediment shelves, fractured rock surfaces, eroded silhouettes, edge talus, cactus ribs and buds.

Small deterministic surface-height textures use existing UVs and authored colors. Scenery detail uses the existing section batching/instancing and visibility culling. Decorative additions are outside the playable lanes; they do not become collision obstacles.

## Preservation and verification

Pre-change verified full-history backup: `backups/pre-full-detail-pass-20261028.bundle` at `4d1c48328a6a41bd7f20e6dad9cb78a975423231`. Branch: `codex/v8.12-full-detail-pass`.

Browser-reviewed all six maps from the actual running camera, with no reported browser errors. Asset tests cover finite geometry, animations, all-cast UV coordinates, representative local/ghost material behavior and owned texture cleanup. The local release check verified 78 public assets plus a temporary two-player race, private purchases, movement and cleanup. Physical phone smoothness/loading and Internet latency remain unmeasured and are the next workstream.
