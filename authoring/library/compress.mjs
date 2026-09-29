// Run after build.py. Keeps Blender optional for normal web builds.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const directory = fileURLToPath(
  new URL("../../public/models/library/", import.meta.url),
);
const manifest = JSON.parse(
  await fs.readFile(path.join(directory, "library.json"), "utf8"),
);
for (const level of manifest.lods) {
  const input = path.join(directory, level.file),
    output = input.replace(".glb", ".compressed.glb");
  const pnpm = process.argv.includes("--pnpm"),
    executable = pnpm ? "pnpm" : "npx";
  const result = spawnSync(
    executable + (process.platform === "win32" ? ".cmd" : ""),
    [
      pnpm ? "dlx" : "--yes",
      "@gltf-transform/cli@4.2.1",
      "meshopt",
      input,
      output,
      "--quantize-position",
      "16",
      "--quantize-normal",
      "12",
      "--quantize-texcoord",
      "14",
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("glTF compression failed");
  const data = await fs.readFile(output);
  const json = JSON.parse(
    data.toString("utf8", 20, 20 + data.readUInt32LE(12)),
  );
  level.triangles = json.nodes.reduce(
    (sum, node) =>
      sum +
      (node.mesh === undefined
        ? 0
        : json.meshes[node.mesh].primitives.reduce(
            (n, p) =>
              n + json.accessors[p.indices ?? p.attributes.POSITION].count / 3,
            0,
          )),
    0,
  );
  level.meshObjects = json.nodes.filter((n) => n.mesh !== undefined).length;
  level.bytes = data.length;
  level.sha256 = createHash("sha256").update(data).digest("hex");
  await fs.rename(output, input);
}
manifest.compression =
  "EXT_meshopt_compression; glTF Transform 4.2.1; position 16 / normal 12 / UV 14 bits";
await fs.writeFile(
  path.join(directory, "library.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest.lods, null, 2));
