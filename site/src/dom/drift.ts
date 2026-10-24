// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Drift: a range of products floating in a soft coloured space, with glass droplets that bend and magnify what is
// behind them. Each product is made solid from its photographs (front and back halves inflated from their
// silhouettes, see solid.ts), so it turns as an object; its ingredients float round it, drawn from a soft copy when
// out of focus. The droplets are real lenses: the scene is drawn first into a buffer, and each droplet is a sphere that
// samples that buffer through its own curvature, magnified, with a split of colour at the rim and a highlight from the
// key light; a droplet behind a product is hidden by the product's depth.
//
// One pinned scene, driven by one number `u` (screens scrolled through it). It opens on the first product beside the
// headline. Each product's chapter turns the wash to its colours, floats it in with its ingredients and turns it round
// to its back label while the copy reads it; at the end the range stands in a row on a shelf of light. The droplets
// drift on their own and make way for the pointer; the products lean towards it. A click on a product (or Look closer)
// brings it forward beside a panel with its label and its button; a click or a drag turns it round. The card recorder
// drives `u`, the pointer, the close look and the clock itself (window.__hoverDemo).

import * as THREE from "three";
import { inflate, type Shape } from "./solid";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

const U_INTRO = 1;
const U_PR = 1.4;
const U_FIN = 1.3;
// The soft copy of a piece is drawn 220 inside a canvas 256/220 larger on both axes.
const SOFT_SCALE = 256 / 220;
const SPIN_W = 9, SPIN_Z = 0.62;
const DROPS = 15;

type Piece = { src: string; soft: string };
type Look = { k: number; bag: number; ry: number };
type Info = { k: string; name: string; line: string; ing: string; use: string; made: string; cta: string; href: string; back: boolean };

const phase = (u: number, n: number) => {
  const cp = (u - U_INTRO) / U_PR;
  return { cp, introK: 1 - smooth(-0.5, -0.05, cp), finK: smooth(n - 0.05, n + 0.4, cp) };
};
const springAt = (tau: number) => {
  if (tau <= 0) return 0;
  const wd = SPIN_W * Math.sqrt(1 - SPIN_Z * SPIN_Z);
  return 1 - Math.exp(-SPIN_Z * SPIN_W * tau) * (Math.cos(wd * tau) + ((SPIN_Z * SPIN_W) / wd) * Math.sin(wd * tau));
};

