// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Lift's timing and its scaffold: plain functions with no WebGL in them, so the page and the tests share them. The
// scaffold is an independent tied scaffold along a house's front: two rows of standards, ledgers along each lift,
// transoms across, five boards to a lift, guard rails and toe boards on the outside, and braces up the face. It goes
// up in the order a gang puts one up, lift by lift, and every part knows when it arrives.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ramp = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The scaffold in metres: bays along the wall, lifts up it, the inner row off the wall and the outer row beyond. */
export const RIG = { bays: 4, bay: 2.0, lifts: 4, lift: 2.0, inner: 0.35, outer: 1.6, tube: 0.024 };

/** The parts, in the order a lift goes up. */
export const KINDS = ["base", "standard", "ledger", "transom", "coupler", "board", "rail", "toe", "brace"] as const;
export type Kind = (typeof KINDS)[number];

/** Each kind's place within its lift's share of the build, as a start and a length (fractions of the lift). */
const SLOT: Record<Kind, [number, number]> = {
  base: [0, 0.3], standard: [0.0, 0.3], ledger: [0.22, 0.25], transom: [0.36, 0.2], coupler: [0.3, 0.3],
  board: [0.5, 0.25], rail: [0.68, 0.18], toe: [0.72, 0.16], brace: [0.8, 0.2],
};

export type Part = { kind: Kind; a: [number, number, number]; b: [number, number, number]; lift: number; start: number; dur: number; w?: number };

/**
 * Every part of the scaffold with its two ends (a tube's ends, a board's ends along its length, a fitting's place in
 * a), its lift, and when in the build (0 to 1) it arrives. Parts of one kind in one lift arrive one after another
 * along the wall, so a lift fills from one end.
 */
export function rig(r = RIG): Part[] {
  const parts: Part[] = [];
  const share = 1 / r.lifts;
  const xs = Array.from({ length: r.bays + 1 }, (_, i) => i * r.bay);
  const rows = [r.inner, r.outer];
  const add = (kind: Kind, a: [number, number, number], b: [number, number, number], lift: number, k: number, of: number, w?: number) => {
    const [s0, len] = SLOT[kind];
    const each = len / Math.max(1, of);
    parts.push({ kind, a, b, lift, start: (lift + s0 + k * each * 0.6) * share, dur: Math.max(each * 1.6, 0.06) * share, w });
  };
  // Base plates and sole boards under every standard, before anything goes up.
  rows.forEach((z, ri) => xs.forEach((x, i) => add("base", [x, 0, z], [x, 0, z], 0, ri * xs.length + i, rows.length * xs.length)));
  for (let L = 0; L < r.lifts; L++) {
    const y0 = L * r.lift, y1 = (L + 1) * r.lift;
    const top = L === r.lifts - 1 ? y1 + 1.0 : y1;
    rows.forEach((z, ri) => xs.forEach((x, i) => add("standard", [x, y0, z], [x, top, z], L, ri * xs.length + i, rows.length * xs.length)));
    rows.forEach((z, ri) => xs.slice(0, -1).forEach((x, i) => add("ledger", [x, y1, z], [x + r.bay, y1, z], L, ri * r.bays + i, rows.length * r.bays)));
    xs.forEach((x, i) => add("transom", [x, y1 + 0.05, r.inner - 0.12], [x, y1 + 0.05, r.outer + 0.12], L, i, xs.length));
    rows.forEach((z, ri) => xs.forEach((x, i) => add("coupler", [x, y1, z], [x, y1, z], L, ri * xs.length + i, rows.length * xs.length)));
    const boards = 5;
    for (let i = 0; i < r.bays; i++) for (let k = 0; k < boards; k++) {
      const z = r.inner + 0.12 + (k + 0.5) * ((r.outer - r.inner - 0.24) / boards);
      add("board", [xs[i]!, y1 + 0.1, z], [xs[i]! + r.bay, y1 + 0.1, z], L, i * boards + k, r.bays * boards, 0.22);
    }
    xs.slice(0, -1).forEach((x, i) => {
      add("rail", [x, y1 + 1.0, r.outer + 0.05], [x + r.bay, y1 + 1.0, r.outer + 0.05], L, i * 2, r.bays * 2);
      add("rail", [x, y1 + 0.5, r.outer + 0.05], [x + r.bay, y1 + 0.5, r.outer + 0.05], L, i * 2 + 1, r.bays * 2);
      add("toe", [x, y1 + 0.18, r.outer + 0.08], [x + r.bay, y1 + 0.18, r.outer + 0.08], L, i, r.bays, 0.15);
      // Braces zigzag up the face, each bay leaning the other way to its neighbour.
      const up = (i + L) % 2 === 0;
      add("brace", [x, up ? y0 : y1, r.outer + 0.06], [x + r.bay, up ? y1 : y0, r.outer + 0.06], L, i, r.bays);
    });
  }
  return parts;
}

/** Screens of scroll each act takes. */
export const U = { rest: 0.5, build: 4.2, inspect: 1.6, hold: 0.8 };

export function marks() {
  const build0 = U.rest;
  const inspect0 = build0 + U.build;
  const finale0 = inspect0 + U.inspect;
  return { build0, inspect0, finale0, end: finale0 + U.hold };
}

export function totalScreens() {
  return marks().end;
}

/** Where the film stands at u: `build` runs the scaffold up (0 to 1), `inspect` walks round it, `finale` stands back. */
export function stages(u: number) {
  const m = marks();
  return {
    hero: 1 - ramp(m.build0 * 0.4, m.build0 + U.build * 0.08, u),
    build: clamp((u - m.build0) / U.build, 0, 1),
    inspect: ramp(m.inspect0, m.inspect0 + U.inspect * 0.6, u),
    finale: ramp(m.finale0 - U.inspect * 0.2, m.finale0 + U.hold * 0.6, u),
  };
}

/** How far part p has arrived at build progress b (0 not yet, 1 in place). */
export function arrived(p: Part, b: number) {
  return clamp((b - p.start) / p.dur, 0, 1);
}

/** The kind being put up at build progress b, for the list of steps. */
export function kindAt(b: number, parts: Part[]): Kind | null {
  let best: Kind | null = null, bestStart = -1;
  for (const p of parts) { const k = arrived(p, b); if (k > 0 && k < 1 && p.start > bestStart) { best = p.kind; bestStart = p.start; } }
  return best;
}
