import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, Vector3, Matrix4, Quaternion } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
export async function inspectGLB(file, expected) {
  await MeshoptDecoder.ready;
  const data = await fs.readFile(file);
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.length, data.readUInt32LE(8));
  assert.equal(data.length, expected.bytes);
  assert.equal(
    createHash("sha256").update(data).digest("hex"),
    expected.sha256,
  );
  const length = data.readUInt32LE(12),
    g = JSON.parse(data.toString("utf8", 20, 20 + length)),
    bin = data.subarray(28 + length);
  assert.ok(g.extensionsRequired.includes("EXT_meshopt_compression"));
  const views = g.bufferViews.map((v) => {
    const e = v.extensions?.EXT_meshopt_compression;
    if (!e)
      return bin.subarray(
        v.byteOffset || 0,
        (v.byteOffset || 0) + v.byteLength,
      );
    const result = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      result,
      e.count,
      e.byteStride,
      bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength),
      e.mode,
      e.filter,
    );
    assert.equal(result.length, v.byteLength);
    return result;
  });
  const types = {
    5120: ["getInt8", 1, 127],
    5121: ["getUint8", 1, 255],
    5122: ["getInt16", 2, 32767],
    5123: ["getUint16", 2, 65535],
    5125: ["getUint32", 4, 4294967295],
    5126: ["getFloat32", 4, 1],
  };
  function accessor(id) {
    const a = g.accessors[id],
      v = g.bufferViews[a.bufferView],
      b = views[a.bufferView],
      view = new DataView(b.buffer, b.byteOffset, b.byteLength),
      [read, size, div] = types[a.componentType],
      n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type],
      stride = v.byteStride || size * n,
      offset = a.byteOffset || 0;
    assert.ok(offset + (a.count - 1) * stride + size * n <= b.length);
    return {
      count: a.count,
      get(i, k = 0) {
        const x = view[read](offset + i * stride + k * size, true);
        return a.normalized ? Math.max(-1, x / div) : x;
      },
    };
  }
  const bounds = new Box3(),
    nodes = [],
    point = new Vector3();
  let triangles = 0,
    meshes = 0;
  function visit(id, parent) {
    const n = g.nodes[id],
      matrix = n.matrix
        ? new Matrix4().fromArray(n.matrix)
        : new Matrix4().compose(
            new Vector3().fromArray(n.translation || [0, 0, 0]),
            new Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
            new Vector3().fromArray(n.scale || [1, 1, 1]),
          );
    matrix.premultiply(parent);
    if (n.mesh !== undefined) {
      meshes++;
      const box = new Box3();
      let count = 0;
      for (const p of g.meshes[n.mesh].primitives) {
        assert.ok(p.mode === undefined || p.mode === 4);
        const position = accessor(p.attributes.POSITION),
          normal = accessor(p.attributes.NORMAL),
          index = accessor(p.indices);
        triangles += index.count / 3;
        count += index.count / 3;
        assert.equal(index.count % 3, 0);
        for (let i = 0; i < index.count; i++)
          assert.ok(index.get(i) < position.count);
        for (let i = 0; i < position.count; i++) {
          point
            .set(position.get(i, 0), position.get(i, 1), position.get(i, 2))
            .applyMatrix4(matrix);
          assert.ok(point.toArray().every(Number.isFinite));
          bounds.expandByPoint(point);
          box.expandByPoint(point);
          const len = Math.hypot(
            normal.get(i, 0),
            normal.get(i, 1),
            normal.get(i, 2),
          );
          assert.ok(
            len > 0.95 && len < 1.05,
            `${n.name}: invalid normal ${len}`,
          );
        }
      }
      nodes.push({
        name: n.name,
        bounds: [box.min.toArray(), box.max.toArray()],
        triangles: count,
      });
    }
    for (const child of n.children || []) visit(child, matrix);
  }
  for (const n of g.scenes[g.scene || 0].nodes) visit(n, new Matrix4());
  assert.equal(triangles, expected.triangles);
  assert.equal(meshes, expected.meshObjects);
  return {
    file: expected.file,
    triangles,
    meshes,
    bytes: data.length,
    bounds: [bounds.min.toArray(), bounds.max.toArray()],
    nodes,
  };
}
