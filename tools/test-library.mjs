import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const root = new URL("../public/models/library/", import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL("library.json", root)));
await MeshoptDecoder.ready;
assert.equal(manifest.lods.length, 3);
assert.equal(manifest.collisionVolumes.length, 40);
const stats = [];
for (const level of manifest.lods) {
  const data = await fs.readFile(new URL(level.file, root));
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  assert.equal(data.length, level.bytes);
  assert.equal(createHash("sha256").update(data).digest("hex"), level.sha256);
  const length = data.readUInt32LE(12);
  const gltf = JSON.parse(data.toString("utf8", 20, 20 + length));
  const bin = data.subarray(28 + length);
  assert.ok(gltf.extensionsRequired.includes("EXT_meshopt_compression"));
  const views = gltf.bufferViews.map((view) => {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (!ext)
      return bin.subarray(
        view.byteOffset || 0,
        (view.byteOffset || 0) + view.byteLength,
      );
    const decoded = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      decoded,
      ext.count,
      ext.byteStride,
      bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength),
      ext.mode,
      ext.filter,
    );
    assert.equal(decoded.byteLength, view.byteLength);
    return decoded;
  });
  const type = {
    5120: ["getInt8", 1, 127],
    5121: ["getUint8", 1, 255],
    5122: ["getInt16", 2, 32767],
    5123: ["getUint16", 2, 65535],
    5125: ["getUint32", 4, 4294967295],
    5126: ["getFloat32", 4, 1],
  };
  function accessor(id) {
    const a = gltf.accessors[id],
      v = gltf.bufferViews[a.bufferView],
      bytes = views[a.bufferView];
    assert.ok(!a.sparse, "unexpected sparse accessor");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const [read, size, divisor] = type[a.componentType],
      components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const stride = v.byteStride || size * components,
      offset = a.byteOffset || 0;
    assert.ok(
      offset + (a.count - 1) * stride + size * components <= bytes.length,
    );
    return {
      count: a.count,
      get(i, k = 0) {
        const x = view[read](offset + i * stride + k * size, true);
        return a.normalized ? Math.max(-1, x / divisor) : x;
      },
    };
  }
  let triangles = 0,
    meshes = 0;
  const bounds = new Box3();
  const facadeChecks = { screenVertices: 0, spandrelVertices: 0, entranceVertices: 0 };
  const point = new Vector3();
  function visit(index, parent) {
    const node = gltf.nodes[index];
    const matrix = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3().fromArray(node.translation || [0, 0, 0]),
          new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
          new Vector3().fromArray(node.scale || [1, 1, 1]),
        );
    matrix.premultiply(parent);
    if (node.mesh !== undefined) {
      meshes++;
      for (const p of gltf.meshes[node.mesh].primitives) {
        assert.ok(p.mode === undefined || p.mode === 4, "expected triangles");
        const positions = accessor(p.attributes.POSITION),
          indices = accessor(p.indices),
          normals = accessor(p.attributes.NORMAL);
        assert.equal(indices.count % 3, 0);
        triangles += indices.count / 3;
        for (let i = 0; i < indices.count; i++)
          assert.ok(indices.get(i) < positions.count);
        for (let i = 0; i < positions.count; i++) {
          point
            .set(positions.get(i, 0), positions.get(i, 1), positions.get(i, 2))
            .applyMatrix4(matrix);
          assert.ok([point.x, point.y, point.z].every(Number.isFinite));
          bounds.expandByPoint(point);
          // Inspect decoded vertices in model space: screens must never intrude into
          // the broad solid ribbons or continuous clear glass slots in any LOD.
          if (/^Petal .* screen \|/.test(node.name) && !node.name.includes("roof screen")) {
            const withinStorey = ((point.y % 5) + 5) % 5;
            assert.ok(withinStorey >= 1.30 && withinStorey <= 4.48, `${node.name}: screen crosses a plain facade band at ${point.y}`);
            if (node.name.startsWith("Petal east-garden")) assert.ok(point.y > 6.30, "garden wing ground floor must remain clear glass");
            facadeChecks.screenVertices++;
          }
          if (node.name.startsWith("Tower spandrel panels")) {
            const withinStorey = ((point.y % 4.4) + 4.4) % 4.4;
            assert.ok(withinStorey >= .12 && withinStorey <= 1.34, "spandrel crosses the clear window band");
            facadeChecks.spandrelVertices++;
          }
          if (node.name.startsWith("Entrance clear glazing")) facadeChecks.entranceVertices++;

          const n = Math.hypot(
            normals.get(i, 0),
            normals.get(i, 1),
            normals.get(i, 2),
          );
          assert.ok(n > 0.95 && n < 1.05, "invalid normal");
        }
      }
    }
    for (const child of node.children || []) visit(child, matrix);
  }
  for (const node of gltf.scenes[gltf.scene || 0].nodes)
    visit(node, new Matrix4());
  for (const [name, count] of Object.entries(facadeChecks)) assert.ok(count > 0, `missing ${name}`);
  const towerFins = gltf.materials.find(m => m.name === "Library / champagne fins");
  assert.ok(towerFins.pbrMetallicRoughness.baseColorFactor[0] > towerFins.pbrMetallicRoughness.baseColorFactor[2], "tower fins must have their separate warm finish");
  assert.equal(triangles, level.triangles);
  assert.equal(meshes, level.meshObjects);
  const size = bounds.getSize(new Vector3());
  assert.ok(
    size.x > 110 && size.x < 165 && size.z > 95 && size.z < 160,
    "metres or axes changed",
  );
  assert.ok(size.y > 83 && size.y < 85, "tower height changed");
  assert.ok(Math.abs(bounds.min.y) < 0.05, "asset base moved");
  stats.push({
    file: level.file,
    triangles,
    meshes,
    bytes: data.length,
    bounds: [bounds.min.toArray(), bounds.max.toArray()],
    facadeChecks,
  });
}
assert.ok(stats[0].triangles > stats[1].triangles * 1.5);
assert.ok(stats[1].triangles > stats[2].triangles * 4);
const campus = JSON.parse(
  await fs.readFile(
    new URL("../public/generated/campus.json", import.meta.url),
  ),
);
assert.deepEqual(campus.libraryAsset.anchor, manifest.anchor);
assert.equal(campus.libraryAsset.yaw, manifest.yaw);
for (const hull of manifest.collisionVolumes) {
  const building = campus.buildings.find((b) => b.name === hull.name);
  const mesh = campus.meshes.find((m) => m.name === hull.name);
  assert.ok(
    building && mesh?.collision && !mesh.visible,
    `${hull.name}: missing independent collider`,
  );
  assert.equal(building.footprint.length, hull.footprint.length);
  for (let i = 0; i < hull.footprint.length; i++) {
    const [x, z] = hull.footprint[i],
      c = Math.cos(manifest.yaw),
      s = Math.sin(manifest.yaw);
    assert.ok(
      Math.hypot(
        building.footprint[i][0] - manifest.anchor[0] - c * x - s * z,
        building.footprint[i][1] - manifest.anchor[1] + s * x - c * z,
      ) < 1e-8,
    );
  }
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      lods: stats,
      independentCollisionVolumes: manifest.collisionVolumes.length,
    },
    null,
    2,
  ),
);
