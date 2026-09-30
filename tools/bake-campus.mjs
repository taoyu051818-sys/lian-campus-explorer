import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "public/generated");
await fs.mkdir(out, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { detailStatus, partialDetailStatus } =
    await server.ssrLoadModule("/src/refinement.ts");
  const { buildCampus } = await server.ssrLoadModule(
    "/tools/build-world-geometry.ts",
  );
  const json = async (p) =>
    JSON.parse(await fs.readFile(path.join(root, "public", p), "utf8"));
  const [data, campus, plans] = await Promise.all(
    ["overall/data.json", "campus.json", "refined-plans.json"].map(json),
  );
  const built = buildCampus(data, campus, plans);
  const { scene, geo, engine, physicalMeshes } = built;
  const buffers = [],
    materials = [],
    meshRecords = [],
    matMap = new Map();
  let byteLength = 0,
    triangles = 0;
  function append(array) {
    const record = { offset: byteLength, count: array.length };
    const buffer = Buffer.from(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    buffers.push(buffer);
    byteLength += buffer.byteLength;
    return record;
  }
  function material(m) {
    if (matMap.has(m.uniqueId)) return matMap.get(m.uniqueId);
    const id = materials.length;
    matMap.set(m.uniqueId, id);
    materials.push({
      name: m.name,
      color: m.diffuseColor?.asArray() ?? [0.7, 0.7, 0.7],
      alpha: m.alpha ?? 1,
      doubleSide: !m.backFaceCulling,
    });
    return id;
  }
  for (const mesh of scene.meshes) {
    const collision = physicalMeshes.includes(mesh);
    const visible = mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0;
    if (
      (!visible && !collision) ||
      !mesh.getTotalVertices() ||
      mesh.name.startsWith("parcel ")
    )
      continue;
    const ps = mesh.getVerticesData("position"),
      ns = mesh.getVerticesData("normal");
    const positions = new Float32Array(ps.length),
      normals = new Float32Array(ps.length);
    const matrix = mesh.computeWorldMatrix(true).m;
    for (let i = 0; i < ps.length; i += 3) {
      const x = ps[i],
        y = ps[i + 1],
        z = ps[i + 2];
      positions[i] = x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12];
      positions[i + 1] =
        x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13];
      positions[i + 2] =
        x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14];
      if (ns) {
        const a = ns[i],
          b = ns[i + 1],
          c = ns[i + 2];
        const nx = a * matrix[0] + b * matrix[4] + c * matrix[8],
          ny = a * matrix[1] + b * matrix[5] + c * matrix[9],
          nz = a * matrix[2] + b * matrix[6] + c * matrix[10];
        const length = Math.hypot(nx, ny, nz) || 1;
        normals.set([nx / length, ny / length, nz / length], i);
      }
    }
    const indices = new Uint32Array(mesh.getIndices());
    // Store outward CCW triangles in the source east/up/north basis. The runtime
    // adapter reflects Z and reverses winding together for Three.js and Rapier.
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const ux = positions[b] - positions[a],
        uy = positions[b + 1] - positions[a + 1],
        uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a],
        vy = positions[c + 1] - positions[a + 1],
        vz = positions[c + 2] - positions[a + 2];
      const dot =
        (uy * vz - uz * vy) * normals[a] +
        (uz * vx - ux * vz) * normals[a + 1] +
        (ux * vy - uy * vx) * normals[a + 2];
      if (dot < 0)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    }
    const sourceMaterials = mesh.material?.subMaterials || [
      mesh.material || scene.defaultMaterial,
    ];
    const record = {
      name: mesh.name,
      placeId: mesh.metadata?.placeId,
      collision,
      visible,
      position: append(positions),
      normal: append(normals),
      index: append(indices),
      materials: sourceMaterials.map((m) =>
        material(m || scene.defaultMaterial),
      ),
      groups: mesh.subMeshes.map((s) => ({
        start: s.indexStart,
        count: s.indexCount,
        materialIndex: s.materialIndex,
      })),
      lod: mesh.getLODLevels().find((l) => !l.mesh)?.distance || 0,
    };
    const uv = mesh.getVerticesData("uv"),
      colors = mesh.getVerticesData("color");
    if (uv) record.uv = append(new Float32Array(uv));
    if (colors) record.color = append(new Float32Array(colors));
    meshRecords.push(record);
    triangles += indices.length / 3;
  }
  const manifest = {
    format: 1,
    coordinates: "east-up-north",
    status: { ...detailStatus, ...partialDetailStatus },
    byteLength,
    materials,
    meshes: meshRecords,
    buildings: geo.buildings,
    spawns: geo.spawns.map((s) => ({ ...s, y: geo.height(...s.point) })),
    teachingFoot: geo.teachingAccess?.stairs[1].foot,
    teachingAccess: geo.teachingAccess,
    libraryAsset: geo.libraryAsset,
    authoredAssets: geo.authoredAssets,
    registrations: built.registrations,
    stats: {
      buildings: geo.buildings.length,
      meshes: meshRecords.length,
      triangles,
      colliders: physicalMeshes.length,
    },
  };
  const binary = gzipSync(Buffer.concat(buffers), { level: 9 });
  await fs.writeFile(path.join(out, "campus.meshpack"), binary);
  await fs.writeFile(path.join(out, "campus.json"), JSON.stringify(manifest));
  console.log("Campus bake:", {
    ...manifest.stats,
    compressedMB: (binary.length / 1e6).toFixed(2),
  });
  scene.dispose();
  engine.dispose();
} finally {
  await server.close();
}
