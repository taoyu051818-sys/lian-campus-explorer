import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  HemisphericLight,
  DirectionalLight,
  ArcRotateCamera,
  Matrix,
  PointerEventTypes,
} from "@babylonjs/core";
import earcut from "earcut";
import type { AtlasData } from "./atlas";
export async function createOverall(
  canvas: HTMLCanvasElement,
  labels: HTMLElement,
  data: AtlasData,
  onSelect: (id: string) => void,
) {
  const engine = new Engine(canvas, true);
  engine.setHardwareScalingLevel(Math.max(1, devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.82, 0.9, 0.86, 1);
  const hemi = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  const sun = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene);
  sun.intensity = 0.3;
  const camera = new ArcRotateCamera(
    "overall",
    -Math.PI / 2,
    0.64,
    740,
    new Vector3(495, 0, 615),
    scene,
  );
  camera.lowerRadiusLimit = 100;
  camera.upperRadiusLimit = 1650;
  camera.upperBetaLimit = 1.35;
  camera.lowerBetaLimit = 0.05;
  camera.minZ = 0.1;
  camera.wheelPrecision = 4;
  camera.panningSensibility = 9;
  camera.attachControl(canvas, true);
  function mat(name: string, c: string) {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(c);
    m.specularColor = Color3.Black();
    return m;
  }
  const water = MeshBuilder.CreateGround(
    "water",
    { width: 1800, height: 1800 },
    scene,
  );
  water.position = new Vector3(495, -2, 700);
  water.material = mat("water", "#c4dfda");
  function plate(
    id: string,
    pts: number[][],
    depth: number,
    m: StandardMaterial,
    y = 0,
  ) {
    const mesh = MeshBuilder.ExtrudePolygon(
      id,
      {
        shape: pts.map(([x, y]) => new Vector3(x, 0, 1400 - y)),
        depth,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      scene,
      earcut,
    );
    mesh.position.y = depth + y;
    mesh.material = m;
    return mesh;
  }
  plate("context", data.land, 1, mat("land", "#e4ebd6"));
  const meshes = new Map<string, Mesh>();
  const pinMat = mat("pin", "#355e54");
  for (const p of data.places) {
    if (p.polygon) {
      const mesh = plate(p.id, p.polygon, 3, mat(p.id, p.color), 1);
      mesh.metadata = { placeId: p.id };
      meshes.set(p.id, mesh);
    }
    const pin = MeshBuilder.CreateCylinder(
      "pin-" + p.id,
      { diameter: 5, height: 8, tessellation: 12 },
      scene,
    );
    pin.position = new Vector3(p.point[0], 7, 1400 - p.point[1]);
    pin.material = pinMat;
    pin.metadata = { placeId: p.id };
  }
  for (const r of data.roads) {
    const l = MeshBuilder.CreateLines(
      r.id,
      { points: r.points.map(([x, y]) => new Vector3(x, 2, 1400 - y)) },
      scene,
    );
    l.color = Color3.FromHexString(
      r.kind === "对外道路" ? "#507e62" : "#8ca582",
    );
  }
  let current = "uestc",
    other = "bupt",
    line: Mesh | undefined;
  const labelItems = data.places.map((p) => {
    const b = document.createElement("button");
    b.className = "three-label";
    b.textContent = p.name;
    b.onclick = () => onSelect(p.id);
    labels.append(b);
    return { p, b };
  });
  scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERPICK) {
      const id = info.pickInfo?.pickedMesh?.metadata?.placeId;
      if (id) onSelect(id);
    }
  });
  const render = () => {
    scene.render();
    const occupied: number[][] = [];
    for (const { p, b } of [...labelItems].sort(
      (a, b) =>
        Number(b.p.id === current || b.p.id === other) -
        Number(a.p.id === current || a.p.id === other),
    )) {
      const projected = Vector3.Project(
        new Vector3(p.point[0], 13, 1400 - p.point[1]),
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        ),
      );
      const x = (projected.x * canvas.clientWidth) / engine.getRenderWidth(),
        y = (projected.y * canvas.clientHeight) / engine.getRenderHeight();
      const width = p.name.length * 10 + 12;
      const rect = [x - width / 2, y - 30, width, 26];
      const blocked = occupied.some(
        (q) =>
          rect[0] < q[0] + q[2] &&
          rect[0] + rect[2] > q[0] &&
          rect[1] < q[1] + q[3] &&
          rect[1] + rect[3] > q[1],
      );
      const show =
        projected.z > 0 &&
        projected.z < 1 &&
        x > 20 &&
        x < canvas.clientWidth - 20 &&
        y > 60 &&
        y < canvas.clientHeight - 30 &&
        !blocked;
      b.hidden = !show;
      if (show) {
        occupied.push(rect);
        b.style.left = x + "px";
        b.style.top = y + "px";
      }
      b.classList.toggle("active", p.id === current);
    }
  };
  window.addEventListener("resize", () => engine.resize());
  return {
    select: (id: string, compared: string) => {
      current = id;
      other = compared;
      for (const [key, m] of meshes) {
        m.scaling.y = key === id ? 2.2 : 1;
      }
      line?.dispose();
      const a = data.places.find((p) => p.id === id)!,
        b = data.places.find((p) => p.id === compared)!;
      line = MeshBuilder.CreateLines(
        "comparison",
        {
          points: [a, b].map(
            (p) => new Vector3(p.point[0], 12, 1400 - p.point[1]),
          ),
        },
        scene,
      );
      (line as any).color = Color3.FromHexString("#c67845");
    },
    setVisible: (visible: boolean) => {
      engine.stopRenderLoop();
      if (visible) {
        engine.resize();
        engine.runRenderLoop(render);
      }
    },
  };
}
