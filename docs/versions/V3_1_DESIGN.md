# V3.1 — character and motion refinement

The user authorized completion of V3.1 after discussing a visual and movement update. V3 remains the gameplay baseline; public deployment and physical-phone testing belong to V4. The saved starting point is `v3.0.0-preview.1`.

## Approach

Retain Three.js 0.180.0, the original reproducible GLB asset pipeline, JavaScript rules and Node/ws backend. A full PlayCanvas, Babylon, Unity or Godot migration would add unrelated client work. Blender remains an optional future asset-authoring tool; it is not installed here and this release must not claim Blender-authored art. Refine the original assets directly and document their provenance.

## Visual goals

- Preserve the four automatically assigned identities, colors and role-defining accessories. Use Courier as the quality reference and bring the whole roster to a consistent standard.
- Replace inflated shoulders, tube-like limbs and mitten-like hands with deliberate shoulder/elbow/wrist/knee transitions, tapered boots and clearer hands. Give faces and hairstyles more individual shapes.
- Make coats, canvas, leather, metal and skin visually distinct; use selective folds, seams, layered collars, cuffs and rear details that survive the running camera. Avoid adding detail that only increases cost without improving visible shape.
- Improve the sense of weight and flow with stride-matched animation, smooth takeoff/landing/boost transitions, coherent leaning and restrained secondary motion. Freeze correctly on pause; reset cleanly on replay; respect reduced motion.
- Improve tunnel surface scale, stone/metal contrast, atmospheric depth and the warm escape vista. Keep all lanes and falling warnings readable. Opponents remain transparent, with no exposed private statistics or abilities.

## Boundaries

Do not change `src/game.js`, `src/hazards.js`, `src/avatars.js`, `src/server/rooms.js`, `src/network.js`, or `src/demo.js`. Timer, course length, acceleration, collisions, ability prices, room protocol and random assignment are frozen. Renderer uses the existing shared jump arc; visual smoothing must not move obstacle crossings or disguise harmful impacts. Keep assets local, resources bounded and the HTTP allowlist explicit. No public hosting, accounts, purchases or new gameplay features.

## Verification

Use real exported GLBs and actual browser captures to review front/back silhouettes, costume seams, run/jump poses, local motion and four transparent rivals. Exercise pause/resume, boost, paid barrier jump, fall warnings, demo completion/rematch and reset. Run asset/animation regression tests, the full existing suite, HTTP/socket checks and syntax checks. Verify the frozen gameplay files are byte-identical to V3. Report measured results and limitations in V3.1 release notes, with a beginner explanation of changed graphics components.
