import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
import { createPlayer } from "./physics-fixture.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/dorm52/dorm52.json"),
  d = await read("authoring/dorm52/design.json"),
  meta = await read("public/generated/campus.json");
const report = {
  version: (await read("package.json")).version,
  date: new Date().toISOString(),
  lods: [],
  surfaces: [],
  routes: [],
};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/dorm52/" + lod.file, lod);
  report.lods.push(stats);
  const bytes = await fs.readFile("public/models/dorm52/" + lod.file),
    g = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  g.scene.updateMatrixWorld(true);
  const down = (p, h = 45) =>
    new Raycaster(
      new Vector3(p[0], h, p[1]),
      new Vector3(0, -1, 0),
      0,
      70,
    ).intersectObject(g.scene, true)[0];
  for (const ct of d.courts) {
    const hit = down(ct.center);
    assert.ok(
      hit?.object.name.startsWith("continuous_courtyard_paving"),
      "courtyard not open to sky " + ct.id + ": " + hit?.object.name,
    );
    assert.ok(hit.point.y < 0.1);
    report.surfaces.push({ lod: lod.file, court: ct.id, y: hit.point.y });
  }
  const facade = new Raycaster(
    new Vector3(-40.4, 1.8, -76),
    new Vector3(0, 0, 1),
    0,
    10,
  ).intersectObject(g.scene, true)[0];
  assert.ok(
    facade?.object.name.startsWith("recessed_windows"),
    "window hidden by room wall: " + facade?.object.name,
  );
  assert.ok(
    facade.distance > 4.5 && facade.distance < 4.7,
    "balcony recess depth",
  );
  for (const p of [
    [0.43, 0.67],
    [42.15, -43.11],
  ]) {
    const hits = new Raycaster(
      new Vector3(p[0], 2, p[1]),
      new Vector3(0, -1, 0),
      0,
      5,
    )
      .intersectObject(g.scene, true)
      .filter((h) => h.object.name.startsWith("continuous_courtyard_paving"));
    assert.equal(
      hits.length,
      1,
      "overlapping coplanar paving at path intersection",
    );
  }
  const cone = down(d.cone.topCenter);
  assert.ok(cone?.object.name.startsWith("tapered_shared_glass_pavilion"));
  assert.ok(
    Math.abs(cone.point.y - d.groundFloor - d.cone.height) < 0.025,
    "cone lost height",
  );
  const roof = down([-42, -67]);
  assert.ok(
    roof && roof.point.y > 21.7 && roof.point.y < 22.4,
    "dormitory roof height",
  );
  const ring = down([19.5, 0]);
  assert.ok(ring?.object.name.startsWith("three_level_open_shared_ring_slabs"));
  assert.ok(
    Math.abs(ring.point.y - 10.96) < 0.025,
    "gallery must remain three levels",
  );
  for (const stem of [
    "private balcony glass panels",
    "open gallery metal balustrades",
    "brown balcony privacy louvers",
    "two storey coloured balcony frames",
    "red brick stair cores",
    "courtyard and perimeter planted lawns",
  ]) {
    if (lod.distance >= 750 && stem === "brown balcony privacy louvers")
      continue;
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(stem)),
      stem,
    );
  }
  g.scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        m.dispose(),
      );
    }
  });
}
assert.ok(model.lods[0].triangles > model.lods[1].triangles * 1.3);
assert.ok(model.lods[1].triangles > model.lods[2].triangles * 1.7);
assert.equal(model.canopyBounds.length, model.landscape.plants.length * 3);
for (const b of model.canopyBounds)
  assert.ok(b.measuredRadius <= b.clearanceRadius + 0.01);
const terrain = model.landscape.terrain;
for (let k = 0; k < terrain.index.length; k += 3) {
  const [a, b, c] = terrain.index
    .slice(k, k + 3)
    .map((i) => terrain.position.slice(i * 3, i * 3 + 3));
  assert.ok(
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0,
    "review terrain faces downward",
  );
}
const reg = meta.authoredAssets.find((a) => a.id === "dorm52");
assert.equal(reg.base, model.fixedTerrainBase);
assert.deepEqual(reg.anchor, model.anchor);
assert.equal(reg.yaw, model.yaw);
assert.ok(
  !meta.meshes.some((m) => m.visible && m.placeId === "dorm52"),
  "legacy geometry still visible",
);
for (const v of model.collisionVolumes)
  assert.ok(
    meta.meshes.some((m) => m.name === v.name && m.collision && !m.visible),
    "missing collider " + v.name,
  );
