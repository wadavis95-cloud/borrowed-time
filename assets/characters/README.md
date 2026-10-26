# Original V3 character assets

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

The source defines continuous contoured torso/limb meshes with blended joint skin
weights, rounded garment folds and hems, layered hair, facial features, stitching,
accessories, leather/canvas/metal surface differences, and deterministic vertex
color detail. There are no embedded texture images. Four different proportion,
silhouette, clothing, and hair designs are authored:

* Courier: lean woman, brown skin, curly ponytail, burgundy and ivory jacket,
  teal neck scarf, and leather satchel.
* Engineer: broad man, copper swept hair, gold shirt, goggles, charcoal workwear,
  canvas bib, crossed suspenders, padded knees, and tool pouches.
* Station Guard: tall angular older woman, silver braid, navy uniform, shoulder
  marks, gloves, and a longer split coat.
* Rooftop Runner: compact young adult, asymmetric cropped hair, short green
  sports jacket, contrasting ankle socks, sneakers, and a small waist pouch.

All appearance differences are cosmetic. Collision and movement rules do not use
character meshes or their proportions. Rest feet are at y=0 and models face -Z.
The renderer controls world position and jump height. Runtime samples the exported
clips and adds lane banking, boosted forward lean, takeoff/tuck pose progression,
landing compression, result poses, and reduced-motion handling.

The runtime preloads all four files before play, clones the skeleton and materials
per participant, and keeps immutable geometry in a shared cache. Ghosts use a stable
player color at opacity 0.4 with `depthWrite=false`. Disposing an avatar cannot
dispose the shared source geometry or another avatar's skeleton/materials.

Limitations: these are stylized procedural models, not a manually sculpted or
motion-captured production character set. Foot placement uses authored cyclic
animation without terrain IK; cloth and hair use secondary bones rather than
physical simulation. Facial animation and detailed normal/roughness texture maps
are not included. The manifest records exported geometry and file sizes; physical
phone/GPU performance must be measured separately from desktop preview testing.
