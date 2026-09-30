import {
  Mesh,
  VertexData,
  StandardMaterial,
  Color3,
  type Scene,
} from "@babylonjs/core";
// The high-resolution campus stops at the legacy collision grid boundary. These
// coarse surroundings continue its shoreline instead of exposing a vertical cut.
export function buildTerrainContext(
  scene: Scene,
  geo: any,
  material: StandardMaterial,
) {
  const ps: number[] = [],
    ix: number[] = [];
  const xs = Array.from({ length: 201 }, (_, i) => -8000 + i * 80);
  const zs = Array.from({ length: 201 }, (_, i) => -8000 + i * 80);
  for (const x of [-1840, 3360]) if (!xs.includes(x)) xs.push(x);
  for (const z of [-2100, 3900]) if (!zs.includes(z)) zs.push(z);
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const sample = (x: number, z: number) => geo.terrain.naturalHeight(x, z);
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const x = xs[i],
        X = xs[i + 1],
        z = zs[j],
        Z = zs[j + 1];
      if (x >= -1840 && X <= 3360 && z >= -2100 && Z <= 3900) continue;
      const corners = [
          [x, z],
          [X, z],
          [X, Z],
          [x, Z],
        ],
        poly: number[][] = [];
      for (let k = 0; k < 4; k++) {
        const a = corners[k],
          b = corners[(k + 1) % 4];
        poly.push(a);
        const boundary =
          (a[0] === b[0] &&
            [-1840, 3360].includes(a[0]) &&
            z >= -2100 &&
            Z <= 3900) ||
          (a[1] === b[1] &&
            [-2100, 3900].includes(a[1]) &&
            x >= -1840 &&
            X <= 3360);
        if (boundary) {
          const axis = a[0] === b[0] ? 1 : 0,
            lo = Math.min(a[axis], b[axis]),
            hi = Math.max(a[axis], b[axis]);
          const cuts = [];
          for (let v = Math.ceil(lo / 20) * 20; v < hi; v += 20)
            if (v > lo) cuts.push(v);
          if (a[axis] > b[axis]) cuts.reverse();
          for (const v of cuts) poly.push(axis === 1 ? [a[0], v] : [v, a[1]]);
        }
      }
      const start = ps.length / 3,
        cx = (x + X) / 2,
        cz = (z + Z) / 2;
      ps.push(cx, sample(cx, cz), cz);
      for (const [px, pz] of poly) {
        const boundary =
          ([-1840, 3360].includes(px) && pz >= -2100 && pz <= 3900) ||
          ([-2100, 3900].includes(pz) && px >= -1840 && px <= 3360);
        ps.push(px, boundary ? geo.height(px, pz) : sample(px, pz), pz);
      }
      for (let k = 0; k < poly.length; k++)
        ix.push(start, start + 1 + k, start + 1 + ((k + 1) % poly.length));
    }
  const mesh = new Mesh("surrounding landform", scene),
    vd = new VertexData(),
    ns: number[] = [];
  VertexData.ComputeNormals(ps, ix, ns);
  vd.positions = ps;
  vd.indices = ix;
  vd.normals = ns;
  vd.applyToMesh(mesh);
  mesh.material = material;
  return mesh;
}

// Background woodland masses inferred from the aerial view. This is canopy
// coverage, not an inventory of individual species or surveyed tree locations.
export function buildTerrainWoodland(scene: Scene, geo: any) {
  const ps: number[] = [],
    ix: number[] = [],
    colors: number[] = [];
  const random = (n: number) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const bounds = geo.buildings.map((b: any) => [
    Math.min(...b.footprint.map((p: number[]) => p[0])) - 28,
    Math.max(...b.footprint.map((p: number[]) => p[0])) + 28,
    Math.min(...b.footprint.map((p: number[]) => p[1])) - 28,
    Math.max(...b.footprint.map((p: number[]) => p[1])) + 28,
  ]);
  let count = 0;
  for (let x = -1800; x < 3340; x += 20)
    for (let z = -2040; z < 3880; z += 20) {
      const seed = x * 1.73 + z * 8.11,
        px = x + (random(seed) - 0.5) * 15,
        pz = z + (random(seed + 1) - 0.5) * 15;
      const y = geo.height(px, pz);
      const wetland = y > 0.5 && y < 5.5;
      if ((y < 38 && !wetland) || !geo.clearRoad([px, pz], 20)) continue;
      if (
        bounds.some(
          (b: number[]) => px >= b[0] && px <= b[1] && pz >= b[2] && pz <= b[3],
        )
      )
        continue;
      if (
        Math.abs(geo.height(px + 5, pz) - geo.height(px - 5, pz)) > 7 ||
        Math.abs(geo.height(px, pz + 5) - geo.height(px, pz - 5)) > 7
      )
        continue;
      const radius = wetland
          ? 8 + random(seed + 2) * 3
          : 12.5 + random(seed + 2) * 4.5,
        top = wetland ? 2.8 + random(seed + 3) * 1.5 : 6 + random(seed + 3) * 5,
        start = ps.length / 3;
      const tint = 0.8 + random(seed + 4) * 0.35;
      for (let ring = 0; ring < 4; ring++)
        for (let k = 0; k < 7; k++) {
          const t = ring / 3,
            a = (k * Math.PI * 2) / 7 + ring * 0.19,
            r =
              radius * Math.sin(t * Math.PI) * (0.86 + 0.14 * random(seed + k));
          ps.push(
            px + Math.cos(a) * r,
            y + (wetland ? -0.15 : 1.3) + t * top,
            pz + Math.sin(a) * r,
          );
          colors.push(0.78 * tint, tint, 0.72 * tint, 1);
        }
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 7; k++) {
          const a = start + r * 7 + k,
            b = start + r * 7 + ((k + 1) % 7),
            c = a + 7,
            d = b + 7;
          ix.push(a, b, c, b, d, c);
        }
      count++;
    }
  const mesh = new Mesh("hillside woodland canopy", scene),
    vd = new VertexData(),
    ns: number[] = [];
  VertexData.ComputeNormals(ps, ix, ns);
  vd.positions = ps;
  vd.indices = ix;
  vd.normals = ns;
  vd.colors = colors;
  vd.applyToMesh(mesh);
  const mat = new StandardMaterial("terrain woodland canopy", scene);
  mat.diffuseColor = Color3.FromHexString("#385838");
  mat.backFaceCulling = false;
  mesh.material = mat;
  mesh.isPickable = false;
  return { mesh, count };
}
