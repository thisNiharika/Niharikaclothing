// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Ferro: a pool of ferrofluid with a drop rising out of it, ray marched in a shader (ferro-gl.ts). The drop grows
// spikes that lean towards the pointer and pulse with a beat (ferro-beat.ts), which the visitor can turn on to hear.
// The headline sits behind the liquid and is mirrored in it.
//
// One pinned scene, driven by one number `u` (screens scrolled through it):
//   0 to 1     the opening: the headline, the drop and the pool, the pointer pulling spikes out of it;
//   1 to 2     closer, as the beat takes hold (the first beat of copy);
//   2 to 3.4   the drop splits into three, each moving to one band of the beat: low, mid and high (the second beat);
//   3.4 to 5   they run back into the pool and the field lets go, leaving a still mirror under the closing line.
// The card recorder drives `u`, the pointer and the clock itself (window.__hoverDemo).

import { Beat, bands } from "./ferro-beat";
import { basis, createFerro, project, unproject, type Drop, type FerroFrame } from "./ferro-gl";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix3 = (a: number[], b: number[], t: number) => [lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t)];

/** Screens of scroll the scene takes. */
export const TOTAL = 5;

/** The scene's progress at u: into the closer look, into the split, and into the calm. */
export function phases(u: number) {
  return { near: smooth(0.55, 1.35, u), split: smooth(1.95, 2.65, u), calm: smooth(3.45, 4.3, u) };
}

type View = { wide: boolean };

/** The drops, the pool and the camera at u, before the pointer and the beat are added. */
export function stage(u: number, v: View) {
  const { near, split, calm } = phases(u);
  const shift = v.wide ? 1 : 0;
  // On a wide screen the copy takes the left from the closer look on, so the liquid moves right; it comes back to the
  // centre for the calm, under the closing line.
  const cx = lerp(lerp(0, 0.85 * shift, near), 0.75 * shift, split) * (1 - calm);
  const main = { x: cx, y: lerp(lerp(0.62, 0.58, near), 0.34, split), r: lerp(0.62, v.wide ? 0.38 : 0.27, split) };
  const gap = v.wide ? 1.3 : 0.7;
  const sr = v.wide ? 0.38 : 0.27;
  // The drops run back into the pool before the camera has come down to look along it.
  const sink = smooth(3.4, 3.95, u);
  const sinkY = lerp(main.y, -0.62, sink), sinkR = lerp(main.r, 0.45, sink);
  const drops = [0, -1, 1].map((side, i) => {
    const r = i === 0 ? main.r : lerp(0, sr, split);
    const x = main.x + side * gap * split * (1 - sink);
    return { x: lerp(x, 0, sink), y: lerp(i === 0 ? main.y : lerp(main.y, 0.34, split), sinkY, sink), z: 0, r: lerp(r, i === 0 ? sinkR : 0.0, sink) };
  });
  const far = v.wide ? 1 : 1.42;
  const lift = v.wide ? 0 : 0.42;
  const hero = { ro: [0, 1.25, 5.9 * far], target: [0, 0.82 + lift, 0] };
  const close = { ro: [0.25 * shift, 1.05, 5.1 * far], target: [0.42 * shift, 0.9 + lift, 0] };
  const wide = { ro: [0.35 * shift, 1.55, 7.3 * far], target: [0.7 * shift, 0.95 + lift, 0] };
  // The calm looks along the pool rather than down on it, where a black liquid is most a mirror.
  // Tilted a little down, so the far edge of the pool, and the mirror line, sit just under the closing words.
  const down = { ro: [0, 0.62, 3.9 * far], target: [0, v.wide ? 0.3 : 0.05, 0] };
  let ro = mix3(hero.ro, close.ro, near), target = mix3(hero.target, close.target, near);
  ro = mix3(ro, wide.ro, split); target = mix3(target, wide.target, split);
  ro = mix3(ro, down.ro, calm); target = mix3(target, down.target, calm);
  const pool = { x: cx, r: lerp(lerp(1.3, v.wide ? 2.15 : 1.7, split), 9, calm * calm), top: 0.035, spacing: 0.3 };
  const blend = lerp(0.34, 0.2, split);
  // The pool's own spikes belong to the single drop: apart, or sinking, the pool lies smooth between them.
  const poolSpikes = (1 - split) * (1 - sink);
  return { near, split, calm, drops, pool, blend, poolSpikes, ro: ro as [number, number, number], target: target as [number, number, number] };
}

export function initFerro() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-ferro]")].entries()) setup(root, n === 0);
}

