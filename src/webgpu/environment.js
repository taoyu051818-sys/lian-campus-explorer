import "../vendor/tidewater/core/TSLPatches.js";
import * as THREE from "three/webgpu";
import {
  Fn,
  vec2,
  vec4,
  float,
  texture,
  mix,
  max,
  abs,
  smoothstep,
  screenUV,
  rtt,
  uniform,
} from "three/tsl";
import { ShoreWaves } from "../vendor/tidewater/ocean/ShoreWaves.js";
import { WaterSurface } from "../vendor/tidewater/ocean/WaterSurface.js";
import { WaterMaterial } from "../vendor/tidewater/ocean/WaterMaterial.js";
import { createFoamTexture } from "../vendor/tidewater/ocean/FoamTexture.js";
import { SeaDetail } from "../vendor/tidewater/ocean/SeaDetail.js";
import { Caustics } from "../vendor/tidewater/ocean/Caustics.js";
import { installUnderwaterLighting } from "../vendor/tidewater/ocean/UnderwaterLighting.js";
import {
  SceneRenderer,
  LAYERS,
} from "../vendor/tidewater/core/SceneRenderer.js";
import { updateCameraVelocity } from "../vendor/tidewater/post/CameraVelocity.js";
import { createTerrainMaterialData } from "./terrain-material-data.js";
import { CSMShadowNode } from "three/addons/csm/CSMShadowNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import {
  Atmosphere,
  SUN_ILLUMINANCE,
} from "../vendor/tidewater/sky/Atmosphere.js";
import { Sky, sunDirectionFromTime } from "../vendor/tidewater/sky/Sky.js";
import { Clouds } from "../vendor/tidewater/sky/Clouds.js";
import { Environment } from "../vendor/tidewater/sky/Environment.js";
import { OceanFFT } from "../vendor/tidewater/ocean/OceanFFT.js";
import { CDLOD } from "../vendor/tidewater/core/CDLOD.js";
import { G } from "../vendor/tidewater/core/Globals.js";

const PRESETS = {
  tropical: { hour: 14.8, cloud: 0.36, haze: 0.85, exposure: 0.66, wind: 5.5 },
  morning: { hour: 7.1, cloud: 0.32, haze: 1.2, exposure: 0.76, wind: 4.5 },
  sunset: { hour: 17.5, cloud: 0.41, haze: 1.35, exposure: 0.87, wind: 5 },
};

