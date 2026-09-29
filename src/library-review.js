import "./library-review.css";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createRenderer } from "./webgpu/renderer.js";
const $ = (id) => document.getElementById(id);
const status = $("model-status");
async function boot() {
  const renderer = await createRenderer($("library-canvas"), {
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dce3e5");
  scene.fog = new THREE.Fog("#dce3e5", 600, 1100);
  const camera = new THREE.PerspectiveCamera(
    42,
    innerWidth / innerHeight,
    0.2,
    1800,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 4;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.495;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.05);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.8;
  room.dispose();
  pmrem.dispose();
  const sun = new THREE.DirectionalLight(0xfff2db, 3.6);
  sun.position.set(-95, 150, -105);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -155,
    right: 155,
    top: 145,
    bottom: -145,
    near: 1,
    far: 500,
  });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.00005;
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardNodeMaterial({ color: "#c2c9c6", roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  scene.add(ground);
  const manifest = await fetch("./models/library/library.json").then((r) =>
    r.json(),
  );
  const cache = new Map();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let active = null,
    triangles = 0,
    frames = 0,
    stamp = performance.now(),
    fps = 0,
    request = 0;
  const poses = {
    overall: [
      [157, 120, -226],
      [0, 31, 0],
    ],
    front: [
      [0, 44, -277],
      [0, 40, 0],
    ],
    screen: [
      [-84, 18, -87],
      [-38, 12, -30],
    ],
    entrance: [
      [-6, 8, -103],
      [-3, 9, -40],
    ],
    tower: [
      [-73, 22, -75],
      [-4, 36, 19],
    ],
    roof: [
      [109, 155, -108],
      [0, 25, -4],
    ],
  };
  function pose(name) {
    const [p, t] = poses[name];
    camera.position.fromArray(p);
    controls.target.fromArray(t);
    controls.update();
    document
      .querySelectorAll("[data-view]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.view === name)),
      );
  }
  pose("overall");
  async function quality(index) {
    const ticket = ++request;
    status.textContent = "正在载入建筑…";
    if (!cache.has(index)) {
      const gltf = await loader.loadAsync(
        "./models/library/" + manifest.lods[index].file,
      );
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      gltf.scene.visible = false;
      scene.add(gltf.scene);
      cache.set(index, gltf.scene);
    }
    if (ticket !== request) return;
    if (active) active.visible = false;
    active = cache.get(index);
    active.visible = true;
    triangles = manifest.lods[index].triangles;
    active.traverse((o) => {
      if (o.isMesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.wireframe = $("wireframe").checked;
      }
    });
    renderer.backend.device.pushErrorScope("validation");
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    const error = await renderer.backend.device.popErrorScope();
    if (error) throw new Error(error.message);
    $("library-canvas").dataset.gpuValidation = "passed";
    $("library-canvas").dataset.lod = String(index);
    status.textContent = `模型已载入 · ${(triangles / 10000).toFixed(1)} 万三角面`;
  }
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.addEventListener("click", () => pose(b.dataset.view)));
  $("model-quality").addEventListener("change", () =>
    quality(Number($("model-quality").value)).catch(fail),
  );
  $("wireframe").addEventListener("change", () =>
    active?.traverse((o) => {
      if (o.isMesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.wireframe = $("wireframe").checked;
    }),
  );
  $("panels").addEventListener("click", () => {
    const hidden = ($("review-panel").hidden = !$("review-panel").hidden);
    $("panels").textContent = hidden ? "显示面板" : "收起面板";
  });
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }
  addEventListener("resize", resize);
  resize();
  await quality(0);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - stamp > 1000) {
      fps = Math.round((frames * 1000) / (now - stamp));
      frames = 0;
      stamp = now;
      if (status.dataset.error !== "true")
        status.textContent = `模型已载入 · ${(triangles / 10000).toFixed(1)} 万三角面 · ${fps} FPS`;
    }
  });
  addEventListener(
    "pagehide",
    () => {
      renderer.setAnimationLoop(null);
      controls.dispose();
      environment.dispose();
      const gs = new Set(),
        ms = new Set(),
        ts = new Set();
      scene.traverse((o) => {
        if (o.geometry) gs.add(o.geometry);
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            ms.add(m);
      });
      ms.forEach((m) => {
        for (const v of Object.values(m)) if (v?.isTexture) ts.add(v);
        m.dispose();
      });
      gs.forEach((g) => g.dispose());
      ts.forEach((t) => t.dispose());
      const device = renderer.backend.device;
      renderer.dispose();
      device.destroy();
    },
    { once: true },
  );
}
function fail(e) {
  console.error(e);
  status.textContent = "加载失败：" + e.message;
  status.dataset.error = "true";
}
boot().catch(fail);
