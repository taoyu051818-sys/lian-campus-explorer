import RAPIER from "@dimforge/rapier3d-compat";

// Kept separate from rendering so the original ramps, courtyards and bridges can be
// regression-tested against the same collision meshes used in the browser.
export async function createPlayer(meshes, progress = () => {}) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const collider = world.createCollider(
      RAPIER.ColliderDesc.trimesh(mesh.position, mesh.index),
    );
    collider.userData = { name: mesh.name, placeId: mesh.placeId };
    if (i % 40 === 0)
      progress(`正在连接碰撞与步行通道 ${i} / ${meshes.length}…`);
  }
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 30, 0),
  );
  const capsule = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.58, 0.32),
    body,
  );
  const controller = world.createCharacterController(0.015);
  controller.enableAutostep(0.32, 0.2, false);
  controller.enableSnapToGround(0.3);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 3);
  let vy = 0,
    grounded = false;
  world.step();
  return {
    world,
    capsule,
    get position() {
      return body.translation();
    },
    get grounded() {
      return grounded;
    },
    get contacts() {
      return Array.from(
        { length: controller.numComputedCollisions() },
        (_, i) => {
          const hit = controller.computedCollision(i);
          return {
            surface: hit.collider?.userData,
            normal: hit.normal1,
            point: hit.witness1,
            applied: hit.translationDeltaApplied,
            remaining: hit.translationDeltaRemaining,
            toi: hit.toi,
          };
        },
      );
    },
    teleport(x, y, z) {
      body.setTranslation({ x, y, z }, true);
      body.setNextKinematicTranslation({ x, y, z });
      vy = 0;
      grounded = false;
      world.step();
    },
    step({ x = 0, z = 0, jump = false }, dt = 1 / 60) {
      vy =
        jump && grounded
          ? 4.7
          : grounded
            ? -0.5
            : Math.max(-35, vy - 9.81 * dt);
      controller.computeColliderMovement(capsule, {
        x: x * dt,
        y: vy * dt,
        z: z * dt,
      });
      const delta = controller.computedMovement(),
        p = body.translation();
      grounded = controller.computedGrounded();
      body.setNextKinematicTranslation({
        x: p.x + delta.x,
        y: p.y + delta.y,
        z: p.z + delta.z,
      });
      world.timestep = dt;
      world.step();
      return delta;
    },
    ray(origin, direction, distance, predicate) {
      return world.castRay(
        new RAPIER.Ray(origin, direction),
        distance,
        true,
        undefined,
        undefined,
        capsule,
        body,
        predicate,
      );
    },
    dispose() {
      world.free();
    },
  };
}