export function createEnvironment(renderer, scene, camera, campus) {
  const atmosphere = new Atmosphere(renderer),
    sky = new Sky(atmosphere);
  const clouds = new Clouds(renderer, atmosphere);
  sky.clouds = clouds;
  clouds.resolutionScale = 0.5;
  scene.backgroundNode = sky.backgroundNode();
  scene.fog = new THREE.FogExp2(0xb8d4db, 0.000035);
  const sun = new THREE.DirectionalLight(0xfff1df, 8);
  sun.castShadow = true;
  sun.layers.enableAll();
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 4000;
  sun.shadow.bias = -0.00002;
  sun.shadow.normalBias = 0.065;
  const csm = new CSMShadowNode(sun, {
    cascades: 3,
    maxFar: 1200,
    lightMargin: 300,
  });
  csm.fade = true;
  sun.shadow.shadowNode = csm;
  scene.add(sun, sun.target);
  const env = new Environment(renderer, scene, sky, 128);
  const fft = new OceanFFT(renderer, { choppiness: 0.8 });
  G.seaLevel.value = -0.8;

  G.cameraWaterHeight.value = G.seaLevel.value;
  const terrain = createTerrainMaterialData(
    campus.colliders.find((m) => m.name === "continuous terrain").position,
  );
  const sceneRenderer = new SceneRenderer(renderer, scene, camera);
  const foamTexture = createFoamTexture(renderer);
  const seaDetail = new SeaDetail();
  const caustics = new Caustics(renderer, fft);
  caustics.detail = seaDetail;
  const cdlod = new CDLOD({
    gridSize: 32,
    leafSize: 16,
    levels: 12,
    maxInstances: 1800,
    minY: -5,
    maxY: 5,
  });
  const surface = new WaterSurface({ fft, cdlod, foamTexture });
  const shore = new ShoreWaves(terrain);
  surface.terrain = terrain;
  surface.shore = shore;
  // Same run-up phase for the water sheet and the beach's wet sheen.
  campus.materialSystem.setShoreWetness(
    Fn(([xz, h]) => {
      const phase = shore.phaseAt(xz);
      const sw = shore._swashRunup(phase.sh, phase.along, h);
      const wet = smoothstep(-0.8, 0.5, sw.Rt.sub(sw.inland));
      const damp = smoothstep(-0.2, 2.0, sw.RhMax.sub(sw.inland)).mul(0.38);
      return max(wet, damp);
    }).setLayout({
      name: "campusSwashWetness",
      type: "float",
      inputs: [
        { name: "xz", type: "vec2" },
        { name: "h", type: "float" },
      ],
    }),
  );
  surface.detail = seaDetail;
  const waterMaterial = new WaterMaterial({
    surface,
    sky,
    sceneCopy: sceneRenderer.opaqueCopy,
  });
  waterMaterial.clouds = clouds;
  waterMaterial.name = "Tidewater water / refraction / SSR / absorption";
  installUnderwaterLighting({ fft, caustics, clouds, terrain, surface });
  const water = new THREE.Mesh(cdlod.geometry, waterMaterial);
  water.name = "FFT ocean";
  water.frustumCulled = false;
  water.layers.set(LAYERS.WATER);
  water.receiveShadow = true;
  scene.add(water);

  const pipeline = new THREE.RenderPipeline(renderer);
  const color = texture(sceneRenderer.sceneRT.texture);
  const depth = texture(sceneRenderer.opaqueCopy.depthTexture);
  const finalDepth = texture(sceneRenderer.sceneRT.depthTexture);
  const aoPass = ao(depth, null, camera);
  aoPass.resolutionScale = 0.5;
  aoPass.radius.value = 1.8;
  aoPass.thickness.value = 1.8;
  aoPass.samples.value = 8;
  // Tidewater's separable, depth-aware filter prevents grain and dark edge halos.
  const blur = (src, dx, dy) =>
    rtt(
      Fn(() => {
        const size = vec2(src.size()),
          dc = depth.sample(screenUV).x;
        const sum = float(0).toVar(),
          weights = float(0).toVar();
        for (let k = -2; k <= 2; k++) {
          const st = screenUV.add(vec2(dx * k, dy * k).div(size));
          const rel = abs(depth.sample(st).x.sub(dc)).div(max(dc, 1e-7));
          const w = float(1).div(rel.mul(40).add(1).pow2());
          sum.addAssign(src.sample(st).r.mul(w));
          weights.addAssign(w);
        }
        return vec4(sum.div(weights), 0, 0, 1);
      })(),
      null,
      null,
      { type: THREE.HalfFloatType, resolutionScale: 0.5 },
    );
  const blurX = blur(aoPass.getTextureNode(), 1, 0),
    blurY = blur(blurX, 0, 1);
  const aoAmount = uniform(0.45),
    bloomPass = bloom(color, 0.06, 0.35, 1.3);
  const graded = Fn(() => {
    const d = depth.sample(screenUV).r,
      df = finalDepth.sample(screenUV).r;
    // Reversed depth: water in front of an opaque floor has a larger value.
    const k = d
      .lessThan(1e-7)
      .or(df.greaterThan(d.add(1e-7)))
      .select(float(0), aoAmount);
    return vec4(color.rgb.mul(mix(1, blurY.r, k)).add(bloomPass.rgb), 1);
  })();
  pipeline.outputNode = fxaa(graded);
  function preset(name) {
    const p = PRESETS[name] || PRESETS.tropical;
    sunDirectionFromTime(p.hour, 18.4, 6, atmosphere.sunDir.value);
    atmosphere.sunDir.value.z *= -1; // Campus authoring uses +Z for north.
    G.sunDir.value.copy(atmosphere.sunDir.value);
    clouds.coverage.value = p.cloud;
    atmosphere.mieScale.value = p.haze;
    atmosphere.invalidate();
    renderer.toneMappingExposure = p.exposure;
    G.windSpeed.value = p.wind;
    fft.local.windSpeed = p.wind;
    fft.updateSpectrumUniforms();
    env.timer = 0;
  }
  preset("tropical");
  let causticInterval = 2,
    updateFrame = 0;
  function quality(name) {
    causticInterval = name === "high" ? 1 : name === "low" ? 4 : 2;
    waterMaterial.params.ssr.value = name === "low" ? 0 : 1;
    const scale = name === "high" ? 1 : name === "low" ? 0.65 : 0.85;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * scale);
    clouds.resolutionScale = name === "high" ? 0.7 : name === "low" ? 0.3 : 0.5;
    pipeline.outputNode = name === "low" ? fxaa(color) : fxaa(graded);
    pipeline.needsUpdate = true;
    aoPass.samples.value = name === "high" ? 12 : 8;
  }
  return {
    preset,
    quality,
    water,
    pipeline,
    update(dt, time) {
      G.time.value = time;
      G.dt.value = dt;
      // Meter-scale contact AO is not meaningful from kilometre-high overview cameras.
      aoAmount.value =
        0.45 * (1 - THREE.MathUtils.smoothstep(camera.position.y, 80, 500));
      atmosphere.update(dt, camera.position.y);
      if (atmosphere.sunTransmittance) {
        G.sunColor.value
          .fromArray(atmosphere.sunTransmittance)
          .multiplyScalar(SUN_ILLUMINANCE);
        G.skyIrradiance.value.fromArray(atmosphere.skyIrradiance);
        G.horizonColor.value.fromArray(atmosphere.horizon);
        sun.color.copy(G.sunColor.value);
        sun.intensity = 1;
        scene.fog.color.copy(G.horizonColor.value);
      }
      sun.position.copy(camera.position).addScaledVector(G.sunDir.value, 500);
      sun.target.position.copy(camera.position);
      clouds.update(dt, camera);
      env.update(dt);
      fft.update(dt);
      seaDetail.update(dt);
      if (updateFrame++ % causticInterval === 0) caustics.update();
      cdlod.update(camera);
    },
    render() {
      updateCameraVelocity(camera);
      sceneRenderer.render();
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
      terrain.dispose();
      foamTexture.dispose();
      seaDetail.texture.dispose();
      for (const layer of [caustics.fine, caustics.broad]) {
        layer.target.dispose();
        layer.meshes.forEach((mesh) => {
          mesh.geometry.dispose();
          mesh.material.dispose();
        });
      }
      sceneRenderer.sceneRT.dispose();
      sceneRenderer.opaqueCopy.dispose();
      sceneRenderer.hullMaskRT.dispose();
      sceneRenderer.hullMaskMaterial.dispose();
      aoPass.dispose();
      blurX.dispose();
      blurY.dispose();
      bloomPass.dispose();
      cdlod.geometry.dispose();
      waterMaterial.dispose();
      env.target.dispose();
      env.back?.dispose();
      env.front?.dispose();
      env.pmrem?.dispose();
    },
  };
}