const c = Math.cos(model.yaw),
  s = Math.sin(model.yaw),
  world = ([x, z]) => [
    model.anchor[0] + c * x + s * z,
    model.anchor[1] - s * x + c * z,
  ];
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { geometry, inside, closest, distance } = await server.ssrLoadModule(
      "/src/world-geometry.ts",
    ),
    { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  let maxDrape = 0;
  for (const path of [...model.landscape.paths, ...model.landscape.beds])
    for (let j = 0; j < path.index.length; j += 3) {
      const ps = path.index
        .slice(j, j + 3)
        .map((i) => path.position.slice(i * 3, i * 3 + 3));
      const p = ps.reduce((a, q) => a.map((v, k) => v + q[k] / 3), [0, 0, 0]);
      const offset = path.heights?.length ? 0.13 : 0.065;
      maxDrape = Math.max(
        maxDrape,
        Math.abs(
          p[1] + model.base - geo.height(...world([p[0], p[2]])) - offset,
        ),
      );
    }
  assert.ok(maxDrape < 1e-6, "paving cuts terrain");
  report.maxDrapeError = maxDrape;
  for (const t of model.landscape.plants) {
    assert.ok(
      Math.abs(t.y + model.base - geo.height(...world(t.point))) < 1e-6,
      "floating tree",
    );
    for (let j = 0; j < 24; j++) {
      const p = [
          t.point[0] + t.crownRadius * Math.cos((j * Math.PI) / 12),
          t.point[1] + t.crownRadius * Math.sin((j * Math.PI) / 12),
        ],
        q = world(p);
      assert.ok(geo.clearRoad(q, 0.4), "crown on road");
      assert.ok(
        geo.buildings
          .filter((b) => b.placeId !== "dorm52")
          .every((b) => !inside(q, b.footprint)),
        "neighbor collision",
      );
      assert.ok(
        d.wings.every((b) => !inside(p, b.footprint)),
        "tree in dormitory",
      );
      assert.ok(
        Math.abs(p[0]) > 2.3 && Math.abs(p[1]) > 2.3,
        "blocked central walkway",
      );
    }
  }
  const bytes = gunzipSync(
      await fs.readFile("public/generated/campus.meshpack"),
    ),
    buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  const meshes = meta.meshes
    .filter((m) => m.collision)
    .map((m) => ({
      name: m.name,
      placeId: m.placeId,
      position: new Float32Array(buffer, m.position.offset, m.position.count),
      index: new Uint32Array(buffer, m.index.offset, m.index.count),
    }));
  const player = await createPlayer(meshes);
  try {
    const routes = [
      {
        name: "north south ring passage",
        points: [
          [0, -82],
          [0, -43],
          [0, 0],
          [0, 43],
          [0, 82],
        ],
      },
      {
        name: "east west ring passage",
        points: [
          [-80, 0],
          [-22, 0],
          [0, 0],
          [22, 0],
          [80, 0],
        ],
      },
      ...d.courts.map((ct) => ({
        name: ct.id,
        points: [[0, ct.center[1]], ct.center],
      })),
    ];
    for (const route of routes) {
      const start = world(route.points[0]);
      player.teleport(start[0], geo.height(...start) + 1.1, start[1]);
      for (let k = 0; k < 100; k++) player.step({});
      for (const list of [route.points, [...route.points].reverse()])
        for (const local of list) {
          const [x, z] = world(local);
          let reached = false;
          for (let k = 0; k < 3500; k++) {
            const dx = x - player.position.x,
              dz = z - player.position.z,
              dist = Math.hypot(dx, dz);
            if (dist < 0.17) {
              reached = true;
              break;
            }
            const speed = Math.min(3, dist * 20);
            player.step({ x: (dx / dist) * speed, z: (dz / dist) * speed });
          }
          assert.ok(
            reached,
            route.name + " blocked " + JSON.stringify(player.position),
          );
          assert.ok(
            Math.abs(player.position.y - geo.height(x, z) - 0.9) < 0.45,
            "wrong walking level",
          );
        }
      report.routes.push({
        name: route.name,
        result: "continuous out and back",
      });
    }
  } finally {
    player.dispose();
  }
} finally {
  await server.close();
}
report.coplanarPaving = "single surface at both tested path junctions";
report.status = "passed";
report.limits = d.evidence.estimated;
await fs.writeFile(
  "验证记录/dorm52-blender.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    lods: report.lods.map((x) => ({ triangles: x.triangles })),
    routes: report.routes,
    maxDrapeError: report.maxDrapeError,
  }),
);
