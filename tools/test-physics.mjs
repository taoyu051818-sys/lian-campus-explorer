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
    const indices = new Uint32Array(
      buffer,
      mesh.index.offset,
      mesh.index.count,
    );
    let surface = null,
      bestHeight = -Infinity,
      bestArea = 0,
      vertical = null,
      largestFace = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const area = Math.abs(
        (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]) -
          (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]),
      );
      if (area < 1e-6) {
        const u = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]),
          v = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
        const normal = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ],
          size = Math.hypot(...normal);
        if (size > largestFace) {
          largestFace = size;
          const n = normal.map((v) => v / size),
            center = [0, 1, 2].map(
              (k) =>
                (positions[a + k] + positions[b + k] + positions[c + k]) / 3,
            );
          vertical = {
            origin: {
              x: center[0] + n[0] * 0.5,
              y: center[1] + n[1] * 0.5,
              z: center[2] + n[2] * 0.5,
            },
            direction: { x: -n[0], y: -n[1], z: -n[2] },
          };
        }
        continue;
      }
      const y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
      if (
        y > bestHeight + 0.001 ||
        (Math.abs(y - bestHeight) < 0.001 && area > bestArea)
      ) {
        bestHeight = y;
        bestArea = area;
        surface = {
          x: (positions[a] + positions[b] + positions[c]) / 3,
          y: y + 0.5,
          z: (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3,
        };
      }
    }
    assert.ok(
      surface || vertical,
      `${mesh.name}: no nondegenerate collision triangle`,
    );
    // A concave slab's bounding-box centre can lie outside it. Cast at a real
    // triangle and require this collider, rather than accidentally hitting terrain.
    const hit = player.ray(
      surface || vertical.origin,
      surface ? { x: 0, y: -1, z: 0 } : vertical.direction,
      1,
      (c) => c.userData?.name === mesh.name,
    );
    assert.ok(
      hit,
      `${mesh.name}: invisible access has no matching collision surface`,
    );
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
  const sports = JSON.parse(
    await fs.readFile(
      new URL("../public/models/sports/sports.json", import.meta.url),
    ),
  );
  const sportsRegistration = manifest.authoredAssets.find(
    (a) => a.id === "sports",
  );
  const sportsRoute = sports.stairRoute.map(([x, z, y]) => [
    x + sportsRegistration.anchor[0],
    z + sportsRegistration.anchor[1],
    y + sportsRegistration.base,
  ]);
  player.teleport(
    sportsRoute[0][0],
    sportsRoute[0][2] + 1.05,
    sportsRoute[0][1],
  );
  for (let i = 0; i < 90; i++) player.step({});
  for (const route of [sportsRoute, [...sportsRoute].reverse()]) {
    for (const [x, z, y] of route) {
      let reached = false;
      for (let i = 0; i < 900; i++) {
        const p = player.position,
          dx = x - p.x,
          dz = z - p.z,
          d = Math.hypot(dx, dz);
        if (d < 0.1) {
          reached = true;
          break;
        }
        const speed = Math.min(2.5, d * 60);
        player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
      }
      assert.ok(
        reached,
        `sports curved stair blocked at ${x},${z}: ${JSON.stringify(player.position)}`,
      );
      assert.ok(
        Math.abs(player.position.y - y - 0.9) < 0.7,
        `sports stair elevation: ${player.position.y} vs ${y + 0.9}`,
      );
    }
  }
  console.log(
    `PASS: 33 destinations settle, jump, land and walk; ${checks} invisible access surfaces preserved; ${meshes.length} collision meshes; six continuous teaching stair/bridge route legs and sports curved stair ascent/descent.`,
  );
  const activity = JSON.parse(
    await fs.readFile(
      new URL("../public/models/activity/activity.json", import.meta.url),
    ),
  );
  const ar = manifest.authoredAssets.find((a) => a.id === "activity");
  for (const name of ["throughRoute", "stairRoute"]) {
    const route = activity[name].map(([x, z, y]) => [
      x + ar.anchor[0],
      z + ar.anchor[1],
      y + ar.base,
    ]);
    player.teleport(route[0][0], route[0][2] + 1.05, route[0][1]);
    for (let i = 0; i < 120; i++) player.step({});
    for (const points of [route, [...route].reverse()])
      for (const [x, z, y] of points) {
        let reached = false;
        for (let i = 0; i < 1500; i++) {
          const p = player.position,
            dx = x - p.x,
            dz = z - p.z,
            d = Math.hypot(dx, dz);
          if (d < 0.09) {
            reached = true;
            break;
          }
          const speed = Math.min(2.1, d * 60);
          player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
        }
        assert.ok(
          reached,
          `activity ${name} blocked: ${JSON.stringify(player.position)} -> ${x},${z},${y}`,
        );
        assert.ok(
          Math.abs(player.position.y - y - 0.9) < 0.65,
          `activity ${name} elevation mismatch: ${player.position.y} vs ${y + 0.9}`,
        );
      }
    console.log(
      `PASS: activity ${name}, ${route.length} waypoints each direction, no teleport between legs.`,
    );
  }
  const hall = JSON.parse(
    await fs.readFile(
      new URL("../public/models/hall/hall.json", import.meta.url),
    ),
  );
  const hr = manifest.authoredAssets.find((a) => a.id === "hall"),
    hc = Math.cos(hr.yaw),
    hs = Math.sin(hr.yaw);
  for (const [index, local] of hall.stairRoutes.entries()) {
    const route = local.map(([x, z, y]) => [
      hc * x + hs * z + hr.anchor[0],
      -hs * x + hc * z + hr.anchor[1],
      y + hr.base,
    ]);
    player.teleport(route[0][0], route[0][2] + 1.05, route[0][1]);
    for (let i = 0; i < 120; i++) player.step({});
    for (const points of [route, [...route].reverse()])
      for (const [x, z, y] of points) {
        let reached = false;
        for (let i = 0; i < 1500; i++) {
          const p = player.position,
            dx = x - p.x,
            dz = z - p.z,
            d = Math.hypot(dx, dz);
          if (d < 0.09) {
            reached = true;
            break;
          }
          const speed = Math.min(2.1, d * 60);
          player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
        }
        assert.ok(
          reached,
          `hall stair ${index} blocked: ${JSON.stringify(player.position)} -> ${x},${z},${y}`,
        );
        assert.ok(
          Math.abs(player.position.y - y - 0.9) < 0.65,
          `hall stair ${index} height: ${player.position.y} vs ${y + 0.9}`,
        );
      }
    console.log(
      `PASS: hall stair ${index}, ${route.length} waypoints each direction, no teleport between legs.`,
    );
  }
  const uestc = JSON.parse(
    await fs.readFile(
      new URL("../public/models/uestc/uestc.json", import.meta.url),
    ),
  );
  const ur = manifest.authoredAssets.find((a) => a.id === "uestc");
  for (const local of uestc.stairRoutes) {
    const route = local.points.map(([x, z, y]) => [
      x + ur.anchor[0],
      z + ur.anchor[1],
      y + ur.base,
    ]);
    player.teleport(route[0][0], route[0][2] + 1.05, route[0][1]);
    for (let i = 0; i < 90; i++) player.step({});
    for (const points of [route, [...route].reverse()])
      for (const [x, z, y] of points) {
        let reached = false;
        for (let i = 0; i < 2400; i++) {
          const p = player.position,
            dx = x - p.x,
            dz = z - p.z,
            d = Math.hypot(dx, dz);
          if (d < 0.16) {
            reached = true;
            break;
          }
          const speed = Math.min(2.5, d * 20);
          player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
        }
        assert.ok(
          reached,
          `UESTC ${local.name} blocked ${JSON.stringify(player.position)} -> ${x},${z},${y}`,
        );
        assert.ok(
          Math.abs(player.position.y - y - 0.9) < 0.65,
          `UESTC ${local.name} wrong height ${player.position.y} vs ${y + 0.9}`,
        );
      }
    console.log(
      `PASS: UESTC ${local.name}, continuous ascent / balcony landing / descent.`,
    );
  }
  {
    const ud = JSON.parse(
      await fs.readFile(
        new URL("../authoring/uestc/design.json", import.meta.url),
      ),
    );
    const bridge = ud.bridge,
      a = bridge.a,
      b = bridge.b,
      span = Math.hypot(b[0] - a[0], b[1] - a[1]),
      normal = [-(b[1] - a[1]) / span, (b[0] - a[0]) / span];
    const bridgeRoute = [0.18, 0.5, 0.82].map((t) => [
      a[0] * (1 - t) + b[0] * t + ur.anchor[0],
      a[1] * (1 - t) + b[1] * t + ur.anchor[1],
      ud.buildingBases.B * (1 - t) +
        ud.buildingBases.A * t +
        ud.storeyHeight +
        ur.base,
    ]);
    const underRoute = [-7, 0, 7].map((k) => {
      const x = (a[0] + b[0]) / 2 + normal[0] * k + ur.anchor[0],
        z = (a[1] + b[1]) / 2 + normal[1] * k + ur.anchor[1];
      const hit = player.ray(
        { x, y: 40, z },
        { x: 0, y: -1, z: 0 },
        80,
        (c) => c.userData?.name === "continuous terrain",
      );
      assert.ok(hit);
      return [x, z, 40 - hit.timeOfImpact];
    });
    for (const [name, route] of [
      ["bridge deck middle span", bridgeRoute],
      ["bridge underpass", underRoute],
    ]) {
      player.teleport(route[0][0], route[0][2] + 1.05, route[0][1]);
      for (let i = 0; i < 90; i++) player.step({});
      for (const points of [route, [...route].reverse()])
        for (const [x, z, y] of points) {
          let reached = false;
          for (let i = 0; i < 1800; i++) {
            const p = player.position,
              dx = x - p.x,
              dz = z - p.z,
              d = Math.hypot(dx, dz);
            if (d < 0.12) {
              reached = true;
              break;
            }
            const speed = Math.min(2.5, d * 20);
            player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
          }
          assert.ok(
            reached,
            `UESTC ${name} blocked: ${JSON.stringify(player.position)}`,
          );
          assert.ok(
            Math.abs(player.position.y - y - 0.9) < 0.65,
            `UESTC ${name} wrong level`,
          );
        }
      console.log(
        `PASS: UESTC ${name}, both directions; distinct bridge/ground elevations.`,
      );
    }
  }
  {
    const bupt = JSON.parse(
      await fs.readFile(
        new URL("../public/models/bupt/bupt.json", import.meta.url),
      ),
    );
    const br = manifest.authoredAssets.find((a) => a.id === "bupt");
    const gardenRoute = [
      "B entry flight 3",
      "B entry flight 2",
      "B entry flight 1",
      "B middle terrace",
      "B upper terrace",
    ].flatMap((name) => bupt.stairRoutes.find((r) => r.name === name).points);
    for (const local of [
      ...bupt.stairRoutes,
      { name: "full five-flight garden promenade", points: gardenRoute },
    ]) {
      const route = local.points.map(([x, z, y]) => [
        x + br.anchor[0],
        z + br.anchor[1],
        y + br.base,
      ]);
      player.teleport(route[0][0], route[0][2] + 1.05, route[0][1]);
      for (let i = 0; i < 90; i++) player.step({});
      for (const points of [route, [...route].reverse()])
        for (const [x, z, y] of points) {
          let reached = false;
          for (let i = 0; i < 2400; i++) {
            const p = player.position,
              dx = x - p.x,
              dz = z - p.z,
              d = Math.hypot(dx, dz);
            if (d < 0.16) {
              reached = true;
              break;
            }
            const speed = Math.min(2.5, d * 20);
            player.step({ x: (dx / d) * speed, z: (dz / d) * speed });
          }
          assert.ok(
            reached,
            `BUPT ${local.name} blocked ${JSON.stringify(player.position)} -> ${x},${z},${y}`,
          );
          assert.ok(
            Math.abs(player.position.y - y - 0.9) < 0.65,
            `BUPT ${local.name} wrong height ${player.position.y} vs ${y + 0.9}`,
          );
        }
      console.log(
        `PASS: BUPT ${local.name}, continuous ascent / garden landing / descent.`,
      );
    }
  }
} finally {
  player.dispose();
}
