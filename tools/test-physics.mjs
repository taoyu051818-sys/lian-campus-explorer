import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createPlayer } from "../src/webgpu/player.js";

const manifest = JSON.parse(
  await fs.readFile(
    new URL("../public/generated/campus.json", import.meta.url),
  ),
);
const bytes = gunzipSync(
  await fs.readFile(
    new URL("../public/generated/campus.meshpack", import.meta.url),
  ),
);
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
assert.equal(buffer.byteLength, manifest.byteLength);
const meshes = manifest.meshes
  .filter((m) => m.collision)
  .map((m) => ({
    name: m.name,
    placeId: m.placeId,
    position: new Float32Array(buffer, m.position.offset, m.position.count),
    index: new Uint32Array(buffer, m.index.offset, m.index.count),
  }));
const player = await createPlayer(meshes);
try {
  assert.equal(manifest.spawns.length, 33);
  for (const spawn of manifest.spawns) {
    const [x, z] = spawn.point;
    player.teleport(x, spawn.y + 1.1, z);
    for (let i = 0; i < 120; i++) player.step({});
    assert.ok(player.grounded, `${spawn.id}: did not settle on ground`);
    assert.ok(
      Math.abs(player.position.y - spawn.y - 0.9) < 0.7,
      `${spawn.id}: wrong ground elevation ${player.position.y}`,
    );
    const y0 = player.position.y;
    let peak = y0;
    for (let i = 0; i < 100; i++) {
      player.step({ jump: i === 0 });
      peak = Math.max(peak, player.position.y);
    }
    assert.ok(peak - y0 > 0.7, `${spawn.id}: jump blocked`);
    assert.ok(player.grounded, `${spawn.id}: failed to land`);
    for (let i = 0; i < 90; i++) player.step({ z: 3.6 });
    assert.ok(
      player.position.y > spawn.y - 2,
      `${spawn.id}: fell through terrain while walking`,
    );
  }
  // Invisible access meshes are intentionally retained: decorative stairs and
  // elevated corridors must remain walkable after changing rendering engines.
  const invisible = manifest.meshes.filter((m) => m.collision && !m.visible);
  assert.ok(invisible.length > 0, "access collision meshes were lost");
  let checks = 0;
  for (const mesh of invisible) {
    const positions = new Float32Array(
      buffer,
      mesh.position.offset,
      mesh.position.count,
    );
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }
    const hit = player.ray(
      { x: (minX + maxX) / 2, y: maxY + 3, z: (minZ + maxZ) / 2 },
      { x: 0, y: -1, z: 0 },
      20,
    );
    assert.ok(hit, `${mesh.name}: invisible access has no collision surface`);
    checks++;
  }
  const access = manifest.teachingAccess;
  const a = access.stairs[0].route,
    b = access.stairs[1].route,
    bridge = access.bridgeRoute;
  player.teleport(a[0][0], a[0][2] + 1.05, a[0][1]);
  for (let i = 0; i < 60; i++) player.step({});
  const legs = [
    a,
    bridge,
    [...b].reverse(),
    b,
    [...bridge].reverse(),
    [...a].reverse(),
  ];
  for (let leg = 0; leg < legs.length; leg++) {
    for (const [x, z, y] of legs[leg]) {
      let reached = false;
      const start = player.position,
        maxFrames =
          Math.ceil((Math.hypot(x - start.x, z - start.z) / 2.5) * 60) + 180;
      for (let frame = 0; frame < maxFrames; frame++) {
        const p = player.position,
          dx = x - p.x,
          dz = z - p.z,
          d = Math.hypot(dx, dz);
        if (d < 0.085) {
          reached = true;
          break;
        }
        const speed = Math.min(2.5, d * 60);
        player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
      }
      if (!reached)
        console.error(
          JSON.stringify({
            leg: leg + 1,
            target: [x, z, y],
            position: player.position,
            grounded: player.grounded,
            contacts: player.contacts,
          }),
        );
      assert.ok(reached, `teaching route leg ${leg + 1}: blocked at ${x},${z}`);
      assert.ok(
        Math.abs(player.position.y - y - 0.9) < 0.65,
        `teaching route leg ${leg + 1}: wrong elevation at ${x},${z}: ${player.position.y} vs ${y + 0.9}`,
      );
    }
  }
  console.log(
    `PASS: 33 destinations settle, jump, land and walk; ${checks} invisible access surfaces preserved; ${meshes.length} collision meshes; six continuous bidirectional stair/bridge route legs.`,
  );
} finally {
  player.dispose();
}
