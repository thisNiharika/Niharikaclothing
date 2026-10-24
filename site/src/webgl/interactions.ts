// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
import * as THREE from "three";
import type { KitConfig } from "../config";

const PALETTES: Record<string, string[]> = {
  petals: ["#F2B8C6", "#E88CA4", "#FFFFFF"],
  sparks: ["#FFD9A0", "#FFB347", "#FFFFFF"],
  dust: ["#D9D9D9", "#A6A6A6", "#FFFFFF"],
  bubbles: ["#BFE3FF", "#8FC7F5", "#FFFFFF"],
  ink: ["#1A1A1E", "#3A3A44", "#000000"],
};

/** Pooled particle burst at the raycast hit point. Capped per config, never allocates per frame. */
export class Burst {
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private points: THREE.Points;
  private head = 0;
  constructor(scene: THREE.Scene, private max: number, palette: string) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const col = new Float32Array(max * 3);
    const colors = (PALETTES[palette] ?? PALETTES.dust!).map((c) => new THREE.Color(c));
    for (let i = 0; i < max; i++) {
      const c = colors[i % colors.length]!;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.02, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(at: THREE.Vector3, normal: THREE.Vector3, count = 24, scale = 1) {
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = at.x; this.pos[i * 3 + 1] = at.y; this.pos[i * 3 + 2] = at.z;
      const spread = 0.6;
      this.vel[i * 3] = (normal.x + (Math.random() - 0.5) * spread) * 0.8 * scale;
      this.vel[i * 3 + 1] = (normal.y + Math.random() * spread) * 0.8 * scale;
      this.vel[i * 3 + 2] = (normal.z + (Math.random() - 0.5) * spread) * 0.8 * scale;
      this.life[i] = 1;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt * 0.9;
      this.vel[i * 3 + 1]! -= dt * 0.6;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      if (this.life[i]! <= 0) { this.pos[i * 3 + 1] = -9999; }
    }
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}

export interface Pointer { ndc: THREE.Vector2; active: boolean; down: boolean; dx: number; dy: number }

export function trackPointer(el: HTMLElement): Pointer {
  const p: Pointer = { ndc: new THREE.Vector2(-2, -2), active: false, down: false, dx: 0, dy: 0 };
  let lx = 0, ly = 0;
  const set = (e: PointerEvent) => {
    p.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    p.active = true;
    if (p.down) { p.dx += e.clientX - lx; p.dy += e.clientY - ly; }
    lx = e.clientX; ly = e.clientY;
  };
  el.addEventListener("pointermove", set, { passive: true });
  el.addEventListener("pointerdown", (e) => { p.down = true; lx = e.clientX; ly = e.clientY; set(e); });
  el.addEventListener("pointerup", () => (p.down = false));
  el.addEventListener("pointerleave", () => { p.active = false; p.down = false; });
  return p;
}

export function hasInteraction(cfg: KitConfig, type: string) {
  return cfg.interactions.find((i) => i.type === type);
}
