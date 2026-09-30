import "../world.css";
import "./visuals.css";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createRenderer } from "./renderer.js";
import { loadCampus } from "./campus.js";
import { createPlayer } from "./player.js";
import { createEnvironment } from "./environment.js";

import {
  mapToWorld,
  worldToMap,
  fromAuthoringPoint,
  bearingTo,
  heading,
  movement,
  RUNTIME_COORDINATES,
} from "./coordinates.js";
import { terrainGrid } from "./terrain-grid.js";

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise(requestAnimationFrame);
let toastTimer;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function progress(text) {
  $("loading-text").textContent = text;
}

async function boot() {
  const canvas = $("scene");
  progress("正在连接 WebGPU 图形设备…");
  const renderer = await createRenderer(canvas);
  // A reload during async shader compilation must also release its GPU device.
  const abortBoot = () => {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.backend.device.destroy();
  };
  addEventListener("pagehide", abortBoot, { once: true });
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(
      55,
      innerWidth / innerHeight,
      0.15,
      35000,
    );
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 15;
  controls.maxDistance = 10000;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(650, 0, -900);
  progress("正在下载校园建筑与碰撞模型…");
  const [campus, data, plans] = await Promise.all([
    loadCampus(progress),
    fetch("./overall/data.json").then((r) => r.json()),
    fetch("./refined-plans.json").then((r) => r.json()),
  ]);
  scene.add(campus.root);
  const player = await createPlayer(campus.colliders, progress);
  const terrain = campus.colliders.find(
    (m) => m.name === "continuous terrain",
  ).position;
  const height = terrainGrid(terrain).heightAt;
  canvas.dataset.coordinates = RUNTIME_COORDINATES;
  progress("正在编译体积云、FFT 海浪与光照…");
  await nextFrame();
  const environment = createEnvironment(renderer, scene, camera, campus);
  progress("正在生成地表、建筑与植物的 PBR 纹理…");
  await nextFrame();
  campus.materialSystem.bake(renderer);
  const avatar = new THREE.Group();
  scene.add(avatar);
  const green = new THREE.MeshStandardNodeMaterial({
    color: "#235c57",
    roughness: 0.8,
  });
  const skin = new THREE.MeshStandardNodeMaterial({
    color: "#ddb28e",
    roughness: 0.85,
  });
  function bodyPart(geometry, material, x, y, z) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    avatar.add(m);
    return m;
  }
  bodyPart(new THREE.CapsuleGeometry(0.23, 0.5, 4, 8), green, 0, 1.03, 0);
  bodyPart(new THREE.SphereGeometry(0.2, 12, 8), skin, 0, 1.59, 0);
  bodyPart(
    new THREE.BoxGeometry(0.36, 0.45, 0.2),
    new THREE.MeshStandardNodeMaterial({ color: "#cc8853" }),
    0,
    1,
    -0.24,
  );
  const legs = [-1, 1].map((side) =>
    bodyPart(
      new THREE.CapsuleGeometry(0.1, 0.48, 4, 8),
      green,
      side * 0.13,
      0.34,
      0,
    ),
  );
  const initialView = new URLSearchParams(location.search).get("view");
  let selected = new URLSearchParams(location.search).get("place") || "uestc";
  if (!data.places.some((p) => p.id === selected)) selected = "uestc";
  let mode = "third",
    yaw = 0,
    pitch = 0.04,
    fast = false,
    jump = false,
    travelled = 0,
    paused = false;
  const keys = new Set(),
    select = $("destination");
  for (const p of data.places)
    select.add(new Option(`${p.name} · ${p.parcel}`, p.id));
  function targetPoint(id = selected) {
    const blocks = campus.meta.buildings.filter((b) => b.placeId === id);
    const points = blocks.flatMap((b) => b.footprint.map(fromAuthoringPoint));
    if (!points.length) {
      const p = mapToWorld(data.places.find((p) => p.id === id).point);
      return { x: p[0], z: p[1], y: height(...p) + 12, radius: 110 };
    }
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    const x = (minX + maxX) / 2,
      z = (minZ + maxZ) / 2,
      h = Math.max(...blocks.map((b) => b.height + (b.baseOffset || 0)));
    return {
      x,
      z,
      y: height(x, z) + h / 2,
      radius: Math.max(50, Math.hypot(maxX - minX, maxZ - minZ, h) / 2),
    };
  }
  function updateDestination() {
    const p = data.places.find((p) => p.id === selected);
    $("destination-note").textContent =
      `${p.parcel} · ${campus.meta.status?.[p.id] || "参考资料建立的校园外观模型"}`;
    $("evidence").href = plans[p.id]?.source || p.source;
    const detailed =
      selected === "library" ||
      campus.meta.authoredAssets?.some((a) => a.id === selected);
    $("library-review").hidden = !detailed;
    $("library-review").textContent = `查看${p.name}建筑与环境 ↗`;
    $("library-review").href =
      selected === "library"
        ? "./library.html"
        : `./building.html?asset=${selected}`;
    select.value = selected;
  }
  function orient() {
    const t =
        selected === "teaching"
          ? { x: campus.meta.teachingFoot[0], z: -campus.meta.teachingFoot[1] }
          : targetPoint(),
      p = player.position;
    yaw = bearingTo(t.x - p.x, t.z - p.z);
    pitch = 0.02;
  }
  function fitSelected() {
    const t = targetPoint(),
      distance =
        (t.radius /
          Math.sin(
            THREE.MathUtils.degToRad(camera.fov / 2) *
              Math.min(1, camera.aspect),
          )) *
        1.12;
    controls.target.set(t.x, t.y, t.z);
    camera.position
      .copy(controls.target)
      .add(
        new THREE.Vector3(-0.58, 0.72, 0.65)
          .normalize()
          .multiplyScalar(distance),
      );
    controls.update();
  }
  function travel(id = selected) {
    selected = id;
    const s = campus.meta.spawns.find((s) => s.id === id);
    player.teleport(s.point[0], s.y + 1.1, -s.point[1]);
    keys.clear();
    jump = false;
    orient();
    updateDestination();
    if (mode === "orbit") fitSelected();
    const url = new URL(location.href);
    url.searchParams.set("place", id);
    if (mode === "orbit") url.searchParams.set("view", "orbit");
    history.replaceState(null, "", url);
    toast("已到达附近道路，可沿路继续探索");
  }
  function setMode(next) {
    keys.clear();
    jump = false;
    mode = next;
    controls.enabled = mode === "orbit";
    if (mode === "orbit") {
      document.exitPointerLock?.();
      controls.target.set(650, 0, -900);
      camera.position.set(-1400, 3500, 2000);
      controls.update();
    }
    const url = new URL(location.href);
    if (mode === "orbit") url.searchParams.set("view", "orbit");
    else url.searchParams.delete("view");
    history.replaceState(null, "", url);
    avatar.visible = mode === "third";
    $("crosshair").hidden = mode !== "first";
    document
      .querySelectorAll("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
      );
    $("hint").textContent =
      mode === "orbit"
        ? "拖动旋转 · 滚轮缩放 · 选择地点后点击前往聚焦"
        : "WASD 移动 · 拖动转向 · Shift 奔跑 · 空格跳跃 · V 切换视角";
  }
  function showTerrain() {
    setMode("orbit");
    controls.target.set(750, 45, -700);
    camera.position.set(-900, 1300, -2300);
    controls.update();
    const url = new URL(location.href);
    url.searchParams.set("view", "terrain");
    history.replaceState(null, "", url);
  }
  function showNorthUp() {
    setMode("orbit");
    controls.target.set(650, 0, -900);
    // Approach straight down from geographic south so OrbitControls retains
    // its regular Y-up orbit axis and north remains at the top of the screen.
    camera.position.set(650, 4400, -899.99);
    controls.update();
    const url = new URL(location.href);
    url.searchParams.set("view", "map");
    history.replaceState(null, "", url);
  }
  $("map-overview").onclick = showNorthUp;
  $("terrain-overview").onclick = showTerrain;
  select.onchange = () => {
    selected = select.value;
    updateDestination();
  };
  $("travel").onclick = () => {
    travel();
    canvas.focus();
  };
  $("orient").onclick = () => {
    if (mode === "orbit") fitSelected();
    else orient();
    canvas.focus();
  };
  document.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        setMode(b.dataset.mode);
        canvas.focus();
      }),
  );
  $("speed").onclick = () => {
    fast = !fast;
    $("speed").setAttribute("aria-pressed", String(fast));
    $("speed").textContent = `快速穿行：${fast ? "开 · 18m/s" : "关"}`;
  };
  $("focus-view").onclick = () => {
    const active = document.body.classList.toggle("immersive");
    $("focus-view").textContent = active ? "显示面板" : "沉浸查看";
    $("focus-view").setAttribute("aria-pressed", String(active));
  };
  const dialog = $("about");
  $("about-open").onclick = () => {
    paused = true;
    keys.clear();
    dialog.showModal();
  };
  $("about-close").onclick = () => dialog.close();
  dialog.onclose = () => {
    paused = false;
    canvas.focus();
  };
  $("model-count").textContent =
    `当前场景：${data.places.length} 个地点、${campus.meta.stats.buildings} 个建筑体块。Three.js WebGPU · Rapier 碰撞。`;
  const pending = data.places.filter((p) => !campus.meta.status?.[p.id]);
  $("pending-count").textContent = `查看仍待细化的地点（${pending.length}）`;
  for (const p of pending) {
    const li = document.createElement("li");
    li.textContent = `${p.name} · ${p.parcel}`;
    $("pending-buildings").append(li);
  }
  $("weather").onchange = () => environment.preset($("weather").value);
  $("quality").onchange = () => {
    environment.quality($("quality").value);
    resize();
  };
  environment.quality("balanced");

  const moveKeys = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
  ]);
  window.addEventListener("keydown", (e) => {
    if (paused || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName))
      return;
    if (moveKeys.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === "Space" && !e.repeat) jump = true;
    if (e.code === "KeyV" && !e.repeat)
      setMode(
        mode === "third" ? "first" : mode === "first" ? "orbit" : "third",
      );
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    jump = false;
  });
  document.addEventListener("visibilitychange", () => {
    keys.clear();
    jump = false;
  });
  let pointer = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus();
    if (mode === "orbit") return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (mode === "orbit" || !pointer || pointer.id !== e.pointerId) return;
    yaw += (e.clientX - pointer.x) * 0.004;
    pitch = THREE.MathUtils.clamp(
      pitch + (e.clientY - pointer.y) * 0.003,
      -1.1,
      1.2,
    );
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  const release = () => {
    pointer = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  document.querySelectorAll("[data-key]").forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      keys.add(b.dataset.key);
    };
    b.onpointerup =
      b.onpointercancel =
      b.onlostpointercapture =
        () => keys.delete(b.dataset.key);
  });
  $("jump").onpointerdown = (e) => {
    e.preventDefault();
    jump = true;
  };

  const labels = data.places.map((p) => {
    const div = document.createElement("div");
    div.className = "world-label";
    div.textContent = p.name;
    const small = document.createElement("small");
    small.textContent = p.parcel;
    div.append(small);
    $("labels").append(div);
    const t = targetPoint(p.id);
    return {
      p,
      div,
      position: new THREE.Vector3(t.x, t.y + Math.min(45, t.radius * 0.4), t.z),
    };
  });
  const mini = $("mini"),
    ctx = mini.getContext("2d"),
    mapBg = document.createElement("canvas");
  mapBg.width = 300;
  mapBg.height = 260;
  const bg = mapBg.getContext("2d");
  const mapP = (p) => [(p[0] / 990) * 300, (p[1] / 1400) * 260];
  function path(points) {
    bg.beginPath();
    points.forEach((p, i) => {
      const [x, y] = mapP(p);
      i ? bg.lineTo(x, y) : bg.moveTo(x, y);
    });
  }
  bg.fillStyle = "#254f57";
  bg.fillRect(0, 0, 300, 260);
  path(data.land);
  bg.closePath();
  bg.fillStyle = "#657c64";
  bg.fill();
  bg.lineWidth = 1;
  bg.strokeStyle = "#b2bc9f";
  for (const r of data.roads) {
    path(r.points);
    bg.stroke();
  }
  for (const p of data.places) {
    const [x, y] = mapP(p.point);
    bg.fillStyle = p.color;
    bg.beginPath();
    bg.arc(x, y, 2.2, 0, Math.PI * 2);
    bg.fill();
  }
  const projected = new THREE.Vector3(),
    direction = new THREE.Vector3();
  let fps = 0;
  function hud() {
    const cp = player.position;
    $("stats").textContent =
      `WebGPU · ${Math.round(fps)} FPS · ${campus.meta.stats.buildings} 体块`;
    $("location").textContent =
      `${data.places.find((p) => p.id === selected).name}附近 · 已行走 ${Math.round(travelled)} m`;
    ctx.drawImage(mapBg, 0, 0);
    const [mx, my] = mapP(worldToMap([cp.x, cp.z]));
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(yaw);
    ctx.fillStyle = "#f3c67b";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-4, 5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const occupied = [];
    document
      .querySelectorAll(
        "header,.modes,.destination,.visual-settings,.minimap,footer",
      )
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width) occupied.push(r);
      });
    for (const { p, div, position } of [...labels].sort(
      (a, b) => Number(b.p.id === selected) - Number(a.p.id === selected),
    )) {
      projected.copy(position).project(camera);
      const distance = position.distanceTo(camera.position);
      const x = (projected.x * 0.5 + 0.5) * innerWidth,
        y = (-projected.y * 0.5 + 0.5) * innerHeight;
      div.hidden = false;
      div.style.left = `${x}px`;
      div.style.top = `${y}px`;
      div.classList.toggle("active", p.id === selected);
      const rect = div.getBoundingClientRect();
      let hidden =
        projected.z < 0 ||
        projected.z > 1 ||
        x < rect.width / 2 ||
        x > innerWidth - rect.width / 2 ||
        y < rect.height ||
        y > innerHeight ||
        (mode !== "orbit" && distance > 1500) ||
        occupied.some(
          (r) =>
            rect.left < r.right + 8 &&
            rect.right > r.left - 8 &&
            rect.top < r.bottom + 6 &&
            rect.bottom > r.top - 6,
        );
      if (!hidden && mode !== "orbit") {
        direction.copy(position).sub(camera.position).normalize();
        const hit = player.ray(camera.position, direction, distance - 8);
        hidden = !!hit;
      }
      div.hidden = hidden;
      if (!hidden) occupied.push(rect);
    }
  }
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }
  window.addEventListener("resize", resize);
  resize();
  travel();
  setMode("third");
  // An optional view in shared links makes architectural review reproducible.
  if (initialView === "orbit") {
    setMode("orbit");
    fitSelected();
  }
  if (initialView === "terrain") showTerrain();
  if (initialView === "map") showNorthUp();
  function updateCamera() {
    const cp = player.position;
    avatar.position.set(cp.x, cp.y - 0.9, cp.z);
    avatar.rotation.y = Math.PI - yaw;
    legs.forEach(
      (leg, i) =>
        (leg.rotation.x = Math.sin(travelled * 2.8 + i * Math.PI) * 0.4),
    );
    if (mode === "orbit") {
      controls.update();
      return;
    }
    const eye = new THREE.Vector3(cp.x, cp.y + 0.65, cp.z);
    const [hx, hz] = heading(yaw);
    const look = new THREE.Vector3(
      hx * Math.cos(pitch),
      -Math.sin(pitch),
      hz * Math.cos(pitch),
    );
    if (mode === "first") {
      camera.position.copy(eye);
      camera.lookAt(eye.clone().add(look));
    } else {
      const target = eye.clone().add(new THREE.Vector3(0, 0.25, 0));
      const offset = look
        .clone()
        .multiplyScalar(-6)
        .add(new THREE.Vector3(0, 1.6, 0));
      const length = offset.length();
      offset.normalize();
      const hit = player.ray(target, offset, length);
      camera.position
        .copy(target)
        .addScaledVector(
          offset,
          hit ? Math.max(0.35, hit.timeOfImpact - 0.3) : length,
        );
      camera.position.y = Math.max(
        camera.position.y,
        height(camera.position.x, camera.position.z) + 0.35,
      );
      camera.lookAt(eye.addScaledVector(look, 4));
    }
    camera.updateMatrixWorld();
  }
  updateCamera();
  environment.update(1 / 60, 0);
  campus.authoredAssets.forEach((asset) => asset.lod.update(camera));
  progress("正在编译建筑光照与阴影…");
  await renderer.compileAsync(scene, camera, null, ({ loaded, total }) => {
    progress(`正在编译建筑光照与阴影 ${loaded} / ${total}…`);
  });
  environment.render();
  progress("正在等待图形设备完成首帧…");
  await renderer.backend.device.queue.onSubmittedWorkDone();
  $("loading").remove();
  $("toast").hidden = true;
  let previous = performance.now(),
    accumulator = 0,
    time = 0,
    frame = 0,
    disposed = false;
  renderer.setAnimationLoop(() => {
    if (disposed || document.hidden) return;
    try {
      const now = performance.now(),
        elapsed = (now - previous) / 1000,
        dt = Math.min(elapsed, 0.05);
      previous = now;
      time += dt;
      fps = fps ? fps * 0.94 + (1 / Math.max(elapsed, 0.001)) * 0.06 : 1 / dt;
      accumulator += dt;
      while (accumulator >= 1 / 60) {
        if (mode !== "orbit" && !paused) {
          let f =
            Number(keys.has("KeyW") || keys.has("ArrowUp")) -
            Number(keys.has("KeyS") || keys.has("ArrowDown"));
          let r =
            Number(keys.has("KeyD") || keys.has("ArrowRight")) -
            Number(keys.has("KeyA") || keys.has("ArrowLeft"));
          const length = Math.hypot(f, r) || 1;
          f /= length;
          r /= length;
          const speed = fast
            ? 18
            : keys.has("ShiftLeft") || keys.has("ShiftRight")
              ? 7
              : 3.6;
          const delta = player.step({
            ...movement(yaw, f * speed, r * speed),
            jump,
          });
          travelled += Math.hypot(delta.x, delta.z);
          jump = false;
          const p = player.position;
          if (
            p.y < -2 ||
            p.x < -1810 ||
            p.x > 3330 ||
            p.z < -3870 ||
            p.z > 2070
          )
            travel();
        }
        accumulator -= 1 / 60;
      }
      updateCamera();
      campus.authoredAssets.forEach((asset) => asset.lod.update(camera));
      canvas.dataset.libraryLod = String(campus.library.lod.getCurrentLevel());
      if (frame % 15 === 0)
        for (const { mesh, distance } of campus.lodMeshes)
          mesh.visible =
            mesh.geometry.boundingSphere.center.distanceTo(camera.position) <
            distance;
      environment.update(paused ? 0 : dt, time);
      environment.render();
      if (frame++ % 15 === 0) {
        canvas.dataset.authoredLods = JSON.stringify(
          Object.fromEntries(
            campus.authoredAssets.map((asset) => [
              asset.manifest.asset || "library",
              asset.lod.getCurrentLevel(),
            ]),
          ),
        );
        hud();
      }
    } catch (error) {
      renderer.setAnimationLoop(null);
      console.error(error);
      toast(`渲染中断：${error.message}`);
    }
  });
  renderer.backend.device.lost.then((info) => {
    if (!disposed) {
      renderer.setAnimationLoop(null);
      toast(`WebGPU 设备已断开：${info.message || "请刷新页面重新连接"}`);
    }
  });
  removeEventListener("pagehide", abortBoot);
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      controls.dispose();
      player.dispose();
      environment.dispose();
      campus.materialSystem.dispose();
      const geometries = new Set(),
        materials = new Set(),
        textures = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            materials.add(m),
          );
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        for (const value of Object.values(m))
          if (value?.isTexture) textures.add(value);
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
      const device = renderer.backend.device;
      renderer.dispose();
      device.destroy();
    },
    { once: true },
  );
}

boot().catch((error) => {
  console.error(error);
  progress(`加载失败：${error.message}`);
  const actions = document.createElement("p");
  const retry = document.createElement("button");
  retry.textContent = "重新连接";
  retry.onclick = () => location.reload();
  const back = document.createElement("a");
  back.href = "./";
  back.textContent = "返回校园位置总图";
  back.style.marginLeft = "16px";
  actions.append(retry, back);
  $("loading").append(actions);
});
