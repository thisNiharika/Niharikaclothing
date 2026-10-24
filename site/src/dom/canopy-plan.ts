// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Canopy's timing and its foliage: plain functions with no WebGL in them, so the page and the tests share them.
// The page opens on a round hedge of leaves. Scrolling parts it from the middle and the camera goes through into a
// clearing where the product stands; its ingredients come out of the foliage; the leaves turn and fall while the rest
// of the range rises out of the ground; and the camera looks down on the fallen leaves lying round the call to action.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ramp = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The hedge: a round bush R across, from its face at z = 0 back to z = -DEPTH. The clearing's centre lies beyond it. */
export const HEDGE = { R: 1.7, DEPTH: 2.6, clearing: { x: 0, y: -1.85, z: -6.4 }, wall: 3.6 };

/** Screens of scroll each act takes, in order. */
export const U = { rest: 0.5, through: 2.0, clearing: 0.9, inside: 1.3, range: 1.6, settle: 1.1, hold: 0.5 };

export function marks() {
  const through0 = U.rest;
  const clearing0 = through0 + U.through;
  const inside0 = clearing0 + U.clearing;
  const range0 = inside0 + U.inside;
  const settle0 = range0 + U.range;
  return { through0, clearing0, inside0, range0, settle0, end: settle0 + U.settle + U.hold };
}

export function totalScreens() {
  return marks().end;
}

/**
 * Where every part stands at u (screens). `through` carries the camera from the hedge's face to the clearing, `turn`
 * swings the product round to its back label while its ingredients are out, `season` turns the leaves from summer to
 * autumn, `fall` brings them down as the camera rises, `rise(i)` lifts product i of the rest of the range out of the ground, and `settle`
 * takes the camera up to look straight down.
 */
export function stages(u: number, others: number) {
  const m = marks();
  return {
    part: ramp(0, m.through0 + U.through * 0.25, u),
    through: ramp(m.through0, m.clearing0 + U.clearing * 0.4, u),
    inside: ramp(m.inside0, m.inside0 + U.inside * 0.35, u) * (1 - ramp(m.range0, m.range0 + U.range * 0.25, u)),
    turn: ramp(m.inside0 + U.inside * 0.2, m.inside0 + U.inside * 0.75, u) * (1 - ramp(m.range0, m.range0 + U.range * 0.3, u)),
    season: ramp(m.range0 - U.inside * 0.15, m.range0 + U.range * 0.45, u),
    // The leaves turn on the wall while the range comes up, and fall only as the camera rises, so they come down
    // below it rather than across the view.
    fall: ramp(m.settle0 - U.range * 0.15, m.settle0 + U.settle * 0.7, u),
    rise: (i: number) => ramp(m.range0 + U.range * (0.15 + (0.5 * i) / Math.max(1, others)), m.range0 + U.range * (0.45 + (0.5 * i) / Math.max(1, others)), u),
    settle: ramp(m.settle0, m.settle0 + U.settle * 0.8, u),
  };
}

/** A small seeded generator, so the hedge is the same on every load and in the tests. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export type Leaf = {
  x: number; y: number; z: number; // rest position
  rx: number; ry: number; rz: number; // rest rotation
  size: number;
  summer: number; autumn: number; // which picture it wears in each season (indices into the leaf pictures)
  seed: number;
  wall: boolean; // part of the clearing's wall rather than the hedge
  gx: number; gz: number; // where it comes to rest on the ground when it falls
};

/**
 * The foliage. The hedge is a dome of leaves, thickest at its face, bulging towards the viewer in the middle; the
 * clearing beyond is walled by a ring of leaves with a gap on the near side, where the camera comes in. Leaves that
 * fall land in a ring round the clearing, leaving the middle clear. `summer` and `autumn` count the pictures of each.
 */
export function foliage(count: number, wallCount: number, summer: number, autumn: number, seed = 7): Leaf[] {
  const r = rng(seed);
  const out: Leaf[] = [];
  const C = HEDGE.clearing;
  const ground = () => {
    const a = r() * Math.PI * 2, rad = 1.25 + Math.sqrt(r()) * 1.7;
    return { gx: C.x + Math.cos(a) * rad, gz: C.z + Math.sin(a) * rad };
  };
  // An accent of autumn even in summer, so the hedge is layered and lit rather than one green.
  const pick = (accent: number) => (r() < accent ? summer + Math.floor(r() * autumn) : Math.floor(r() * summer));
  for (let i = 0; i < count; i++) {
    const rad = HEDGE.R * Math.sqrt(r());
    const a = r() * Math.PI * 2;
    const rn = rad / HEDGE.R;
    // The face of the dome comes forward in the middle; leaves sit at or behind it, most of them near it.
    const face = 0.55 * (1 - rn * rn);
    const z = face - Math.pow(r(), 1.8) * HEDGE.DEPTH;
    out.push({
      x: Math.cos(a) * rad, y: Math.sin(a) * rad, z,
      rx: (r() - 0.5) * 1.2, ry: (r() - 0.5) * 1.2, rz: r() * Math.PI * 2,
      size: 0.26 + r() * 0.24,
      summer: pick(0.1), autumn: summer + Math.floor(r() * autumn),
      seed: r(), wall: false, ...ground(),
    });
  }
  for (let i = 0; i < wallCount; i++) {
    // A ring round the clearing, open on the side that faces the hedge (the camera's way in, never seen once inside).
    const a = Math.PI / 2 + 1.3 + r() * (Math.PI * 2 - 2.6);
    // A thick bank of foliage from the ground up, densest low down, so it reads as hedge rather than as leaves in air.
    const rad = HEDGE.wall + Math.pow(r(), 0.7) * 1.6;
    const y = C.y + Math.pow(r(), 1.4) * 2.8;
    out.push({
      x: C.x + Math.cos(a) * rad, y, z: C.z + Math.sin(a) * rad,
      rx: (r() - 0.5) * 1.4, ry: -a + Math.PI / 2 + (r() - 0.5) * 0.8, rz: r() * Math.PI * 2,
      size: 0.34 + r() * 0.3,
      summer: pick(0.12), autumn: summer + Math.floor(r() * autumn),
      seed: r(), wall: true, ...ground(),
    });
  }
  return out;
}

/** Where product i of the rest of the range stands once it has risen: an arc behind the hero product. */
export function rangeAt(i: number, n: number) {
  const C = HEDGE.clearing;
  const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
  const a = f * 1.05;
  return { x: C.x + Math.sin(a) * 1.1, y: C.y, z: C.z - Math.cos(a) * 0.8 + 0.15 };
}
