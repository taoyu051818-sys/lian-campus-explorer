import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  materialFamily,
  MATERIAL_CATALOG,
} from "../src/webgpu/material-catalog.js";
import { createTerrainMaterialData } from "../src/webgpu/terrain-material-data.js";

const root = new URL("../", import.meta.url);
const meta = JSON.parse(
  await fs.readFile(new URL("public/generated/campus.json", root)),
);
const counts = {};
for (const m of meta.materials) {
  const family = materialFamily(m.name);
  counts[family] = (counts[family] || 0) + 1;
}
// Authored GLBs can retire procedural materials without removing their explicit mappings.
// Every active material is still checked by materialFamily above; stale entries are harmless.
assert.equal(
  new Set(meta.materials.map((m) => m.name)).size,
  meta.materials.length,
);
for (const name of Object.keys(MATERIAL_CATALOG))
  assert.ok(materialFamily(name));
assert.throws(() => materialFamily("unassigned future facade"), /尚未映射/);
const provenance = JSON.parse(
  await fs.readFile(
    new URL("src/vendor/tidewater/MATERIAL_SOURCES.json", root),
  ),
);
for (const [path, expected] of Object.entries(provenance.files)) {
  const bytes = await fs.readFile(
    new URL(`src/vendor/tidewater/${path}`, root),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expected,
    `Modified upstream source: ${path}`,
  );
}
const mesh = meta.meshes.find((m) => m.name === "continuous terrain");
const binary = gunzipSync(
  await fs.readFile(new URL("public/generated/campus.meshpack", root)),
);
const aligned = binary.buffer.slice(
  binary.byteOffset,
  binary.byteOffset + binary.byteLength,
);
const positions = new Float32Array(
  aligned,
  mesh.position.offset,
  mesh.position.count,
);
const terrain = createTerrainMaterialData(positions);
// Every height-field vertex must remain on the original grid (shoreline registration).
for (let i = 0; i < positions.length; i += 3)
  assert.ok(
    Math.abs(
      terrain.heightCPU(positions[i], positions[i + 2]) - positions[i + 1],
    ) < 1e-5,
  );
assert.equal(terrain.heightCPU(-3000, -3000), -90);
for (const v of terrain.shoreTexture.image.data) assert.ok(Number.isFinite(v));
terrain.dispose();
console.log(
  JSON.stringify(
    {
      materials: meta.materials.length,
      families: counts,
      upstreamFiles: Object.keys(provenance.files).length,
      registeredHeightVertices: positions.length / 3,
      shoreField: "finite",
      status: "passed",
    },
    null,
    2,
  ),
);
