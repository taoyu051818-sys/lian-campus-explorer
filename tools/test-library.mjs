import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const root = new URL("../public/models/library/", import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL("library.json", root)));
await MeshoptDecoder.ready;
assert.equal(manifest.lods.length, 3);
assert.equal(
  manifest.collisionVolumes.filter(
    (h) => !h.name.startsWith("library landscape"),
  ).length,
  42,
);
const stats = [];
assert.equal(manifest.roofLevels.length, 4);
const roofLevels = new Map(
  manifest.roofLevels.map((level) => [level.name, level]),
);
const design = JSON.parse(
  await fs.readFile(
    new URL("../authoring/library/design.json", import.meta.url),
  ),
);
assert.deepEqual([...roofLevels.keys()].sort(), [
  "front-left",
  "front-right",
  "rear-garden",
  "right-garden",
]);
const getRoof = (name) => roofLevels.get(name);
assert.equal(getRoof("front-left").deck, getRoof("front-right").deck);
assert.ok(getRoof("front-left").center[0] > getRoof("front-right").center[0]);
assert.ok(getRoof("right-garden").center[0] < getRoof("front-right").center[0]);
assert.ok(
  getRoof("rear-garden").center[1] > getRoof("front-right").center[1] + 35,
);
assert.ok(getRoof("right-garden").deck < getRoof("front-right").deck - 5);
assert.ok(
  getRoof("rear-garden").upperTerrace > getRoof("rear-garden").deck + 4,
);
const photo = manifest.photoCamera;
const photoCamera = new PerspectiveCamera(
  photo.fov,
  photo.imageSize[0] / photo.imageSize[1],
  0.1,
  1000,
);
photoCamera.position.fromArray(photo.position);
photoCamera.lookAt(new Vector3().fromArray(photo.target));
photoCamera.updateMatrixWorld();
const photoPoint = new Vector3();
function project(point) {
  photoPoint.copy(point).project(photoCamera);
  return new Vector3(
    ((photoPoint.x + 1) * photo.imageSize[0]) / 2,
    ((1 - photoPoint.y) * photo.imageSize[1]) / 2,
    0,
  );
}
function crownHeight(point, roof) {
  let best = Infinity,
    height = 0;
  const curve = roof.crownOutline;
  for (let i = 0; i < curve.length; i++) {
    const a = curve[i],
      b = curve[(i + 1) % curve.length];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a[0]) * dx + (point.z - a[1]) * dz) / (dx * dx + dz * dz),
      ),
    );
    const distance =
      (point.x - a[0] - t * dx) ** 2 + (point.z - a[1] - t * dz) ** 2;
    if (distance < best) {
      best = distance;
      height = a[2] * (1 - t) + b[2] * t;
    }
  }
  return height;
}
function insideRoof(point, roof) {
  let inside = false;
  const curve = roof.crownOutline;
  for (let i = 0, j = curve.length - 1; i < curve.length; j = i++) {
    const a = curve[i],
      b = curve[j];
    if (
      a[1] > point.z !== b[1] > point.z &&
      point.x < ((b[0] - a[0]) * (point.z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

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
  let architectureTriangles = 0;
  const architectureBounds = new Box3();
  let triangles = 0,
    meshes = 0;
  const bounds = new Box3();
  const facadeChecks = {
    screenVertices: 0,
    spandrelVertices: 0,
    entranceVertices: 0,
  };
  const point = new Vector3();
  const roofBounds = new Map();
  const projectedCrowns = new Map();
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
        if (!node.name.startsWith("Landscape "))
          architectureTriangles += indices.count / 3;
        for (let i = 0; i < indices.count; i++)
          assert.ok(indices.get(i) < positions.count);
        for (let i = 0; i < positions.count; i++) {
          point
            .set(positions.get(i, 0), positions.get(i, 1), positions.get(i, 2))
            .applyMatrix4(matrix);
          assert.ok([point.x, point.y, point.z].every(Number.isFinite));
          bounds.expandByPoint(point);
          if (!node.name.startsWith("Landscape "))
            architectureBounds.expandByPoint(point);
          // Inspect decoded vertices in model space: screens must never intrude into
          // the broad solid ribbons or continuous clear glass slots in any LOD.
          const petalName = node.name.match(/^Petal ([^ ]+) /)?.[1];
          const roof = roofLevels.get(petalName);
          if (
            roof &&
            /^Petal .* screen \|/.test(node.name) &&
            !node.name.includes("roof screen")
          ) {
            const floor = roof.floorLevels.findIndex(
              (y, i, levels) =>
                i < levels.length - 1 &&
                point.y >= y &&
                point.y < levels[i + 1],
            );
            assert.ok(
              floor >= 0,
              `${node.name}: screen outside occupied floors`,
            );
            assert.ok(
              point.y >= roof.floorLevels[floor] + 1.3 &&
                point.y <= roof.floorLevels[floor + 1] - 0.52,
              `${node.name}: screen crosses a solid ribbon or clear glass slot`,
            );
            if (petalName === "right-garden")
              assert.ok(
                floor > 0,
                "garden ground floor must remain clear glass",
              );
            facadeChecks.screenVertices++;
          }
          if (
            roof &&
            / (sloping rim|upper terrace|lower terrace) \|/.test(node.name)
          ) {
            const part = node.name.split(" | ")[0];
            if (!roofBounds.has(part)) roofBounds.set(part, new Box3());
            roofBounds.get(part).expandByPoint(point);
          }
          if (roof && node.name.includes(" roof screen |")) {
            const top = crownHeight(point, roof);
            assert.ok(
              point.y <= top + 0.18,
              `${node.name}: screen exceeds sloping crown`,
            );
            assert.ok(
              point.y >= roof.deck + 1.08,
              `${node.name}: screen intersects roof band`,
            );
          }
          if (roof && node.name.includes(" sloping rim |")) {
            if (!projectedCrowns.has(petalName))
              projectedCrowns.set(petalName, new Box3());
            projectedCrowns.get(petalName).expandByPoint(project(point));
          }
          if (roof && node.name.includes(" upper terrace |")) {
            assert.ok(
              insideRoof(point, roof),
              `${petalName}: inner roof extends outside its containing wing`,
            );
          }
          if (node.name.startsWith("Tower spandrel panels")) {
            const withinStorey = ((point.y % 4.4) + 4.4) % 4.4;
            assert.ok(
              withinStorey >= 0.12 && withinStorey <= 1.34,
              "spandrel crosses the clear window band",
            );
            facadeChecks.spandrelVertices++;
          }
          if (node.name.startsWith("Entrance clear glazing"))
            facadeChecks.entranceVertices++;

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
  for (const [name, count] of Object.entries(facadeChecks))
    assert.ok(count > 0, `missing ${name}`);
  const towerFins = gltf.materials.find(
    (m) => m.name === "Library / champagne fins",
  );
  assert.ok(
    towerFins.pbrMetallicRoughness.baseColorFactor[0] >
      towerFins.pbrMetallicRoughness.baseColorFactor[2],
    "tower fins must have their separate warm finish",
  );
  for (const roof of roofLevels.values()) {
    const prefix = `Petal ${roof.name}`;
    const rim = roofBounds.get(prefix + " sloping rim");
    const lower = roofBounds.get(prefix + " lower terrace");
    assert.ok(rim && lower, `${prefix}: missing roof silhouette or deck`);
    assert.ok(
      Math.abs(lower.min.y - roof.deck - 0.05) < 0.03,
      `${prefix}: deck elevation drift`,
    );
    assert.ok(
      Math.abs(rim.min.y - roof.crownMin) < 0.35,
      `${prefix}: low crown drift`,
    );
    assert.ok(
      Math.abs(rim.max.y - roof.crownMax - 0.22) < 0.35,
      `${prefix}: high crown drift`,
    );
    if (roof.upperTerrace !== null) {
      const upper = roofBounds.get(prefix + " upper terrace");
      assert.ok(
        upper &&
          Math.abs(upper.min.y - roof.upperTerrace) < 0.03 &&
          Math.abs(upper.max.y - roof.upperTerrace) < 0.03,
        `${prefix}: raised white platform missing`,
      );
      assert.ok(
        upper.min.y > lower.max.y + 2.5,
        `${prefix}: terrace step lost`,
      );
    }
  }
  // Check actual decoded geometry in the photo camera, not just authoring constants.
  // The bounds allow small curve interpolation and LOD error around traced landmarks.
  for (const wing of design.petals) {
    const box = projectedCrowns.get(wing.name);
    const pixels = wing.photoCrownPixels;
    const expected = [
      Math.min(...pixels.map((p) => p[0])),
      Math.min(...pixels.map((p) => p[1])),
      Math.max(...pixels.map((p) => p[0])),
      Math.max(...pixels.map((p) => p[1])),
    ];
    const actual = [box.min.x, box.min.y, box.max.x, box.max.y];
    for (let i = 0; i < 4; i++)
      assert.ok(
        Math.abs(actual[i] - expected[i]) < 20,
        `${wing.name}: silhouette or camera flipped / drifted`,
      );
  }
  assert.equal(triangles, level.triangles);
  assert.equal(meshes, level.meshObjects);
  const size = architectureBounds.getSize(new Vector3());
  assert.ok(
    size.x > 165 && size.x < 185 && size.z > 95 && size.z < 160,
    "metres or axes changed",
  );
  assert.ok(size.y > 83 && size.y < 85, "tower height changed");
  assert.ok(Math.abs(architectureBounds.min.y) < 0.05, "asset base moved");
  stats.push({
    file: level.file,
    triangles,
    architectureTriangles,
    meshes,
    bytes: data.length,
    bounds: [bounds.min.toArray(), bounds.max.toArray()],
    facadeChecks,
    photoSilhouettes: Object.fromEntries(
      [...projectedCrowns].map(([name, box]) => [
        name,
        [box.min.toArray(), box.max.toArray()],
      ]),
    ),
    roofs: Object.fromEntries(
      [...roofBounds].map(([name, box]) => [name, [box.min.y, box.max.y]]),
    ),
  });
}
assert.ok(
  stats[0].architectureTriangles > stats[1].architectureTriangles * 1.5,
);
assert.ok(stats[1].architectureTriangles > stats[2].architectureTriangles * 4);
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
