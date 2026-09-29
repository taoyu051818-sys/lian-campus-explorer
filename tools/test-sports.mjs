import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/sports/sports.json"),
  design = await read("authoring/sports/design.json"),
  campus = await read("public/generated/campus.json");
assert.equal(model.lods.length, 3);
assert.equal(design.blocks.length, 3);
const results = [];
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/sports/" + lod.file, lod);
  results.push(stats);
  for (const part of [
    "pool central curved wrap",
    "pool perforated panels",
    "gym shell",
    "gym curved entry stairs",
    "annex cladding",
    "annex rooftop court",
    "annex court fence",
    "site foliage",
    "site perimeter paving",
    "pool ochre garden path",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(part)),
      `${lod.file}: missing ${part}`,
    );
  const hood = stats.nodes.find((n) =>
    n.name.startsWith("pool central curved wrap"),
  );
  assert.ok(
    Math.abs(
      hood.bounds[1][1] -
        design.blocks.find((b) => b.id === "pool").base -
        24.5,
    ) < 0.05,
    "pool wrap must rise above and turn over roof",
  );
  assert.ok(
    stats.bounds[1][1] < 36 && stats.bounds[1][0] - stats.bounds[0][0] > 200,
    "asset units changed",
  );
}
assert.ok(results[0].triangles > results[1].triangles * 1.4);
assert.ok(results[1].triangles > results[2].triangles * 2.5);
const registration = campus.authoredAssets.find((a) => a.id === "sports");
assert.deepEqual(registration.anchor, model.anchor);
assert.ok(Math.abs(registration.base - model.base) < 1e-8);
for (const hull of model.collisionVolumes) {
  const mesh = campus.meshes.find((m) => m.name === hull.name);
  assert.ok(mesh?.collision && !mesh.visible, `${hull.name}: collider missing`);
  const b = campus.buildings.find((b) => b.name === hull.name);
  assert.ok(Math.abs(b.fixedBase - (registration.base + hull.base)) < 1e-8);
  assert.equal(b.height, hull.height);
}
assert.ok(
  campus.meshes.some(
    (m) => m.name === "sports curved stair ramp" && m.collision && !m.visible,
  ),
);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "sports"),
  "old procedural sports surfaces must be removed",
);
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
let treeSamples = 0,
  bedSamples = 0;
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
  const buildingHulls = geo.buildings.filter(
    (b) => !b.name.startsWith("sports-tree-"),
  );
  function clear(p) {
    assert.ok(inside(p, geo.land), "planting leaves land");
    assert.ok(geo.clearRoad(p, 3.5), "planting reaches road");
    assert.ok(
      geo.spawns.every((s) => distance(p, s.point) > 5),
      "planting blocks arrival",
    );
    for (const b of buildingHulls)
      assert.ok(!inside(p, b.footprint), `planting intersects ${b.name}`);
    for (const path of geo.walkways)
      for (let i = 1; i < path.points.length; i++)
        assert.ok(
          distance(p, closest(p, path.points[i - 1], path.points[i])) >
            path.width / 2 + 1,
          "planting blocks footpath",
        );
  }
  for (const tree of model.landscape.plants) {
    const p = world(tree.point);
    assert.ok(
      Math.abs(tree.y + model.base - geo.height(...p)) < 1e-7,
      "tree floats above terrain",
    );
    clear(p);
    for (let i = 0; i < 24; i++) {
      clear([
        p[0] + tree.crownRadius * Math.cos((i * Math.PI) / 12),
        p[1] + tree.crownRadius * Math.sin((i * Math.PI) / 12),
      ]);
      treeSamples++;
    }
  }
  for (const bed of model.landscape.beds)
    for (const p of bed.footprint) {
      clear(world(p));
      bedSamples++;
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
      treeSamples,
      bedSamples,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: model.collisionMeshes.length,
      lods: results,
    },
    null,
    2,
  ),
);
