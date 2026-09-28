# Third-party notices

## Tidewater

This project's WebGPU atmosphere, sky, volumetric clouds, progressive sky environment,
four-cascade FFT ocean simulation and CDLOD ocean grid are derived from Tidewater:
https://github.com/zzzhengqi/tidewater

Upstream revision: d9fcc35 (retrieved 2026-09-28).
Vendored source: src/vendor/tidewater/. These files are copied unchanged; campus-specific
water shading, lighting and integration live in src/webgpu/environment.js.
Copyright (c) 2026 DRG Software Solutions LLC. Licensed under the MIT License.
The full license is retained in src/vendor/tidewater/LICENSE and the published notice.

## Rendering and physics

Three.js 0.186.0: MIT, https://github.com/mrdoob/three
Rapier 3D 0.19.3: Apache-2.0, https://github.com/dimforge/rapier.js
Babylon.js 9.26.0 remains a build-time mesh authoring dependency (Apache-2.0).
It is not loaded by the WebGPU browser scene.

Existing campus reference data and OpenStreetMap attributions retain their original
terms; this migration does not change the provenance or accuracy of those models.
