// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Storm: a snack brand's pieces (crisps) tumbling in 3D on a vortex round its bags. Every cut-out, piece or bag, is
// made solid: its silhouette is inflated like a cushion (a membrane solved over the picture's alpha), so a bag is a
// pillow of foil with its print on the front and its label on the back, and a chilli is round. Pieces away from the
// plane of focus are drawn from a soft copy of the same picture, so the storm has depth of field without a blur pass.
//
// One pinned scene, driven by one number `u` (screens scrolled through it). It opens on the first bag with a few
// pieces round it beside the headline; scrolling builds the storm. Each flavour's chapter turns the ground and the type
// to the bag's colours, slides a giant cropped word in behind the storm, drops the bag in, brings that flavour's own
// ingredients into the storm, and turns the bag round to its back label while the copy reads it out. At the end the
// storm calms and every bag fans out in a row. The pointer pushes the pieces near it aside. A click on a bag (or Look
// closer) brings it forward beside a panel with its label and its button; a click or a drag turns it round. The storm
// keeps turning on its own, as a storm does; everything else moves only with the scroll and the pointer, and the card
// recorder drives `u`, the pointer, the close look and the clock itself (window.__hoverDemo).

import * as THREE from "three";
import { inflate, type Shape } from "./solid";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

const U_INTRO = 1;
const U_FL = 1.4;
const U_FIN = 1.3;
// The soft copy of a piece is drawn smaller with a margin for the blur to spread into (220 inside 256).
const SOFT_SCALE = 256 / 220;
// How many crisps keep the first bag company before the storm builds.
const HERO_CRISPS = 12;
// The bag's turn: a spring that overshoots a little and settles, as a thing with weight does.
const SPIN_W = 9, SPIN_Z = 0.62;

type Piece = { src: string; soft: string };
type Pal = { ground: THREE.Color; ink: THREE.Color; accent: THREE.Color };
type Look = { k: number; bag: number; ry: number };
type Info = { k: string; name: string; line: string; ing: string; facts: string[]; made: string; cta: string; href: string; back: boolean };

// Where the scroll is: the chapter position, how much of the opening is left, how far into the end.
const phase = (u: number, n: number) => {
  const cp = (u - U_INTRO) / U_FL;
  return { cp, introK: 1 - smooth(-0.5, -0.05, cp), finK: smooth(n - 0.05, n + 0.4, cp) };
};
// The storm turns slower round the opening bag and calms at the end; the clock that drives it runs at this pace.
const paceAt = (u: number, n: number) => { const p = phase(u, n); return lerp(0.45, 1, 1 - p.introK) * (1 - 0.65 * p.finK); };
const springAt = (tau: number) => {
  if (tau <= 0) return 0;
  const wd = SPIN_W * Math.sqrt(1 - SPIN_Z * SPIN_Z);
  return 1 - Math.exp(-SPIN_Z * SPIN_W * tau) * (Math.cos(wd * tau) + ((SPIN_Z * SPIN_W) / wd) * Math.sin(wd * tau));
};

