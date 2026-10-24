// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The rail's timing, as plain functions with no DOM in them, so the page and the tests agree. A `wear` section pins for
// a number of screens; the rail position p runs from 0 (the first jacket on him) to n - 1 (the last), one jacket per
// `perItem` screens, with a short lead before it moves and a tail after the last one lands. Each jacket is drawn twice:
// the worn photograph crossfades in over the base as the jacket lands (that is what he wears, pixel for pixel), and the
// cut-out of the jacket alone is the ghost that slides along the rail and fades as it leaves the body.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A smooth step from 0 at a to 1 at b. */
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Screens of scroll: before the rail moves, per jacket, and after the last one has landed. */
export const WEAR = { lead: 0.3, perItem: 0.64, tail: 0.55, spacing: 1.08 };

/** How many screens the section scrolls through beyond the one it pins, for n jackets. */
export function totalScreens(n: number) {
  return WEAR.lead + WEAR.perItem * Math.max(0, n - 1) + WEAR.tail;
}

/** The rail position for u screens scrolled into the section: 0 to n - 1, clamped. */
export function railAt(u: number, n: number) {
  return clamp((u - WEAR.lead) / WEAR.perItem, 0, Math.max(0, n - 1));
}

/** The screens scrolled at which jacket i sits on him, so a press can scroll there. */
export function screensFor(i: number) {
  return WEAR.lead + WEAR.perItem * i;
}

/**
 * What jacket i looks like when the rail is at p, from d = i - p (negative: it has gone to the left).
 * `worn` is the worn photograph's opacity (full within 0.12 of landing, gone by 0.42), `ghost` the cut-out's
 * (0 on him, up to full as it leaves, then down to a faint neighbour and away past the edge), `x` the ghost's place in
 * jacket widths, and `scale` a settle: the ghost arrives a touch large and sits down as it lands.
 */
export function layerAt(d: number) {
  const a = Math.abs(d);
  const worn = 1 - smooth(0.12, 0.42, a);
  const ghost = smooth(0.08, 0.3, a) * (1 - 0.55 * smooth(0.3, 0.7, a)) * (1 - 0.5 * smooth(1.3, 1.9, a)) * (1 - smooth(2.1, 2.7, a));
  // The snap: a jacket is small out on the rail and grows as it comes in from the right, lands a touch large and sits
  // down to its size; leaving to the left it shrinks the same way. The worn photograph takes the same settle, so the
  // landing reads as one thing arriving rather than a swap.
  const bump = smooth(0, 0.2, a) * (1 - smooth(0.2, 0.46, a));
  const far = (1 - 0.3 * smooth(0.05, 1.15, a)) * (1 - 0.16 * smooth(1.15, 2.4, a));
  return { worn, ghost, x: d * WEAR.spacing, scale: far + 0.06 * bump, wornScale: 1 + 0.035 * bump };
}

/** The giant word for jacket i when the rail is at p: how much of it shows and how far it has slid, in vw. */
export function wordAt(d: number) {
  const a = Math.abs(d);
  return { show: 1 - smooth(0.32, 0.62, a), x: clamp(d, -1.4, 1.4) * 16 };
}

/** An ease that overshoots its end a little and comes back: the snap, for the card's rail. */
export function backOut(x: number) {
  const t = clamp(x, 0, 1) - 1, s = 1.35;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/** The jacket nearest the rail position, and how firmly it is on him (1 on him, 0 halfway to the next). */
export function nearest(p: number) {
  const i = Math.round(p);
  return { i, hold: 1 - clamp(Math.abs(p - i) / 0.5, 0, 1) };
}

/** The ground's tint: the two jackets the rail is between and how far from the first to the second. */
export function tintAt(p: number, n: number) {
  const i0 = clamp(Math.floor(p), 0, n - 1), i1 = clamp(i0 + 1, 0, n - 1);
  return { i0, i1, t: clamp(p - i0, 0, 1) };
}

/** The card: the rail position by time, dwelling on each jacket, for the recorder that films by the clock. */
export function demoRailAt(time: number, n: number) {
  const dwell = 1.5, move = 0.9;
  const per = dwell + move;
  const k = clamp(Math.floor(time / per), 0, Math.max(0, n - 1));
  const within = time - k * per;
  if (k >= n - 1) return n - 1;
  return k + (within <= dwell ? 0 : backOut((within - dwell) / move));
}

/** How long the card runs for n jackets: every jacket shown, then a hold on the last. */
export function demoSeconds(n: number) {
  return (1.5 + 0.9) * Math.max(0, n - 1) + 2.6;
}
