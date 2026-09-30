import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  mapToWorld,
  worldToMap,
  fromAuthoringPoint,
  reflectMesh,
  placeAuthoredAsset,
  heading,
  movement,
  bearingTo,
} from "../src/webgpu/coordinates.js";
import { terrainGrid } from "../src/webgpu/terrain-grid.js";
import { preserveAuthoredLettering } from "../src/webgpu/library.js";
const json = async (p) => JSON.parse(await fs.readFile(p));
const meta = await json("public/generated/campus.json");
const report = {
  version: (await json("package.json")).version,
  date: new Date().toISOString(),
  meshes: 0,
  assets: [],
};
const near = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const camera = new THREE.OrthographicCamera(-4000, 4000, 4000, -4000, 1, 20000);
camera.position.set(0, 10000, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
// Signed orientation catches reflections; distance-only checks cannot.
const landmarks = (await json("public/overall/data.json")).places;
const screen = landmarks.map((p) => {
  const q = mapToWorld(p.point),
    v = new THREE.Vector3(q[0], 0, q[1]).project(camera);
  const back = worldToMap(q);
  near(back[0], p.point[0]);
  near(back[1], p.point[1]);
  return { id: p.id, map: p.point, screen: [v.x, -v.y] };
});
const orientation = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
let triangles = 0;
for (let i = 0; i < screen.length - 2; i++)
  for (let j = i + 1; j < screen.length - 1; j++)
    for (let k = j + 1; k < screen.length; k++) {
      const points = [screen[i], screen[j], screen[k]],
        a = orientation(...points.map((p) => p.map)),
        b = orientation(...points.map((p) => p.screen));
      if (Math.abs(a) < 1e-7) continue;
      assert.equal(Math.sign(a), Math.sign(b), "mirrored map landmarks");
      triangles++;
    }
for (const [bearing, expected] of [
  [0, [0, -1]],
  [Math.PI / 2, [1, 0]],
  [Math.PI, [0, 1]],
  [-Math.PI / 2, [-1, 0]],
]) {
  const h = heading(bearing),
    m = movement(bearing, 1, 0),
    r = movement(bearing, 0, 1);
  near(h[0], expected[0]);
  near(h[1], expected[1]);
  near(m.x, h[0]);
  near(m.z, h[1]);
  near(r.x, -h[1]);
  near(r.z, h[0]);
  near(Math.sin(bearingTo(m.x, m.z) - bearing), 0);
}
report.orientation = {
  landmarks: screen.length,
  signedTriangles: triangles,
  cardinalBearings: 4,
};
const bytes = gunzipSync(await fs.readFile("public/generated/campus.meshpack"));
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
let ground;
for (const m of meta.meshes) {
  const p = new Float32Array(buffer, m.position.offset, m.position.count),
    n = new Float32Array(buffer, m.normal.offset, m.normal.count),
    ix = new Uint32Array(buffer, m.index.offset, m.index.count);
  const old = p.slice(),
    normals = n.slice(),
    oldIndex = ix.slice();
  reflectMesh(p, n, ix);
  for (let i = 0; i < p.length; i++) {
    near(p[i], i % 3 === 2 ? -old[i] : old[i]);
    near(n[i], i % 3 === 2 ? -normals[i] : normals[i]);
  }
  for (let i = 0; i < ix.length; i += 3) {
    assert.equal(ix[i], oldIndex[i]);
    assert.equal(ix[i + 1], oldIndex[i + 2]);
    assert.equal(ix[i + 2], oldIndex[i + 1]);
  }
  if (m.name === "continuous terrain") ground = p;
  report.meshes++;
}
const grid = terrainGrid(ground);
assert.deepEqual(grid.step, [20, -20]);
let samples = 0;
// Test actual reflected triangle barycentres, not a second copy of the sampler.
const terrain = meta.meshes.find((m) => m.name === "continuous terrain");
const ti = new Uint32Array(buffer, terrain.index.offset, terrain.index.count);
for (let i = 0; i < ti.length; i += 3) {
  const p = [0, 0, 0];
  for (let k = 0; k < 3; k++)
    for (let j = 0; j < 3; j++) p[j] += ground[ti[i + k] * 3 + j] / 3;
  near(grid.heightAt(p[0], p[2]), p[1], 1e-7);
  samples++;
}
report.terrain = { triangles: samples, origin: grid.origin, size: grid.size };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// Geometry/placement test in Node; real textures are checked in the browser.
loader.register(() => ({
  name: "geometry-only",
  loadMaterial: () => Promise.resolve(new THREE.MeshStandardMaterial()),
}));
for (const registration of [
  { ...meta.libraryAsset, id: "library" },
  ...meta.authoredAssets,
]) {
  const manifest = await json(
    `public/models/${registration.id}/${registration.id}.json`,
  );
  let points = 0,
    lettering = 0;
  for (const level of manifest.lods) {
    const b = await fs.readFile(
      `public/models/${registration.id}/${level.file}`,
    );
    const asset = await loader.parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      "",
    );
    const source = new THREE.Group();
    source.position.set(
      registration.anchor[0],
      registration.base,
      registration.anchor[1],
    );
    source.rotation.y = registration.yaw;
    source.add(asset.scene);
    source.updateMatrixWorld(true);
    const before = [];
    asset.scene.traverse((m) => {
      if (m.isMesh) {
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 13)))
          before.push([
            m,
            i,
            new THREE.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(m.matrixWorld),
          ]);
      }
    });
    placeAuthoredAsset(source, registration);
    source.updateMatrixWorld(true);
    for (const [m, i, old] of before) {
      const p = new THREE.Vector3()
        .fromBufferAttribute(m.geometry.attributes.position, i)
        .applyMatrix4(m.matrixWorld);
      near(p.x, old.x);
      near(p.y, old.y);
      near(p.z, -old.z);
      points++;
    }
    // This is the exact runtime lettering adapter, tested for idempotence and
    // world-handedness restoration (native text should remain readable).
    preserveAuthoredLettering(asset.scene);
    source.updateMatrixWorld(true);
    asset.scene.traverse((m) => {
      if (m.userData.letteringConverted) {
        assert.ok(m.matrixWorld.determinant() > 0);
        lettering++;
      }
    });
    const scales = [];
    asset.scene.traverse((m) => scales.push(m.scale.x));
    preserveAuthoredLettering(asset.scene);
    let i = 0;
    asset.scene.traverse((m) => assert.equal(m.scale.x, scales[i++]));
    asset.scene.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material)
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((m) =>
          m.dispose(),
        );
    });
  }
  // Collider footprints use the same placement as the rendered local model.
  const placement = new THREE.Group();
  placeAuthoredAsset(placement, registration);
  placement.updateMatrixWorld(true);
  const bodies = meta.buildings.filter((b) => b.placeId === registration.id);
  for (const [hullIndex, hull] of manifest.collisionVolumes.entries()) {
    const body = bodies[hullIndex];
    assert.equal(body?.name, hull.name);
    assert.ok(body, hull.name);
    for (let i = 0; i < hull.footprint.length; i++) {
      const p = hull.footprint[i],
        q = new THREE.Vector3(p[0], hull.base, p[1]).applyMatrix4(
          placement.matrixWorld,
        ),
        expected = fromAuthoringPoint(body.footprint[i]);
      near(q.x, expected[0]);
      near(q.z, expected[1]);
      near(
        q.y,
        body.fixedBase +
          (registration.id === "library" ? (hull.foundationDepth ?? 2) : 0),
      );
    }
  }
  assert.equal(
    lettering,
    ["library", "incubator", "canteen"].includes(registration.id) ? 2 : 0,
    registration.id + " lettering conversion missed",
  );
  report.assets.push({
    id: registration.id,
    lods: manifest.lods.length,
    vertices: points,
    lettering,
  });
}
assert.equal(report.assets.length, 11);
await fs.writeFile(
  `验证记录/coordinates-v${report.version}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
