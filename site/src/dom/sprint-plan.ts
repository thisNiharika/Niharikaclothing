// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Sprint's timing and its race: plain functions with no WebGL in them, so the page and the tests share them. The page
// opens on one piece of kit mid-stride over a running track; scrolling is the run, the rest of the range coming up from
// behind and overtaking one at a time; then the camera stands at the finish line and every piece crosses it while a
// slit camera builds the photo-finish print out of the single column of pixels on the line, as a real one does.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ramp = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The track: lanes along x, lane 0 nearest the viewer, LANE apart in depth. */
export const TRACK = { LANE: 1.25, SIZE: 2.0 };

/** Screens of scroll each act takes. `pass` is per runner. */
export const U = { rest: 0.45, pass: 0.42, hold: 0.35, finish: 2.2, print: 0.9 };

export function marks(n: number) {
  const run0 = U.rest;
  const finish0 = run0 + U.pass * Math.max(1, n - 1) + U.hold;
  const print0 = finish0 + U.finish;
  return { run0, finish0, print0, end: print0 + U.print };
}

export function totalScreens(n: number) {
  return marks(n).end;
}

/**
 * Where every part stands at u. `run` is the run's progress, `finish` the finish act's (the camera moves to the line,
 * then everyone crosses it), `slit` how far through the crossings the slit camera has written, `print` the print
 * filling the screen, and `pass(i)` how far runner i has come through its overtake.
 */
export function stages(u: number, n: number) {
  const m = marks(n);
  return {
    hero: 1 - ramp(m.run0 * 0.5, m.run0 + U.pass * 0.6, u),
    run: ramp(m.run0, m.finish0, u),
    speed: 0.35 + 0.65 * ramp(0, m.run0 + U.pass, u) + 0.25 * ramp(m.finish0, m.finish0 + U.finish * 0.3, u),
    toLine: ramp(m.finish0 - U.hold * 0.6, m.finish0 + U.finish * 0.18, u),
    slit: clamp((u - (m.finish0 + U.finish * 0.15)) / (U.finish * 0.8), 0, 1),
    print: ramp(m.print0 - U.finish * 0.05, m.print0 + U.print * 0.5, u),
    pass: (i: number) => (i === 0 ? 1 : ramp(m.run0 + U.pass * (i - 1), m.run0 + U.pass * i + U.pass * 0.35, u)),
  };
}

/**
 * Runner i's place along the track during the run, relative to the camera's run: each comes up from well behind,
 * draws level, and goes ahead of the one before, so the pack ends in order of overtaking, the last overtaker in front.
 * Returns x (world units, the camera centred near 0) and how fast it is moving relative to the pack (for the smear).
 * `run` is the run's progress, which only the first piece uses.
 */
export function runAt(i: number, n: number, pass: number, run: number) {
  const settled = 2.4 - (n - 1 - i) * 0.78 + (i === 0 ? -0.3 : 0);
  const behind = -9;
  // The hero's piece starts out in front, where the page opens on it, and drops back through the pack as it passes.
  const x = i === 0 ? 0.6 + (settled - 0.6) * run : behind + (settled - behind) * (1 - Math.pow(1 - pass, 2.2));
  const v = i === 0 ? 0 : (settled - behind) * 2.2 * Math.pow(1 - pass, 1.2) * (pass > 0 && pass < 1 ? 1 : 0);
  return { x, v };
}

/**
 * The finish: runner i crosses the line at slit time cross(i), the leader (the last overtaker) first. x is relative to
 * the line, positive past it; each runner covers SPEED world units for the whole of the slit's time.
 */
export const FINISH = { SPEED: 13, GAP: 0.075, FIRST: 0.24 };
export function crossAt(i: number, n: number) {
  return FINISH.FIRST + (n - 1 - i) * FINISH.GAP;
}
export function finishAt(i: number, n: number, slit: number) {
  return (slit - crossAt(i, n)) * FINISH.SPEED;
}
