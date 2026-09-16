import { createTeachingAccess } from "./teaching-access";
import { createForecourts } from "./fire-station";
import { createTransportSites } from "./transport-details";
import "./world.css";
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  VertexData,
  StandardMaterial,
  HemisphericLight,
  DirectionalLight,
  UniversalCamera,
  ArcRotateCamera,
  PhysicsAggregate,
  PhysicsShapeType,
  HavokPlugin,
  PhysicsCharacterController,
  CharacterSupportedState,
  TransformNode,
  Ray,
  Matrix,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import earcut from "earcut";
import type { AtlasData } from "./atlas";
import {
  refine,
  detailStatus,
  partialDetailStatus,
  type RefinedBuilding,
} from "./refinement";
import { createLandscape, createTurfTexture } from "./landscape";
import { createSchoolGrounds } from "./school-grounds";
import { createDetails } from "./architectural-details";
import {
  geometry,
  toWorld,
  toMap,
  inside,
  distance,
  type Point,
} from "./world-geometry";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("scene"),
  keys = new Set<string>();
let mode = "third",
  yaw = 0,
  pitch = 0.05,
  fast = false,
  jump = false,
  paused = false,
  travelled = 0,
  timer = 0;
function toast(s: string) {
  el("toast").textContent = s;
  el("toast").hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => (el("toast").hidden = true), 3500);
}
async function boot() {
  const [data, campus, plans] = await Promise.all([
    fetch("./overall/data.json").then((r) => r.json()) as Promise<AtlasData>,
    fetch("./campus.json").then((r) => r.json()),
    fetch("./refined-plans.json").then((r) => r.json()),
  ]);
  const geo = geometry(data, campus),
    height = geo.height;
  const registrations = refine(geo, data, plans);
  const engine = new Engine(canvas, true, {
    stencil: true,
    adaptToDeviceRatio: false,
  });
  engine.setHardwareScalingLevel(Math.max(1, devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    engine.stopRenderLoop();
    scene.dispose();
    engine.dispose();
  });
  scene.clearColor = new Color4(0.69, 0.8, 0.83, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.69, 0.8, 0.83);
  scene.fogDensity = 0.00017;
  const sky = new HemisphericLight("sky", new Vector3(0.4, 1, 0.2), scene);
  sky.intensity = 0.6;
  sky.groundColor = new Color3(0.39, 0.43, 0.34);
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene);
  sun.intensity = 0.65;
  const mat = (name: string, hex: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor.set(0.03, 0.03, 0.03);
    return m;
  };
  const grass = mat("terrain", "#879e59"),
    asphalt = mat("roads", "#657778"),
    shoulder = mat("walkways", "#d9d9c9"),
    white = mat("road markings", "#e8e7d5"),
    grey = mat("schematic blocks", "#bcc3be"),
    traced = mat("traced UESTC", "#e5dcc5"),
    roof = mat("roofs", "#909f99"),
    parcelMat = mat("parcel surfaces", "#90a865");
  const turfTexture = createTurfTexture(scene);
  grass.diffuseTexture = turfTexture;
  parcelMat.diffuseTexture = turfTexture;
  const water = MeshBuilder.CreateGround(
    "harbour",
    { width: 10000, height: 10000 },
    scene,
  );
  water.position.set(500, -0.8, 500);
  water.material = mat("harbour water", "#7faeb8");
  const ground = new Mesh("continuous terrain", scene),
    positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [];
  const xmin = -1840,
    xmax = 3360,
    zmin = -2100,
    zmax = 3900,
    step = 20,
    nx = (xmax - xmin) / step,
    nz = (zmax - zmin) / step;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = xmin + i * step,
        z = zmin + j * step;
      positions.push(x, geo.rawHeight(x, z), z);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  vd.uvs = positions.flatMap((_, i) =>
    i % 3 === 0 ? [positions[i] / 12, positions[i + 2] / 12] : [],
  );
  vd.applyToMesh(ground);
  ground.material = grass;
  el("loading-text").textContent = "正在铺设道路与地块建筑…";
  function ribbon(
    name: string,
    path: Point[],
    width: number,
    offset: number,
    material: StandardMaterial,
    subdivision = 8,
  ) {
    const ps: number[] = [],
      ix: number[] = [];
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1],
        b = path[j],
        len = distance(a, b),
        n = Math.max(1, Math.ceil(len / subdivision)),
        dx = (b[0] - a[0]) / len,
        dz = (b[1] - a[1]) / len;
      const start = ps.length / 3;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n,
          z = a[1] + ((b[1] - a[1]) * k) / n;
        for (const sign of [-1, 1]) {
          const px = x - ((dz * width) / 2) * sign,
            pz = z + ((dx * width) / 2) * sign;
          ps.push(px, height(px, pz) + offset, pz);
        }
      }
      for (let k = 0; k < n; k++) {
        const a = start + k * 2;
        ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const m = new Mesh(name, scene),
      v = new VertexData(),
      ns: number[] = [];
    VertexData.ComputeNormals(ps, ix, ns);
    v.positions = ps;
    v.indices = ix;
    v.normals = ns;
    v.applyToMesh(m);
    m.material = material;
    m.isPickable = false;
    return m;
  }
  for (const r of geo.roads) {
    ribbon(r.name + "步道", r.points, r.width + 7, 0.12, shoulder);
    ribbon(r.name, r.points, r.width, 0.22, asphalt);
    for (const p of r.points) {
      const m = MeshBuilder.CreateDisc(
        "junction",
        {
          radius: r.width / 2,
          tessellation: 20,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene,
      );
      m.rotation.x = Math.PI / 2;
      m.position.set(p[0], height(...p) + 0.25, p[1]);
      m.material = asphalt;
      m.isPickable = false;
    }
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        len = distance(a, b);
      for (let s = 8; s < len - 6; s += 20) {
        const p: Point = [
            a[0] + ((b[0] - a[0]) * s) / len,
            a[1] + ((b[1] - a[1]) * s) / len,
          ],
          q: Point = [
            a[0] + ((b[0] - a[0]) * (s + 5)) / len,
            a[1] + ((b[1] - a[1]) * (s + 5)) / len,
          ];
        ribbon("dash", [p, q], 0.25, 0.31, white);
      }
    }
  }
  const dashes = scene.meshes.filter((m) => m.name === "dash") as Mesh[];
  if (dashes.length)
    Mesh.MergeMeshes(dashes, true, true, undefined, false, false);
  function volume(
    name: string,
    fp: Point[],
    h: number,
    base: number,
    material: StandardMaterial,
  ) {
    const m = MeshBuilder.ExtrudePolygon(
      name,
      {
        shape: fp.map((p) => new Vector3(p[0], 0, p[1])),
        depth: h,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
      earcut,
    );
    m.position.y = base + h;
    m.material = material;
    return m;
  }
  const physicalMeshes: Mesh[] = [ground];
  const details = createDetails(scene, height, volume);
  for (const p of data.places) {
    // A75/A79 crosses the stadium terrain transition; its coarse parcel overlay hid ground paths.
    if (!p.polygon || p.id === "teaching") continue;
    const fp = p.polygon.map(toWorld);
    const m = MeshBuilder.CreatePolygon(
      "parcel " + p.id,
      {
        shape: fp.map((q) => new Vector3(q[0], 0, q[1])),
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
      earcut,
    );
    const ps = m.getVerticesData("position")!;
    for (let i = 0; i < ps.length; i += 3)
      ps[i + 1] = height(ps[i], ps[i + 2]) + 0.045;
    m.setVerticesData("position", ps);
    m.setVerticesData(
      "uv",
      Array.from(ps).flatMap((_, i) =>
        i % 3 === 0 ? [ps[i] / 12, ps[i + 2] / 12] : [],
      ),
    );
    m.material = parcelMat;
    m.isPickable = false;
  }
  const facilityBase = new Map<string, number>();
  for (const id of [
    "hall",
    "workshop",
    "geology",
    "law",
    "energy",
    "hospital",
    "fire",
    "police",
    "dorm56",
    "dorm52",
  ]) {
    const points = geo.buildings
      .filter((b) => b.placeId === id)
      .flatMap((b) => b.footprint);
    facilityBase.set(id, Math.min(...points.map((p) => height(...p))) - 0.15);
  }
  let generatedBuildings = 0;
  for (const b of geo.buildings as RefinedBuilding[]) {
    if (generatedBuildings++ % 8 === 0) {
      el("loading-text").textContent =
        `正在生成建筑 ${generatedBuildings} / ${geo.buildings.length}…`;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    const base =
      b.fixedBase ??
      (facilityBase.get(b.placeId) ??
        Math.min(...b.footprint.map((p) => height(...p))) - 0.15) +
        (b.baseOffset || 0);
    if (b.placeId === "library" && b.height < 30) {
      const cx = b.footprint.reduce((s, p) => s + p[0], 0) / b.footprint.length;
      const cz = b.footprint.reduce((s, p) => s + p[1], 0) / b.footprint.length;
      for (let floor = 0; floor < 4; floor++) {
        const fp = b.footprint.map(
          (p) =>
            [
              cx + (p[0] - cx) * (1 - floor * 0.065),
              cz + (p[1] - cz) * (1 - floor * 0.065),
            ] as Point,
        );
        const y = base + floor * 4.4;
        const body = volume(b.name + " terrace " + floor, fp, 4.4, y, traced);
        body.metadata = { placeId: b.placeId };
        physicalMeshes.push(body);
        details.facade(
          { ...b, footprint: fp, height: 4.4, floors: 1, kind: "library" },
          y,
        );
      }
      continue;
    }
    const solid = volume(
      b.name,
      b.footprint,
      b.height,
      base,
      b.traced || b.placeId === "library" ? traced : grey,
    );
    solid.metadata = { placeId: b.placeId };
    physicalMeshes.push(solid);
    const cap = volume(
      "roof " + b.name,
      b.footprint,
      0.3,
      base + b.height,
      roof,
    );
    cap.isPickable = false;
    details.facade(b, base);
  }
  for (const path of campus.roads as Point[][])
    ribbon("UESTC internal road", path.map(geo.local), 5, 0.24, shoulder);
  const entrance = geo.local(campus.roads[0][0]);
  ribbon(
    "UESTC access",
    [entrance, geo.nearestRoad(entrance).point],
    6,
    0.26,
    shoulder,
  );
  const walkPaving = new StandardMaterial("residential path paving", scene);
  walkPaving.diffuseColor = Color3.FromHexString("#c3b7a0");
  walkPaving.specularColor.set(0.08, 0.08, 0.08);
  for (const path of geo.walkways) {
    ribbon(
      path.name + " edge",
      path.points,
      path.width + 0.4,
      0.18,
      shoulder,
      2,
    );
    ribbon(path.name, path.points, path.width, 0.21, walkPaving, 2);
  }
  physicalMeshes.push(...createTeachingAccess(scene, geo, volume));
  const landscape = createLandscape(scene, geo, data, campus);
  createSchoolGrounds(scene, geo);
  createForecourts(scene, geo);
  physicalMeshes.push(...createTransportSites(scene, geo).physical);
  physicalMeshes.push(...details.stadium(data));
  physicalMeshes.push(...details.library(data));
  el("loading-text").textContent = "正在启用碰撞与人物控制…";
  const hk = await HavokPhysics({ locateFile: () => havokUrl });
  const gravity = new Vector3(0, -9.81, 0),
    down = new Vector3(0, -1, 0);
  scene.enablePhysics(gravity, new HavokPlugin(true, hk));
  scene.getPhysicsEngine()!.setTimeStep(1 / 60);
  for (const m of physicalMeshes)
    new PhysicsAggregate(
      m,
      PhysicsShapeType.MESH,
      { mass: 0, friction: 0.65, restitution: 0 },
      scene,
    );
  const spawn = geo.spawns.find((p) => p.id === "uestc")!.point;
  const controller = new PhysicsCharacterController(
    new Vector3(spawn[0], height(...spawn) + 1.1, spawn[1]),
    { capsuleHeight: 1.8, capsuleRadius: 0.32 },
    scene,
  );
  controller.maxSlopeCosine = Math.cos(Math.PI / 4);
  controller.maxStepHeight = 0.32;
  const walk = new UniversalCamera("walk", new Vector3(), scene);
  walk.minZ = 0.08;
  walk.maxZ = 10000;
  walk.fov = 1.03;
  walk.inputs.clear();
  const orbit = new ArcRotateCamera(
    "overall",
    -Math.PI / 2,
    0.52,
    1800,
    new Vector3(650, 0, 720),
    scene,
  );
  orbit.minZ = 5;
  orbit.maxZ = 14000;
  orbit.lowerBetaLimit = 0.08;
  orbit.upperBetaLimit = 1.45;
  orbit.lowerRadiusLimit = 35;
  orbit.upperRadiusLimit = 6200;
  orbit.wheelPrecision = 0.2;
  orbit.panningSensibility = 12;
  const avatar = new TransformNode("player", scene),
    avatarMat = mat("player green", "#215a49");
  const body = MeshBuilder.CreateCapsule(
    "player body",
    { height: 0.75, radius: 0.25, subdivisions: 2, tessellation: 8 },
    scene,
  );
  body.position.y = 1.05;
  body.parent = avatar;
  body.material = avatarMat;
  const head = MeshBuilder.CreateSphere(
    "player head",
    { diameter: 0.4, segments: 8 },
    scene,
  );
  head.position.y = 1.6;
  head.parent = avatar;
  head.material = mat("player skin", "#e8c19b");
  const bag = MeshBuilder.CreateBox(
    "backpack",
    { width: 0.36, height: 0.48, depth: 0.24 },
    scene,
  );
  bag.position.set(0, 0.95, -0.23);
  bag.parent = avatar;
  bag.material = mat("backpack orange", "#c9814b");
  const legs = [-1, 1].map((side) => {
    const m = MeshBuilder.CreateCapsule(
      "leg",
      { height: 0.68, radius: 0.105, tessellation: 6 },
      scene,
    );
    m.parent = avatar;
    m.position.set(side * 0.13, 0.36, 0);
    m.material = avatarMat;
    return m;
  });
  let selected = new URLSearchParams(location.search).get("place") || "uestc";
  if (!data.places.some((p) => p.id === selected)) selected = "uestc";
  const select = el<HTMLSelectElement>("destination");
  for (const p of data.places)
    select.add(new Option(p.name + " · " + p.parcel, p.id));
  select.value = selected;
  function updateDestination() {
    const p = data.places.find((p) => p.id === selected)!;
    el("destination-note").textContent =
      `${p.parcel} · ${detailStatus[p.id] || partialDetailStatus[p.id] || "示意体量与示意立面"}`;
    el<HTMLAnchorElement>("evidence").href = plans[p.id]?.source || p.source;
  }
  function orient() {
    const p =
        selected === "teaching"
          ? ((geo as any).teachingAccess.stairs[1].foot as Point)
          : toWorld(data.places.find((p) => p.id === selected)!.point),
      cp = controller.getPosition();
    yaw = Math.atan2(p[0] - cp.x, p[1] - cp.z);
    pitch = 0.02;
  }
  function travel(id = selected) {
    selected = id;
    select.value = id;
    const s = geo.spawns.find((p) => p.id === id)!.point;
    controller.setPosition(new Vector3(s[0], height(...s) + 1.1, s[1]));
    controller.setVelocity(Vector3.Zero());
    keys.clear();
    jump = false;
    orient();
    updateDestination();
    if (mode === "orbit") {
      const viewAlpha = orbit.alpha;
      const target = toWorld(data.places.find((p) => p.id === id)!.point);
      orbit.setTarget(
        new Vector3(target[0], height(...target) + 15, target[1]),
      );
      orbit.beta = 0.8;
      orbit.radius = 350;
      if (
        [
          "sports",
          "activity",
          "hall",
          "dorm3",
          "minzu",
          "blcu",
          "incubator",
          "dorm62",
          "workshop",
          "geology",
          "law",
          "energy",
          "youth",
          "school",
          "hospital",
          "fire",
          "police",
          "dorm56",
          "dorm52",
          "community",
          "hub30",
          "hub87",
          "teaching",
          "canteen",
        ].includes(id)
      ) {
        const blocks = geo.buildings.filter(
          (b) => b.placeId === id,
        ) as RefinedBuilding[];
        const points = [
          ...blocks.flatMap((b) => b.footprint),
          ...geo.transportSites
            .filter((s) => s.placeId === id)
            .flatMap((s) => s.footprint),
          ...geo.grounds
            .filter((s) => s.placeId === id)
            .flatMap((s) => s.footprint),
        ];
        const minX = Math.min(...points.map((p) => p[0])),
          maxX = Math.max(...points.map((p) => p[0]));
        const minZ = Math.min(...points.map((p) => p[1])),
          maxZ = Math.max(...points.map((p) => p[1]));
        const x = (minX + maxX) / 2,
          z = (minZ + maxZ) / 2;
        const h = Math.max(
          ...blocks.map((b) => b.height + (b.baseOffset || 0)),
        );
        const radius = Math.hypot((maxX - minX) / 2, (maxZ - minZ) / 2, h / 2);
        const halfFov = Math.atan(
          Math.tan(orbit.fov / 2) * Math.min(1, engine.getAspectRatio(orbit)),
        );
        orbit.setTarget(new Vector3(x, height(x, z) + h / 2, z));
        orbit.radius = Math.max(100, (radius / Math.sin(halfFov)) * 1.12);
      }
      // setTarget recalculates spherical angles; restore the overview after fitting.
      // The fire station fronts the road to its northwest; arrive facing its garage facade.
      if (id === "fire") {
        const fp = geo.buildings.find(
          (b) =>
            b.placeId === id && (b as RefinedBuilding).kind === "fire-main",
        )!.footprint;
        orbit.alpha =
          Math.atan2(fp[1][1] - fp[0][1], fp[1][0] - fp[0][0]) + Math.PI / 2;
      } else orbit.alpha = viewAlpha;
      orbit.beta = 0.8;
      orbit.inertialAlphaOffset = 0;
      orbit.inertialBetaOffset = 0;
      orbit.inertialRadiusOffset = 0;
    }
    toast("已到达地块附近的道路；可沿路继续自由探索");
  }
  function setMode(next: string) {
    keys.clear();
    jump = false;
    mode = next;
    document
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
      );
    orbit.detachControl();
    if (mode === "orbit") {
      document.exitPointerLock?.();
      const p = controller.getPosition();
      orbit.setTarget(new Vector3(650, 0, 900));
      orbit.beta = 0.35;
      orbit.radius = 5200;
      scene.activeCamera = orbit;
      orbit.attachControl(canvas, true);
    } else scene.activeCamera = walk;
    avatar.setEnabled(mode === "third");
    el("crosshair").hidden = mode !== "first";
    el("hint").textContent =
      mode === "orbit"
        ? "拖动旋转 · 滚轮缩放 · 切换人称继续从原地行走"
        : matchMedia("(pointer:coarse)").matches
          ? "方向键移动 · 拖动场景转向 · 点按跳跃"
          : "WASD 移动 · 拖动转向 · Shift 奔跑 · 空格跳跃 · V 切换视角";
  }
  select.onchange = () => {
    selected = select.value;
    updateDestination();
  };
  el("travel").onclick = () => {
    travel();
    canvas.focus();
  };
  el("orient").onclick = () => {
    orient();
    canvas.focus();
  };
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        setMode(b.dataset.mode!);
        canvas.focus();
      }),
  );
  el("speed").onclick = () => {
    fast = !fast;
    el("speed").setAttribute("aria-pressed", String(fast));
    el("speed").textContent = `快速穿行：${fast ? "开 · 18m/s" : "关"}`;
  };
  const dialog = el<HTMLDialogElement>("about");
  el("focus-view").onclick = () => {
    const focused = document.body.classList.toggle("immersive");
    el("focus-view").textContent = focused ? "显示面板" : "沉浸查看";
    el("focus-view").setAttribute("aria-pressed", String(focused));
    canvas.focus();
  };
  el("about-open").onclick = () => {
    document.exitPointerLock?.();
    paused = true;
    keys.clear();
    jump = false;
    dialog.showModal();
  };
  el("about-close").onclick = () => dialog.close();
  dialog.onclose = () => {
    paused = false;
    keys.clear();
    jump = false;
  };
  const pendingBuildings = data.places.filter((p) => !detailStatus[p.id]);
  el("pending-count").textContent =
    `仍待细化的地点（${pendingBuildings.length}处）`;
  for (const p of pendingBuildings) {
    const item = document.createElement("li");
    item.textContent = `${p.name} · ${p.parcel} · ${partialDetailStatus[p.id] || "通用灰模"}`;
    el("pending-buildings").append(item);
  }
  el("model-count").textContent =
    `当前 ${geo.buildings.length} 个主体体块，另含体育场看台。已对${Object.keys(detailStatus).length}处学校与设施进行不同程度的外形细化，其中效果图参考模型仍有尺寸估算。其余仍为示意体量与通用立面。`;
  window.addEventListener("keydown", (e) => {
    if (paused || e.target instanceof HTMLSelectElement) return;
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
    if (e.code === "Space" && !e.repeat) jump = true;
    if (e.code === "KeyV" && !e.repeat)
      setMode(mode === "first" ? "third" : "first");
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
  let drag = false,
    lx = 0,
    ly = 0;
  canvas.addEventListener("pointerdown", (e) => {
    if (mode === "orbit" || paused) return;
    canvas.focus();
    drag = true;
    lx = e.clientX;
    ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => (drag = false));
  canvas.addEventListener("pointercancel", () => (drag = false));
  canvas.addEventListener("dblclick", () => {
    if (mode !== "orbit" && !paused)
      canvas.requestPointerLock?.()?.catch(() => toast("可拖动场景转向"));
  });
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
    yaw += dx * 0.003;
    pitch = Math.max(-1.15, Math.min(1.15, pitch + dy * 0.003));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      keys.add(b.dataset.key!);
      b.setPointerCapture(e.pointerId);
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      b.addEventListener(event, () => keys.delete(b.dataset.key!));
  });
  el("jump").onpointerdown = (e) => {
    e.preventDefault();
    jump = true;
  };
  const labels = data.places.map((p) => {
    const label = document.createElement("div");
    label.className = "world-label";
    const title = document.createElement("span");
    title.textContent = p.name;
    const sub = document.createElement("small");
    sub.textContent =
      (detailStatus[p.id] || partialDetailStatus[p.id] || "示意模型") +
      " · " +
      p.parcel;
    label.append(title, sub);
    el("labels").append(label);
    return { p, label, point: toWorld(p.point) };
  });
  const mini = el<HTMLCanvasElement>("mini"),
    ctx = mini.getContext("2d")!;
  function hud() {
    const cp = controller.getPosition(),
      mp = toMap([cp.x, cp.z]);
    const nearest = [...data.places].sort(
      (a, b) => distance(a.point, mp) - distance(b.point, mp),
    )[0];
    el("location").textContent =
      `${nearest.name}附近 · 已行进 ${Math.round(travelled)} m`;
    el("stats").textContent = `${Math.round(engine.getFps())} FPS · 连续场景`;
    ctx.clearRect(0, 0, 300, 260);
    ctx.fillStyle = "#9dc4c7";
    ctx.fillRect(0, 0, 300, 260);
    const scale = 0.37;
    const map = (p: Point): Point => [
      150 + (p[0] - mp[0]) * scale,
      130 + (p[1] - mp[1]) * scale,
    ];
    const poly = (points: Point[]) => {
      ctx.beginPath();
      points.forEach((p, i) => {
        const q = map(p);
        i ? ctx.lineTo(...q) : ctx.moveTo(...q);
      });
    };
    poly(data.land);
    ctx.closePath();
    ctx.fillStyle = "#dce3c9";
    ctx.fill();
    for (const p of data.places) {
      if (p.polygon) {
        poly(p.polygon);
        ctx.closePath();
        ctx.fillStyle = p.id === selected ? "#e8bb85" : "#b9c7b0";
        ctx.fill();
      }
    }
    ctx.strokeStyle = "#728d81";
    ctx.lineWidth = 2;
    for (const r of data.roads) {
      poly(r.points);
      ctx.stroke();
    }
    for (const p of data.places) {
      const q = map(p.point);
      ctx.beginPath();
      ctx.arc(...q, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.id === selected ? "#bd6a32" : "#416655";
      ctx.fill();
    }
    ctx.save();
    ctx.translate(150, 130);
    ctx.rotate(yaw);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-6, 7);
    ctx.lineTo(6, 7);
    ctx.closePath();
    ctx.fillStyle = "#d87534";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#466454";
    ctx.font = "10px sans-serif";
    ctx.fillText("约500m", 12, 246);
    ctx.fillRect(12, 233, (500 / (1000 / 190)) * scale, 2);
    const rect = canvas.getBoundingClientRect(),
      viewport = scene.activeCamera!.viewport.toGlobal(rect.width, rect.height),
      occupied: { x: number; y: number }[] = [];
    for (const item of [...labels].sort(
      (a, b) =>
        Number(b.p.id === selected) - Number(a.p.id === selected) ||
        distance(a.point, [cp.x, cp.z]) - distance(b.point, [cp.x, cp.z]),
    )) {
      const { point, p, label } = item,
        d = distance(point, [cp.x, cp.z]),
        projected = Vector3.Project(
          new Vector3(point[0], height(...point) + 38, point[1]),
          Matrix.Identity(),
          scene.getTransformMatrix(),
          viewport,
        );
      const x = projected.x,
        y = projected.y;
      const hidden =
        (mode !== "orbit" && d > 800) ||
        projected.z < 0 ||
        projected.z > 1 ||
        x < 55 ||
        x > rect.width - 55 ||
        y < 125 ||
        y > rect.height - 95 ||
        occupied.some(
          (o) => Math.abs(o.x - x) < 135 && Math.abs(o.y - y) < 47,
        ) ||
        (x < 410 && y < 475) ||
        (x > rect.width - 285 && y > rect.height - 370);
      label.hidden = hidden;
      if (!hidden) {
        occupied.push({ x, y });
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.classList.toggle("active", p.id === selected);
      }
    }
  }
  travel();
  setMode("third");
  el("toast").hidden = true;
  el("loading").remove();
  let accumulator = 0,
    frame = 0;
  engine.runRenderLoop(() => {
    accumulator += Math.min(engine.getDeltaTime() / 1000, 0.05);
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
        const speed = fast
          ? 18
          : keys.has("ShiftLeft") || keys.has("ShiftRight")
            ? 7
            : 3.6;
        let vy = grounded ? 0 : controller.getVelocity().y - 9.81 / 60;
        if (jump && grounded) vy = 4.7;
        jump = false;
        controller.setVelocity(
          new Vector3(
            (Math.sin(yaw) * f + Math.cos(yaw) * r) * speed,
            vy,
            (Math.cos(yaw) * f - Math.sin(yaw) * r) * speed,
          ),
        );
        controller.integrate(1 / 60, support, gravity);
        const p = controller.getPosition();
        travelled += Math.hypot(p.x - old.x, p.z - old.z);
        if (
          p.y < -2 ||
          p.x < xmin + 30 ||
          p.x > xmax - 30 ||
          p.z < zmin + 30 ||
          p.z > zmax - 30
        ) {
          travel();
          toast("已返回最近选择的道路位置");
        }
      }
      accumulator -= 1 / 60;
    }
    const cp = controller.getPosition();
    avatar.position.copyFrom(cp).addInPlace(new Vector3(0, -0.9, 0));
    avatar.rotation.y = yaw;
    legs.forEach(
      (leg, i) =>
        (leg.rotation.x = Math.sin(travelled * 2.8 + i * Math.PI) * 0.4),
    );
    if (mode !== "orbit") {
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
          offset = look.scale(-6).add(new Vector3(0, 1.6, 0)),
          len = offset.length(),
          dir = offset.normalize(),
          hit = scene.pickWithRay(new Ray(target, dir, len), (m) =>
            physicalMeshes.includes(m as Mesh),
          );
        walk.position.copyFrom(
          target.add(
            dir.scale(hit?.hit ? Math.max(0.4, hit.distance - 0.3) : len),
          ),
        );
        walk.position.y = Math.max(
          walk.position.y,
          height(walk.position.x, walk.position.z) + 0.35,
        );
        walk.setTarget(eye.add(look.scale(4)));
      }
    }
    if (mode === "orbit") orbit.minZ = Math.max(1, orbit.radius / 25);
    scene.render();
    if (frame++ % 10 === 0) hud();
  });
  window.addEventListener("resize", () => engine.resize());
  if (import.meta.env.DEV)
    (window as any).worldDebug = {
      state: () => ({
        mode,
        position: controller.getPosition().asArray(),
        selected,
        travelled,
        buildings: geo.buildings.length,
        roads: geo.roads.length,
        fps: engine.getFps(),
      }),
      geometry: geo,
      registrations,
      detailStats: details.stats,
      landscapeStats: landscape.stats,
      setMode,
      travel,
      teleport: (x: number, z: number) => {
        controller.setPosition(new Vector3(x, height(x, z) + 1.1, z));
        controller.setVelocity(Vector3.Zero());
      },
      yaw: (y: number) => (yaw = y),
      press: (k: string) => {
        keys.add(k);
        if (k === "Space") jump = true;
      },
      release: (k: string) => keys.delete(k),
    };
}
boot().catch((e) => {
  console.error(e);
  el("loading-text").textContent = "加载失败：" + String(e) + "。请刷新重试。";
});
