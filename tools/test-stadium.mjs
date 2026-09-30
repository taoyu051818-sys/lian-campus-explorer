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
const m = await read("public/models/stadium/stadium.json"),
  d = await read("authoring/stadium/design.json"),
  campus = await read("public/generated/campus.json");
const G = d.fieldHeight,
  A = d.halfStraight,
  R = d.standRadius,
  L = 2 * Math.PI * R + 2 * A;
const pt = (s, r) => {
  if (s < Math.PI * R) {
    const t = Math.PI / 2 + s / R;
    return [-A + r * Math.cos(t), r * Math.sin(t)];
  }
  if (s < Math.PI * R + 2 * A) return [-A + s - Math.PI * R, -r];
  const t = -Math.PI / 2 + (s - Math.PI * R - 2 * A) / R;
  return [A + r * Math.cos(t), r * Math.sin(t)];
};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
  lods = [],
  surfaces = [],
  pavingSamples = [];
for (const lod of m.lods) {
  const stats = await inspectGLB("public/models/stadium/" + lod.file, lod);
  lods.push(stats);
  for (const name of [
    "two tier seating terraces",
    "individual blue bucket seats",
    "individual white bucket seats",
    "radial white aisle stair treads",
    "recessed central officials gallery",
    "folded elevated viewing platform",
    "eight lane blue running track",
    "slender balustrades and fence posts",
    "connected planted lawns",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `missing ${name}`,
    );
  const bytes = await fs.readFile("public/models/stadium/" + lod.file),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.updateMatrixWorld(true);
  const ray = (p, dir, len = 50) =>
    new Raycaster(
      new Vector3(...p),
      new Vector3(...dir),
      0,
      len,
    ).intersectObject(gltf.scene, true);
  const down = (p, y = G + 35) => ray([p[0], y, p[1]], [0, -1, 0])[0];
  for (const [p, name, height] of [
    [[0, 0], "natural_turf", G + 0.019],
    [[0, -40], "eight_lane_blue", G + 0.008],
    [[68, 0], "blue_track_runoff", G],
  ]) {
    const hit = down(p);
    assert.ok(
      hit?.object.name.startsWith(name),
      `${lod.file}: wrong surface ${name}: ${hit?.object.name}`,
    );
    assert.ok(Math.abs(hit.point.y - height) < 0.04);
    surfaces.push({ lod: lod.file, name, height: hit.point.y });
  }
  for (const route of m.stairRoutes) {
    const s = (Number(route.name.split(" ")[1]) * L) / 26,
      row = 5,
      r = R + row * d.rowDepth + d.rowDepth * 0.75,
      p = pt(s, r),
      hit = down(p);
    assert.ok(
      hit?.object.name.startsWith("radial_white_aisle_stair_treads"),
      `stairs occluded: ${hit?.object.name}`,
    );
    assert.ok(
      Math.abs(hit.point.y - (G + 0.35 + (row + 1) * d.rowRise)) < 0.055,
    );
  }
  for (const route of m.passageRoutes) {
    const a = route.points[1],
      b = route.points.at(-1),
      len = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const hits = ray(
      [a[0], G + 1.45, a[1]],
      [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len],
      len,
    );
    assert.equal(
      hits.length,
      0,
      `entrance visually blocked ${route.name}: ${hits[0]?.object.name}`,
    );
  }
  assert.equal(
    down([0, 58]),
    undefined,
    "sea-facing middle edge closed by seating",
  );
  assert.equal(
    ray([-125, G + 17, 10], [1, 0, 0], 25).length,
    0,
    "viewing platform filled below deck",
  );
  assert.ok(
    ray([-125, G + 17, 8], [1, 0, 0], 25).some((h) =>
      h.object.name.startsWith("folded_elevated_viewing_platform"),
    ),
    "open frame columns missing",
  );
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.name.startsWith("terrain_conforming_perimeter_paving")) {
      const g = o.geometry,
        ix = g.index,
        p = g.attributes.position;
      for (let i = 0; i < ix.count; i += 3) {
        const v = new Vector3();
        for (let j = 0; j < 3; j++)
          v.add(
            new Vector3()
              .fromBufferAttribute(p, ix.getX(i + j))
              .applyMatrix4(o.matrixWorld),
          );
        v.divideScalar(3);
        pavingSamples.push(v.toArray());
      }
    }
    o.geometry?.dispose();
    if (o.material) for (const mat of [].concat(o.material)) mat.dispose();
  });
}
assert.ok(lods[0].triangles > lods[1].triangles * 1.4);
assert.ok(lods[1].triangles > lods[2].triangles * 1.25);
assert.equal(m.canopyBounds.length, m.landscape.plants.length * 3);
for (const v of m.canopyBounds)
  assert.ok(v.measuredRadius <= v.clearanceRadius + 0.01);
// Curbed planting islands must not overlap each other in any orientation.
let bedPairs = 0;
for (let i = 0; i < m.landscape.plants.length; i++)
  for (let j = i + 1; j < m.landscape.plants.length; j++) {
    const a = m.landscape.plants[i],
      b = m.landscape.plants[j],
      ba = m.landscape.beds.find((v) => v.name === a.bed),
      bb = m.landscape.beds.find((v) => v.name === b.bed);
    const radius = (bed, t) =>
      Math.max(
        ...bed.footprint.map((p) =>
          Math.hypot(p[0] - t.point[0], p[1] - t.point[1]),
        ),
      );
    assert.ok(
      Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]) >
        radius(ba, a) + radius(bb, b) + 0.13,
      "planting curbs overlap",
    );
    bedPairs++;
  }
