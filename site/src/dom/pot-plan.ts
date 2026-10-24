// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Peel's timing and its geometry: plain functions with no WebGL in them, so the page, its shaders and the tests agree.
// A yoghurt pot is built in code (a lathed cup) and wears its flat printed wrap and its foil lid. The scroll peels the
// lid back from its tab, unwinds the wrap off the pot from its seam into a flat print, rolls it back on, steps through
// the flavours, and stacks the pots for the close.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ramp = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The pot: radius R at the rim, a little narrower at the foot, H tall, in scene units. */
export const POT = { R: 1, foot: 0.9, H: 1.18 };

/** Screens of scroll each act takes. `flavour` is per flavour. */
export const U = { rest: 0.5, peel: 1.1, unwrap: 1.5, rewrap: 0.5, flavour: 0.75, stack: 1.1, hold: 0.4 };

export function marks(n: number) {
  const peel0 = U.rest;
  const unwrap0 = peel0 + U.peel;
  const flavours0 = unwrap0 + U.unwrap + U.rewrap;
  const stack0 = flavours0 + U.flavour * Math.max(1, n);
  return { peel0, unwrap0, flavours0, stack0, end: stack0 + U.stack + U.hold };
}

export function totalScreens(n: number) {
  return marks(n).end;
}

/**
 * Where everything stands at u. `peel` curls the lid back (and `reseal` lays it down again), `unwind` frees the wrap
 * from its seam round the pot, `flat` carries the freed wrap to a flat print facing the viewer, `rewrap` puts it back,
 * `flavour` is the flavour in focus as a continuous index, and `stack` gathers the pots into a stack for the close.
 */
export function stages(u: number, n: number) {
  const m = marks(n);
  const rewrap = ramp(m.flavours0 - U.rewrap, m.flavours0, u);
  return {
    hero: 1 - ramp(m.peel0 * 0.6, m.peel0 + U.peel * 0.3, u),
    peel: ramp(m.peel0 + U.peel * 0.1, m.peel0 + U.peel * 0.8, u) * (1 - ramp(m.unwrap0, m.unwrap0 + U.unwrap * 0.15, u)),
    unwind: ramp(m.unwrap0 + U.unwrap * 0.05, m.unwrap0 + U.unwrap * 0.6, u) * (1 - rewrap),
    flat: ramp(m.unwrap0 + U.unwrap * 0.5, m.unwrap0 + U.unwrap * 0.85, u) * (1 - rewrap),
    rewrap,
    flavour: clamp((u - m.flavours0) / U.flavour - 0.25, 0, n - 1),
    flavours: ramp(m.flavours0 - U.rewrap * 0.4, m.flavours0 + U.flavour * 0.3, u) * (1 - ramp(m.stack0, m.stack0 + U.stack * 0.3, u)),
    stack: ramp(m.stack0, m.stack0 + U.stack * 0.8, u),
  };
}

/**
 * A point of the wrap as it unwinds from the pot, the way a label comes off: from the seam at the back, the freed part
 * leaving along the tangent where it lets go, as a stiff sheet does, with a little curl. `s` is the distance along the
 * wrap from its start at the seam (0 to C, C the pot's circumference), `free` how much of it, from the far end, has
 * come away. Returns x and z in the pot's own frame (z towards the viewer, the seam at z = -R).
 */
export function unwindAt(s: number, free: number, R = POT.R) {
  const C = 2 * Math.PI * R;
  const sd = C - clamp(free, 0, C);
  const at = (a: number) => ({ x: R * Math.sin(a), z: R * Math.cos(a) });
  const angle = (x: number) => -Math.PI + x / R;
  if (s <= sd) return at(angle(s));
  const a = angle(sd);
  const p = at(a);
  // The tangent at the point of letting go, in the direction the wrap runs, and the outward normal for the curl.
  const tx = Math.cos(a), tz = -Math.sin(a);
  const nx = Math.sin(a), nz = Math.cos(a);
  const d = s - sd;
  const curl = 0.06 * d * d / C;
  return { x: p.x + tx * d + nx * curl, z: p.z + tz * d + nz * curl };
}

/** Where pot i of n stands in the flavour line: a shallow arc, the one in focus forward. */
export function lineAt(i: number, n: number, focus: number) {
  const f = n === 1 ? 0 : i - (n - 1) / 2;
  const near = Math.max(0, 1 - Math.abs(i - focus));
  return { x: f * 2.5, z: -Math.abs(f) * 0.6 + near * 0.9, lift: near };
}

/** Where pot i stands in the closing stack: one on another, the first at the foot. */
export function stackAt(i: number) {
  return { x: 0, y: i * (POT.H + 0.02), z: 0 };
}
