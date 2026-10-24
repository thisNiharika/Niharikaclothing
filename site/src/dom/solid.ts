// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Cut-outs made solid, shared by the scenes that turn photographs in 3D (storm, drift).

import * as THREE from "three";

export type Shape = { geo: THREE.BufferGeometry; gx: number; gy: number; a: Uint8Array };

// A cut-out made solid. The picture's alpha, drawn down to a grid, is the boundary of a membrane under even pressure
// (Poisson's equation, solved by over-relaxation); the root of its height is a cushion that is round at the edges and
// smooth over the middle, with no creases where a distance field would ridge. A pillow keeps that whole shape (a
// bag full of air); a piece is a slab, rounded at the rim and capped at a thickness, so a chilli comes out round and a
// crisp thin. Heights are in units of the picture's longer side.
export function inflate(img: { width: number; height: number }, cols: number, pillow: boolean, depth: number, both: boolean): Shape {
  const asp = img.width / Math.max(1, img.height);
  const gx = Math.max(8, Math.round(asp >= 1 ? cols : cols * asp));
  const gy = Math.max(8, Math.round(asp >= 1 ? cols / asp : cols));
  const W = gx + 1, H = gy + 1;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img as CanvasImageSource, 0, 0, W, H);
  let px: Uint8ClampedArray;
  try { px = ctx.getImageData(0, 0, W, H).data; } catch { px = new Uint8ClampedArray(W * H * 4).fill(255); }
  const a = new Uint8Array(W * H);
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { a[i] = px[i * 4 + 3]!; inside[i] = a[i]! > 100 ? 1 : 0; }
  const f = new Float32Array(W * H);
  const iters = Math.round(Math.max(gx, gy) * 1.7), om = 1.85;
  for (let k = 0; k < iters; k++) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!inside[i]) continue;
      f[i] = f[i]! + om * ((f[i - 1]! + f[i + 1]! + f[i - W]! + f[i + W]! + 1) / 4 - f[i]!);
    }
  }
  let fmax = 0;
  for (let i = 0; i < W * H; i++) fmax = Math.max(fmax, f[i]!);
  const long = Math.max(gx, gy);
  const z = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const v = Math.max(0, f[i]!);
    if (!v || !fmax) continue;
    z[i] = pillow ? depth * Math.sqrt(v / fmax) : depth * Math.tanh((1.41 * Math.sqrt(v)) / long / depth);
  }
  const sides = both ? [1, -1] : [1];
  const pos = new Float32Array(W * H * sides.length * 3);
  const uv = new Float32Array(W * H * sides.length * 2);
  sides.forEach((sd, s) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = s * W * H + i;
      pos[o * 3] = x / gx - 0.5; pos[o * 3 + 1] = 0.5 - y / gy; pos[o * 3 + 2] = sd * z[i]!;
      uv[o * 2] = x / gx; uv[o * 2 + 1] = 1 - y / gy;
    }
  });
  const idx: number[] = [];
  for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) {
    const i0 = y * W + x, i1 = i0 + 1, i2 = i0 + W, i3 = i2 + 1;
    if (Math.max(a[i0]!, a[i1]!, a[i2]!, a[i3]!) < 8) continue;
    idx.push(i0, i2, i1, i1, i2, i3);
    if (both) { const o = W * H; idx.push(o + i0, o + i1, o + i2, o + i1, o + i3, o + i2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, gx, gy, a };
}
