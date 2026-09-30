// Source plans and meshpacks retain Babylon's east/up/north authoring basis.
// Convert once at the runtime boundary: Three.js uses east/up/south (+X,+Y,+Z).
// Metadata and GLB files remain in authoring space; never silently rewrite them.
export const AUTHORING_COORDINATES = "east-up-north";
export const RUNTIME_COORDINATES = "east-up-south";
const SCALE = 1000 / 190;
export const fromAuthoringPoint = ([x, north]) => [x, -north];
export const fromAuthoringVector = ([x, y, north]) => [x, y, -north];
export const mapToWorld = ([x, y]) => [(x - 359) * SCALE, (y - 870) * SCALE];
export const worldToMap = ([x, z]) => [x / SCALE + 359, z / SCALE + 870];

// Reflection changes winding as well as positions and normals. The same arrays
// feed rendering and Rapier; reflecting a scene group alone would split them.
export function reflectMesh(position, normal, index) {
  for (let i = 2; i < position.length; i += 3) position[i] *= -1;
  if (normal) for (let i = 2; i < normal.length; i += 3) normal[i] *= -1;
  for (let i = 0; i < index.length; i += 3)
    [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
}

export function placeAuthoredAsset(object, registration) {
  // F R(yaw) = R(-yaw) F. Reflecting only the anchor leaves local landscapes
  // and asymmetric building wings on the wrong side of their colliders.
  object.position.set(
    registration.anchor[0],
    registration.base,
    -registration.anchor[1],
  );
  object.rotation.y = -registration.yaw;
  object.scale.z = -1;
}

// Bearings are clockwise from north, matching the north-up minimap.
export const bearingTo = (dx, dz) => Math.atan2(dx, -dz);
export const heading = (bearing) => [Math.sin(bearing), -Math.cos(bearing)];
export function movement(bearing, forward, right) {
  return {
    x: Math.sin(bearing) * forward + Math.cos(bearing) * right,
    z: -Math.cos(bearing) * forward + Math.sin(bearing) * right,
  };
}
