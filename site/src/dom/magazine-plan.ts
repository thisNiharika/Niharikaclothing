// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The timing of the magazine's scroll: plain functions with no WebGL in them, so the page and the tests share them.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Screens of scroll on the cover before the first turn, per leaf, and after the last. */
export const U_COVER = 0.8, U_LEAF = 1.0, U_END = 0.9;

/**
 * How far leaf j has turned at u, 0 (lying on the right) to 1 (lying on the left), eased at both ends. `share` is the
 * part of the leaf's scroll the turn takes; the rest holds the spread open.
 */
export function leafTurn(u: number, j: number, share = 0.82) {
  const t = clamp((u - U_COVER - j * U_LEAF) / (U_LEAF * share), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The scroll the whole magazine takes for n garments: the cover, a leaf per garment, and the back cover's leaf. */
export function totalScreens(n: number) {
  return U_COVER + (n + 1) * U_LEAF + U_END;
}

/**
 * On a phone the camera shows one page at a time: it follows each leaf over to the left-hand page (the photograph),
 * then pans back to the right-hand page (the details) before the next leaf turns. Returns the page in view, +0.5 for
 * the right-hand page and -0.5 for the left. The phone's turns take half of each leaf's scroll (PHONE_SHARE).
 */
export const PHONE_SHARE = 0.5;
export function phonePage(u: number, n: number) {
  const s = u - U_COVER;
  if (s <= 0) return 0.5;
  const leaves = n + 1;
  const j = Math.min(leaves - 1, Math.floor(s / U_LEAF));
  const within = s - j * U_LEAF;
  const p = leafTurn(u, j, PHONE_SHARE);
  const t = clamp((within - 0.58) / 0.22, 0, 1);
  const pan = j < leaves - 1 ? t * t * (3 - 2 * t) : 0;
  return 0.5 - p + pan;
}