export function initStorm() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-storm]")].entries()) setup(root, n === 0);
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".storm-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".storm-gl")!;
  const intro = root.querySelector<HTMLElement>(".storm-intro");
  const finale = root.querySelector<HTMLElement>(".storm-finale");
  const panel = root.querySelector<HTMLElement>(".storm-look");
  const words = [...root.querySelectorAll<HTMLElement>(".storm-word [data-w]")];
  const articles = [...root.querySelectorAll<HTMLElement>(".storm-fl")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const n = articles.length;
  const total = U_INTRO + n * U_FL + U_FIN;
  root.style.setProperty("--storm-screens", String(total + 1));

  const pal = (el: HTMLElement): Pal => ({ ground: new THREE.Color(el.dataset.ground), ink: new THREE.Color(el.dataset.ink), accent: new THREE.Color(el.dataset.accent) });
  const heroPal = pal(pin);
  const pals = [heroPal, ...articles.map(pal), heroPal];
  const parse = <T,>(v: string | undefined, fb: T): T => { try { return v ? (JSON.parse(v) as T) : fb; } catch { return fb; } };
  const data = {
    crisps: parse<Piece[]>(pin.dataset.pieces, []),
    extras: parse<{ name: string; bag: string }[]>(pin.dataset.extras, []),
    flavours: articles.map((a) => ({ bag: a.dataset.bag ?? "", back: a.dataset.back ?? "", pieces: parse<Piece[]>(a.dataset.pieces, []) })),
  };

  // What the close look says about each bag: the chapter's own copy, and a name and a button for the extra bags.
  const txt = (el: Element, sel: string) => el.querySelector(sel)?.textContent?.trim() ?? "";
  const finaleCta = finale?.querySelector<HTMLAnchorElement>(".btn");
  const info: Info[] = [
    ...articles.map((a, i) => ({
      k: `${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`, name: txt(a, ".pb-name"), line: txt(a, ".pb-line"), ing: txt(a, ".pb-ing"),
      facts: [...a.querySelectorAll(".pb-facts li")].map((li) => li.textContent?.trim() ?? ""), made: txt(a, ".pb-made"),
      cta: txt(a, ".pb-cta"), href: a.querySelector<HTMLAnchorElement>(".pb-cta")?.getAttribute("href") ?? "#", back: Boolean(a.dataset.back),
    })),
    ...data.extras.map((x) => ({ k: "Also in the box", name: x.name, line: "", ing: "", facts: [], made: "", cta: `${pin.dataset.verb ?? "Order"} ${x.name}`, href: finaleCta?.getAttribute("href") ?? "#", back: false })),
  ];

  let gl: ReturnType<typeof createScene> | null = null;
  try { gl = createScene(canvas, data); } catch (e) { console.warn("Storm: no WebGL", e); }
  if (!gl) root.classList.add("is-flat");

  // The close look: k opens it, bag is which bag, spin is the bag's turn (a spring towards goal).
  const L = { target: 0, k: 0, bag: -1, spin: { x: 0, v: 0 }, goal: 0 };
  let ptrK = 0;

  const cur = { ground: new THREE.Color(), ink: new THREE.Color(), accent: new THREE.Color() };
  const apply = (u: number, px: number, py: number, t: number) => {
    const { cp, introK, finK } = phase(u, n);
    const lk = L.bag >= 0 ? L.k : 0;
    // Colours: from the opening's, through each bag's, back to the opening's for the row.
    cur.ground.copy(pals[0]!.ground); cur.ink.copy(pals[0]!.ink); cur.accent.copy(pals[0]!.accent);
    for (let j = 0; j <= n; j++) {
      const w = smooth(j - 0.2, j + 0.1, cp);
      if (w <= 0) break;
      const p = pals[j + 1]!;
      cur.ground.lerp(p.ground, w); cur.ink.lerp(p.ink, w); cur.accent.lerp(p.accent, w);
    }
    pin.style.setProperty("--ground", `#${cur.ground.getHexString()}`);
    pin.style.setProperty("--ink", `#${cur.ink.getHexString()}`);
    pin.style.setProperty("--accent", `#${cur.accent.getHexString()}`);
    // The giant words: the opening's, each flavour's in its chapter, the row's; each slides as its chapter plays.
    const win = (k: number) => smooth(k - 0.2, k + 0.1, cp) * (1 - smooth(k + 0.8, k + 1.1, cp));
    words.forEach((w, k) => {
      const weight = k === 0 ? introK : k === words.length - 1 ? finK : win(k - 1);
      const local = k === 0 ? cp + 1 : k === words.length - 1 ? cp - n : cp - (k - 1);
      w.style.opacity = (weight * (1 - 0.55 * lk)).toFixed(3);
      w.style.transform = `translate3d(${((0.5 - clamp(local, -0.3, 1.3)) * 14).toFixed(2)}vw, 0, 0)`;
    });
    gl?.draw({ cp, u, introK, finK, px, py, pk: ptrK, t, look: { k: lk, bag: L.bag, ry: L.spin.x } });
    const calm = 1 - lk;
    if (intro) { intro.style.opacity = String(smooth(0.3, 0.9, introK) * calm); intro.style.transform = `translateY(${((1 - introK) * -36).toFixed(1)}px)`; }
    articles.forEach((a, i) => {
      const d = cp - i;
      const show = (lo: number, hi: number) => smooth(lo, lo + 0.07, d) * (1 - smooth(hi - 0.07, hi, d));
      const beats = [show(0.12, 0.48), show(0.52, 0.92)];
      a.style.visibility = beats.some((b) => b > 0.001) ? "visible" : "hidden";
      a.querySelectorAll<HTMLElement>(".pb").forEach((el, k) => {
        const b = (beats[k] ?? 0) * calm;
        el.style.opacity = b.toFixed(3);
        el.style.transform = `translateY(${((1 - b) * 22).toFixed(1)}px)`;
        // A beat's buttons take clicks only while it can be read.
        const acts = el.querySelector<HTMLElement>(".pb-acts");
        if (acts) acts.style.visibility = b > 0.6 ? "visible" : "hidden";
      });
    });
    if (finale) { finale.style.opacity = String(smooth(0.45, 1, finK) * calm); finale.style.transform = `translateY(${((1 - finK) * 30).toFixed(1)}px)`; finale.style.pointerEvents = finK > 0.8 && lk < 0.5 ? "auto" : "none"; }
    if (panel) panel.style.setProperty("--lk", lk.toFixed(3));
  };

  // ------------------------------------------------------------------------------------------------ the close look
  const sl = panel && {
    k: panel.querySelector<HTMLElement>(".sl-k")!, name: panel.querySelector<HTMLElement>(".sl-name")!, line: panel.querySelector<HTMLElement>(".sl-line")!,
    ing: panel.querySelector<HTMLElement>(".sl-ing")!, facts: panel.querySelector<HTMLElement>(".sl-facts")!, made: panel.querySelector<HTMLElement>(".sl-made")!,
    cta: panel.querySelector<HTMLAnchorElement>(".sl-cta")!, turn: panel.querySelector<HTMLButtonElement>(".sl-turn")!, close: panel.querySelector<HTMLButtonElement>(".sl-close")!,
    hint: panel.querySelector<HTMLElement>(".sl-hint"),
  };
  const fill = (j: number) => {
    const f = info[j];
    if (!sl || !f) return;
    const put = (el: HTMLElement, v: string) => { el.textContent = v; el.hidden = !v; };
    put(sl.k, f.k); put(sl.name, f.name); put(sl.line, f.line); put(sl.ing, f.ing); put(sl.made, f.made);
    sl.facts.replaceChildren(...f.facts.map((x) => Object.assign(document.createElement("li"), { textContent: x })));
    sl.facts.hidden = !f.facts.length;
    sl.cta.textContent = f.cta; sl.cta.setAttribute("href", f.href);
    sl.turn.hidden = !f.back;
    if (sl.hint) sl.hint.hidden = !f.back;
    panel!.setAttribute("aria-label", f.name);
  };
  let back: HTMLElement | null = null;
  const openLook = (j: number) => {
    if (!gl || !panel || j < 0 || j >= info.length) return;
    const r = gl.ry(j);
    L.bag = j; L.target = 1;
    L.spin.x = Math.round(r / Math.PI) * Math.PI; L.spin.v = 0; L.goal = L.spin.x;
    fill(j);
    panel.hidden = false;
    root.classList.add("is-looking");
    back = document.activeElement as HTMLElement | null;
    sl?.close.focus({ preventScroll: true });
    run();
  };
  const closeLook = () => {
    if (L.target === 0) return;
    L.target = 0;
    root.classList.remove("is-looking");
    back?.focus?.({ preventScroll: true });
  };
  const turn = (dir = 1) => { if (info[L.bag]?.back) L.goal += Math.PI * dir; };
  sl?.close.addEventListener("click", closeLook);
  sl?.turn.addEventListener("click", () => turn(1));
  sl?.cta.addEventListener("click", closeLook);
  root.querySelectorAll<HTMLButtonElement>(".pb-look").forEach((b) => b.addEventListener("click", () => openLook(Number(b.dataset.look))));
  // While a bag is open the page holds still: the wheel, a swipe and the paging keys do nothing, except inside the
  // panel when it is tall enough to scroll (on a phone), where overscroll-behavior keeps the page out of it.
  const hold = (e: Event) => {
    if (L.target === 0) return;
    if (panel?.contains(e.target as Node) && panel.scrollHeight > panel.clientHeight + 1) return;
    e.preventDefault();
  };
  addEventListener("wheel", hold, { passive: false });
  addEventListener("touchmove", hold, { passive: false });
  addEventListener("keydown", (e) => {
    if (L.target === 0) return;
    if (e.key === "Escape") { e.preventDefault(); closeLook(); return; }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); turn(e.key === "ArrowLeft" ? -1 : 1); return; }
    const onControl = (e.target as HTMLElement | null)?.closest?.("button, a, input, textarea, select");
    if (!onControl && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) e.preventDefault();
  });

  // A click on a bag opens it; on the open bag, a click turns it and a drag turns it by hand; anywhere else closes.
  let down: { x: number; j: number; spin0: number; moved: boolean } | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!gl) return;
    const j = gl.pick(e.clientX, e.clientY);
    down = { x: e.clientX, j, spin0: L.spin.x, moved: false };
    if (L.target > 0 && j === L.bag) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!down || L.target === 0 || down.j !== L.bag || !info[L.bag]?.back) return;
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 6) down.moved = true;
    if (down.moved) { L.spin.x = down.spin0 + dx * 0.012; L.spin.v = 0; L.goal = L.spin.x; }
  });
  canvas.addEventListener("pointerup", () => {
    const d = down;
    down = null;
    if (!d) return;
    if (d.moved) { L.goal = Math.round(L.spin.x / Math.PI) * Math.PI; return; }
    if (L.target > 0) { if (d.j === L.bag) turn(1); else closeLook(); }
    else if (d.j >= 0) openLook(d.j);
  });
  canvas.addEventListener("pointercancel", () => { down = null; });

  // ------------------------------------------------------------------------------------------------------- the loop
  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  let uNow = progress();
  const ptr = { x: 0, y: 0, tx: 0, ty: 0, on: 0 };
  let raf = 0, last = 0, demoing = false, clock = 0, hoverAsk = false, hx = 0, hy = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const still = reduced.matches;
    const k = still ? 1 : 1 - Math.exp(-dt / 0.11);
    uNow += (progress() - uNow) * k;
    if (!still) { const kp = 1 - Math.exp(-dt / 0.25); ptr.x += (ptr.tx - ptr.x) * kp; ptr.y += (ptr.ty - ptr.y) * kp; }
    ptrK = still ? 0 : ptrK + (ptr.on - ptrK) * (1 - Math.exp(-dt / 0.3));
    L.k = still ? L.target : L.k + (L.target - L.k) * (1 - Math.exp(-dt / 0.13));
    if (still) { L.spin.x = L.goal; L.spin.v = 0; }
    else {
      const steps = Math.ceil(dt * 240), h = dt / steps;
      for (let i = 0; i < steps; i++) { L.spin.v += (SPIN_W * SPIN_W * (L.goal - L.spin.x) - 2 * SPIN_Z * SPIN_W * L.spin.v) * h; L.spin.x += L.spin.v * h; }
    }
    if (L.target === 0 && L.k < 0.002) { L.k = 0; L.bag = -1; if (panel) panel.hidden = true; }
    if (!still) clock += dt * paceAt(uNow, n);
    apply(uNow, ptr.x, ptr.y, clock);
    if (hoverAsk && gl) {
      hoverAsk = false;
      const j = gl.pick(hx, hy);
      canvas.style.cursor = j < 0 ? "" : L.target > 0 && j === L.bag ? (info[j]?.back ? "grab" : "") : "pointer";
    }
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  addEventListener("pointermove", (e) => {
    ptr.tx = (e.clientX / innerWidth) * 2 - 1; ptr.ty = (e.clientY / innerHeight) * 2 - 1;
    // The pieces make way for a mouse, and for a finger only while it is down.
    ptr.on = e.pointerType === "mouse" || e.buttons ? 1 : 0;
    hoverAsk = true; hx = e.clientX; hy = e.clientY;
  }, { passive: true });
  addEventListener("pointerdown", (e) => { ptr.tx = (e.clientX / innerWidth) * 2 - 1; ptr.ty = (e.clientY / innerHeight) * 2 - 1; ptr.on = 1; }, { passive: true });
  addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") ptr.on = 0; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.on = 0; });
  addEventListener("resize", () => { gl?.resize(); apply(uNow, ptr.x, ptr.y, clock); });
  apply(uNow, 0, 0, 0);
  if (gl) gl.loaded.then(() => { apply(uNow, ptr.x, ptr.y, clock); document.body.classList.add("canvas-ready"); });
  else document.body.classList.add("canvas-ready");

  // ------------------------------------------------------------------------------------------------ card recording
  // The pointer sweeps through the crisps round the first bag, the page scrolls into its chapter, a click opens the
  // bag, a second click turns it to its label, Close, and the film carries on through each flavour to the row.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const T = { open: 3.5, spin: 4.7, close: 6.6, resume: 7.2 };
    const at = (cp: number) => U_INTRO + cp * U_FL;
    const keys: [number, number][] = [[0, 0], [1.7, 0], [2.9, at(0.28)], [T.resume, at(0.28)], [T.resume + 1.0, at(0.74)]];
    const t0 = T.resume + 1.0;
    for (let k = 1; k < n; k++) keys.push([t0 + (k - 1) * 2.1 + 1.0, at(k + 0.3)], [t0 + (k - 1) * 2.1 + 2.1, at(k + 0.74)]);
    const tEnd = keys.at(-1)![0];
    keys.push([tEnd + 1.4, at(n + 0.55)], [tEnd + 3.0, at(n + 0.55)]);
    const uAt = (t: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [ta, ua] = keys[k - 1]!, [tb, ub] = keys[k]!;
        if (t <= tb) return lerp(ua, ub, smoother((t - ta) / (tb - ta)));
      }
      return keys.at(-1)![1];
    };
    // The storm's clock at a moment, summed on a fixed step so the same instant always draws the same storm.
    const clockAt = (t: number) => { let c = 0; for (let s = 0; s < t; s += 1 / 60) c += paceAt(uAt(s), n) / 60; return c; };
    let cursor: SVGSVGElement | null = null;
    const demo = (t: number) => {
      demoing = true;
      stop();
      if (!cursor) {
        cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        cursor.id = "rec-cursor";
        cursor.setAttribute("viewBox", "0 0 22 30");
        cursor.innerHTML = '<path d="M2 2l16 13.5-7 .8 4.2 8.6-3.4 1.6-4.2-8.7L2 22.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>';
        document.body.appendChild(cursor);
        document.body.classList.add("rec-hover");
      }
      const W = innerWidth, H = innerHeight, wide = W / H > 1.05;
      type P = { x: number; y: number };
      const seg = (a: P, b: P, ta: number, tb: number) => { const k = smoother((t - ta) / (tb - ta)); return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }; };
      const enter = { x: W * 0.97, y: H * 0.26 }, sweep = { x: W * 0.6, y: H * 0.7 };
      const bag = wide ? { x: W * 0.7, y: H * 0.52 } : { x: W * 0.5, y: H * 0.7 };
      const focus = wide ? { x: W * 0.33, y: H * 0.5 } : { x: W * 0.5, y: H * 0.3 };
      const r = sl?.close.getBoundingClientRect();
      const close = r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W * 0.9, y: H * 0.15 };
      const rest = { x: W * 0.86, y: H * 0.8 };
      let w: P;
      if (t < 1.7) w = seg(enter, sweep, 0.2, 1.6);
      else if (t < T.open) w = seg(sweep, bag, 2.4, 3.3);
      else if (t < T.spin) w = seg(bag, focus, 3.8, 4.4);
      else if (t < T.close) w = seg(focus, close, 5.7, 6.4);
      else w = seg(close, rest, 7.0, 7.9);
      const press = (a: number) => (t >= a - 0.1 && t < a + 0.1 ? 1 - Math.sin(((t - a + 0.1) / 0.2) * Math.PI) * 0.14 : 1);
      cursor.style.transform = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px) scale(${(press(T.open) * press(T.spin) * press(T.close)).toFixed(3)})`;
      // The close look, as the springs would play it from the clicks.
      const k = smooth(T.open, T.open + 0.6, t) * (1 - smooth(T.close, T.close + 0.5, t));
      if (k > 0.001 && L.bag !== 0) fill(0);
      L.bag = k > 0.001 ? 0 : -1;
      L.k = k;
      L.spin.x = Math.PI * springAt(t - T.spin);
      if (panel) panel.hidden = k <= 0.001;
      ptrK = 1;
      apply(uAt(t), (w.x / W) * 2 - 1, (w.y / H) * 2 - 1, clockAt(t));
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

type DrawState = { cp: number; u: number; introK: number; finK: number; px: number; py: number; pk: number; t: number; look: Look };
function createScene(canvas: HTMLCanvasElement, data: { crisps: Piece[]; extras: { name: string; bag: string }[]; flavours: { bag: string; back: string; pieces: Piece[] }[] }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(16));
  const loader = new THREE.TextureLoader();
  const cache = new Map<string, Promise<THREE.Texture | null>>();
  const tex = (src: string) => {
    if (!src) return Promise.resolve(null);
    if (!cache.has(src)) cache.set(src, new Promise((done) => loader.load(src, (t) => { t.anisotropy = 4; done(t); }, undefined, () => done(null))));
    return cache.get(src)!;
  };
  const shapes = new Map<string, Shape>();
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;

  // The photographs are lit already, as if facing the viewer: shading is relative to that, so a face turned to the
  // light brightens a little and one turned away darkens, and foil catches a highlight that slides as it turns.
  const LIGHT = new THREE.Vector3(-0.45, 0.6, 0.75).normalize();
  const material = (spec: number) => new THREE.ShaderMaterial({
    uniforms: { map: { value: blank }, soft: { value: blank }, uBlur: { value: 0 }, uAlpha: { value: 1 }, uSoftOn: { value: 0 }, uSpec: { value: spec } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform sampler2D soft; uniform float uBlur; uniform float uAlpha; uniform float uSoftOn; uniform float uSpec;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 a = texture2D(map, vUv);
        vec4 b = uSoftOn > 0.5 ? texture2D(soft, (vUv - 0.5) / ${SOFT_SCALE.toFixed(4)} + 0.5) : a;
        vec4 c = mix(a, b, uBlur);
        if (c.a * uAlpha < 0.004) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 l = vec3(${LIGHT.x.toFixed(4)}, ${LIGHT.y.toFixed(4)}, ${LIGHT.z.toFixed(4)});
        float shade = clamp((0.4 + 0.6 * max(dot(n, l), 0.0)) / ${(0.4 + 0.6 * LIGHT.z).toFixed(4)}, 0.32, 1.12);
        float sp = pow(max(dot(n, normalize(l + normalize(vV))), 0.0), 40.0) * uSpec;
        gl_FragColor = vec4(c.rgb * shade + sp, c.a * uAlpha);
      }`,
    transparent: true,
    depthWrite: false,
  });
  type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  type Solid = { cols: number; pillow: boolean; depth: number; both: boolean };
  const flat = new THREE.PlaneGeometry(1, 1);
  const loads: Promise<unknown>[] = [];
  // Dress a mesh in its picture, then swap its flat card for the solid made from that picture's silhouette.
  const dress = (m: Mesh, p: Piece, size: number, solid: Solid) => {
    loads.push(tex(p.src).then((t) => {
      if (!t) return;
      m.material.uniforms.map!.value = t;
      const img = t.image as { width: number; height: number };
      const k = size / Math.max(img.width, img.height);
      m.userData.sx = img.width * k; m.userData.sy = img.height * k; m.userData.sz = size;
      try {
        const key = `${p.src}|${solid.pillow}|${solid.both}`;
        if (!shapes.has(key)) shapes.set(key, inflate(img, solid.cols, solid.pillow, solid.depth, solid.both));
        const sh = shapes.get(key)!;
        m.geometry = sh.geo;
        m.userData.shape = sh;
      } catch (e) { console.warn("Storm: kept a flat card", e); }
    }));
    if (p.soft) loads.push(tex(p.soft).then((t) => { if (t) { m.material.uniforms.soft!.value = t; m.material.uniforms.uSoftOn!.value = 1; } }));
  };

  // Seeded, so the storm is the same storm every time the page loads.
  let seed = 9871;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  type P = { m: Mesh; a0: number; w: number; r: number; y: number; ph: number; spin: [number, number, number]; group: number; hero: boolean };
  const parts: P[] = [];
  // Crisps are thin; an ingredient (a chilli, a lime) is about as thick as it is wide.
  const CRISP: Solid = { cols: 40, pillow: false, depth: 0.035, both: true };
  const INGREDIENT: Solid = { cols: 48, pillow: false, depth: 0.12, both: true };
  const add = (p: Piece, group: number, size: number, hero: boolean) => {
    const m = new THREE.Mesh(flat, material(group < 0 ? 0.12 : 0.22)) as Mesh;
    m.userData.sx = size; m.userData.sy = size; m.userData.sz = size;
    dress(m, p, size, group < 0 ? CRISP : INGREDIENT);
    scene.add(m);
    parts.push({ m, a0: rnd() * Math.PI * 2, w: 0.22 + rnd() * 0.3, r: 0.45 + rnd() * 0.6, y: rnd() * 2 - 1, ph: rnd() * 6.28, spin: [0.5 + rnd() * 0.9, 0.4 + rnd() * 0.8, rnd() * 0.8 - 0.4], group, hero });
  };
  const CRISPS = 58;
  for (let i = 0; i < CRISPS && data.crisps.length; i++) add(data.crisps[i % data.crisps.length]!, -1, 0.95 + rnd() * 0.5, i < HERO_CRISPS);
  data.flavours.forEach((f, k) => { for (let i = 0; i < 14 && f.pieces.length; i++) add(f.pieces[i % f.pieces.length]!, k, 1.0 + rnd() * 0.7, false); });

  // The bags: a pillow of foil, its print on the front and its label on the back, so a bag turns round to its label.
  // A bag with no back picture is a closed pillow with its print on both faces.
  type Bag = { g: THREE.Group; front: Mesh; back: Mesh | null; extra: boolean };
  const BAG: Solid = { cols: 72, pillow: true, depth: 0.1, both: false };
  const bagOf = (front: string, backSrc: string, extra: boolean): Bag => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(flat, material(0.5)) as Mesh;
    dress(f, { src: front, soft: "" }, 4.4, backSrc ? BAG : { ...BAG, both: true });
    g.add(f);
    let b: Mesh | null = null;
    if (backSrc) {
      b = new THREE.Mesh(flat, material(0.5)) as Mesh;
      dress(b, { src: backSrc, soft: "" }, 4.4, BAG);
      b.rotation.y = Math.PI;
      g.add(b);
    }
    scene.add(g);
    return { g, front: f, back: b, extra };
  };
  const bags = [...data.flavours.map((f) => bagOf(f.bag, f.back, false)), ...data.extras.map((x) => bagOf(x.bag, "", true))];
  const lastRy = bags.map(() => 0);
  const loaded = Promise.all(loads);

  let W = 1, H = 1;
  const resize = () => {
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  resize();
  const nf = data.flavours.length;
  const v = new THREE.Vector3();

  const draw = (s: DrawState) => {
    const aspect = W / H, wide = aspect > 1.05;
    const z = wide ? 13 : 18;
    const lk = s.look.bag >= 0 ? s.look.k : 0;
    camera.position.set(s.px * 0.4 * (1 - lk), -s.py * 0.25 * (1 - lk), z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const visH = 2 * z * tanHalf, visW = visH * aspect;
    // The bag and the storm stand right of the copy; the storm is drawn tight round the bag so the column stays clear.
    // At the end the copy is centred at the top, so the storm comes to the middle and settles low round the row of bags.
    const bx = lerp(wide ? visW * 0.2 : 0, 0, s.finK), by = lerp(wide ? -0.15 : -1.9, -visH * 0.2, s.finK);
    // An open bag stands left of its panel (above it on a phone), and the storm gathers round it there.
    const focus = wide ? { x: -visW * 0.17, y: -0.1, sc: 1.18 } : { x: 0, y: visH * 0.2, sc: 0.86 };
    const cx = lerp(bx, focus.x, lk), cy = lerp(by, focus.y, lk);
    const Rx = visW * lerp(lerp(wide ? 0.29 : 0.5, wide ? 0.4 : 0.5, s.finK), wide ? 0.36 : 0.5, lk), Rz = 5.5;
    const Hy = visH * lerp(lerp(wide ? 0.38 : 0.23, 0.2, s.finK), wide ? 0.42 : 0.3, lk);
    const win = (k: number) => smooth(k - 0.15, k + 0.25, s.cp) * (1 - smooth(k + 0.85, k + 1.15, s.cp));
    const pX = s.px * aspect, pY = -s.py;
    for (const p of parts) {
      const presence = p.group >= 0 ? win(p.group) : p.hero ? 1 : smooth(0.05, 0.85, 1 - s.introK);
      p.m.visible = presence > 0.01;
      if (!p.m.visible) continue;
      const a = p.a0 + s.t * p.w + s.u * 0.55;
      const r = p.r * (1 + (1 - presence) * 1.3) * (1 - 0.25 * s.finK) * (1 + 0.5 * lk) * lerp(1, 0.86, s.introK);
      let x = cx + Math.cos(a) * r * Rx;
      const zz = Math.sin(a) * r * Rz;
      let y = cy + p.y * Hy + Math.sin(a * 1.7 + p.ph) * 0.35;
      // The pointer pushes the pieces near it aside, and sets them turning.
      let kick = 0;
      if (s.pk > 0.01) {
        v.set(x, y, zz).project(camera);
        const dx = v.x * aspect - pX, dy = v.y - pY, d2 = dx * dx + dy * dy;
        const f = s.pk * Math.exp(-d2 / 0.09);
        if (f > 0.002) {
          const d = Math.sqrt(d2) || 1, m = f * 0.26 * (z - zz) * tanHalf;
          x += (dx / d) * m; y += (dy / d) * m;
          kick = f * 1.4 * Math.sign(dx || 1);
        }
      }
      p.m.position.set(x, y, zz);
      // Each piece rocks rather than tumbling end over end, so it is seldom seen edge on; it turns freely in its plane.
      p.m.rotation.set(
        Math.sin(s.t * p.spin[0] + p.ph + s.u * 1.1) * 1.05,
        Math.sin(s.t * p.spin[1] + p.ph * 1.7 + s.u * 0.8) * 1.05,
        p.ph + s.t * p.spin[2] * 1.5 + s.u * 0.4 + kick,
      );
      const sc = presence * (1 - 0.15 * s.finK);
      p.m.scale.set(p.m.userData.sx * sc, p.m.userData.sy * sc, p.m.userData.sz * sc);
      const u = p.m.material.uniforms;
      u.uBlur!.value = Math.pow(clamp(Math.abs(zz) / 6, 0, 1), 1.4);
      u.uAlpha!.value = presence * (1 - 0.2 * lk);
    }
    // The bags: the first stands in the opening; each drops into its chapter, turns round to its back half way through,
    // and drops out below; at the end all of them, and any bag without a chapter, fan out in a row.
    const m = bags.length;
    const rowW = Math.min(visW * 0.86, m * 2.6);
    bags.forEach((b, j) => {
      let px = bx, py = by, rz = 0, ry = 0, sc = 1, show = true;
      if (!b.extra) {
        const d = s.cp - j;
        const e = j === 0 ? 1 : smooth(-0.22, 0.12, d), out = j === nf - 1 ? 0 : smooth(0.82, 1.1, d);
        py = by + (1 - e) * visH * 1.05 - out * visH * 1.1;
        rz = (1 - e) * 0.5 - out * 0.35;
        ry = Math.PI * smooth(0.46, 0.62, d) + s.px * 0.3 * (1 - s.finK);
        if (j === 0) { py += Math.sin(s.t * 1.3) * 0.06 * s.introK; rz -= 0.07 * s.introK; sc = lerp(1, 1.06, s.introK); }
        show = e > 0.001 && out < 0.999;
      } else { py = -visH * 1.2; show = false; }
      if (s.finK > 0.001) {
        const k = smoother(clamp((s.finK - j * 0.05) / (1 - (m - 1) * 0.05), 0, 1));
        const col = wide ? j : j % 3, row = wide ? 0 : Math.floor(j / 3);
        const cols = wide ? m : 3;
        const rx = (col - (cols - 1) / 2) * (wide ? rowW / m : visW * 0.31);
        const ry_ = wide ? -visH * 0.16 : -0.9 - row * 2.1;
        const from = b.extra || j < nf - 1 ? -visH * 1.2 : py;
        px = lerp(px, rx, k); py = lerp(from, ry_, k); rz = lerp(rz, (col - (cols - 1) / 2) * -0.05, k); ry = lerp(ry, 0, k);
        sc = lerp(sc, wide ? 0.62 : 0.36, k);
        show = show || k > 0.001;
      }
      lastRy[j] = ry;
      if (lk > 0) {
        if (j === s.look.bag) { px = lerp(px, focus.x, lk); py = lerp(py, focus.y, lk); rz = lerp(rz, 0, lk); ry = lerp(ry, s.look.ry, lk); sc = lerp(sc, focus.sc, lk); show = true; }
        else py -= lk * visH * 0.8;
      }
      b.g.visible = show;
      b.g.position.set(px, py, 0);
      b.g.rotation.set(-s.py * 0.08 * (1 - lk), ry, rz);
      for (const mm of [b.front, b.back]) if (mm) mm.scale.set(mm.userData.sx * sc, mm.userData.sy * sc, mm.userData.sz * sc);
    });
    renderer.clear();
    renderer.render(scene, camera);
  };

  // Which bag is under a point on the screen: the first bag hit where its picture is solid, or -1.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return -1;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(bags.filter((b) => b.g.visible).map((b) => b.g), true);
    for (const h of hits) {
      const sh = h.object.userData.shape as Shape | undefined;
      if (sh && h.uv) {
        const ix = Math.round(h.uv.x * sh.gx), iy = Math.round((1 - h.uv.y) * sh.gy);
        if ((sh.a[iy * (sh.gx + 1) + ix] ?? 0) < 100) continue;
      }
      return bags.findIndex((b) => b.g === h.object.parent);
    }
    return -1;
  };
  return { draw, resize, loaded, pick, ry: (j: number) => lastRy[j] ?? 0 };
}
