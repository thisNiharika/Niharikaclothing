// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The timing of Unwrap's scroll and the palette it reads from each label: plain functions with no WebGL in them, so
// the page and the tests share them.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const U_INTRO = 1, U_CAN = 1.35, U_FIN = 1.5;

/** One can's turn at u: how far its label has peeled (0 wrapped, 1 flat), and how far its print has lifted away. */
export function turn(u: number, i: number, n: number) {
  const a = u - U_INTRO - i * U_CAN;
  const peel = smooth(0.08, 0.6, a / U_CAN);
  const away = smooth(0.9, 1.12, a / U_CAN);
  const fin = smooth(-0.1, 0.55, (u - U_INTRO - n * U_CAN) / U_FIN);
  return { peel, away, fin, show: peel * (1 - away) };
}

export function totalScreens(n: number) {
  return U_INTRO + n * U_CAN + U_FIN;
}

/** A label's palette: the colours that cover most of it, darkest first, by k-means over a small copy. */
export function palette(px: Uint8ClampedArray, k = 6): string[] {
  const pts: number[][] = [];
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]! > 200) pts.push([px[i]!, px[i + 1]!, px[i + 2]!]);
  if (!pts.length) return [];
  const lum = (c: number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  const sorted = [...pts].sort((x, y) => lum(x) - lum(y));
  let cs = Array.from({ length: k }, (_, j) => [...sorted[Math.floor(((j + 0.5) / k) * sorted.length)]!]);
  const count = new Array(k).fill(0);
  for (let it = 0; it < 10; it++) {
    const sum = cs.map(() => [0, 0, 0]);
    count.fill(0);
    for (const p of pts) {
      let b = 0, bd = Infinity;
      cs.forEach((c, j) => { const d = (p[0]! - c[0]!) ** 2 + (p[1]! - c[1]!) ** 2 + (p[2]! - c[2]!) ** 2; if (d < bd) { bd = d; b = j; } });
      sum[b]![0]! += p[0]!; sum[b]![1]! += p[1]!; sum[b]![2]! += p[2]!; count[b]++;
    }
    cs = cs.map((c, j) => (count[j] ? sum[j]!.map((v) => v / count[j]) : c));
  }
  const hex = (c: number[]) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  // Keep the colours that cover a real part of the label, and drop near duplicates.
  const out: number[][] = [];
  cs.map((c, j) => ({ c, n: count[j] as number })).filter((x) => x.n > pts.length * 0.03).sort((a, b) => lum(a.c) - lum(b.c)).forEach(({ c }) => {
    if (!out.some((o) => Math.hypot(o[0]! - c[0]!, o[1]! - c[1]!, o[2]! - c[2]!) < 28)) out.push(c);
  });
  return out.map(hex);
}

