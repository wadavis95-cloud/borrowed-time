# Original V3.1 character assets

These four binary glTF 2.0 files were authored for Borrowed Time using the local
Three.js generator in `scripts/build-avatars.mjs`. They contain original geometry,
vertex colors, materials, a 24-bone skeleton, and `idle`, `run`, `jump`, and `stumble`
animation clips. No downloaded character, external texture, paid asset, or online
generation service is used. They were **not authored in Blender**. They can be
imported into a glTF-compatible modeling application for later manual refinement.

Rebuild all four assets and their measured manifest with:

```sh
node scripts/build-avatars.mjs
```

V3.1 replaces round shoulder caps with sloping sleeve heads, adds deliberate elbow,
calf and wrist taper, and uses flattened palms, separate thumbs and four curled
finger shapes. Narrower boots have a shaped vamp, tongue, welt, flat heel and pull
loop. The four face profiles differ in chin, jaw, cheek, eye and brow proportions;
eyes are smaller and noses have shaped bridges. Grouped swept hair and fitted back
caps replace isolated round crown pieces. The courier's ponytail and guard's braid
retain their secondary bones.

Clothing uses actual layered collar/lapel and pocket panels, selective large sleeve
folds, cuffs and rear yoke seams. The satchel, tool pouches and runner's waist pouch
have flatter, bevelled forms. Woven cloth, very rough canvas, skin, hair, worn
leather, rubber, glass and brushed metal have distinct material responses. Canvas
adds no extra draw to the engineer's total because its leather-soled boots share
the leather material. There are no embedded texture images. Four different
proportion, silhouette, clothing, and hair designs are authored:

* Courier: lean woman, brown skin, curly ponytail, burgundy and ivory jacket,
  teal neck scarf, and leather satchel.
* Engineer: broad man, copper swept hair, gold shirt, goggles, charcoal workwear,
  canvas bib, crossed suspenders, padded knees, and tool pouches.
* Station Guard: tall angular older woman, silver braid, navy uniform, shoulder
  marks, gloves, and a longer split coat.
* Rooftop Runner: compact young adult, asymmetric cropped hair, short green
  sports jacket, contrasting ankle socks, sneakers, and a small waist pouch.

The V3.1 export uses 26,580–34,976 triangles per character, down from V3's
32,608–48,000. Exported sizes are 832,748–1,082,932 bytes. The manifest records each
asset's exact geometry, size and material draw counts. Silhouette and readable
costume layers take priority over small invisible details.

All appearance differences are cosmetic. Collision and movement rules do not use
character meshes or their proportions. Rest feet are at y=0 and models face -Z.
The renderer controls world position and jump height. Runtime samples the exported
clips and adds presentation-only lane banking, boosted forward lean, landing
recovery, result poses, and reduced-motion handling.

The run clip retains its 0.72-second loop and the runtime's `distance * 0.058`
sampling cadence. Baked ankle trajectories use a short contact phase matched to
`distance * 0.34` world travel, with exact toe-off keys and a small sole-height
compensation for pelvis roll. This preserves cadence and footstep synchronization
while substantially reducing foot sliding. Sampling both feet from the exported
GLBs over 25 interior contact times measured 3.2–4.9 mm longitudinal world drift
and sole heights from -1.4 to +4.6 mm. These are flat-ground authored contacts, not
terrain IK or a guarantee of zero slip during visual pose transitions.

The runtime preloads all four files before play, clones the skeleton and materials
per participant, and keeps immutable geometry in a shared cache. Ghosts use a stable
player color at opacity 0.4 with `depthWrite=false`. Disposing an avatar cannot
dispose the shared source geometry or another avatar's skeleton/materials.

Limitations: these are stylized procedural models, not a manually sculpted or
motion-captured production character set. Cloth and hair use secondary bones rather
than physical simulation. Facial animation, finger bones and detailed
normal/roughness texture maps are not included. Physical phone/GPU performance must
be measured separately from desktop preview testing.

## V7 map casts

Eight additional original avatars are authored in `scripts/build-avatars.mjs`:
Captain, Navigator, Shipwright and Deckhand for The Last Voyage; Trail Scout,
Botanist, Jungle Ranger and Volcanologist for Volcanic Jungle. They share the
established skeleton and fluent animation system but have distinct proportions,
headwear, equipment and palettes. `node scripts/build-avatars.mjs --new-only`
rebuilds only these eight GLBs plus `maps-manifest.json`, preserving the four
baseline files. No external models, textures or downloads are used for these casts.
