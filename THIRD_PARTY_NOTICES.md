# Third-party notices

## Tidewater

This project's WebGPU atmosphere, sky, volumetric clouds, progressive sky environment,
four-cascade FFT ocean simulation, CDLOD ocean grid, material textures and water
shading are derived from Tidewater:
https://github.com/zzzhengqi/tidewater

Upstream revision: d9fcc35 (retrieved 2026-09-28).
Vendored source: src/vendor/tidewater/. JavaScript sources are copied unchanged.
MATERIAL_SOURCES.json records SHA-256 hashes for the 27 material-related source files.
Campus-specific material assignments and adaptations live in src/webgpu/material-catalog.js,
materials.js, terrain-material-data.js and environment.js. The AO denoising filter in
environment.js is adapted from Tidewater's src/post/PostFX.js at the same revision.

The integration uses the upstream GPU-baked village PBR maps, terrain detail texture,
terrain shading functions, leaf atlas and shadow-aware foliage translucency, shared
scene lighting classes, full WaterMaterial/WaterSurface, foam pattern, SeaDetail,
ShoreField/ShoreWaves, caustics, underwater lighting and multi-pass SceneRenderer.
Village and vegetation factories are retained with their dependencies; the campus adapter
uses their textures and shading functions with the campus's existing geometry and colours.
It does not substitute the village buildings, boats, fish or tropical forest for campus assets.
Copyright (c) 2026 DRG Software Solutions LLC. Licensed under the MIT License.
The full license is retained in src/vendor/tidewater/LICENSE and the published notice.

## Rendering and physics

Three.js 0.186.0: MIT, https://github.com/mrdoob/three
Rapier 3D 0.19.3: Apache-2.0, https://github.com/dimforge/rapier.js
Babylon.js 9.26.0 remains a build-time mesh authoring dependency (Apache-2.0).
It is not loaded by the WebGPU browser scene.

Existing campus reference data and OpenStreetMap attributions retain their original
terms; this migration does not change the provenance or accuracy of those models.
