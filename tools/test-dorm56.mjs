import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
import { createPlayer } from "../src/webgpu/player.js";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/dorm56/dorm56.json"),
  d = await read("authoring/dorm56/design.json"),
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
  const stats = await inspectGLB("public/models/dorm56/" + lod.file, lod);
  report.lods.push(stats);
  const bytes = await fs.readFile("public/models/dorm56/" + lod.file),
    g = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  g.scene.updateMatrixWorld(true);
  const down = (p, h = 55) =>
    new Raycaster(
      new Vector3(p[0], h, p[1]),
      new Vector3(0, -1, 0),
      0,
      80,
    ).intersectObject(g.scene, true)[0];
  // Every step of the original plan must survive all LODs, including low terraces.
  for (const block of d.blocks) {
    const p = block.footprint.reduce(
        (a, b) => a.map((v, k) => v + b[k] / 4),
        [0.19, 0.11],
      ),
      hit = down(p),
      top = d.groundFloor + 4.2 + (block.floors - 1) * 3.4;
    assert.ok(hit, block.name + " has no roof");
    assert.ok(
      hit.point.y >= top - 0.05 && hit.point.y < top + 1.6,
      block.name + " roof height " + hit.point.y + " expected " + top,
    );
    report.surfaces.push({
      lod: lod.file,
      building: block.name,
      height: hit.point.y,
    });
  }
  // Glazing must be visible in front of backing walls, with an actual balcony recess.
  const fp = d.buildings.find((b) => b.number === 4).levels[4].facade[0]
    .outline;
  const a = fp[0],
    b = fp[1],
    len = Math.hypot(b[0] - a[0], b[1] - a[1]),
    u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
    n = [u[1], -u[0]],
    bay = len / Math.round(len / 3.25),
    p = a.map((v, k) => v + u[k] * bay * 0.5 + n[k] * 3);
  const hit = new Raycaster(
    new Vector3(p[0], d.groundFloor + 4.2 + 3 * 3.4 + 1.7, p[1]),
    new Vector3(-n[0], 0, -n[1]),
    0,
    7,
  ).intersectObject(g.scene, true)[0];
  assert.ok(
    hit?.object.name.startsWith("blue_recessed_room_windows"),
    "window occluded: " + hit?.object.name,
  );
  assert.ok(Math.abs(hit.distance - 4.13) < 0.02, "lost recess");
  for (const bridge of d.bridges) {
    const p = bridge.a.map((v, k) => (v + bridge.b[k]) / 2 + 0.03),
      hit = down(p);
    assert.ok(
      hit && Math.abs(hit.point.y - bridge.roof) < 0.025,
      bridge.id + " roof is missing",
    );
  }
  for (const stem of [
    "projecting white floor bands",
    "recessed grey dormitory walls",
    "red brick service building piers",
    "glazed link curtain wall",
    "terrace red paving",
    "terrace planted beds",
    "branching tree trunks",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(stem)),
      stem,
    );
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
for (const b of model.canopyBounds)
  assert.ok(b.measuredRadius <= b.clearanceRadius + 0.01);
