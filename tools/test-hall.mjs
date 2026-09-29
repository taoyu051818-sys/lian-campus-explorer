import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/hall/hall.json"),
  design = await read("authoring/hall/design.json"),
  campus = await read("public/generated/campus.json");
const results = [],
  recessChecks = [],
  loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/hall/" + lod.file, lod);
  results.push(stats);
  for (const name of [
    "jointed pale stone facade",
    "stepped window heads",
    "deep recessed glazing",
    "portal gold soffit",
    "twin exterior stone stairs",
    "rear open pergola",
    "connected planted lawns",
    "branching tree trunks",
    "fan plaza paving",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `${lod.file}: missing ${name}`,
    );
  assert.ok(
    Math.abs(stats.bounds[1][1] - design.buildingBase - 19.7) < 0.03,
    "survey height changed",
  );
  const bytes = await fs.readFile("public/models/hall/" + lod.file),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.updateMatrixWorld(true);
  const start = -Math.PI / 2 + 0.14,
    bay = (Math.PI * 2 - 0.28) / 40;
  for (const [angle, expected] of [
    [start + 9.5 * bay, "deep_recessed_glazing"],
    [start + 9.12 * bay, "jointed_pale_stone_facade"],
    [-Math.PI / 2 + 0.021, "portal_entrance_doors"],
  ]) {
    const ray = new Raycaster(
      new Vector3(
        40 * Math.cos(angle),
        design.buildingBase + 8,
        40 * Math.sin(angle),
      ),
      new Vector3(-Math.cos(angle), 0, -Math.sin(angle)),
      0,
      30,
    );
    const hit = ray.intersectObject(gltf.scene, true)[0];
    assert.ok(
      hit?.object.name.includes(expected),
      `${lod.file}: ray must hit ${expected}, got ${hit?.object.name}`,
    );
    recessChecks.push({
      file: lod.file,
      feature: expected,
      distance: hit.distance,
    });
  }
  // A podium slab spanning the stairwell would hide the lower flight from above.
  for (const [x, ground] of [-25.4, 26].map((x, i) => [
    x,
    design.stairGround[i],
  ])) {
    const startHeight = Math.max(design.buildingBase + 0.02, ground + 0.075),
      middle = (startHeight + design.buildingBase + 5.2) / 2;
    const hit = new Raycaster(
      new Vector3(x, design.buildingBase + 9, 14),
      new Vector3(0, -1, 0),
      0,
      20,
    ).intersectObject(gltf.scene, true)[0];
    assert.ok(
      hit?.object.name.includes("twin_exterior_stone_stairs"),
      "podium blocks stair void",
    );
    assert.ok(
      Math.abs(hit.point.y - (startHeight + middle) / 2) < 0.18,
      "stair treads elevation mismatch",
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
assert.ok(results[0].triangles > results[1].triangles * 1.4);
assert.ok(results[1].triangles > results[2].triangles * 1.4);
assert.equal(model.canopyBounds.length, model.landscape.plants.length * 3);
for (const tree of model.canopyBounds)
  assert.ok(
    tree.measuredRadius <= tree.clearanceRadius + 0.01,
    "canopy exceeds checked envelope",
  );
const registration = campus.authoredAssets.find((a) => a.id === "hall");
assert.deepEqual(registration.anchor, model.anchor);
assert.equal(registration.yaw, model.yaw);
assert.ok(Math.abs(registration.base - model.base) < 1e-8);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "hall"),
  "legacy visible geometry overlaps authored model",
);
for (const hull of [...model.collisionVolumes, ...model.collisionMeshes]) {
  const m = campus.meshes.find((m) => m.name === hull.name);
  assert.ok(m?.collision && !m.visible, `missing collider ${hull.name}`);
}
assert.equal(
  model.collisionMeshes.filter((m) => m.name.startsWith("hall stair ramp"))
    .length,
  4,
);
assert.equal(
  model.collisionMeshes.filter((m) => m.name.startsWith("hall stair guard"))
    .length,
  12,
);
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
let treeSamples = 0,
  bedSamples = 0,
  buildingSamples = 0;
try {
  const { geometry, inside, distance, closest } = await server.ssrLoadModule(
    "/src/world-geometry.ts",
  );
  const { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const geo = geometry(
    await read("public/overall/data.json"),
    await read("public/campus.json"),
  );
  refine(
    geo,
    await read("public/overall/data.json"),
    await read("public/refined-plans.json"),
  );
  const c = Math.cos(model.yaw),
    s = Math.sin(model.yaw);
  const world = (p) => [
    c * p[0] + s * p[1] + model.anchor[0],
    -s * p[0] + c * p[1] + model.anchor[1],
  ];
  const others = geo.buildings.filter((b) => b.placeId !== "hall"),
    plantHulls = geo.buildings.filter((b) => !b.name.startsWith("hall-tree-"));
  function clear(p) {
    assert.ok(inside(p, geo.land), "planting outside land");
    assert.ok(geo.clearRoad(p, 1.5), "planting on road");
    assert.ok(
      geo.spawns.every((s) => distance(p, s.point) > 3.5),
      "planting blocks arrival",
    );
    assert.ok(
      plantHulls.every((b) => !inside(p, b.footprint)),
      "planting enters building",
    );
    for (const path of geo.walkways)
      for (let i = 1; i < path.points.length; i++)
        assert.ok(
          distance(p, closest(p, path.points[i - 1], path.points[i])) >
            path.width / 2 + 0.5,
          "planting blocks path",
        );
  }
  for (const tree of model.landscape.plants) {
    const p = world(tree.point);
    assert.ok(Math.abs(tree.y + model.base - geo.height(...p)) < 1e-7);
    clear(p);
    for (let i = 0; i < 32; i++) {
      clear([
        p[0] + tree.crownRadius * Math.cos((i * Math.PI) / 16),
        p[1] + tree.crownRadius * Math.sin((i * Math.PI) / 16),
      ]);
      treeSamples++;
    }
  }
  for (const bed of model.landscape.beds)
    for (const p of bed.footprint) {
      clear(world(p));
      bedSamples++;
    }
  // Check lawn interiors too: the merged convex patches must not bridge over a road.
  for (const bed of model.landscape.beds) {
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
        if (inside([x, z], fp)) {
          clear(world([x, z]));
          bedSamples++;
        }
  }
  const footprint = design.footprint;
  const samples = footprint.flatMap((a, i) => {
    const b = footprint[(i + 1) % footprint.length],
      n = Math.ceil(distance(a, b));
    return Array.from({ length: n }, (_, j) =>
      a.map((v, k) => v + ((b[k] - v) * j) / n),
    );
  });
  const min = [0, 1].map((k) => Math.min(...footprint.map((p) => p[k]))),
    max = [0, 1].map((k) => Math.max(...footprint.map((p) => p[k])));
  for (let x = min[0]; x <= max[0]; x += 1.5)
    for (let z = min[1]; z <= max[1]; z += 1.5)
      if (inside([x, z], footprint)) samples.push([x, z]);
  for (const p of samples) {
    const q = world(p);
    assert.ok(geo.clearRoad(q, 0.5), "new curved footprint reaches road");
    assert.ok(
      others.every((b) => !inside(q, b.footprint)),
      "new footprint enters other site",
    );
    buildingSamples++;
  }
} finally {
  await server.close();
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      trees: model.landscape.plants.length,
      beds: model.landscape.beds.length,
      shrubs: model.landscape.shrubs.length,
      treeSamples,
      bedSamples,
      buildingSamples,
      windowAndPortalChecks: recessChecks,
      stairVoidLODs: 3,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: model.collisionMeshes.length,
      lods: results,
    },
    null,
    2,
  ),
);
