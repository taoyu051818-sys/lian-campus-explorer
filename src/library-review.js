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
  const requestedAsset = document.body.dataset.genericModel
    ? new URLSearchParams(location.search).get("asset") || "sports"
    : "library";
  const supportedAssets = document.body.dataset.genericModel
    ? ["sports", "activity"]
    : ["library"];
  if (!supportedAssets.includes(requestedAsset))
    throw new Error("未找到该建筑模型");
  const modelBase = `./models/${requestedAsset}/`;
  const manifest = await fetch(`${modelBase}${requestedAsset}.json`).then((r) =>
    r.json(),
  );
  if (document.body.dataset.genericModel) {
    document.title = `${manifest.name} · 建筑与环境`;
    document.querySelector("header h1").textContent = manifest.name;
    document.querySelector("header a").href =
      `./world.html?place=${requestedAsset}&view=orbit`;
    $("library-canvas").setAttribute(
      "aria-label",
      `${manifest.name}三维模型，拖动旋转，滚轮缩放`,
    );
    if (manifest.review) {
      document.querySelector("header div span").textContent =
        manifest.review.eyebrow;
      document.querySelector("#review-panel h2").textContent =
        manifest.review.heading;
      document.querySelector("#review-panel h2 + p").textContent =
        manifest.review.description;
    }
    document.querySelector("#review-panel details p").textContent =
      "依据官方实建图与建成照片细化。可见体量和结构有资料依据；构件尺寸、植物布置和校园配准仍含估算。";
    document.querySelector("#review-panel details a").href =
      manifest.sources[0].url;
  }
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
  const cache = new Map();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let active = null,
    triangles = 0,
    frames = 0,
    stamp = performance.now(),
    fps = 0,
    request = 0;
  const poses = {
    photo: [
      manifest.photoCamera?.position || [-23, 112, -235],
      manifest.photoCamera?.target || [-23, 18, 23],
    ],
    overall: [
      [110, 130, -255],
      [-23, 30, -15],
    ],
    front: [
      [-23, 44, -290],
      [-23, 40, -10],
    ],
    screen: [
      [-78, 18, -122],
      [-38, 12, -65],
    ],
    heights: [
      [-25, 165, -185],
      [-25, 15, -21],
    ],
    entrance: [
      [-4, 8, -124],
      [-4, 10, -66],
    ],
    tower: [
      [-73, 22, -75],
      [-4, 36, 19],
    ],
    roof: [
      [80, 185, -110],
      [-23, 25, -20],
    ],
  };
  if (manifest.views) {
    for (const [name, view] of Object.entries(manifest.views))
      poses[name] = [view.position, view.target];
    const labels = {
      overall: "整体",
      pool: "游泳馆",
      gym: "体育馆",
      landscape: "周边绿化",
      roof: "屋顶",
      front: "庭院正面",
      arcade: "首层通廊",
      facade: "幕墙与外廊",
    };
    document.querySelector(".view-buttons").replaceChildren(
      ...Object.keys(manifest.views).map((name) => {
        const button = document.createElement("button");
        button.dataset.view = name;
        button.textContent = labels[name] || name;
        button.setAttribute("aria-pressed", "false");
        return button;
      }),
    );
  }
  function pose(name) {
    const [p, t] = poses[name];
    camera.fov =
      manifest.views?.[name]?.fov ??
      (name === "photo"
        ? manifest.photoCamera.fov
        : name === "entrance"
          ? 46
          : 42);
    camera.updateProjectionMatrix();
    camera.position.fromArray(p);
    controls.target.fromArray(t);
    controls.update();
    document
      .querySelectorAll("[data-view]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.view === name)),
      );
  }
  pose(manifest.views ? "overall" : "photo");
  async function quality(index) {
    const ticket = ++request;
    status.textContent = "正在载入建筑…";
    if (!cache.has(index)) {
      const gltf = await loader.loadAsync(
        modelBase + manifest.lods[index].file,
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
    // Authored landscapes follow campus slopes and may extend below local zero.
    ground.position.y = Math.min(
      -0.12,
      new THREE.Box3().setFromObject(active).min.y - 0.1,
    );
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