assert.equal(model.canopyBounds.length, model.landscape.plants.length * 3);
const t = model.landscape.terrain;
for (let i = 0; i < t.index.length; i += 3) {
  const [a, b, c] = t.index
    .slice(i, i + 3)
    .map((k) => t.position.slice(k * 3, k * 3 + 3));
  assert.ok(
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0,
    "terrain facing down",
  );
}
const reg = meta.authoredAssets.find((a) => a.id === "dorm56");
assert.deepEqual(reg.anchor, model.anchor);
assert.equal(reg.base, model.fixedTerrainBase);
assert.equal(reg.yaw, model.yaw);
assert.ok(
  !meta.meshes.some((m) => m.visible && m.placeId === "dorm56"),
  "old geometry remains",
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
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const { geometry, inside } = await server.ssrLoadModule(
      "/src/world-geometry.ts",
    ),
    { refine } = await server.ssrLoadModule("/src/refinement.ts"),
    data = await read("public/overall/data.json"),
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  let error = 0;
  for (const patch of [...model.landscape.paths, ...model.landscape.beds])
    for (let j = 0; j < patch.index.length; j += 3) {
      const ps = patch.index
          .slice(j, j + 3)
          .map((i) => patch.position.slice(i * 3, i * 3 + 3)),
        p = ps.reduce((a, q) => a.map((v, k) => v + q[k] / 3), [0, 0, 0]);
      error = Math.max(
        error,
        Math.abs(
          p[1] +
            model.base -
            geo.height(...world([p[0], p[2]])) -
            (patch.heights?.length ? 0.13 : 0.065),
        ),
      );
    }
  assert.ok(error < 1e-6, "paving cuts terrain " + error);
  report.maxDrapeError = error;
  for (const tree of model.landscape.plants) {
    assert.ok(
      Math.abs(tree.y + model.base - geo.height(...world(tree.point))) < 1e-6,
      "floating tree",
    );
    for (let j = 0; j < 24; j++) {
      const p = tree.point.map(
          (v, k) =>
            v +
            tree.crownRadius *
              (k ? Math.sin((j * Math.PI) / 12) : Math.cos((j * Math.PI) / 12)),
        ),
        q = world(p);
      assert.ok(geo.clearRoad(q, 0.4), "tree over road");
      assert.ok(
        d.blocks.every((b) => !inside(p, b.footprint)),
        "tree enters building",
      );
      assert.ok(
        geo.buildings
          .filter((b) => b.placeId !== "dorm56")
          .every((b) => !inside(q, b.footprint)),
        "tree enters neighbor",
      );
    }
  }
  // The focused route test retains every collider overlapping the route envelope.
  // The separate test:physics regression still exercises the complete campus world.
  const routePoints = [
    ...d.walkRoutes.flatMap((r) => r.points),
    ...d.bridges.flatMap((b) => [b.a, b.b]),
  ].map(world);
  const bounds = [
    Math.min(...routePoints.map((p) => p[0])) - 12,
    Math.max(...routePoints.map((p) => p[0])) + 12,
    Math.min(...routePoints.map((p) => p[1])) - 12,
    Math.max(...routePoints.map((p) => p[1])) + 12,
  ];
  const bytes = gunzipSync(
      await fs.readFile("public/generated/campus.meshpack"),
    ),
    buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    meshes = meta.meshes
      .filter((m) => m.collision)
      .map((m) => ({
        name: m.name,
        placeId: m.placeId,
        position: new Float32Array(buffer, m.position.offset, m.position.count),
        index: new Uint32Array(buffer, m.index.offset, m.index.count),
      }))
      .filter((m) => {
        let minX = Infinity,
          maxX = -Infinity,
          minZ = Infinity,
          maxZ = -Infinity;
        for (let i = 0; i < m.position.length; i += 3) {
          minX = Math.min(minX, m.position[i]);
          maxX = Math.max(maxX, m.position[i]);
          minZ = Math.min(minZ, m.position[i + 2]);
          maxZ = Math.max(maxZ, m.position[i + 2]);
        }
        return (
          maxX >= bounds[0] &&
          minX <= bounds[1] &&
          maxZ >= bounds[2] &&
          minZ <= bounds[3]
        );
      }),
    player = await createPlayer(meshes);
  report.collisionScope = {
    bounds,
    colliders: meshes.length,
    campusColliders: meta.meshes.filter((m) => m.collision).length,
  };
  console.log("ROUTE_COLLIDERS", meshes.length);
  try {
    const routes = [
      ...d.walkRoutes,
      ...d.bridges.map((b) => {
        const mid = b.a.map((v, k) => (v + b.b[k]) / 2),
          l = Math.hypot(...b.a.map((v, k) => v - b.b[k])),
          u = b.a.map((v, k) => (b.b[k] - v) / l);
        return {
          name: b.id + " ground underpass",
          points: [
            mid.map((v, k) => v - u[k] * 3),
            mid.map((v, k) => v + u[k] * 3),
          ],
        };
      }),
    ];
    for (const route of routes) {
      const start = world(route.points[0]);
      player.teleport(start[0], geo.height(...start) + 1.1, start[1]);
      for (let k = 0; k < 100; k++) player.step({});
      for (const list of [route.points, [...route.points].reverse()])
        for (const local of list) {
          const [x, z] = world(local);
          let reached = false;
          for (let k = 0; k < 5000; k++) {
            const dx = x - player.position.x,
              dz = z - player.position.z,
              dist = Math.hypot(dx, dz);
            if (dist < 0.18) {
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
            route.name + " wrong walking level",
          );
        }
      console.log("ROUTE_PASS", route.name);
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
report.status = "passed";
report.limits = d.evidence.estimated;
await fs.writeFile(
  "验证记录/dorm56-blender.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    lods: report.lods.map((l) => l.triangles),
    routes: report.routes.length,
    maxDrapeError: report.maxDrapeError,
  }),
);
