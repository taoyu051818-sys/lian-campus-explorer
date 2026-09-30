import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
const root = new URL("../", import.meta.url).pathname;
const json = async (p) =>
  JSON.parse(await fs.readFile(new URL("../" + p, import.meta.url), "utf8"));
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
const report = {
  version: (await json("package.json")).version,
  date: new Date().toISOString(),
};
try {
  const { geometry, toWorld } = await server.ssrLoadModule(
    "/src/world-geometry.ts",
  );
  const { refine } = await server.ssrLoadModule("/src/refinement.ts");
  const data = await json("public/overall/data.json");
  const geo = geometry(data, await json("public/campus.json"));
  refine(geo, data, await json("public/refined-plans.json"));
  const config = await json("public/terrain/landform.json");
  const meta = await json("public/generated/campus.json");
  const bytes = gunzipSync(
    await fs.readFile(
      new URL("../public/generated/campus.meshpack", import.meta.url),
    ),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const positions = (m) =>
    new Float32Array(buffer, m.position.offset, m.position.count);
  const indices = (m) => new Uint32Array(buffer, m.index.offset, m.index.count);
  const ground = positions(
    meta.meshes.find((m) => m.name === "continuous terrain"),
  );
  assert.equal(ground.length, 261 * 301 * 3);
  let maxHeight = -Infinity,
    minHeight = Infinity,
    maxGridError = 0;
  for (let i = 0; i < ground.length; i += 3) {
    assert.ok(Number.isFinite(ground[i + 1]));
    maxHeight = Math.max(maxHeight, ground[i + 1]);
    minHeight = Math.min(minHeight, ground[i + 1]);
    maxGridError = Math.max(
      maxGridError,
      Math.abs(ground[i + 1] - geo.height(ground[i], ground[i + 2])),
    );
  }
  assert.ok(maxGridError < 0.001);
  assert.ok(maxHeight > 210);
  report.grid = {
    vertices: ground.length / 3,
    minHeight,
    maxHeight,
    maxGridError,
  };
  const contextMesh = meta.meshes.find(
    (m) => m.name === "surrounding landform",
  );
  assert.ok(contextMesh?.collision, "surrounding ground has no collision");
  const seam = new Set();
  let seamError = 0;
  for (let i = 0, p = positions(contextMesh); i < p.length; i += 3) {
    const x = p[i],
      z = p[i + 2];
    if (
      ([-1840, 3360].includes(x) && z >= -2100 && z <= 3900) ||
      ([-2100, 3900].includes(z) && x >= -1840 && x <= 3360)
    ) {
      seam.add(`${x}:${z}`);
      seamError = Math.max(seamError, Math.abs(p[i + 1] - geo.height(x, z)));
    }
  }
  for (let x = -1840; x <= 3360; x += 20)
    for (const z of [-2100, 3900])
      assert.ok(seam.has(`${x}:${z}`), "missing horizontal seam vertex");
  for (let z = -2100; z <= 3900; z += 20)
    for (const x of [-1840, 3360])
      assert.ok(seam.has(`${x}:${z}`), "missing vertical seam vertex");
  assert.ok(seamError < 0.001);
  report.context = { seamVertices: seam.size, maxHeightError: seamError };
  const crowns = meta.meshes.find((m) => m.name === "hillside woodland canopy");
  assert.ok(crowns?.visible);
  report.context.canopyClusters = positions(crowns).length / 3 / 28;
  report.peaks = config.peaks.map((p) => ({
    name: p.name,
    target: p.height,
    actual: geo.height(...toWorld(p.map)),
  }));
  for (const p of report.peaks)
    assert.ok(
      Math.abs(p.target - p.actual) < 3,
      `${p.name} lost its height constraint`,
    );
  assert.ok(geo.height(...toWorld([850, 580])) < config.lake.waterLevel - 1);
  assert.ok(
    geo.height(...toWorld([730, 1180])) < -0.8,
    "southern bay is still filled in",
  );
  const lake = meta.meshes.find((m) => m.name === "山中湖 water");
  assert.ok(lake?.visible);
  for (let i = 1, p = positions(lake); i < p.length; i += 3)
    assert.ok(Math.abs(p[i] - config.lake.waterLevel) < 0.0001);
  // All assets' baked landscape samples must keep the exact existing ground grid.
  report.authored = [];
  for (const id of [
    "library",
    "stadium",
    "sports",
    "activity",
    "hall",
    "uestc",
    "bupt",
    "incubator",
    "canteen",
  ]) {
    const a = await json(`public/models/${id}/${id}.json`),
      c = Math.cos(a.yaw),
      s = Math.sin(a.yaw);
    const transform = (p) => [
      a.anchor[0] + c * p[0] + s * p[1],
      a.anchor[1] - s * p[0] + c * p[1],
    ];
    let count = 0,
      error = 0;
    const oldHeight = (x, z) => {
      const x0 = Math.floor(x / 20) * 20,
        z0 = Math.floor(z / 20) * 20,
        u = (x - x0) / 20,
        v = (z - z0) / 20,
        A = geo.legacyHeight(x0, z0),
        B = geo.legacyHeight(x0 + 20, z0),
        C = geo.legacyHeight(x0, z0 + 20),
        D = geo.legacyHeight(x0 + 20, z0 + 20);
      return u + v <= 1
        ? A + (B - A) * u + (C - A) * v
        : D + (C - D) * (1 - u) + (B - D) * (1 - v);
    };
    for (const patch of [
      ...a.collisionVolumes,
      ...a.landscape.beds,
      ...(a.landscape.paths || []),
      ...(a.landscape.aprons || []),
    ]) {
      for (const p of patch.footprint || patch.outer || []) {
        const q = transform(p);
        error = Math.max(error, Math.abs(geo.height(...q) - oldHeight(...q)));
        count++;
      }
    }
    assert.ok(
      error < 1e-7,
      `${id} changed below authored landscape by ${error}`,
    );
    assert.ok(
      Math.abs(geo.height(...a.anchor) + 0.12 - a.base) < 1e-7,
      `${id} model registration moved`,
    );
    report.authored.push({ id, samples: count, maxGradeError: error });
  }
  let roadTriangles = 0,
    maxDrapeError = 0;
  const roadNames = new Set(
    geo.roads.flatMap((r) => [r.name, r.name + "步道"]),
  );
  roadNames.add("junction");
  for (const mesh of meta.meshes.filter((m) => roadNames.has(m.name))) {
    const p = positions(mesh),
      ix = indices(mesh),
      offset =
        mesh.name === "junction"
          ? 0.25
          : mesh.name.endsWith("步道")
            ? 0.12
            : 0.22;
    for (let i = 0; i < ix.length; i += 3) {
      const v = [0, 0, 0];
      for (let k = 0; k < 3; k++)
        for (let j = 0; j < 3; j++) v[j] += p[ix[i + k] * 3 + j] / 3;
      maxDrapeError = Math.max(
        maxDrapeError,
        Math.abs(v[1] - geo.height(v[0], v[2]) - offset),
      );
      roadTriangles++;
    }
  }
  assert.ok(roadTriangles > 10000);
  assert.ok(maxDrapeError < 0.015, `road crosses terrain: ${maxDrapeError}`);
  let maxGrade = 0;
  const steep = [];
  for (const r of geo.roads)
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        n = Math.ceil(len / 4);
      let prev = geo.height(...a);
      for (let k = 1; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n,
          z = a[1] + ((b[1] - a[1]) * k) / n,
          h = geo.height(x, z),
          grade = Math.abs(h - prev) / (len / n);
        maxGrade = Math.max(maxGrade, grade);
        if (grade > 0.08) steep.push({ name: r.name, x, z, grade });
        prev = h;
      }
    }
  report.roads = {
    triangles: roadTriangles,
    maxDrapeError,
    maxGrade,
    steep: steep.slice(0, 8),
  };
  // Foundation cut/fill must leave the occupied ground storey above its platform.
  const burial = [];
  for (const b of geo.buildings.filter(
    (b) =>
      !["library-blender", "authored-blender"].includes(b.kind) &&
      !b.kind?.startsWith("teaching") &&
      !["services", "industry"].includes(b.placeId),
  )) {
    for (const p of b.footprint) {
      const delta = geo.height(...p) - b.fixedBase;
      if (delta > 0.65) burial.push({ name: b.name, delta });
    }
  }
  report.playingFields = geo.grounds.map((g) => {
    const heights = [g.center, ...g.footprint].map((p) => geo.height(...p));
    return {
      id: g.placeId,
      min: Math.min(...heights),
      max: Math.max(...heights),
    };
  });
  for (const f of report.playingFields)
    assert.ok(f.max - f.min < 0.05, `${f.id} field is not level`);
  report.platforms = {
    count: geo.terrain.pads.length,
    buriedCorners: burial.length,
    worst: burial.sort((a, b) => b.delta - a.delta).slice(0, 8),
  };
  console.log(JSON.stringify(report, null, 2));
  await fs.writeFile(
    new URL(`../验证记录/terrain-v${report.version}.json`, import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  assert.ok(!steep.length, "road grade exceeds 8%");
  assert.ok(!burial.length, "terrain enters building ground floors");
} finally {
  await server.close();
}
