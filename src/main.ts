import "./style.css";
import {
  Engine,
  Scene,
  Color3,
  Color4,
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  ArcRotateCamera,
  UniversalCamera,
  PhysicsAggregate,
  PhysicsShapeType,
  HavokPlugin,
  PhysicsCharacterController,
  CharacterSupportedState,
  TransformNode,
  VertexData,
  Ray,
  Texture,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import earcut from "earcut";
type XY = [number, number];
interface Block {
  name: string;
  floors: number;
  footprint: XY[];
  height: number;
  base: number;
}
interface Campus {
  boundary: XY[];
  blocks: Block[];
  roads: XY[][];
  terrain: [number, number, number][];
  spawn: XY;
  stops: { name: string; point: XY }[];
  imageCorners: XY[];
}
interface Doc {
  title: string;
  date: string;
  source: string;
  attachment?: string;
  category?: string;
  note?: string;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("scene");
const keys = new Set<string>();
const touch = matchMedia("(pointer:coarse)").matches;
let mode: "orbit" | "first" | "third" = "orbit",
  yaw = 0,
  pitch = -0.1,
  paused = false,
  jumpRequested = false,
  docs: Doc[] = [];
let engine: Engine,
  scene: Scene,
  controller: PhysicsCharacterController,
  data: Campus,
  orbit: ArcRotateCamera,
  walk: UniversalCamera;
const gravity = new Vector3(0, -9.81, 0),
  down = new Vector3(0, -1, 0);
const solids: Mesh[] = [];
let lastTime = 0,
  accumulator = 0,
  clock = 0,
  walkingDistance = 0,
  plan: Mesh,
  avatar: TransformNode;
function toast(text: string) {
  el("toast").textContent = text;
  el("toast").hidden = false;
  window.clearTimeout(lastTime);
  lastTime = window.setTimeout(() => (el("toast").hidden = true), 3600);
}
function mat(name: string, hex: string) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.06, 0.06, 0.06);
  return m;
}
function groundHeight(x: number, z: number) {
  let sum = 0,
    weight = 0;
  for (const [px, pz, h] of data.terrain) {
    const w = 1 / (Math.pow(x - px, 2) + Math.pow(z - pz, 2) + 60);
    sum += h * w;
    weight += w;
  }
  return sum / weight;
}
function isInside(p: XY, poly: XY[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}
function segmentDistance(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    d = dx * dx + dz * dz;
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (d || 1)),
  );
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}
function roadDistance(p: XY) {
  let d = 1e5;
  for (const path of data.roads)
    for (let i = 1; i < path.length; i++)
      d = Math.min(d, segmentDistance(p, path[i - 1], path[i]));
  return d;
}
function physical(mesh: Mesh, shape = PhysicsShapeType.MESH) {
  const a = new PhysicsAggregate(
    mesh,
    shape,
    { mass: 0, friction: 0.65, restitution: 0 },
    scene,
  );
  solids.push(mesh);
  return a;
}
function volume(
  name: string,
  points: XY[],
  height: number,
  y: number,
  material: StandardMaterial,
  collision = false,
) {
  const m = MeshBuilder.ExtrudePolygon(
    name,
    {
      shape: points.map(([x, z]) => new Vector3(x, 0, z)),
      depth: height,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
    earcut,
  );
  m.position.y = y + height;
  m.material = material;
  m.receiveShadows = true;
  if (collision) physical(m);
  return m;
}
function strip(
  name: string,
  pts: XY[],
  width: number,
  material: StandardMaterial,
) {
  const positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)],
      b = pts[Math.min(i + 1, pts.length - 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = ((-(b[1] - a[1]) / len) * width) / 2,
      dz = (((b[0] - a[0]) / len) * width) / 2;
    for (const s of [-1, 1]) {
      const x = pts[i][0] + dx * s,
        z = pts[i][1] + dz * s;
      positions.push(
        x,
        groundHeight(x, z) + (name.startsWith("路面") ? 0.09 : 0.06),
        z,
      );
    }
    if (i > 0) {
      const q = i * 2;
      indices.push(q - 2, q, q - 1, q - 1, q, q + 1);
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.applyToMesh(m);
  m.material = material;
  m.receiveShadows = true;
  return m;
}
function renderDocs(query = "") {
  const parent = el("documents");
  parent.replaceChildren();
  const filtered = docs.filter((d) =>
    (d.title + " " + (d.category || "")).includes(query),
  );
  if (!filtered.length) {
    parent.textContent = "暂未找到匹配的资料。";
    return;
  }
  for (const d of filtered) {
    const card = document.createElement("article");
    card.className = "doc";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent =
      d.category || (/核实/.test(d.title) ? "实建核实" : "规划资料");
    const h = document.createElement("h3");
    h.textContent = d.title;
    const date = document.createElement("small");
    date.textContent = d.date;
    card.append(tag, h, date);
    if (d.note) {
      const note = document.createElement("p");
      note.className = "doc-note";
      note.textContent = d.note;
      card.append(note);
    }
    card.append(document.createElement("br"));
    for (const [label, url] of [
      ["官网公告 ↗", d.source],
      ["原始附件 ↗", d.attachment],
    ]) {
      if (!url || !url.startsWith("https://")) continue;
      const a = document.createElement("a");
      a.textContent = label || "来源";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      card.append(a);
    }
    parent.append(card);
  }
}
function openDialog(id: string) {
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear();
  jumpRequested = false;
  paused = true;
  el<HTMLDialogElement>(id).showModal();
}
function reset() {
  if (!controller) return;
  const [x, z] = data.spawn;
  controller.setPosition(new Vector3(x, groundHeight(x, z) + 1.02, z));
  controller.setVelocity(Vector3.Zero());
  yaw = 0.3;
  pitch = -0.03;
  toast("已回到入口广场");
}
function setMode(next: typeof mode) {
  mode = next;
  keys.clear();
  scene.activeCamera = next === "orbit" ? orbit : walk;
  document.body.classList.toggle("walking", next !== "orbit");
  el("crosshair").hidden = next !== "first";
  el("touch-controls").hidden = next === "orbit" || !touch;
  avatar.setEnabled(next === "third");
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.mode === next);
    b.setAttribute("aria-pressed", String(b.dataset.mode === next));
  });
  if (next === "orbit") {
    document.exitPointerLock?.();
    orbit.attachControl(canvas, true);
    el("controls").textContent = "拖动旋转 · 滚轮缩放";
  } else {
    orbit.detachControl();
    el("controls").textContent = touch
      ? "左侧移动 · 拖动转向 · 右侧跳跃"
      : "WASD 移动 · Shift 跑步 · Space 跳跃 · V 视角 · Esc 释放鼠标";
    if (!touch)
      canvas.requestPointerLock?.()?.catch(() => toast("点击场景即可控制视角"));
    canvas.focus();
  }
}
function miniMap() {
  const c = el<HTMLCanvasElement>("map"),
    ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#e8eee3";
  ctx.fillRect(0, 0, c.width, c.height);
  const project = ([x, z]: XY): XY => [x * 0.76 + 116, 106 - z * 0.76];
  const path = (pts: XY[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = project(p);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
  };
  path(data.boundary);
  ctx.fillStyle = "#d8e3ce";
  ctx.fill();
  ctx.strokeStyle = "#9bac9c";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  for (const p of data.roads) {
    ctx.beginPath();
    p.forEach((q, i) => {
      const [x, y] = project(q);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = "#f8f9f2";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  for (const b of data.blocks) {
    path(b.footprint);
    ctx.fillStyle = "#738d84";
    ctx.fill();
  }
  const p = controller.getPosition(),
    [x, y] = project([p.x, p.z]);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(yaw);
  ctx.fillStyle = "#d87437";
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  el("position").textContent =
    mode === "orbit"
      ? "电子科大片区"
      : `${Math.round(walkingDistance)} m 已行走`;
}
async function boot() {
  [data, docs] = await Promise.all([
    fetch("./campus.json").then((r) => r.json()),
    fetch("./documents.json")
      .then((r) =>
        r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : [],
      )
      .catch(() => []),
  ]);
  engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  engine.setHardwareScalingLevel(
    Math.max(1, devicePixelRatio / (touch ? 1 : 1.6)),
  );
  scene = new Scene(engine);
  scene.clearColor = new Color4(0.82, 0.89, 0.86, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0009;
  scene.fogColor = new Color3(0.82, 0.89, 0.86);
  const hk = await HavokPhysics({ locateFile: () => havokUrl });
  scene.enablePhysics(gravity, new HavokPlugin(true, hk));
  scene.getPhysicsEngine()!.setTimeStep(1 / 60);
  const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.58;
  hemi.groundColor = Color3.FromHexString("#81937e");
  const sun = new DirectionalLight("sun", new Vector3(-0.6, -1, 0.45), scene);
  sun.position = new Vector3(100, 160, -70);
  sun.intensity = 0.72;
  const shadows = new ShadowGenerator(touch ? 1024 : 2048, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 16;
  shadows.darkness = 0.2;
  shadows.bias = 0.003;
  const lawn = mat("草地", "#c4d3b3"),
    paving = mat("步道", "#e4e6d9"),
    wall = mat("暖白混凝土", "#eeeee4"),
    band = mat("水平板", "#fcfaf0"),
    glass = mat("遮阳阴影", "#7e9992"),
    road = mat("园内道路", "#bec7bc"),
    bark = mat("树干", "#8b9380"),
    leaf = mat("树冠", "#6c967a"),
    accent = mat("入口标识", "#c67747");
  const ground = MeshBuilder.CreateGround(
    "terrain",
    { width: 540, height: 420, subdivisions: 95 },
    scene,
  );
  let positions = ground.getVerticesData("position")!;
  for (let i = 0; i < positions.length; i += 3)
    positions[i + 1] = groundHeight(positions[i], positions[i + 2]);
  ground.updateVerticesData("position", positions);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, ground.getIndices()!, normals);
  ground.updateVerticesData("normal", normals);
  ground.material = lawn;
  ground.receiveShadows = true;
  physical(ground);
  for (let i = 0; i < data.roads.length; i++) {
    strip("路肩" + i, data.roads[i], i ? 4 : 8, paving);
    strip("路面" + i, data.roads[i], i ? 2.5 : 5, road);
  }
  for (const b of data.blocks) {
    const base =
      Math.max(b.base, ...b.footprint.map(([x, z]) => groundHeight(x, z))) +
      0.1;
    const m = volume(b.name, b.footprint, b.height, base, wall, true);
    shadows.addShadowCaster(m);
    for (let floor = 1; floor <= b.floors; floor++) {
      const slab = volume(
        "楼层轮廓",
        b.footprint,
        0.22,
        base + floor * 3.9,
        band,
      );
      shadows.addShadowCaster(slab);
      if (floor < b.floors)
        volume("层间阴影", b.footprint, 0.6, base + floor * 3.9 + 0.3, glass);
    }
    // A shallow foundation closes the gap between approximated terrain and massing.
    volume("基础", b.footprint, Math.max(0.3, base - 0.2), 0.2, wall, true);
  }
  const courtyard1 = data.stops[1].point,
    courtyard2 = data.stops[2].point;
  for (const [i, [x, z]] of [courtyard1, courtyard2].entries()) {
    const q = MeshBuilder.CreateCylinder(
      "中庭铺装" + i,
      { diameter: i ? 10 : 16, height: 0.08, tessellation: 40 },
      scene,
    );
    q.position = new Vector3(x, groundHeight(x, z) + 0.06, z);
    q.material = paving;
    q.receiveShadows = true;
  }
  let seed = 811;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const trunk = MeshBuilder.CreateCylinder(
    "树干模板",
    { diameter: 0.28, height: 3, tessellation: 6 },
    scene,
  );
  trunk.material = bark;
  trunk.isVisible = false;
  const crown = MeshBuilder.CreateSphere(
    "树冠模板",
    { diameter: 4.4, segments: 5 },
    scene,
  );
  crown.material = leaf;
  crown.isVisible = false;
  for (let i = 0; i < 450; i++) {
    const x = random() * 270 - 125,
      z = random() * 235 - 110,
      p: XY = [x, z];
    if (
      !isInside(p, data.boundary) ||
      roadDistance(p) < 5 ||
      data.blocks.some(
        (b) =>
          isInside(p, b.footprint) ||
          b.footprint.some((q) => Math.hypot(q[0] - x, q[1] - z) < 4),
      )
    )
      continue;
    const h = groundHeight(x, z),
      scale = 0.6 + random() * 0.6;
    const t = trunk.createInstance("树干");
    t.position = new Vector3(x, h + 1.5, z);
    t.scaling.y = scale;
    const cr = crown.createInstance("树冠");
    cr.position = new Vector3(x, h + 2.7 * scale, z);
    cr.scaling = new Vector3(scale, scale * 0.9, scale);
    shadows.addShadowCaster(cr);
  }
  // Perimeter context remains neutral; no invented school buildings are placed here.
  const boundaryLine = MeshBuilder.CreateLines(
    "地块边界",
    {
      points: [...data.boundary, data.boundary[0]].map(
        ([x, z]) => new Vector3(x, groundHeight(x, z) + 0.08, z),
      ),
    },
    scene,
  );
  boundaryLine.color = Color3.FromHexString("#849d87");
  for (const [i, s] of data.stops.entries()) {
    const [x, z] = s.point;
    const pole = MeshBuilder.CreateBox(
      "导览标记" + i,
      { width: 0.8, height: 2.3, depth: 0.16 },
      scene,
    );
    pole.position = new Vector3(x + 3, groundHeight(x + 3, z) + 1.15, z);
    pole.material = accent;
    shadows.addShadowCaster(pole);
  }
  const p = data.imageCorners,
    vd = new VertexData();
  vd.positions = p.flatMap(([x, z]) => [x, groundHeight(x, z) + 0.17, z]);
  vd.indices = [0, 1, 2, 0, 2, 3];
  vd.uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  plan = new Mesh("实建图参考", scene);
  vd.applyToMesh(plan);
  const pm = new StandardMaterial("图纸", scene);
  pm.diffuseTexture = new Texture("./site-plan.jpg", scene);
  pm.emissiveColor = Color3.White();
  pm.disableLighting = true;
  pm.backFaceCulling = false;
  plan.material = pm;
  plan.setEnabled(false);
  orbit = new ArcRotateCamera(
    "overview",
    -0.9,
    1.02,
    265,
    new Vector3(-24, 3, -10),
    scene,
  );
  orbit.lowerRadiusLimit = 60;
  orbit.upperRadiusLimit = 410;
  orbit.upperBetaLimit = 1.45;
  orbit.lowerBetaLimit = 0.25;
  orbit.wheelPrecision = 13;
  orbit.panningSensibility = 65;
  orbit.minZ = 0.2;
  orbit.setTarget(new Vector3(-23, 3, -8));
  orbit.attachControl(canvas, true);
  walk = new UniversalCamera("walk", new Vector3(0, 2, 0), scene);
  walk.minZ = 0.08;
  walk.maxZ = 1000;
  walk.fov = 1.05;
  controller = new PhysicsCharacterController(
    new Vector3(0, 3, 0),
    { capsuleHeight: 1.8, capsuleRadius: 0.32 },
    scene,
  );
  controller.maxSlopeCosine = Math.cos(Math.PI / 4);
  controller.maxStepHeight = 0.32;
  avatar = new TransformNode("player", scene);
  const body = MeshBuilder.CreateCapsule(
    "body",
    { height: 1.25, radius: 0.24, tessellation: 12 },
    scene,
  );
  body.parent = avatar;
  body.position.y = 0.94;
  body.material = mat("服装", "#c97442");
  const head = MeshBuilder.CreateSphere(
    "head",
    { diameter: 0.37, segments: 10 },
    scene,
  );
  head.parent = avatar;
  head.position.y = 1.65;
  head.material = mat("头部", "#e6c7a9");
  for (const s of [-1, 1]) {
    const leg = MeshBuilder.CreateBox(
      "leg",
      { width: 0.16, height: 0.65, depth: 0.2 },
      scene,
    );
    leg.parent = avatar;
    leg.position.set(s * 0.14, 0.36, 0);
    leg.material = mat("裤装" + s, "#385a5a");
    shadows.addShadowCaster(leg);
  }
  shadows.addShadowCaster(body);
  shadows.addShadowCaster(head);
  avatar.setEnabled(false);
  reset();
  el("toast").hidden = true;
  scene.activeCamera = orbit;
  el("doc-count").textContent = String(docs.length);
  renderDocs();
  el("start").addEventListener("click", () => setMode("first"));
  document
    .querySelectorAll<HTMLButtonElement>("[data-mode]")
    .forEach((b) =>
      b.addEventListener("click", () => setMode(b.dataset.mode as typeof mode)),
    );
  el("reset").addEventListener("click", reset);
  el("home").addEventListener("click", (e) => {
    e.preventDefault();
    setMode("orbit");
  });
  el("source-btn").addEventListener("click", () => openDialog("sources"));
  el("help-source").addEventListener("click", () => {
    el<HTMLDialogElement>("help").close();
    openDialog("sources");
  });
  el("help-reset").addEventListener("click", () => {
    el<HTMLDialogElement>("help").close();
    reset();
  });
  el("library-btn").addEventListener("click", () => openDialog("library"));
  el("help-btn").addEventListener("click", () => openDialog("help"));
  document
    .querySelectorAll<HTMLButtonElement>("[data-close]")
    .forEach((b) =>
      b.addEventListener("click", () => b.closest("dialog")!.close()),
    );
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("close", () => {
      paused = !!document.querySelector("dialog[open]");
      keys.clear();
    }),
  );
  el<HTMLInputElement>("search-docs").addEventListener("input", (e) =>
    renderDocs((e.target as HTMLInputElement).value.trim()),
  );
  el<HTMLInputElement>("show-plan").addEventListener("change", (e) => {
    plan.setEnabled((e.target as HTMLInputElement).checked);
  });
  window.addEventListener("keydown", (e) => {
    if (paused || e.target instanceof HTMLInputElement) return;
    if (
      [
        "Space",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    )
      e.preventDefault();
    keys.add(e.code);
    if (e.code === "Space" && !e.repeat) jumpRequested = true;
    if (e.code === "KeyV" && !e.repeat)
      setMode(mode === "third" ? "first" : "third");
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => keys.clear());
  document.addEventListener("pointerlockchange", () => keys.clear());
  canvas.addEventListener("click", () => {
    if (mode !== "orbit" && !paused && !touch)
      canvas
        .requestPointerLock?.()
        ?.catch(() => toast("浏览器未允许锁定鼠标，可拖动场景转向"));
  });
  let drag = false,
    lx = 0,
    ly = 0;
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "orbit") return;
    drag = true;
    lx = e.clientX;
    ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => (drag = false));
  canvas.addEventListener("pointercancel", () => (drag = false));
  canvas.addEventListener("pointermove", (e) => {
    if (mode === "orbit" || paused) return;
    let dx = 0,
      dy = 0;
    if (document.pointerLockElement === canvas) {
      dx = e.movementX;
      dy = e.movementY;
    } else if (drag) {
      dx = e.clientX - lx;
      dy = e.clientY - ly;
    } else return;
    lx = e.clientX;
    ly = e.clientY;
    yaw += dx * 0.0025;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.0025));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      keys.add(b.dataset.key!);
      b.setPointerCapture(e.pointerId);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(event, () => keys.delete(b.dataset.key!));
  });
  el("touch-jump").addEventListener(
    "pointerdown",
    () => (jumpRequested = true),
  );
  el("touch-jump").addEventListener("pointerup", () => keys.delete("Space"));
  window.addEventListener("resize", () => engine.resize());
  const welcome = el("loading");
  welcome.style.opacity = "0";
  setTimeout(() => welcome.remove(), 400);
  let frame = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    clock += dt;
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      if (mode !== "orbit" && !paused) {
        const old = controller.getPosition().clone(),
          support = controller.checkSupport(1 / 60, down),
          grounded =
            support.supportedState !== CharacterSupportedState.UNSUPPORTED &&
            controller.getVelocity().y <= 0.01;
        let f =
            Number(keys.has("KeyW") || keys.has("ArrowUp")) -
            Number(keys.has("KeyS") || keys.has("ArrowDown")),
          r =
            Number(keys.has("KeyD") || keys.has("ArrowRight")) -
            Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        const length = Math.hypot(f, r) || 1;
        f /= length;
        r /= length;
        const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7 : 3.6;
        let vy = grounded ? 0 : controller.getVelocity().y - 9.81 / 60;
        if (jumpRequested && grounded) {
          vy = 4.7;
        }
        jumpRequested = false;
        controller.setVelocity(
          new Vector3(
            (Math.sin(yaw) * f + Math.cos(yaw) * r) * speed,
            vy,
            (Math.cos(yaw) * f - Math.sin(yaw) * r) * speed,
          ),
        );
        controller.integrate(1 / 60, support, gravity);
        const now = controller.getPosition();
        walkingDistance += Math.hypot(now.x - old.x, now.z - old.z);
        if (now.y < -10 || Math.abs(now.x) > 240 || Math.abs(now.z) > 190)
          reset();
      }
      accumulator -= 1 / 60;
    }
    if (mode !== "orbit") {
      const cp = controller.getPosition();
      avatar.position.copyFrom(cp).addInPlace(new Vector3(0, -0.9, 0));
      avatar.rotation.y = yaw;
      const eye = cp.add(new Vector3(0, 0.65, 0)),
        look = new Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          -Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        );
      if (mode === "first") {
        walk.position.copyFrom(eye);
        walk.setTarget(eye.add(look));
      } else {
        const target = eye.add(new Vector3(0, 0.25, 0)),
          offset = look.scale(-5.5).add(new Vector3(0, 1.4, 0)),
          dist = offset.length(),
          dir = offset.normalize(),
          hit = scene.pickWithRay(new Ray(target, dir, dist), (m) =>
            solids.includes(m as Mesh),
          );
        const len = hit?.hit ? Math.max(0.5, hit.distance - 0.3) : dist;
        walk.position.copyFrom(target.add(dir.scale(len)));
        walk.position.y = Math.max(
          walk.position.y,
          groundHeight(walk.position.x, walk.position.z) + 0.3,
        );
        walk.setTarget(eye.add(look.scale(3)));
      }
    }
    scene.render();
    if (frame++ % 12 === 0) {
      miniMap();
      el("fps").textContent =
        `${Math.round(Number.isFinite(engine.getFps()) ? engine.getFps() : 0)} FPS · 黎安校园漫游`;
    }
  });
  // Diagnostics and deterministic controls available only on the local development server.
  if (import.meta.env.DEV)
    (window as any).campusDebug = {
      getState: () => ({
        mode,
        position: controller.getPosition().asArray(),
        meshCount: scene.meshes.length,
        documents: docs.length,
        fps: engine.getFps(),
      }),
      setMode,
      reset,
      teleport: (x: number, z: number) =>
        controller.setPosition(new Vector3(x, groundHeight(x, z) + 1.1, z)),
      press: (key: string) => {
        keys.add(key);
        if (key === "Space") jumpRequested = true;
      },
      release: (key: string) => keys.delete(key),
      groundHeight,
    };
}
boot().catch((error) => {
  console.error(error);
  el("loading-text").textContent =
    "场景加载失败，请刷新重试。" +
    (error instanceof Error ? error.message : String(error));
  el("loading").querySelector(".loading-line")?.remove();
});
