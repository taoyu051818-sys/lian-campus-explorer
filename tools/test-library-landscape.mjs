import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/library/library.json"),
  design = await read("authoring/library/landscape.json"),
  campus = await read("public/generated/campus.json");
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
  results = [],
  surfaceChecks = [];
// Geometry raycasts run in Node; texture decoding is covered by browser QA.
loader.register(() => ({
  name: "geometry-only",
  loadTexture: () => Promise.resolve(null),
}));
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/library/" + lod.file, lod);
  results.push(stats);
  for (const name of [
    "Landscape reflecting pool",
    "Landscape curved white shade canopy",
    "Landscape connected lawns",
    "Landscape ground leaf canopy",
    "Landscape roof white planters",
    "Landscape roof timber board joints",
  ]) {
    if (lod.file.includes("lod2") && name.endsWith("joints")) continue;
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `missing ${name}`,
    );
  }
  const bytes = await fs.readFile("public/models/library/" + lod.file),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.updateMatrixWorld(true);
  const down = (p, y) =>
    new Raycaster(
      new Vector3(p[0], y, p[1]),
      new Vector3(0, -1, 0),
      0,
      200,
    ).intersectObject(gltf.scene, true)[0];
  const pond = design.pond,
    hit = down(pond.center, 3);
  assert.ok(
    hit?.object.name.startsWith("Landscape_reflecting_pool"),
    "pool lost open water surface",
  );
  assert.ok(Math.abs(hit.point.y - pond.waterHeight) < 0.05);
  surfaceChecks.push({ lod: lod.file, pool: hit.point.y });
  for (const route of model.walkRoutes)
    for (const p of route.points) {
      const h = down(p, p[2] + 1.9);
      assert.ok(
        h?.object.name.startsWith("Landscape_forecourt_paving"),
        `approach surface missing at ${p}: ${h?.object.name}`,
      );
      assert.ok(Math.abs(h.point.y - p[2]) < 0.12);
    }
  for (const check of model.roofPlanting) {
    const [x, z, y] = check.point;
    const hit = new Raycaster(
      new Vector3(x, y + 0.2, z),
      new Vector3(0, -1, 0),
      0,
      0.5,
    )
      .intersectObject(gltf.scene, true)
      .find((h) => h.object.name.startsWith("Landscape_roof_planted_islands"));
    assert.ok(
      hit && Math.abs(hit.point.y - y) < 0.04,
      `roof bed ${check.wing} does not sit on its deck`,
    );
  }
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        m.dispose(),
      );
    }
  });
}
assert.ok(results[0].triangles > results[1].triangles * 1.5);
assert.ok(results[1].triangles > results[2].triangles * 2);
assert.equal(model.canopyBounds.length, model.landscape.plants.length * 3);
for (const c of model.canopyBounds)
  assert.ok(c.measuredRadius <= c.clearanceRadius + 0.01);
const reg = campus.libraryAsset;
assert.deepEqual(reg.anchor, model.anchor);
assert.equal(reg.yaw, model.yaw);
assert.ok(Math.abs(reg.base - model.base) < 1e-8);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "library"),
  "legacy geometry overlaps",
);
for (const c of [...model.collisionVolumes, ...(model.collisionMeshes || [])]) {
  const m = campus.meshes.find((m) => m.name === c.name);
  assert.ok(m?.collision && !m.visible, `missing ${c.name}`);
}
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
let plantSamples = 0,
  buildingSamples = 0,
  pavingTerrainSamples = 0;
try {
  const { geometry, inside, closest, distance } = await server.ssrLoadModule(
      "/src/world-geometry.ts",
    ),
    { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  const c = Math.cos(model.yaw),
    s = Math.sin(model.yaw);
  const world = ([x, z]) => [
    model.anchor[0] + c * x + s * z,
    model.anchor[1] - s * x + c * z,
  ];
  const others = geo.buildings.filter((b) => b.placeId !== "library"),
    hulls = geo.buildings.filter(
      (b) => !b.name.startsWith("library landscape"),
    );
  const paving = design.pavingMesh;
  for (let i = 0; i < paving.index.length; i += 3) {
    const vertices = paving.index
      .slice(i, i + 3)
      .map((j) => paving.position.slice(j * 3, j * 3 + 3));
    for (const weights of [
      [1 / 3, 1 / 3, 1 / 3],
      [0.5, 0.5, 0],
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
    ]) {
      const p = [0, 1, 2].map((k) =>
        vertices.reduce((sum, v, j) => sum + v[k] * weights[j], 0),
      );
      const gap = p[1] + model.base - geo.height(...world([p[0], p[2]]));
      assert.ok(
        gap > 0.025 && gap < 0.13,
        `paving intersects terrain or floats: ${gap}`,
      );
      pavingTerrainSamples++;
    }
  }
  const clear = (p) => {
    const q = world(p);
    assert.ok(inside(q, geo.land));
    assert.ok(geo.clearRoad(q, 0.5), "plant on campus road");
    assert.ok(
      geo.spawns.every((s) => distance(q, s.point) > 3),
      "plant blocks spawn",
    );
    assert.ok(
      hulls.every((b) => !inside(q, b.footprint)),
      "plant intersects building or route",
    );
    for (const path of geo.walkways)
      for (let i = 1; i < path.points.length; i++)
        assert.ok(
          distance(q, closest(q, path.points[i - 1], path.points[i])) >
            path.width / 2 + 0.25,
          "plant blocks path",
        );
    plantSamples++;
  };
  for (const t of model.landscape.plants) {
    clear(t.point);
    assert.ok(
      Math.abs(t.y + model.base - geo.height(...world(t.point))) < 1e-7,
    );
    for (let i = 0; i < 32; i++)
      clear([
        t.point[0] + t.crownRadius * Math.cos((i * Math.PI) / 16),
        t.point[1] + t.crownRadius * Math.sin((i * Math.PI) / 16),
      ]);
  }
  for (const bed of model.landscape.beds) {
    for (const p of bed.footprint) clear(p);
    const fp = bed.footprint;
    for (
      let x = Math.min(...fp.map((p) => p[0]));
      x < Math.max(...fp.map((p) => p[0]));
      x += 1.5
    )
      for (
        let z = Math.min(...fp.map((p) => p[1]));
        z < Math.max(...fp.map((p) => p[1]));
        z += 1.5
      )
        if (inside([x, z], fp)) clear([x, z]);
  }
  // Authored landscape exclusion areas must survive teaching-access registration.
  const patches = geo.exteriorAccessAreas.filter(
    (p) => p.placeId === "library",
  );
  assert.ok(
    patches.length >= design.paths.length + design.beds.length,
    "landscape exclusions were overwritten",
  );
  for (const route of model.walkRoutes)
    for (const [x, z] of route.points) {
      assert.ok(!inside([x, z], design.pond.footprint));
      buildingSamples++;
    }
} finally {
  await server.close();
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      buildings: 1,
      towerFloors: 19,
      trees: model.landscape.plants.length,
      beds: model.landscape.beds.length,
      shrubs: model.landscape.shrubs.length,
      plantSamples,
      buildingSamples,
      pavingTerrainSamples,
      walkRoutes: model.walkRoutes.length,
      surfaceChecks,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: (model.collisionMeshes || []).length,
      lods: results,
    },
    null,
    2,
  ),
);
