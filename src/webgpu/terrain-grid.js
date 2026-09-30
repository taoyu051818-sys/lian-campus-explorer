// Vertex rows keep the source ordering after conversion, so row Z decreases.
// Derive signed spacing from the actual collider; CPU and GPU share this basis.
export function terrainGrid(positions) {
  const width = 261,
    height = 301;
  if (positions.length !== width * height * 3)
    throw new Error("Invalid campus terrain grid");
  const origin = [positions[0], positions[2]];
  const step = [positions[3] - origin[0], positions[width * 3 + 2] - origin[1]];
  const size = [step[0] * (width - 1), step[1] * (height - 1)];
  const heights = Float32Array.from(
    { length: width * height },
    (_, i) => positions[i * 3 + 1],
  );
  const at = (x, z) =>
    heights[
      Math.max(0, Math.min(height - 1, z)) * width +
        Math.max(0, Math.min(width - 1, x))
    ];
  function heightAt(x, z) {
    const fx = (x - origin[0]) / step[0],
      fz = (z - origin[1]) / step[1];
    if (fx < 0 || fx > width - 1 || fz < 0 || fz > height - 1) return -16.8;
    const ix = Math.min(width - 2, Math.floor(fx)),
      iz = Math.min(height - 2, Math.floor(fz));
    const u = fx - ix,
      v = fz - iz;
    const a = at(ix, iz),
      b = at(ix + 1, iz),
      c = at(ix, iz + 1),
      d = at(ix + 1, iz + 1);
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  return { width, height, origin, step, size, heights, at, heightAt };
}
