# Late Tunnel shader variants

The public test counted two new program objects but did not identify them. A local full-course trace reproduced two late programs before this change:

1. `MeshBasicMaterial` for `local-contact-particles`, with `USE_INSTANCING` and `USE_INSTANCING_COLOR`. `setColorAt` first allocated `instanceColor` after running began, so the warmup saw a different layout. All 48 particle color slots are now allocated during effect construction; runtime updates reuse that attribute.
2. `MeshDepthMaterial` with `FLIP_SIDED` and `USE_SHADOWMAP`, first appearing roughly 35 seconds into the run. This is the plain, non-instanced, non-skinned shadow caster variant. Existing textured rubble and rigged/instanced representatives did not exercise it in the hidden shadow pass. A tiny ordinary untextured caster now lives in the retained hidden warmup group and exercises the real shadow pass. It uses existing shared geometry/materials and does not enter gameplay or the visible race.

Opt-in local diagnostic `?shaderTrace=1` prints a bounded material/feature trace to the browser console when new programs appear during running. It reads shader sources only when explicitly enabled and does not transmit them through telemetry. Material ownership lookup does not identify the internal shadow material's unique source mesh; the trace establishes the shader variant, not the specific exit mesh.

Evidence: `artifacts/readiness/shader-variant-before-trace-20261029.json` captures both late variants. After changes, a full Tunnel demo reached escape with zero new program objects, one successful warmup, zero failures or missing visual objects, and no browser warnings/errors. Monitoring capture `shader-variant-after-20261029.json`. This is a local graphics reproduction, not proof that public phone skips are resolved.

Backup: `backups/pre-shader-variant-investigation-20261029.zip`. Rules, ability prices, network buffer and prediction code are unchanged. Changes remain local pending deployment.