export function initDrift() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-drift]")].entries()) setup(root, n === 0);
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".drift-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".drift-gl")!;
  const intro = root.querySelector<HTMLElement>(".drift-intro");
  const finale = root.querySelector<HTMLElement>(".drift-finale");
  const panel = root.querySelector<HTMLElement>(".drift-look");
  const articles = [...root.querySelectorAll<HTMLElement>(".drift-fl")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const n = articles.length;
  const total = U_INTRO + n * U_PR + U_FIN;
  root.style.setProperty("--drift-screens", String(total + 1));

  // The shaders draw what they are given, unconverted, so a colour goes in as the hex reads, not in linear light.
  const trio = (v: string | undefined) => (v ?? "#dfe7ec,#eef3f5,#f8fafb").split(",").map((h) => new THREE.Color().setHex(parseInt(h.replace("#", ""), 16), THREE.LinearSRGBColorSpace)) as [THREE.Color, THREE.Color, THREE.Color];
  const heroC = trio(pin.dataset.colors);
  const washes = [heroC, ...articles.map((a) => trio(a.dataset.colors)), heroC];
  const parse = <T,>(v: string | undefined, fb: T): T => { try { return v ? (JSON.parse(v) as T) : fb; } catch { return fb; } };
  const data = articles.map((a) => ({ front: a.dataset.front ?? "", back: a.dataset.back ?? "", pieces: parse<Piece[]>(a.dataset.pieces, []) }));

  const txt = (el: Element, sel: string) => el.querySelector(sel)?.textContent?.trim() ?? "";
  const info: Info[] = articles.map((a, i) => ({
    k: `${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`, name: txt(a, ".pb-name"), line: txt(a, ".pb-line"), ing: txt(a, ".pb-ing"), use: txt(a, ".pb-use"),
    made: txt(a, ".pb-made"), cta: txt(a, ".pb-cta"), href: a.querySelector<HTMLAnchorElement>(".pb-cta")?.getAttribute("href") ?? "#", back: Boolean(a.dataset.back),
  }));

  let gl: ReturnType<typeof createScene> | null = null;
  try { gl = createScene(canvas, data); } catch (e) { console.warn("Drift: no WebGL", e); }
  if (!gl) root.classList.add("is-flat");

  const L = { target: 0, k: 0, bag: -1, spin: { x: 0, v: 0 }, goal: 0 };
  let ptrK = 0;
  const wash = [new THREE.Color(), new THREE.Color(), new THREE.Color()] as const;

  const apply = (u: number, px: number, py: number, t: number) => {
    const { cp, introK, finK } = phase(u, n);
    const lk = L.bag >= 0 ? L.k : 0;
    // The wash: the opening's colours, through each product's, back to the opening's for the shelf.
    for (let c = 0; c < 3; c++) wash[c]!.copy(washes[0]![c]!);
    for (let j = 0; j <= n; j++) {
      const w = smooth(j - 0.25, j + 0.1, cp);
      if (w <= 0) break;
      for (let c = 0; c < 3; c++) wash[c]!.lerp(washes[j + 1]![c]!, w);
    }
    gl?.draw({ cp, u, introK, finK, px, py, pk: ptrK, t, look: { k: lk, bag: L.bag, ry: L.spin.x }, wash });
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
    ing: panel.querySelector<HTMLElement>(".sl-ing")!, use: panel.querySelector<HTMLElement>(".sl-use")!, made: panel.querySelector<HTMLElement>(".sl-made")!,
    cta: panel.querySelector<HTMLAnchorElement>(".sl-cta")!, turn: panel.querySelector<HTMLButtonElement>(".sl-turn")!, close: panel.querySelector<HTMLButtonElement>(".sl-close")!,
    hint: panel.querySelector<HTMLElement>(".sl-hint"),
  };
  const fill = (j: number) => {
    const f = info[j];
    if (!sl || !f) return;
    const put = (el: HTMLElement, v: string) => { el.textContent = v; el.hidden = !v; };
    put(sl.k, f.k); put(sl.name, f.name); put(sl.line, f.line); put(sl.ing, f.ing); put(sl.use, f.use); put(sl.made, f.made);
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
  // While a product is open the page holds still, except inside the panel when it is tall enough to scroll.
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
    uNow += (progress() - uNow) * (still ? 1 : 1 - Math.exp(-dt / 0.11));
    if (!still) { const kp = 1 - Math.exp(-dt / 0.25); ptr.x += (ptr.tx - ptr.x) * kp; ptr.y += (ptr.ty - ptr.y) * kp; }
    ptrK = still ? 0 : ptrK + (ptr.on - ptrK) * (1 - Math.exp(-dt / 0.3));
    L.k = still ? L.target : L.k + (L.target - L.k) * (1 - Math.exp(-dt / 0.13));
    if (still) { L.spin.x = L.goal; L.spin.v = 0; }
    else {
      const steps = Math.ceil(dt * 240), h = dt / steps;
      for (let i = 0; i < steps; i++) { L.spin.v += (SPIN_W * SPIN_W * (L.goal - L.spin.x) - 2 * SPIN_Z * SPIN_W * L.spin.v) * h; L.spin.x += L.spin.v * h; }
    }
    if (L.target === 0 && L.k < 0.002) { L.k = 0; L.bag = -1; if (panel) panel.hidden = true; }
    if (!still) clock += dt;
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
  // The pointer moves through the droplets round the first product, the page scrolls into its chapter, a click opens
  // it, a second click turns it to its label, Close, and the film carries on through the range to the shelf.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const T = { open: 3.5, spin: 4.7, close: 6.6, resume: 7.2 };
    const at = (cp: number) => U_INTRO + cp * U_PR;
    const keys: [number, number][] = [[0, 0], [1.7, 0], [2.9, at(0.28)], [T.resume, at(0.28)], [T.resume + 1.0, at(0.74)]];
    const t0 = T.resume + 1.0, step = 1.7;
    for (let k = 1; k < n; k++) keys.push([t0 + (k - 1) * step + 0.85, at(k + 0.3)], [t0 + k * step, at(k + 0.74)]);
    const tEnd = keys.at(-1)![0];
    keys.push([tEnd + 1.4, at(n + 0.55)], [tEnd + 3.0, at(n + 0.55)]);
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
      const enter = { x: W * 0.97, y: H * 0.3 }, sweep = { x: W * 0.56, y: H * 0.66 };
      const prod = wide ? { x: W * 0.69, y: H * 0.5 } : { x: W * 0.5, y: H * 0.66 };
      const focus = wide ? { x: W * 0.33, y: H * 0.48 } : { x: W * 0.5, y: H * 0.28 };
      const r = sl?.close.getBoundingClientRect();
      const close = r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W * 0.9, y: H * 0.15 };
      const rest = { x: W * 0.88, y: H * 0.8 };
      let w: P;
      if (t < 1.7) w = seg(enter, sweep, 0.2, 1.6);
      else if (t < T.open) w = seg(sweep, prod, 2.4, 3.3);
      else if (t < T.spin) w = seg(prod, focus, 3.8, 4.4);
      else if (t < T.close) w = seg(focus, close, 5.7, 6.4);
      else w = seg(close, rest, 7.0, 7.9);
      const press = (a: number) => (t >= a - 0.1 && t < a + 0.1 ? 1 - Math.sin(((t - a + 0.1) / 0.2) * Math.PI) * 0.14 : 1);
      cursor.style.transform = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px) scale(${(press(T.open) * press(T.spin) * press(T.close)).toFixed(3)})`;
      const k = smooth(T.open, T.open + 0.6, t) * (1 - smooth(T.close, T.close + 0.5, t));
      if (k > 0.001 && L.bag !== 0) fill(0);
      L.bag = k > 0.001 ? 0 : -1;
      L.k = k;
      L.spin.x = Math.PI * springAt(t - T.spin);
      if (panel) panel.hidden = k <= 0.001;
      ptrK = 1;
      apply(uAt(t), (w.x / W) * 2 - 1, (w.y / H) * 2 - 1, t);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

type DrawState = { cp: number; u: number; introK: number; finK: number; px: number; py: number; pk: number; t: number; look: Look; wash: readonly [THREE.Color, THREE.Color, THREE.Color] };

function createScene(canvas: HTMLCanvasElement, data: { front: string; back: string; pieces: Piece[] }[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const drops = new THREE.Scene();
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

  // The scene is drawn into this buffer first; the droplets look through it. Its depth hides a droplet behind a product.
  const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(1, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  // The wash: a soft space in three colours, light from the top left, slow clouds of the deepest colour drifting
  // through it, and at the end a shelf of light the products stand on.
  const washMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() }, uT: { value: 0 }, uAsp: { value: 1 }, uShelf: { value: 0 }, uShelfY: { value: 0.3 }, uShelfY2: { value: -1 }, uFocus: { value: new THREE.Vector2(0.7, 0.45) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform float uT; uniform float uAsp; uniform float uShelf; uniform float uShelfY; uniform float uShelfY2; uniform vec2 uFocus;
      varying vec2 vUv;
      float blob(vec2 p, vec2 c, float r){ vec2 d = p - c; d.x *= uAsp; return exp(-dot(d, d) / (r * r)); }
      void main(){
        vec2 p = vUv;
        vec3 col = mix(uB, uC, smoothstep(0.0, 1.0, p.y * 0.9 + (1.0 - p.x) * 0.25));
        float t = uT * 0.05;
        // The deepest colour gathers behind the product, so a pale bottle always stands on a deeper ground.
        float c = blob(p, uFocus + vec2(0.04 * sin(t * 1.3), 0.03 * cos(t)), 0.3) * 0.95
                + blob(p, vec2(0.18 + 0.06 * cos(t * 0.8), 0.18 + 0.05 * sin(t * 1.1)), 0.36) * 0.55
                + blob(p, vec2(0.48 + 0.1 * sin(t * 0.6 + 2.0), 0.88), 0.3) * 0.35;
        col = mix(col, uA, clamp(c, 0.0, 1.0) * 0.75);
        col += vec3(1.0) * 0.08 * blob(p, vec2(0.12, 0.95), 0.5);
        // A soft vignette, so the edges settle and the middle reads as lit.
        vec2 q = (p - 0.5) * vec2(uAsp, 1.0);
        col *= 1.0 - 0.12 * smoothstep(0.35, 1.1, length(q));
        // The shelf: a thin line of light, its glow spread above and below, and the room darkening a touch round it.
        float dy = p.y - uShelfY, dy2 = p.y - uShelfY2;
        float line = exp(-dy * dy / 0.000012) * 0.9 + exp(-dy * dy / 0.0016) * 0.22 + exp(-max(dy, 0.0) * 9.0) * 0.06 * step(0.0, dy);
        // A second shelf, when the range stands in two rows on a phone.
        line += step(0.0, uShelfY2) * (exp(-dy2 * dy2 / 0.000012) * 0.9 + exp(-dy2 * dy2 / 0.0016) * 0.22);
        float span = smoothstep(0.0, 0.18, p.x) * smoothstep(1.0, 0.82, p.x);
        col = mix(col, col * 0.96, uShelf * 0.6) + uShelf * line * span * vec3(1.0, 0.99, 0.97);
        // Fine grain, so the gradient never bands.
        float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(col + (g - 0.5) / 255.0, 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const washMesh = new THREE.Mesh(quad, washMat);
  washMesh.frustumCulled = false;
  washMesh.renderOrder = -1000;
  scene.add(washMesh);

  // Products and pieces: photographs on solid shapes, lit relative to the light they were photographed in.
  const LIGHT = new THREE.Vector3(-0.45, 0.6, 0.75).normalize();
  const material = (spec: number, solid: boolean) => new THREE.ShaderMaterial({
    uniforms: { map: { value: blank }, soft: { value: blank }, uBlur: { value: 0 }, uAlpha: { value: 1 }, uSoftOn: { value: 0 }, uSpec: { value: spec } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform sampler2D soft; uniform float uBlur; uniform float uAlpha; uniform float uSoftOn; uniform float uSpec;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 a = texture2D(map, vUv);
        vec4 b = uSoftOn > 0.5 ? texture2D(soft, (vUv - 0.5) / ${SOFT_SCALE.toFixed(4)} + 0.5) : a;
        vec4 c = mix(a, b, uBlur);
        if (c.a * uAlpha < ${solid ? "0.02" : "0.004"}) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 l = vec3(${LIGHT.x.toFixed(4)}, ${LIGHT.y.toFixed(4)}, ${LIGHT.z.toFixed(4)});
        float shade = clamp((0.45 + 0.55 * max(dot(n, l), 0.0)) / ${(0.45 + 0.55 * LIGHT.z).toFixed(4)}, 0.4, 1.1);
        float sp = pow(max(dot(n, normalize(l + normalize(vV))), 0.0), 60.0) * uSpec;
        gl_FragColor = vec4(c.rgb * shade + sp, c.a * uAlpha);
      }`,
    // A product writes depth, so it hides the droplets behind it; its cut-out edge is smoothed by the buffer's
    // multisampling rather than blended, which an opaque, depth-writing surface cannot be.
    transparent: !solid,
    depthWrite: solid,
    alphaToCoverage: solid,
  });
  type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  type Solid = { cols: number; pillow: boolean; depth: number; both: boolean };
  const flat = new THREE.PlaneGeometry(1, 1);
  const loads: Promise<unknown>[] = [];
  const dress = (m: Mesh, p: Piece, size: number, solid: Solid) => {
    loads.push(tex(p.src).then((t) => {
      if (!t) return;
      m.material.uniforms.map!.value = t;
      const img = t.image as { width: number; height: number };
      const k = size / Math.max(img.width, img.height);
      m.userData.sx = img.width * k; m.userData.sy = img.height * k; m.userData.sz = size;
      try {
        const key = `${p.src}|${solid.cols}|${solid.depth}|${solid.both}`;
        if (!shapes.has(key)) shapes.set(key, inflate(img, solid.cols, solid.pillow, solid.depth, solid.both));
        m.geometry = shapes.get(key)!.geo;
        // How far down its canvas the product's picture ends: the shelf stands each product on that, not its canvas.
        const sh = shapes.get(key)!;
        let last = 0;
        for (let y = 0; y <= sh.gy; y++) for (let x = 0; x <= sh.gx; x++) if ((sh.a[y * (sh.gx + 1) + x] ?? 0) > 100) last = y;
        m.userData.bottom = last / sh.gy;
        m.userData.shape = shapes.get(key);
      } catch (e) { console.warn("Drift: kept a flat card", e); }
    }));
    if (p.soft) loads.push(tex(p.soft).then((t) => { if (t) { m.material.uniforms.soft!.value = t; m.material.uniforms.uSoftOn!.value = 1; } }));
  };

  let seed = 4127;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // A product is two halves, each inflated round from its own photograph, back to back: it turns as a bottle does.
  const PRODUCT: Solid = { cols: 72, pillow: false, depth: 0.3, both: false };
  const SIZE = 6.2;
  type Product = { g: THREE.Group; front: Mesh; back: Mesh | null };
  const products: Product[] = data.map((d) => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(flat, material(0.35, true)) as Mesh;
    dress(f, { src: d.front, soft: "" }, SIZE, d.back ? PRODUCT : { ...PRODUCT, both: true });
    g.add(f);
    let b: Mesh | null = null;
    if (d.back) {
      b = new THREE.Mesh(flat, material(0.35, true)) as Mesh;
      dress(b, { src: d.back, soft: "" }, SIZE, PRODUCT);
      b.rotation.y = Math.PI;
      g.add(b);
    }
    scene.add(g);
    return { g, front: f, back: b };
  });
  const lastRy = products.map(() => 0);

  // Each product's ingredients, floating round it in its chapter.
  type P = { m: Mesh; group: number; a0: number; w: number; r: number; y: number; z: number; ph: number; spin: [number, number, number] };
  const parts: P[] = [];
  const INGREDIENT: Solid = { cols: 48, pillow: false, depth: 0.1, both: true };
  data.forEach((d, k) => {
    for (let i = 0; i < 6 && d.pieces.length; i++) {
      const m = new THREE.Mesh(flat, material(0.2, false)) as Mesh;
      const size = 1.1 + rnd() * 0.9;
      m.userData.sx = size; m.userData.sy = size; m.userData.sz = size;
      dress(m, d.pieces[i % d.pieces.length]!, size, INGREDIENT);
      scene.add(m);
      parts.push({ m, group: k, a0: (i / 6) * Math.PI * 2 + rnd() * 0.5, w: 0.05 + rnd() * 0.07, r: 0.75 + rnd() * 0.45, y: rnd() * 2 - 1, z: rnd() * 2 - 1, ph: rnd() * 6.28, spin: [0.2 + rnd() * 0.3, 0.15 + rnd() * 0.3, rnd() * 0.3 - 0.15] });
    }
  });

  // The droplets: glass spheres that look through the drawn scene, magnified, with the colour split at the rim.
  const dropMat = () => new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uRes: { value: new THREE.Vector2(1, 1) }, uLens: { value: new THREE.Vector2(0.05, 0.05) }, uAlpha: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tScene; uniform sampler2D tDepth; uniform vec2 uRes; uniform vec2 uLens; uniform float uAlpha;
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec2 suv = gl_FragCoord.xy / uRes;
        if (texture2D(tDepth, suv).r < gl_FragCoord.z - 0.00002) discard;
        vec3 n = normalize(vN), v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        // A ball of water magnifies what is behind it: sample nearer the centre the further out the fragment is.
        vec2 off = -n.xy * uLens;
        vec3 col;
        col.r = texture2D(tScene, suv + off * 1.03).r;
        col.g = texture2D(tScene, suv + off).g;
        col.b = texture2D(tScene, suv + off * 0.97).b;
        vec3 behind = texture2D(tScene, suv).rgb;
        float fres = pow(1.0 - ndv, 2.6);
        // What makes it read as water rather than a disc: a darker band inside the rim where the light bends away,
        // a soft shadow low in the drop, and the sky caught thinly at the very edge.
        col *= 1.0 - 0.42 * smoothstep(0.5, 0.97, 1.0 - ndv);
        col *= 1.0 - 0.14 * smoothstep(-0.1, -0.85, n.y);
        col = mix(col, vec3(1.0), fres * 0.38);
        vec3 l = normalize(vec3(-0.45, 0.6, 0.75));
        float nh = max(dot(n, normalize(l + v)), 0.0);
        float sp = pow(nh, 220.0) * 1.4 + pow(nh, 18.0) * 0.07;
        // Light gathered through the ball lands on the side away from the light.
        float caus = smoothstep(0.35, 0.95, dot(normalize(n.xy + 1e-4), -normalize(l.xy))) * (1.0 - ndv) * 0.28;
        col += sp + caus;
        gl_FragColor = vec4(mix(behind, col, uAlpha), 1.0);
      }`,
  });
  type Drop = { m: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>; x: number; y: number; z: number; r: number; ph: number; w: number; big: boolean };
  const ball = new THREE.SphereGeometry(1, 48, 32);
  const dropList: Drop[] = [];
  for (let i = 0; i < DROPS; i++) {
    const m = new THREE.Mesh(ball, dropMat());
    drops.add(m);
    // A few large ones near the product, in front of it, so they magnify its label; more small ones spread over the
    // stage and through its depth.
    const big = i < 3;
    // (The large ones sit either side of the product's middle, so they magnify its edge, not cover its name.)
    // For a large one, x is its side of the product (-1 or 1) plus a little, and y its height against it.
    dropList.push({ m, big, x: big ? (i % 2 ? -1 : 1) * (1 + rnd() * 0.3) : rnd() * 2 - 1, y: big ? rnd() * 1.1 - 0.35 : rnd() * 2 - 1, z: big ? 1.5 + rnd() * 2 : rnd() * 8 - 4, r: big ? 0.26 + rnd() * 0.14 : 0.08 + rnd() * 0.22, ph: rnd() * 6.28, w: 0.25 + rnd() * 0.35 });
  }

  const blit = new THREE.Mesh(quad, new THREE.ShaderMaterial({
    uniforms: { t: { value: rt.texture } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }",
    depthTest: false,
    depthWrite: false,
  }));
  blit.frustumCulled = false;
  const blitScene = new THREE.Scene();
  blitScene.add(blit);
  const flatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const loaded = Promise.all(loads);
  let W = 1, H = 1;
  const resize = () => {
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    const pr = renderer.getPixelRatio();
    rt.setSize(Math.round(W * pr), Math.round(H * pr));
    for (const d of dropList) d.m.material.uniforms.uRes!.value.set(Math.round(W * pr), Math.round(H * pr));
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    washMat.uniforms.uAsp!.value = W / H;
  };
  resize();
  const n = data.length;
  const v = new THREE.Vector3();

  const draw = (s: DrawState) => {
    const aspect = W / H, wide = aspect > 1.05;
    const z = wide ? 14 : 19;
    const lk = s.look.bag >= 0 ? s.look.k : 0;
    camera.position.set(s.px * 0.35 * (1 - lk), -s.py * 0.22 * (1 - lk), z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const visH = 2 * z * tanHalf, visW = visH * aspect;
    washMat.uniforms.uA!.value.copy(s.wash[0]); washMat.uniforms.uB!.value.copy(s.wash[1]); washMat.uniforms.uC!.value.copy(s.wash[2]);
    washMat.uniforms.uT!.value = s.t;
    // Where a product stands: right of the copy (below it on a phone); an open one left of its panel (above it).
    // Beside the copy in the chapters; in the opening, centred under the headline, a little smaller.
    const bx = lerp(wide ? visW * 0.19 : 0, 0, s.introK), by = lerp(wide ? -0.25 : -visH * 0.16, wide ? -visH * 0.2 : -visH * 0.15, s.introK);
    const focus = wide ? { x: -visW * 0.17, y: -0.1, sc: 1.05 } : { x: 0, y: visH * 0.2, sc: 0.8 };
    // The shelf at the end: the row stands on a line of light a little below the middle.
    const shelfY = wide ? -visH * 0.3 : -visH * 0.25;
    const rowSc = wide ? Math.min(0.48, (visW * 0.86) / n / (SIZE * 0.42)) : 0.3;
    washMat.uniforms.uShelf!.value = s.finK * (1 - lk);
    v.set(0, shelfY, 0).project(camera);
    washMat.uniforms.uShelfY!.value = v.y * 0.5 + 0.5;
    const shelf2 = shelfY + visH * 0.26;
    v.set(0, shelf2, 0).project(camera);
    washMat.uniforms.uShelfY2!.value = wide || n <= 3 ? -1 : v.y * 0.5 + 0.5;
    // Where the deep colour gathers: behind the product, the open one, or the middle of the shelf at the end.
    v.set(lerp(lerp(bx, focus.x, lk), 0, s.finK), lerp(lerp(by, focus.y, lk), shelfY + visH * 0.12, s.finK), 0).project(camera);
    washMat.uniforms.uFocus!.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);

    products.forEach((p, j) => {
      const d = s.cp - j;
      // The next product rises only once the one before has begun to float away, so neither peeks in early.
      const e = j === 0 ? 1 : smooth(-0.15, 0.15, d), out = j === n - 1 ? 0 : smooth(0.8, 1.15, d);
      let px = bx + Math.sin(s.t * 0.31 + j) * 0.08, py = by - (1 - e) * visH * 1.1 + out * visH * 1.0 + Math.sin(s.t * 0.55 + j * 1.7) * 0.12;
      let pz = -(1 - e) * 5 - out * 3;
      let ry = Math.PI * smooth(0.46, 0.62, d) + s.px * 0.28 + Math.sin(s.t * 0.4 + j) * 0.1;
      let rx = s.py * 0.1 + Math.sin(s.t * 0.33 + j) * 0.04, rz = Math.sin(s.t * 0.37 + j * 2.1) * 0.05 - (1 - e) * 0.3 + out * 0.25;
      let sc = j === 0 ? lerp(1, wide ? 0.72 : 0.8, s.introK) : 1;
      let show = e > 0.001 && out < 0.999;
      if (s.finK > 0.001) {
        // The shelf: each product settles on the line of light in turn, front on.
        const k = smoother(clamp((s.finK - j * 0.06) / (1 - (n - 1) * 0.06), 0, 1));
        const cols = wide ? n : 3, col = wide ? j : j % 3, row = wide ? 0 : Math.floor(j / 3);
        const spacing = wide ? (visW * 0.8) / n : visW * 0.32;
        const tx = (col - (cols - 1) / 2) * spacing;
        // Stood on the line by the foot of its own picture, so a jar and a bottle share the shelf.
        const foot = (p.front.userData.bottom as number | undefined) ?? 1;
        const ty = (wide ? shelfY : row === 0 && n > 3 ? shelf2 : shelfY) + (foot - 0.5) * (p.front.userData.sy as number) * rowSc;
        const from = j < n - 1 ? -visH * 1.1 : py;
        px = lerp(px, tx, k); py = lerp(from, ty, k); pz = lerp(pz, 0, k);
        ry = lerp(ry, s.px * 0.2, k); rx = lerp(rx, 0, k); rz = lerp(rz, 0, k);
        sc = lerp(sc, rowSc, k);
        show = show || k > 0.001;
      }
      lastRy[j] = ry;
      if (lk > 0) {
        if (j === s.look.bag) { px = lerp(px, focus.x, lk); py = lerp(py, focus.y, lk); pz = lerp(pz, 0, lk); rx = lerp(rx, 0, lk); rz = lerp(rz, 0, lk); ry = lerp(ry, s.look.ry, lk); sc = lerp(sc, focus.sc, lk); show = true; }
        else py -= lk * visH * 0.9;
      }
      p.g.visible = show;
      p.g.position.set(px, py, pz);
      p.g.rotation.set(rx, ry, rz);
      // A half turned well away is hidden behind the other, except for a sliver of its rim: leave it out.
      const facing = Math.cos(ry);
      p.front.visible = !p.back || facing > -0.3;
      if (p.back) p.back.visible = facing < 0.3;
      for (const mm of [p.front, p.back]) if (mm) mm.scale.set(mm.userData.sx * sc, mm.userData.sy * sc, mm.userData.sz * sc);
    });

    // Ingredients: a slow orbit round their product, rocking, in and out of focus.
    const win = (k: number) => (k === 0 ? 1 : smooth(k - 0.3, k + 0.15, s.cp)) * (1 - smooth(k + 0.85, k + 1.15, s.cp));
    const cx = lerp(bx, focus.x, lk), cy = lerp(by, focus.y, lk);
    for (const p of parts) {
      const presence = win(p.group) * (1 - s.finK);
      p.m.visible = presence > 0.01;
      if (!p.m.visible) continue;
      const a = p.a0 + s.t * p.w + s.u * 0.35;
      const r = p.r * (1 + (1 - presence) * 1.2) * (1 + 0.35 * lk);
      let x = cx + Math.cos(a) * r * visW * (wide ? lerp(0.21, 0.3, s.introK) : 0.42);
      // Never much nearer the camera than the product: a piece that close fills the frame however soft it is.
      const zz = Math.min(3, Math.sin(a) * r * 3.6 + p.z * 1.2);
      // A piece passing in front of the product keeps to its sides, so it never sits across the label; behind it,
      // it may pass behind.
      const clear = (wide ? 1.75 : 1.5) + (p.m.userData.sx as number) * 0.35;
      const front = smooth(-1, 0.6, zz);
      if (front > 0 && Math.abs(x - cx) < clear) x = lerp(x, cx + Math.sign(x - cx || 1) * clear, front);
      const y = cy + p.y * visH * (wide ? 0.34 : 0.26) + Math.sin(s.t * 0.4 + p.ph) * 0.25;
      p.m.position.set(x, y, zz);
      // Rocking, never as far as edge on, where a petal or a slice reads as a line.
      p.m.rotation.set(Math.sin(s.t * p.spin[0] + p.ph) * 0.5, Math.sin(s.t * p.spin[1] + p.ph * 1.7) * 0.5, p.ph + s.t * p.spin[2]);
      // On a phone the product fills the width, so its ingredients are smaller and kept to its sides.
      const sc = presence * (wide ? 1 : 0.72);
      p.m.scale.set(p.m.userData.sx * sc, p.m.userData.sy * sc, p.m.userData.sz * sc);
      const u = p.m.material.uniforms;
      u.uBlur!.value = Math.pow(clamp(Math.abs(zz) / 5, 0, 1), 1.3);
      u.uAlpha!.value = presence * (1 - 0.25 * lk);
    }

    // Droplets: drifting where they were put, making way for the pointer, thinning out at the shelf.
    const pX = s.px * aspect, pY = -s.py;
    for (const d of dropList) {
      const big = d.big;
      // A large droplet keeps to the edge of the product, magnifying its side, never across its name.
      let x = big ? cx + d.x * visW * (wide ? 0.11 : 0.3) + Math.sin(s.t * d.w + d.ph) * 0.2 : d.x * visW * 0.52 + Math.sin(s.t * d.w + d.ph) * 0.35 + s.u * 0.12 * Math.sign(d.x);
      let y = big ? cy + d.y * visH * 0.3 + Math.cos(s.t * d.w * 0.8 + d.ph) * 0.25 : d.y * visH * 0.46 + Math.cos(s.t * d.w * 0.8 + d.ph) * 0.45;
      const zz = d.z;
      if (lk > 0) { x += Math.sign(d.x || 1) * lk * visW * 0.15; }
      if (s.pk > 0.01) {
        v.set(x, y, zz).project(camera);
        const dx = v.x * aspect - pX, dy = v.y - pY, d2 = dx * dx + dy * dy;
        const f = s.pk * Math.exp(-d2 / 0.08);
        if (f > 0.002) { const dd = Math.sqrt(d2) || 1, m = f * 0.3 * (z - zz) * tanHalf; x += (dx / dd) * m; y += (dy / dd) * m; }
      }
      const fade = 1 - s.finK * (big && wide ? 0 : big ? 1 : 0.6);
      d.m.position.set(x, y, zz);
      const r = d.r * (wide || !big ? 1 : 0.7) * (0.6 + 0.4 * fade) * (1 + Math.sin(s.t * 1.7 + d.ph) * 0.02);
      d.m.scale.set(r * (1 + Math.sin(s.t * 1.3 + d.ph) * 0.03), r, r);
      // How much to magnify: about half the droplet's radius on screen, in the buffer's coordinates.
      const ruv = r / (2 * (z - zz) * tanHalf);
      d.m.material.uniforms.uLens!.value.set((ruv * 0.42) / aspect, ruv * 0.42);
      d.m.material.uniforms.uAlpha!.value = fade;
      d.m.visible = r > 0.02;
    }

    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(blitScene, flatCam);
    renderer.clearDepth();
    renderer.render(drops, camera);
  };

  // Which product is under a point on the screen: the first hit where its picture is solid, or -1.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return -1;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(products.filter((p) => p.g.visible).map((p) => p.g), true)) {
      const sh = h.object.userData.shape as Shape | undefined;
      if (sh && h.uv) {
        const ix = Math.round(h.uv.x * sh.gx), iy = Math.round((1 - h.uv.y) * sh.gy);
        if ((sh.a[iy * (sh.gx + 1) + ix] ?? 0) < 100) continue;
      }
      return products.findIndex((p) => p.g === h.object.parent);
    }
    return -1;
  };
  return { draw, resize, loaded, pick, ry: (j: number) => lastRy[j] ?? 0 };
}
