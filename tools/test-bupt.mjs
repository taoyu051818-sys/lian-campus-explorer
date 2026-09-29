import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/bupt/bupt.json"),
  design = await read("authoring/bupt/design.json"),
  campus = await read("public/generated/campus.json");
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
  results = [],
  stairChecks = [],
  courtChecks = [];
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/bupt/" + lod.file, lod);
  results.push(stats);
  for (const name of [
    "white rectangular window frames",
    "brick red end tower panels",
    "charcoal end tower panels",
    "horizontal silver sun louvers",
    "open white roof pergolas",
    "open connector floor decks",
    "stepped garden retaining walls",
    "garden stair treads",
    "roof garden planted panels",
    "connected planted lawns",
    "internal drive and court paving",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `missing ${name}`,
    );
  const bytes = await fs.readFile("public/models/bupt/" + lod.file),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.updateMatrixWorld(true);
  for (const route of model.stairRoutes) {
    const p = route.points[2],
      hit = new Raycaster(
        new Vector3(p[0], p[2] + 3, p[1]),
        new Vector3(0, -1, 0),
        0,
        5,
      ).intersectObject(gltf.scene, true)[0];
    assert.ok(
      hit?.object.name.includes("garden_stair_treads"),
      `${lod.file}: stair occluded by ${hit?.object.name}`,
    );
    assert.ok(Math.abs(hit.point.y - p[2]) < 0.2);
    stairChecks.push({ lod: lod.file, route: route.name, y: hit.point.y });
  }
  const [x, z] = design.courtyards[1];
  const hits = new Raycaster(
    new Vector3(x, 40, z),
    new Vector3(0, -1, 0),
    0,
    45,
  ).intersectObject(gltf.scene, true);
  assert.ok(
    !hits.some((h) => h.point.y > 10),
    "college1 open atrium roofed over",
  );
  courtChecks.push({ lod: lod.file, highestHit: hits[0]?.point.y ?? null });
  for (const check of model.terraceChecks) {
    const [x, z, y] = check.point;
    const hits = new Raycaster(
      new Vector3(x, y + 1, z),
      new Vector3(0, -1, 0),
      0,
      3,
    ).intersectObject(gltf.scene, true);
    assert.ok(hits.length, `${check.name}: missing terrace surface`);
    assert.ok(
      Math.abs(hits[0].point.y - y) < 0.2,
      `${check.name}: wrong visual terrace height`,
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
assert.ok(results[0].triangles > results[1].triangles * 1.2);
assert.ok(results[1].triangles > results[2].triangles * 1.4);
assert.equal(model.canopyBounds.length, model.landscape.plants.length * 3);
for (const c of model.canopyBounds)
  assert.ok(c.measuredRadius <= c.clearanceRadius + 0.01);
const reg = campus.authoredAssets.find((a) => a.id === "bupt");
assert.deepEqual(reg.anchor, model.anchor);
assert.equal(reg.yaw, 0);
assert.ok(Math.abs(reg.base - model.base) < 1e-8);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "bupt"),
  "legacy geometry overlaps",
);
for (const c of [...model.collisionVolumes, ...model.collisionMeshes]) {
  const m = campus.meshes.find((m) => m.name === c.name);
  assert.ok(m?.collision && !m.visible, `missing ${c.name}`);
}
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
let plantSamples = 0,
  buildingSamples = 0;
try {
  const { geometry, inside, closest, distance } = await server.ssrLoadModule(
      "/src/world-geometry.ts",
    ),
    { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  const world = (p) => p.map((v, k) => v + model.anchor[k]);
  const others = geo.buildings.filter((b) => b.placeId !== "bupt"),
    hulls = geo.buildings.filter(
      (b) =>
        !b.name.startsWith("bupt-tree-") && !b.name.startsWith("bupt lamp"),
    );
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
  for (const b of design.blocks)
    for (let i = 0; i < b.outline.length; i++) {
      const a = b.outline[i],
        c = b.outline[(i + 1) % b.outline.length],
        n = Math.ceil(distance(a, c));
      for (let j = 0; j < n; j++) {
        const q = world(a.map((v, k) => v + ((c[k] - v) * j) / n));
        assert.ok(geo.clearRoad(q, 0.5));
        assert.ok(others.every((b) => !inside(q, b.footprint)));
        buildingSamples++;
      }
    }
} finally {
  await server.close();
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      buildings: 2,
      wingComponents: design.blocks.length,
      trees: model.landscape.plants.length,
      beds: model.landscape.beds.length,
      shrubs: model.landscape.shrubs.length,
      plantSamples,
      buildingSamples,
      stairChecks,
      courtChecks,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: model.collisionMeshes.length,
      lods: results,
    },
    null,
    2,
  ),
);
