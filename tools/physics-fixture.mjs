import { createPlayer as runtimePlayer } from "../src/webgpu/player.js";
import { reflectMesh } from "../src/webgpu/coordinates.js";

// Existing route fixtures are source-plan coordinates. Exercise exactly the
// reflected collider arrays used by the browser while keeping those fixtures
// independent of the runtime conversion. Never mutate source meshpack buffers.
export async function createPlayer(meshes, progress) {
  if (!process.argv.includes("--runtime"))
    return runtimePlayer(meshes, progress);
  const converted = meshes.map((m) => {
    const position = m.position.slice(),
      index = m.index.slice();
    reflectMesh(position, null, index);
    return { ...m, position, index };
  });
  const p = await runtimePlayer(converted, progress);
  const vector = (v) => ({ ...v, z: -(v.z || 0) });
  console.log(
    `Runtime coordinate regression: ${converted.length} reflected colliders`,
  );
  return {
    get position() {
      return vector(p.position);
    },
    get grounded() {
      return p.grounded;
    },
    get contacts() {
      return p.contacts;
    },
    teleport(x, y, z) {
      p.teleport(x, y, -z);
    },
    step(v, dt) {
      return vector(p.step(vector(v), dt));
    },
    ray(origin, direction, distance, predicate) {
      return p.ray(vector(origin), vector(direction), distance, predicate);
    },
    dispose() {
      p.dispose();
    },
  };
}
