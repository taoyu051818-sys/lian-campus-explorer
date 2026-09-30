import * as THREE from "three/webgpu";
import {
  Fn,
  float,
  vec2,
  texture,
  textureLoad,
  ivec2,
  floor,
  fract,
  mix,
  clamp,
  uniform,
} from "three/tsl";

import { terrainGrid } from "./terrain-grid.js";
import { computeShoreField } from "../vendor/tidewater/world/ShoreField.js";

// Adapter from the campus's shared 20 m authoring grid to Tidewater's material
// queries. Half-texel correction keeps the rendered shore on the collision grid.
export function createTerrainMaterialData(positions) {
  const grid = terrainGrid(positions);
  const { width, height, step, heights, at, heightAt: heightCPU } = grid;
  const normals = new Uint16Array(width * height * 4);
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, z) - at(x - 1, z)) / (step[0] * 2),
        dz = (at(x, z + 1) - at(x, z - 1)) / (step[1] * 2);
      const inv = 1 / Math.hypot(dx, 1, dz),
        i = (z * width + x) * 4;
      [-dx * inv, -dz * inv, 0, 1].forEach(
        (v, k) => (normals[i + k] = THREE.DataUtils.toHalfFloat(v)),
      );
    }
  function dataTexture(data, format, type) {
    const t = new THREE.DataTexture(data, width, height, format, type);
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
  // Float32 sampling isn't filterable on every adapter; half floats are portable.
  const heightTexture = dataTexture(
    Uint16Array.from(heights, THREE.DataUtils.toHalfFloat),
    THREE.RedFormat,
    THREE.HalfFloatType,
  );
  const normalTexture = dataTexture(
    normals,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  const nNode = texture(normalTexture);
  const origin = new THREE.Vector2(...grid.origin),
    size = new THREE.Vector2(...grid.size);
  const uOrigin = uniform(origin),
    uSize = uniform(size);
  const uvOf = (p) => p.sub(uOrigin).div(uSize);
  const texUV = (p) =>
    uvOf(p)
      .mul(vec2(width - 1, height - 1))
      .add(0.5)
      .div(vec2(width, height));
  const heightAt = Fn(([p]) => {
    const uv = uvOf(p);
    const inside = uv.x
      .greaterThanEqual(0)
      .and(uv.x.lessThanEqual(1))
      .and(uv.y.greaterThanEqual(0))
      .and(uv.y.lessThanEqual(1));
    const f = clamp(
      uv.mul(vec2(width - 1, height - 1)),
      vec2(0),
      vec2(width - 1.001, height - 1.001),
    );
    const i = ivec2(floor(f)),
      t = fract(f);
    const a = textureLoad(heightTexture, i).r;
    const b = textureLoad(heightTexture, i.add(ivec2(1, 0))).r;
    const c = textureLoad(heightTexture, i.add(ivec2(0, 1))).r;
    const d = textureLoad(heightTexture, i.add(ivec2(1, 1))).r;
    const sampled = t.x
      .add(t.y)
      .lessThanEqual(1)
      .select(
        a.add(b.sub(a).mul(t.x)).add(c.sub(a).mul(t.y)),
        d
          .add(c.sub(d).mul(float(1).sub(t.x)))
          .add(b.sub(d).mul(float(1).sub(t.y))),
      );
    return inside.select(sampled, float(-16.8));
  }).setLayout({
    name: "campusHeightAt",
    type: "float",
    inputs: [{ name: "p", type: "vec2" }],
  });
  // The phase solver needs a positive square in runtime east/south coordinates.
  const min = Math.min(
    ...grid.origin,
    ...grid.origin.map((v, i) => v + grid.size[i]),
  );
  const max = Math.max(
    ...grid.origin,
    ...grid.origin.map((v, i) => v + grid.size[i]),
  );
  const field = computeShoreField(
    { origin: min, size: max - min, heightAt: heightCPU },
    { res: 320, swellDir: [0.8, 0.6], seaLevel: -0.8 },
  );
  const shoreTexture = new THREE.DataTexture(
    field.data,
    field.res,
    field.res,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  shoreTexture.minFilter = shoreTexture.magFilter = THREE.NearestFilter;
  shoreTexture.needsUpdate = true;
  const shoreSample = Fn(([p]) => {
    const f = clamp(
      p.sub(field.origin).div(field.size).mul(field.res).sub(0.5),
      0,
      field.res - 1.001,
    );
    const i = ivec2(floor(f)),
      t = fract(f);
    const a = textureLoad(shoreTexture, i),
      b = textureLoad(shoreTexture, i.add(ivec2(1, 0)));
    const c = textureLoad(shoreTexture, i.add(ivec2(0, 1))),
      d = textureLoad(shoreTexture, i.add(ivec2(1, 1)));
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
  }).setLayout({
    name: "campusShoreSample",
    type: "vec4",
    inputs: [{ name: "p", type: "vec2" }],
  });
  return {
    origin,
    size,
    uOrigin,
    uSize,
    heightTexture,
    normalTexture,
    uvOf,
    heightAt,
    shoreTexture,
    shoreSample,
    heightCPU,
    normalRock: (p) => nNode.sample(texUV(p)).level(0),
    dispose() {
      heightTexture.dispose();
      normalTexture.dispose();
      shoreTexture.dispose();
    },
  };
}
