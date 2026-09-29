import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/incubator/incubator.json"),
  design = await read("authoring/incubator/design.json"),
  campus = await read("public/generated/campus.json");
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
  results = [],
  courtChecks = [];
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/incubator/" + lod.file, lod);
  results.push(stats);
  for (const name of [
    "separate floor plates and setback terraces",
    "white open rooftop framework",
    "lower dark glazing",
    "middle silver glazing",
    "upper bronze reflective panels",
    "exposed stilt columns",
    "west roof terrace planting",
    "rooftop service enclosures",
    "connected planted lawns",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `missing ${name}`,
    );
  const bytes = await fs.readFile("public/models/incubator/" + lod.file),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.updateMatrixWorld(true);
  const point = (u, v) =>
    design.frame.origin.map(
      (c, k) => c + design.frame.u[k] * u + design.frame.v[k] * v,
    );
  const base = design.buildingBase,
    stilt = design.stiltHeight,
    H = design.storeyHeight;
  const down = (u, v, y, far = 40) => {
    const [x, z] = point(u, v);
    return new Raycaster(
      new Vector3(x, y, z),
      new Vector3(0, -1, 0),
      0,
      far,
    ).intersectObject(gltf.scene, true)[0];
  };
  for (const [u, v, expected, label] of [
    [50, 32, base + stilt + 2 * H, "third-floor front recess"],
    [15, 13, base + stilt + 4 * H + 0.1, "west stepped rooftop terrace"],
  ]) {
    const rayY = label.startsWith("third") ? expected + H * 0.7 : 35;
    const hit = down(u, v, rayY);
    assert.ok(hit, `${label}: no surface`);
    assert.ok(
      Math.abs(hit.point.y - expected) < 0.15,
      `${lod.file} ${label}: ${hit.point.y} vs ${expected}`,
    );
    courtChecks.push({ lod: lod.file, name: label, y: hit.point.y });
  }
  for (const route of model.walkRoutes) {
    for (const [x, z, y] of route.points) {
      const hit = new Raycaster(
        new Vector3(x, y + 2.2, z),
        new Vector3(0, -1, 0),
        0,
        3,
      ).intersectObject(gltf.scene, true)[0];
      assert.ok(
        hit?.object.name.includes("paving"),
        `stilt passage obstructed by ${hit?.object.name}`,
      );
      assert.ok(Math.abs(hit.point.y - y) < 0.1);
    }
  }
  const grid = down(50, 17, 35),
    opening = down(50, 18, 35);
  assert.ok(
    grid?.object.name.includes("white_open_rooftop_framework"),
    "missing overhead roof beam",
  );
  assert.ok(
    opening && grid.point.y - opening.point.y > 2,
    "white roof grid was filled in",
  );
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
const reg = campus.authoredAssets.find((a) => a.id === "incubator");
assert.deepEqual(reg.anchor, model.anchor);
assert.equal(reg.yaw, 0);
assert.ok(Math.abs(reg.base - model.base) < 1e-8);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "incubator"),
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
  const others = geo.buildings.filter((b) => b.placeId !== "incubator"),
    hulls = geo.buildings.filter(
      (b) =>
        !b.name.startsWith("incubator-tree-") &&
        !b.name.startsWith("incubator lamp"),
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
      buildings: 1,
      aboveGroundFloors: design.levels.length,
      trees: model.landscape.plants.length,
      beds: model.landscape.beds.length,
      shrubs: model.landscape.shrubs.length,
      plantSamples,
      buildingSamples,
      stiltRoutes: model.walkRoutes.length,
      courtChecks,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: model.collisionMeshes.length,
      lods: results,
    },
    null,
    2,
  ),
);
