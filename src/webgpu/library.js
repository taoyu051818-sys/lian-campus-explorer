import * as THREE from "three/webgpu";
import { placeAuthoredAsset } from "./coordinates.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { physical } from "../vendor/tidewater/materials/Materials.js";
import { LAYERS } from "../vendor/tidewater/core/SceneRenderer.js";

// Preserve the Blender PBR asset: do not replace its UVs, colours or baked maps
// with the procedural campus material-name catalogue.
export function adaptLibraryMaterial(source) {
  const target = physical({
    name: source.name,
    color: source.color.clone(),
    metalness: source.metalness,
    roughness: source.roughness,
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    aoMap: source.aoMap,
    aoMapIntensity: source.aoMapIntensity,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: source.depthWrite,
    clearcoat: source.clearcoat ?? 0,
    clearcoatRoughness: source.clearcoatRoughness ?? 0,
    ior: source.ior ?? 1.5,
  });
  target.userData = { ...source.userData };
  target.underwaterLighting = "lite";
  return target;
}

export function loadLibrary(registration, progress = () => {}) {
  return loadAuthoredAsset(
    { ...registration, id: "library", name: "图书馆" },
    progress,
  );
}

export async function loadAuthoredAsset(registration, progress = () => {}) {
  const id = registration.id;
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid model identifier");
  const base = `${import.meta.env.BASE_URL}models/${id}/`;
  const response = await fetch(`${base}${id}.json`);
  if (!response.ok) throw new Error(`${registration.name}模型清单加载失败。`);
  const manifest = await response.json();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const lod = new THREE.LOD();
  lod.name = `Blender ${id}`;
  lod.autoUpdate = false;
  placeAuthoredAsset(lod, registration);
  progress(`正在加载${registration.name}与周边环境…`);
  for (const level of manifest.lods) {
    const asset = await loader.loadAsync(`${base}${level.file}`);
    preserveAuthoredLettering(asset.scene);
    const converted = new Map();
    asset.scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const convert = (source) => {
        if (!converted.has(source))
          converted.set(source, adaptLibraryMaterial(source));
        return converted.get(source);
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(convert)
        : convert(mesh.material);
      mesh.userData.placeId = id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.layers.set(LAYERS.OPAQUE);
    });
    converted.forEach((_, source) => source.dispose());
    lod.addLevel(asset.scene, level.distance, 0.12);
  }
  lod.updateMatrixWorld(true);
  return { lod, manifest };
}

// Letter outlines were created in Blender's native text basis. Keep them readable
// when reflecting the architectural source basis, about each label's own centre.
export function preserveAuthoredLettering(root) {
  root.traverse((mesh) => {
    if (
      !mesh.isMesh ||
      mesh.userData.letteringConverted ||
      !/^(Entrance sign (Library|图书馆)|Rooftop sign 黎安国际科创港|Student canteen facade lettering)(\.\d+)?$/.test(
        mesh.userData.name || mesh.name,
      )
    )
      return;
    mesh.geometry.computeBoundingBox();
    const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
    mesh.position.add(
      new THREE.Vector3(2 * center.x * mesh.scale.x, 0, 0).applyQuaternion(
        mesh.quaternion,
      ),
    );
    mesh.scale.x *= -1;
    mesh.userData.letteringConverted = true;
  });
}