const reg = campus.authoredAssets.find((a) => a.id === "stadium");
assert.deepEqual(reg.anchor, m.anchor);
assert.equal(reg.yaw, m.yaw);
assert.ok(Math.abs(reg.base - m.base) < 1e-9);
assert.ok(
  !campus.meshes.some(
    (v) =>
      v.visible &&
      (v.placeId === "stadium" ||
        v.name === "blue coastal stadium" ||
        v.name === "parcel stadium"),
  ),
  "old stadium overlaps authored model",
);
for (const collider of [...m.collisionVolumes, ...m.collisionMeshes]) {
  const mesh = campus.meshes.find((v) => v.name === collider.name);
  assert.ok(
    mesh?.collision && !mesh.visible,
    `collision missing ${collider.name}`,
  );
}
const c = Math.cos(m.yaw),
  s = Math.sin(m.yaw),
  world = ([x, z]) => [
    m.anchor[0] + c * x + s * z,
    m.anchor[1] - s * x + c * z,
  ];
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
let plantSamples = 0;
try {
  const { geometry, inside, closest, distance } = await server.ssrLoadModule(
      "/src/world-geometry.ts",
    ),
    { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await read("public/overall/data.json"),
    geo = geometry(data, await read("public/campus.json"));
  refine(geo, data, await read("public/refined-plans.json"));
  const hulls = geo.buildings.filter(
    (b) => !b.name.startsWith("stadium-tree-"),
  );
  const clear = (p) => {
    const q = world(p);
    assert.ok(inside(q, geo.land));
    assert.ok(geo.clearRoad(q, 0.5), "plant on road");
    assert.ok(
      geo.spawns.every((v) => distance(q, v.point) > 3),
      "plant on spawn",
    );
    assert.ok(
      hulls.every((b) => !inside(q, b.footprint)),
      `plant ${p} in ${hulls.find((b) => inside(q, b.footprint))?.name}`,
    );
    for (const path of geo.walkways)
      for (let i = 1; i < path.points.length; i++)
        assert.ok(
          distance(q, closest(q, path.points[i - 1], path.points[i])) >
            path.width / 2 + 0.25,
          "plant in path",
        );
    plantSamples++;
  };
  assert.ok(
    pavingSamples.length > 300,
    "decoded perimeter pavement samples missing",
  );
  for (const [x, y, z] of pavingSamples) {
    const h = y + m.base - geo.height(...world([x, z]));
    assert.ok(
      h > 0.055 && h < 0.145,
      `perimeter pavement crosses ground: ${[x, y, z, h]}`,
    );
  }
  for (const tree of m.landscape.plants) {
    clear(tree.point);
    assert.ok(
      Math.abs(tree.y + m.base - geo.height(...world(tree.point))) < 1e-7,
    );
    for (let i = 0; i < 48; i++)
      clear(
        tree.point.map(
          (v, k) =>
            v +
            tree.crownRadius *
              (k ? Math.sin((i * Math.PI) / 24) : Math.cos((i * Math.PI) / 24)),
        ),
      );
  }
  for (const bed of m.landscape.beds) for (const p of bed.footprint) clear(p);
} finally {
  await server.close();
}
// Use the actual baked campus collision meshpack, not stand-alone approximations.
const packed = gunzipSync(
    await fs.readFile("public/generated/campus.meshpack"),
  ),
  buffer = packed.buffer.slice(
    packed.byteOffset,
    packed.byteOffset + packed.byteLength,
  );
const player = await createPlayer(
  campus.meshes
    .filter((v) => v.collision)
    .map((v) => ({
      name: v.name,
      placeId: v.placeId,
      position: new Float32Array(buffer, v.position.offset, v.position.count),
      index: new Uint32Array(buffer, v.index.offset, v.index.count),
    })),
);
const routes = [];
try {
  for (const local of [...m.stairRoutes, ...m.passageRoutes]) {
    const route = local.points.map(([x, z, y]) => [
      ...world([x, z]),
      y + reg.base,
    ]);
    player.teleport(route[0][0], route[0][2] + 1.05, route[0][1]);
    for (let i = 0; i < 90; i++) player.step({});
    for (const points of [route, [...route].reverse()])
      for (const [x, z, y] of points) {
        let reached = false;
        for (let i = 0; i < 1500; i++) {
          const p = player.position,
            dx = x - p.x,
            dz = z - p.z,
            dist = Math.hypot(dx, dz);
          if (dist < 0.16) {
            reached = true;
            break;
          }
          const speed = Math.min(2.5, dist * 20);
          player.step({ x: (dx / dist) * speed, z: (dz / dist) * speed });
        }
        assert.ok(
          reached,
          `${local.name} blocked at ${JSON.stringify(player.position)} toward ${[x, z, y]}`,
        );
        assert.ok(
          Math.abs(player.position.y - y - 0.9) < 0.45,
          `${local.name} wrong elevation ${player.position.y} expected ${y + 0.9}`,
        );
      }
    routes.push({
      name: local.name,
      waypoints: route.length,
      outAndBack: true,
    });
  }
} finally {
  player.dispose();
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      trees: m.landscape.plants.length,
      shrubs: m.landscape.shrubs.length,
      representedSeats: m.representedSeats,
      plantSamples,
      bedPairs,
      surfaces,
      pavingTerrainSamples: pavingSamples.length,
      routes,
      collisionVolumes: m.collisionVolumes.length,
      collisionMeshes: m.collisionMeshes.length,
      lods,
    },
    null,
    2,
  ),
);
