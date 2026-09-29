import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "vite";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { Raycaster, Vector3 } from "three";
import { inspectGLB } from "./inspect-glb.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const model = await read("public/models/canteen/canteen.json"),
  design = await read("authoring/canteen/design.json"),
  campus = await read("public/generated/campus.json");
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
  results = [],
  surfaceChecks = [];
for (const lod of model.lods) {
  const stats = await inspectGLB("public/models/canteen/" + lod.file, lod);
  results.push(stats);
  for (const name of [
    "thick terracotta sun fins",
    "white folded wing and parapets",
    "deep shaded canteen glazing",
    "tilted dark solar collector faces",
    "blue horizontal roof tank",
    "exposed teal rooftop pipework",
    "entrance stone stair treads",
    "connected planted lawns",
    "scooter parking bay markings",
  ])
    assert.ok(
      stats.nodes.some((n) => n.name.startsWith(name)),
      `missing ${name}`,
    );
  const bytes = await fs.readFile("public/models/canteen/" + lod.file),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  gltf.scene.updateMatrixWorld(true);
  const point = (u, v) =>
    design.frame.origin.map(
      (c, k) => c + design.frame.u[k] * u + design.frame.v[k] * v,
    );
  const down = (p, y) =>
    new Raycaster(
      new Vector3(p[0], y, p[1]),
      new Vector3(0, -1, 0),
      0,
      40,
    ).intersectObject(gltf.scene, true)[0];
  const roof = design.buildingBase + design.plinthHeight + design.height;
  const high = down(point(8.67, 13), roof + 3),
    low = down(point(8.67, 14.8), roof + 3);
  assert.ok(
    high?.object.name.startsWith("tilted_dark_solar_collector_faces") &&
      low?.object.name.startsWith("tilted_dark_solar_collector_faces"),
    "missing collector faces",
  );
  assert.ok(high.point.y - low.point.y > 0.35, "collector tilt flattened");
  const deck = down(point(65, 12), roof + 6);
  assert.ok(deck?.object.name.startsWith("roof_decks"), "missing roof surface");
  assert.ok(Math.abs(deck.point.y - roof) < 0.08);
  surfaceChecks.push({
    lod: lod.file,
    collectorRise: high.point.y - low.point.y,
    roof: deck.point.y,
  });
  for (const route of model.stairRoutes) {
    const p = route.points[2],
      hit = down(p, p[2] + 3);
    assert.ok(
      hit?.object.name.startsWith("entrance_stone_stair_treads"),
      `stairs occluded by ${hit?.object.name}`,
    );
    assert.ok(Math.abs(hit.point.y - p[2]) < 0.2);
    surfaceChecks.push({ lod: lod.file, stair: route.name, y: hit.point.y });
  }
  // Cast normal to the angled facade: its outer frame must stand forward of the infill.
  const sf = design.sideFrame,
    t = sf.tangent,
    n = sf.normal;
  const ray = (along, h) => {
    const p = point(
      sf.a[0] + t[0] * along + n[0] * 5,
      sf.a[1] + t[1] * along + n[1] * 5,
    );
    const dn = [
      design.frame.u[0] * n[0] + design.frame.v[0] * n[1],
      design.frame.u[1] * n[0] + design.frame.v[1] * n[1],
    ];
    return new Raycaster(
      new Vector3(p[0], h, p[1]),
      new Vector3(-dn[0], 0, -dn[1]),
      0,
      10,
    ).intersectObject(gltf.scene, true)[0];
  };
  const frame = ray(8, roof - 0.45),
    infill = ray(8, roof - 2);
  assert.ok(frame && infill, "white facade missing");
  assert.ok(
    frame.distance + 1 < infill.distance,
    "white border lost physical recess",
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
const reg = campus.authoredAssets.find((a) => a.id === "canteen");
assert.deepEqual(reg.anchor, model.anchor);
assert.equal(reg.yaw, 0);
assert.ok(Math.abs(reg.base - model.base) < 1e-8);
assert.ok(
  !campus.meshes.some((m) => m.visible && m.placeId === "canteen"),
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
  const others = geo.buildings.filter((b) => b.placeId !== "canteen"),
    hulls = geo.buildings.filter(
      (b) =>
        !b.name.startsWith("canteen-tree-") &&
        !b.name.startsWith("canteen lamp"),
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
      aboveGroundFloors: 2,
      trees: model.landscape.plants.length,
      beds: model.landscape.beds.length,
      shrubs: model.landscape.shrubs.length,
      plantSamples,
      buildingSamples,
      stairRoutes: model.stairRoutes.length,
      surfaceChecks,
      collisionVolumes: model.collisionVolumes.length,
      collisionMeshes: model.collisionMeshes.length,
      lods: results,
    },
    null,
    2,
  ),
);
