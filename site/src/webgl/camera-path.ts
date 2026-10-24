// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
import * as THREE from "three";

export interface Keyframe { t: number; position: [number, number, number]; target: [number, number, number]; fov: number }

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/** Samples position, target and fov along the keyframes at progress p in [0,1]. */
export function sampleCameraPath(kfs: Keyframe[], p: number, easing = "smoothstep", outPos: THREE.Vector3, outTarget: THREE.Vector3) {
  if (!kfs.length) return 32;
  const t = Math.min(1, Math.max(0, p));
  let i = 0;
  while (i < kfs.length - 2 && t > kfs[i + 1]!.t) i++;
  const a = kfs[i]!, b = kfs[Math.min(i + 1, kfs.length - 1)]!;
  const span = Math.max(1e-6, b.t - a.t);
  let u = Math.min(1, Math.max(0, (t - a.t) / span));
  if (easing === "smoothstep") u = smoothstep(u);
  outPos.set(a.position[0] + (b.position[0] - a.position[0]) * u, a.position[1] + (b.position[1] - a.position[1]) * u, a.position[2] + (b.position[2] - a.position[2]) * u);
  outTarget.set(a.target[0] + (b.target[0] - a.target[0]) * u, a.target[1] + (b.target[1] - a.target[1]) * u, a.target[2] + (b.target[2] - a.target[2]) * u);
  return a.fov + (b.fov - a.fov) * u;
}
