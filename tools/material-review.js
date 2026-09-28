// Development-only GPU smoke check: intentionally excluded from Vite's build inputs.
import * as THREE from "three/webgpu";
import { createRenderer } from "../src/webgpu/renderer.js";
import { createCampusMaterialSystem } from "../src/webgpu/materials.js";

async function run() {
  const renderer = await createRenderer(document.querySelector("canvas"));
  renderer.setSize(innerWidth, innerHeight - 86, false);
  const device = renderer.backend.device;
  device.pushErrorScope("validation");
  const meta = await fetch("/generated/campus.json").then((r) => r.json());
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c2d2d6");
  const sun = new THREE.DirectionalLight(0xfff1d5, 3);
  sun.position.set(12, 24, 18);
  scene.add(sun, new THREE.HemisphereLight(0xb2d6f6, 0x646046, 2));
  const system = createCampusMaterialSystem();
  system.bake(renderer);
  const camera = new THREE.PerspectiveCamera(
    45,
    innerWidth / (innerHeight - 86),
    0.1,
    500,
  );
  camera.position.set(0, 15, 23);
  camera.lookAt(0, 0, 0);
  const geo = new THREE.SphereGeometry(0.72, 32, 24);
  meta.materials.forEach((entry, i) => {
    const m = system.create(entry);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(
      ((i % 14) - 6.5) * 1.9,
      0,
      (Math.floor(i / 14) - 3) * 2.3,
    );
    scene.add(mesh);
  });
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  await device.queue.onSubmittedWorkDone();
  const error = await device.popErrorScope();
  if (error) throw new Error(error.message);
  document.querySelector("#status").textContent =
    `通过：${meta.materials.length} / ${meta.materials.length} 材质已编译并绘制，GPU validation errors = 0`;
  window.addEventListener(
    "pagehide",
    () => {
      system.dispose();
      geo.dispose();
      renderer.dispose();
      device.destroy();
    },
    { once: true },
  );
}
run().catch((e) => {
  console.error(e);
  document.querySelector("#status").textContent = `失败：${e.message}`;
});