/** A headline drawn into a canvas glyph by glyph where the page set it, so the shader can mirror exactly that. */
function paintWord(el: HTMLElement): HTMLCanvasElement | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const k = 2;
  const c = document.createElement("canvas");
  c.width = Math.ceil(r.width * k);
  c.height = Math.ceil(r.height * k);
  const x = c.getContext("2d");
  if (!x) return null;
  x.scale(k, k);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const cs = getComputedStyle(node.parentElement!);
    x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    x.fillStyle = cs.color;
    x.textBaseline = "alphabetic";
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      if (!text[i]!.trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const g = range.getBoundingClientRect();
      const m = x.measureText(text[i]!);
      const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
      x.fillText(text[i]!, g.left - r.left, g.top - r.top + asc);
    }
  }
  return c;
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".ferro-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".ferro-gl")!;
  const intro = root.querySelector<HTMLElement>(".ferro-intro");
  const word = root.querySelector<HTMLElement>(".ferro-word");
  const hint = root.querySelector<HTMLElement>(".ferro-hint");
  const beatsEl = [...root.querySelectorAll<HTMLElement>(".ferro-beat")];
  const bandEls = [...root.querySelectorAll<HTMLElement>(".ferro-bands li")];
  const finale = root.querySelector<HTMLElement>(".ferro-finale");
  const finWord = finale?.querySelector<HTMLElement>("h2") ?? null;
  const soundBtn = root.querySelector<HTMLButtonElement>(".ferro-sound");
  const eq = [...root.querySelectorAll<HTMLElement>(".ferro-eq i")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  root.style.setProperty("--ferro-screens", String(TOTAL + 1));

  if (hint && matchMedia("(hover: none)").matches) {
    const span = hint.querySelector("span");
    if (span && hint.dataset.touch) span.textContent = hint.dataset.touch;
  }

  const css = getComputedStyle(document.documentElement);
  const color = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
  let gl: ReturnType<typeof createFerro> | null = null;
  try { gl = createFerro(canvas, { bg: color("--c-bg", "#ecebe6"), ink: color("--c-text", "#141518") }); } catch (e) { console.warn("Ferro: no WebGL2", e); }
  if (!gl) root.classList.add("is-flat");

  const beat = new Beat();
  if (soundBtn && Beat.available()) {
    soundBtn.hidden = false;
    const label = soundBtn.querySelector<HTMLElement>(".ferro-sound-label");
    const show = () => {
      soundBtn.setAttribute("aria-pressed", String(beat.playing));
      if (label) label.textContent = (beat.playing ? soundBtn.dataset.off : soundBtn.dataset.on) ?? "";
    };
    soundBtn.addEventListener("click", async () => {
      if (beat.playing) beat.off(); else await beat.on().catch(() => undefined);
      show();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden && beat.playing) { beat.off(); show(); } });
    new IntersectionObserver(([e]) => { if (!e?.isIntersecting && beat.playing) { beat.off(); show(); } }).observe(root);
  }

  // The words the liquid mirrors: redrawn when the layout or the fonts change, placed every frame.
  const rectOf = (el: HTMLElement | null) => {
    if (!el) return [0, 0, 0, 0];
    const r = el.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    return [(r.left - c.left) / c.width, 1 - (r.bottom - c.top) / c.height, (r.right - c.left) / c.width, 1 - (r.top - c.top) / c.height];
  };
  const repaint = () => {
    if (!gl) return;
    gl.word(0, word ? paintWord(word) : null, rectOf(word));
    gl.word(1, finWord ? paintWord(finWord) : null, rectOf(finWord));
  };

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * TOTAL;
  };
  const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, k: 0 };
  let uNow = progress(), clock = 0, raf = 0, last = 0, demoing = false;

  /** Everything drawn at u for a pointer at (px, py) (fractions of the screen) and the beat's clock t. */
  const apply = (u: number, px: number, py: number, pk: number, t: number, amt: number, soft = 1) => {
    const wide = innerWidth / innerHeight > 1.05;
    const s = stage(u, { wide });
    const f: FerroFrame = { ro: s.ro, target: s.target, fovY: 30, drops: [], pool: { ...s.pool, h: 0 }, blend: s.blend, ptr: { x: 0, y: 0, z: 0, k: 0 }, words: { k0: 0, k1: 0 } };
    const aspect = innerWidth / Math.max(1, innerHeight);
    // The pointer, carried onto a plane just in front of the liquid.
    const pw = unproject(basis({ ro: s.ro, target: s.target, fovY: 30 }, aspect), px, py, 0.6);
    const live = 1 - s.calm;
    const band = bands(t, soft);
    const beatK = amt * lerp(0.4, 1, s.near) * live;
    const drops: Drop[] = s.drops.map((d, i) => {
      const dx = pw[0]! - d.x, dy = pw[1]! - d.y;
      const prox = Math.exp(-(dx * dx + dy * dy) / 0.9) * pk;
      // One drop moves to the kick and the bass. Split, the left drop keeps the low band, the centre takes the mid and
      // the right the highs, so the three read left to right as the labels do.
      const own = i === 0 ? lerp(band.low, band.mid, s.split) : i === 1 ? band.low : band.high;
      const pulse = i === 0 ? lerp(band.low * 0.34 + band.mid * 0.05, band.mid * 0.3, s.split) : i === 1 ? band.low * 0.34 : band.high * 0.24;
      // Left alone the field is weak, and the drop is nearly smooth: only the beat and the pointer raise spikes.
      const rest = 0.012 + 0.006 * Math.sin(t * 1.4 + i);
      return {
        x: d.x + clamp(dx, -1, 1) * 0.1 * prox * live,
        y: d.y + clamp(dy, -1, 1) * 0.07 * prox * live,
        z: d.z,
        r: d.r * (1 + own * 0.03 * beatK),
        h: (rest + pulse * beatK * 0.9 + 0.05 * prox) * live,
        lean: 0.42 * prox * live,
      };
    });
    f.drops = s.split > 0.002 || s.calm > 0.002 ? drops : drops.slice(0, 1);
    f.pool.h = 0.07 * band.low * beatK * live * s.poolSpikes;
    f.ptr = { x: pw[0]!, y: pw[1]!, z: pw[2]!, k: pk * live };
    const introK = 1 - smooth(0.45, 0.95, u);
    const finK = smooth(3.65, 4.2, u);
    f.words = { k0: introK, k1: finK };
    if (gl) {
      gl.word(0, null, rectOf(word));
      gl.word(1, null, rectOf(finWord));
      const b = gl.draw(f);
      // The band labels stand under the three drops while they are apart.
      bandEls.forEach((el, k) => {
        const d = f.drops[[1, 0, 2][k]!];
        const vis = s.split * (1 - smooth(3.3, 3.7, u));
        // Below the pool's front edge, on the page's ground, where a label can be read.
        const p = d ? project(b, [d.x, 0, f.pool.r * 0.92]) : null;
        el.style.opacity = p ? vis.toFixed(3) : "0";
        if (p) el.style.transform = `translate(${(p.x * 100).toFixed(2)}vw, calc(${(p.y * 100).toFixed(2)}svh + 18px)) translate(-50%, 0)`;
        const bar = el.querySelector<HTMLElement>("i");
        if (bar) bar.style.transform = `scaleX(${(0.25 + 0.75 * [band.low, band.mid, band.high][k]! * amt).toFixed(3)})`;
      });
    }
    eq.forEach((el, k) => { el.style.transform = `scaleY(${(0.3 + 0.7 * [band.low, band.mid, band.high][k]! * (beat.playing ? 1 : 0.35)).toFixed(3)})`; });
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.transform = `translateY(${((1 - introK) * -40).toFixed(1)}px)`; }
    if (hint) hint.style.opacity = (introK * (1 - pk * 0.6)).toFixed(3);
    beatsEl.forEach((el, k) => {
      const [a, z] = k === 0 ? [1.05, 2.05] : [2.55, 3.45];
      const o = smooth(a, a + 0.3, u) * (1 - smooth(z - 0.3, z, u));
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - o) * 24).toFixed(1)}px)`;
    });
    if (finale) {
      finale.style.opacity = finK.toFixed(3);
      finale.style.transform = `translateY(${((1 - finK) * 30).toFixed(1)}px)`;
      finale.style.pointerEvents = finK > 0.8 ? "auto" : "none";
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const still = reduced.matches;
    uNow += (progress() - uNow) * (still ? 1 : 1 - Math.exp(-dt / 0.12));
    const kp = 1 - Math.exp(-dt / 0.18);
    ptr.x += (ptr.tx - ptr.x) * kp;
    ptr.y += (ptr.ty - ptr.y) * kp;
    ptr.k += ((still ? 0 : ptr.on) - ptr.k) * (1 - Math.exp(-dt / 0.35));
    if (!still) clock += dt;
    const heard = beat.clock();
    apply(uNow, ptr.x, ptr.y, ptr.k, heard ?? clock, still ? 0 : heard !== null ? 1 : 0.4);
    gl?.adapt(dt);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  const point = (e: PointerEvent) => {
    const r = pin.getBoundingClientRect();
    ptr.tx = (e.clientX - r.left) / Math.max(1, r.width);
    ptr.ty = (e.clientY - r.top) / Math.max(1, r.height);
  };
  addEventListener("pointermove", (e) => { point(e); ptr.on = e.pointerType === "mouse" || e.buttons ? 1 : 0; }, { passive: true });
  addEventListener("pointerdown", (e) => { point(e); ptr.on = 1; }, { passive: true });
  addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") ptr.on = 0; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.on = 0; });
  addEventListener("resize", () => { gl?.resize(); repaint(); apply(uNow, ptr.x, ptr.y, ptr.k, clock, 0.4); });

  apply(uNow, 0.5, 0.5, 0, 0, 0.4);
  const ready = () => { repaint(); apply(uNow, ptr.x, ptr.y, ptr.k, clock, 0.4); document.body.classList.add("canvas-ready"); };
  if (document.fonts?.ready) document.fonts.ready.then(ready, ready); else ready();

  // ------------------------------------------------------------------------------------------------ card recording
  // The pointer comes in and draws the spikes out of the drop, circles it while the beat pulses, and the page scrolls
  // through the closer look, the split into three bands and the calm.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const keys: [number, number][] = [[0, 0], [4.4, 0], [5.8, 1.55], [7.6, 1.55], [9.0, 3.0], [11.2, 3.0], [12.8, 4.75], [14.6, 4.75]];
    const uAt = (t: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [ta, ua] = keys[k - 1]!, [tb, ub] = keys[k]!;
        if (t <= tb) return lerp(ua, ub, smoother((t - ta) / (tb - ta)));
      }
      return keys.at(-1)![1];
    };
    let cursor: SVGSVGElement | null = null;
    const demo = (t: number) => {
      demoing = true;
      stop();
      gl?.lock(Math.min(1.25, devicePixelRatio || 1));
      if (!cursor) {
        cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        cursor.id = "rec-cursor";
        cursor.setAttribute("viewBox", "0 0 22 30");
        cursor.innerHTML = '<path d="M2 2l16 13.5-7 .8 4.2 8.6-3.4 1.6-4.2-8.7L2 22.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>';
        document.body.appendChild(cursor);
        document.body.classList.add("rec-hover");
      }
      const u = uAt(t);
      const wide = innerWidth / innerHeight > 1.05;
      const s = stage(u, { wide });
      // Aim at the drop on screen, so the path follows it wherever the camera has moved.
      const b = basis({ ro: s.ro, target: s.target, fovY: 30 }, innerWidth / Math.max(1, innerHeight));
      const d0 = project(b, [s.drops[0]!.x, s.drops[0]!.y, 0]) ?? { x: 0.5, y: 0.6 };
      const right = project(b, [s.drops[2]!.x, s.drops[2]!.y, 0]) ?? d0;
      const orbit = (a: number, rx: number, ry: number) => ({ x: d0.x + Math.cos(a) * rx, y: d0.y - 0.02 + Math.sin(a) * ry });
      type P = { x: number; y: number };
      const seg = (a: P, c: P, ta: number, tb: number) => { const k = smoother((t - ta) / (tb - ta)); return { x: lerp(a.x, c.x, k), y: lerp(a.y, c.y, k) }; };
      let w: P;
      const enter = { x: 0.98, y: 0.3 };
      if (t < 1.6) w = seg(enter, orbit(-0.6, 0.13, 0.17), 0.2, 1.5);
      else if (t < 4.4) w = orbit(-0.6 - (t - 1.6) * 1.15, wide ? 0.11 : 0.2, 0.16);
      else if (t < 8.8) w = seg(orbit(-0.6 - 2.8 * 1.15, wide ? 0.11 : 0.2, 0.16), { x: 0.92, y: 0.82 }, 4.4, 5.4);
      else if (t < 11.2) w = seg({ x: 0.92, y: 0.82 }, { x: right.x + 0.03, y: right.y - 0.1 }, 9.2, 10.2);
      else w = seg({ x: right.x + 0.03, y: right.y - 0.1 }, { x: 0.94, y: 0.9 }, 11.4, 12.4);
      cursor.style.transform = `translate(${(w.x * innerWidth).toFixed(1)}px, ${(w.y * innerHeight).toFixed(1)}px)`;
      const pk = t < 0.4 ? 0 : t < 4.6 ? 1 : t < 5.4 ? 1 - smooth(4.6, 5.4, t) : t < 9.4 ? 0 : t < 11.4 ? smooth(9.4, 10.0, t) : 1 - smooth(11.4, 12.2, t);
      apply(u, w.x, w.y, pk, t, 0.95, 1.7);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

