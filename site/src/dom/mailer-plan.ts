// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The mailer's timing and its net: plain functions with no WebGL in them, so the page and the tests share them.
// A mailer box is cut from one flat sheet (its net): the base, a wall on each side, the lid beyond the back wall and a
// tuck flap beyond the lid. The page opens on that sheet lying printed side up, then the scroll folds it, flips it,
// opens it, lifts the packs out, lays them out, and finally lets the empty box fall flat again.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ramp = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The box in metres: 32 by 24 by 10 cm, with a 6 cm tuck flap on the lid, cut from 5 mm board. */
export const BOX = { w: 0.32, d: 0.24, h: 0.1, tuck: 0.06, board: 0.005 };

/** The flat sheet's extent, x across the box and z from the front wall's edge to the tuck's: a cross, longer in z. */
export function netSize(b = BOX) {
  return { x: b.w + 2 * b.h, z: b.h + b.d + b.h + b.d + b.tuck };
}

/** Screens of scroll each act takes, in order. The last pack's rise sets where the lay begins. */
export const U = { rest: 0.55, lift: 0.35, fold: 1.0, flip: 0.7, open: 0.9, rise: 0.32, riseEach: 0.55, lay: 1.0, hold: 0.7, unfold: 0.9, dive: 0.8 };

export function marks(n: number) {
  const fold0 = U.rest;
  const flip0 = fold0 + U.lift + U.fold;
  const open0 = flip0 + U.flip;
  const rise0 = open0 + U.open;
  const lay0 = rise0 + U.rise * Math.max(0, n - 1) + U.riseEach;
  const unfold0 = lay0 + U.lay + U.hold;
  const dive0 = unfold0 + U.unfold;
  return { fold0, flip0, open0, rise0, lay0, unfold0, dive0, end: dive0 + U.dive };
}

export function totalScreens(n: number) {
  return marks(n).end;
}

/**
 * Where every part of the sequence stands at u. Angles are fractions (0 flat, 1 folded); the scene turns them into
 * rotations. `lift` raises the sheet off the table so the walls can fold down under it; `flip` turns the folded box
 * over onto its base; `rise(i)` takes pack i out of the box to stand behind it; `lay` lays every pack on the table.
 */
export function stages(u: number, n: number) {
  const m = marks(n);
  const f = m.fold0 + U.lift;
  return {
    lift: ramp(m.fold0, f, u) * (1 - ramp(m.flip0 + U.flip * 0.45, m.flip0 + U.flip, u)),
    // The side walls first, then the front and back, then the lid curls over and the tuck goes in.
    sides: ramp(f, f + U.fold * 0.4, u),
    ends: ramp(f + U.fold * 0.25, f + U.fold * 0.65, u),
    lid: ramp(f + U.fold * 0.55, f + U.fold * 0.92, u),
    tuck: ramp(f + U.fold * 0.75, f + U.fold, u),
    flip: ramp(m.flip0, m.flip0 + U.flip, u),
    // Opening: the tuck comes out, the lid swings back past upright, the tissue parts.
    untuck: ramp(m.open0, m.open0 + U.open * 0.3, u),
    open: ramp(m.open0 + U.open * 0.15, m.open0 + U.open * 0.7, u),
    tissue: ramp(m.open0 + U.open * 0.55, m.open0 + U.open, u),
    rise: (i: number) => ramp(m.rise0 + i * U.rise, m.rise0 + i * U.rise + U.riseEach, u),
    lay: ramp(m.lay0, m.lay0 + U.lay, u),
    unfold: ramp(m.unfold0, m.unfold0 + U.unfold, u),
    dive: ramp(m.dive0, m.dive0 + U.dive, u),
  };
}

/**
 * The packs knolled on the table: in rows across a width, tallest first, centred. Sizes and the result are in the same
 * units; `at[i]` is the centre of pack i.
 */
export function knoll(sizes: { w: number; h: number }[], width: number, gap: number) {
  const order = sizes.map((s, i) => ({ ...s, i })).sort((a, b) => b.h - a.h);
  const rows: { items: typeof order; w: number; h: number }[] = [];
  for (const it of order) {
    const row = rows.at(-1);
    if (row && row.w + gap + it.w <= width) { row.items.push(it); row.w += gap + it.w; row.h = Math.max(row.h, it.h); }
    else rows.push({ items: [it], w: it.w, h: it.h });
  }
  const total = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
  const out: { x: number; y: number }[] = new Array(sizes.length);
  let y = -total / 2;
  for (const r of rows) {
    let x = -r.w / 2;
    for (const it of r.items) { out[it.i] = { x: x + it.w / 2, y: y + r.h / 2 }; x += it.w + gap; }
    y += r.h + gap;
  }
  return { at: out, height: total };
}

/**
 * Where a pack stands once it has come out: on the table behind the open box and its lid, facing the viewer, in the order they came
 * out from left to right, every other one a step further back so it shows in the gap between its neighbours. Metres,
 * table at y = 0 (the pack's foot), the box's front towards +z.
 */
export function lineAt(i: number, n: number, b = BOX) {
  const back = i % 2 === 1;
  // Clear of the open lid, which leans back from the box's back wall until its tuck rests on the table.
  // The line bows into an arch, the middle furthest back: seen from above the box, further back is higher on the
  // screen, so the middle packs rise clear of the lid instead of standing behind it.
  const lid = b.d / 2 + Math.sqrt((b.d + b.tuck) ** 2 - b.h ** 2);
  const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
  return { x: (i - (n - 1) / 2) * b.w * 0.27, y: 0, z: -(lid + (back ? 0.2 : 0.06) + 0.22 * (1 - f * f)) };
}
