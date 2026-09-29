import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/activity/activity.json"),
  design = await read("authoring/activity/design.json"),
  campus = await read("public/generated/campus.json");
const results = [],
  loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function endPoint(s, t, h) {
  const a = design.stations[0],
    b = design.stations[1],
    f = s / b.s;
  return new Vector3(
    a.point[0] + (b.point[0] - a.point[0]) * f + t * a.right[0],
    design.buildingBase + h,
    a.point[1] + (b.point[1] - a.point[1]) * f + t * a.right[1],
  );
}
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/activity/" + lod.file, lod);
  results.push(stats);
  for (const name of [
    "continuous curved bands",
    "upper curtain walls",
    "brick ground rooms and piers",
    "upper end wall with square opening",
    "south exterior return stairs",
    "connected planted lawns",
    "branching tree trunks",
    "courtyard circular path",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `${lod.file}: missing ${name}`,
    );
  assert.ok(
    stats.bounds[1][1] - design.buildingBase < 22.0 &&
      stats.bounds[1][1] - design.buildingBase > 21.5,
    "survey height / metre units changed",
  );
  const bytes = await fs.readFile("public/models/activity/" + lod.file);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  gltf.scene.updateMatrixWorld(true);
  const walls = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.name.startsWith("upper_end_wall_with_square_opening"))
      walls.push(o);
  });
  // Loader sanitises node names; the visible aperture must actually be empty in every LOD.
  if (!walls.length)
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.name.includes("square_opening")) walls.push(o);
    });
  assert.ok(walls.length, "end wall nodes not found");
  for (const [t, expected] of [
    [0, false],
    [4, true],
  ]) {
    const a = endPoint(-2, t, 15.7),
      direction = endPoint(2, t, 15.7).sub(a).normalize();
    const hits = new Raycaster(a, direction, 0, 4).intersectObjects(
      walls,
      false,
    );
    assert.equal(
      hits.length > 0,
      expected,
      `${lod.file}: square opening or surrounding wall incorrect`,
    );
  }
  const decks = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.name.includes("exterior_gallery_floors")) decks.push(o);
  });
  assert.ok(decks.length, "gallery floor nodes not found");
  for (const h of [5.2, 10.4, 15.6])
    for (const [t, expected] of [
      [-3, false],
      [5, true],
    ]) {
      const p = endPoint(3, t, h + 1);
      assert.equal(
        new Raycaster(p, new Vector3(0, -1, 0), 0, 2).intersectObjects(
          decks,
          false,
        ).length > 0,
        expected,
        `${lod.file}: stairwell must cut the gallery floor`,
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
assert.ok(results[0].triangles > results[1].triangles * 1.6);
assert.ok(results[1].triangles > results[2].triangles * 1.6);
assert.equal(model.canopyBounds.length, model.landscape.plants.length * 3);
for (const tree of model.canopyBounds)
  assert.ok(
    tree.measuredRadius <= tree.clearanceRadius + 0.01,
    "actual canopy exceeds planting clearance envelope",
  );
const registration = campus.authoredAssets.find((a) => a.id === "activity");
assert.deepEqual(registration.anchor, model.anchor);
assert.equal(registration.yaw, 0);
assert.ok(Math.abs(registration.base - model.base) < 1e-8);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "activity"),
  "old procedural building overlaps authored asset",
);
for (const hull of model.collisionVolumes) {
  const mesh = campus.meshes.find((m) => m.name === hull.name);
  assert.ok(
    mesh?.collision && !mesh.visible,
    `${hull.name}: missing hidden collider`,
  );
}
assert.equal(
  model.collisionMeshes.filter((m) => m.name.startsWith("activity stair ramp"))
    .length,
  6,
);
assert.equal(
  model.collisionMeshes.filter((m) => m.name.startsWith("activity stair guard"))
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
  const world = (p) => [p[0] + model.anchor[0], p[1] + model.anchor[1]];
  const others = geo.buildings.filter((b) => b.placeId !== "activity"),
    plantHulls = geo.buildings.filter(
      (b) => !b.name.startsWith("activity-tree-"),
    );
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
      squareApertureLODs: 3,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: model.collisionMeshes.length,
      lods: results,
    },
    null,
    2,
  ),
);
