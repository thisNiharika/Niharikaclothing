// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The aisle: a loop of products on an arch beneath the headline. One stands at the front, below the copy; the others
// rise up either side of it, smaller and further into the aisle's fog the further round they are, so the products
// frame the words rather than sit behind them.
//
// The loop is one number, `pos` (which product is at the front, fractional while it moves), and every product's place
// is a function of how far round from `pos` it is. `pos` follows `goal` on a spring. Left alone, the loop brings the
// next product round every few seconds, so one is always in focus; the visitor takes over at once: the arrows step it
// by one, a sideways scroll or a drag slides it and lets it settle on the nearest product, a click on a product brings
// that one round, and the loop holds while the pointer is on the products or a product is open. Every product floats
// a little above its reflection, rising and settling on its own beat. The card recorder replays the same spring on a
// fixed step against a clock it owns (window.__hoverDemo), so every captured frame is exact.
//
// Each aisle has its own colours, and the background is a slow liquid light in those colours (WebGL, one quad),
// which changes with the aisle. A product at the front opens the close look, where it turns round to its label.

import { createSky } from "./sky";

type Item = { el: HTMLButtonElement; i: number };
type Aisle = { id: string; label: string; code: string; colors: [string, string, string]; items: Item[]; root: HTMLElement; tab: HTMLButtonElement | null };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const easeIn = (x: number) => { const t = clamp(x, 0, 1); return t * t * t; };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

const SPRING = 10.5; // the loop's spring, radians a second: a step settles in about half a second, without overshoot
const SWITCH = 1.15; // seconds an aisle change takes
const HOLD = 2; // seconds a product holds the front before the loop brings the next one round
const RESUME = 4; // seconds after the visitor last moved the loop before it carries on by itself

/** One fixed step of a critically damped spring: the loop's motion, live and in the recorder alike. */
function spring(p: number, v: number, goal: number, dt: number, w = SPRING, zeta = 1): [number, number] {
  v += (w * w * (goal - p) - 2 * zeta * w * v) * dt;
  return [p + v * dt, v];
}

export function initAisles() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-aisle]")].entries()) setup(root, n === 0);
}

function setup(root: HTMLElement, lead: boolean) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const stage = root.querySelector<HTMLElement>(".aisle-stage")!;
  const word = root.querySelector<HTMLElement>(".aisle-word");
  const aisles: Aisle[] = [...root.querySelectorAll<HTMLElement>("[data-aisle-set]")].map((el) => ({
    id: el.dataset.aisleSet!,
    label: el.dataset.label ?? "",
    code: el.dataset.code ?? "",
    colors: (el.dataset.colors ?? "#111111,#333333,#999999").split(",") as [string, string, string],
    root: el,
    tab: root.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="${el.id}"]`),
    items: [...el.querySelectorAll<HTMLButtonElement>(".aisle-item")].map((b, i) => ({ el: b, i })),
  }));
  if (!aisles.length) return;
  let active = 0;
  let pos = 0;
  let goal = 0;
  let vel = 0;
  let front = -1;
  const caption = root.querySelector<HTMLElement>(".aisle-caption");
  const look = createLook(root);
  const sky = createSky(root.querySelector<HTMLCanvasElement>(".aisle-sky"));
  let colors = aisles[0]!.colors.map(hex) as [number, number, number][];

  let W = 1, H = 1;
  const measure = () => { const r = stage.getBoundingClientRect(); W = r.width || 1; H = r.height || 1; };
  measure();
  addEventListener("resize", () => { measure(); paint(performance.now() / 1000); });
  // How far a drag or a sideways scroll moves the loop by one product.
  const stepPx = () => clamp(W * 0.16, 110, 220);

  const wrap = (u: number, n: number) => ((u % n) + n + n / 2) % n - n / 2; // the shortest way round: no seam

  /**
   * Where a product u places round from the front stands. The front one is at the foot of the stage, below the copy.
   * The rest go out to the sides and up, on an arch, so the ones two places round stand beside the headline; the one
   * opposite the front is out of sight, which is where a product changes sides.
   */
  const place = (u: number) => {
    const a = Math.min(Math.abs(u), 3);
    const sgn = Math.sign(u);
    const narrow = W < 700;
    const x = sgn * W * (narrow ? 0.44 : 0.34) * Math.tanh(a * (narrow ? 0.95 : 0.85));
    const lift = H * (narrow ? 0.62 : 1.18) * Math.pow(a / 3, 1.6);
    const s = Math.max(0.36, 1 - (narrow ? 0.2 : 0.22) * a);
    const turn = clamp(-u * 20, -38, 38);
    const fog = ease((a - 0.45) / 2);
    const alpha = 1 - ease((a - 2.35) / 0.5);
    return { x, lift, s, turn, fog, alpha };
  };

  const paint = (t = 0) => {
    const a = aisles[active]!;
    const n = a.items.length;
    for (const it of a.items) {
      const u = wrap(it.i - pos, n);
      const p = place(u);
      // The float: each product rises and settles on its own beat, and leans a little as it does.
      const beat = t * 1.25 + it.i * 1.9, rise = (8 + 7 * Math.sin(beat)) / 15;
      it.el.style.setProperty("--bob", `${(-15 * rise * p.s).toFixed(2)}px`);
      it.el.style.setProperty("--rise", rise.toFixed(3));
      it.el.style.setProperty("--tilt", `${(Math.sin(beat * 0.72 + 1.1) * 1.4).toFixed(3)}deg`);
      it.el.style.transform = `translateX(-50%) translate(${p.x.toFixed(1)}px, ${(-p.lift).toFixed(1)}px) scale(${p.s.toFixed(4)}) perspective(1200px) rotateY(${p.turn.toFixed(2)}deg)`;
      it.el.style.opacity = p.alpha.toFixed(3);
      it.el.style.zIndex = String(1000 - Math.round(Math.abs(u) * 100));
      it.el.style.setProperty("--fog", p.fog.toFixed(3));
      // A product lifted off the floor loses its reflection and its shadow: it hangs in the light instead.
      it.el.style.setProperty("--lift", clamp(p.lift / (H * 0.18), 0, 1).toFixed(3));
      // Blur in steps: a continuously changing blur repaints every product every frame.
      it.el.style.setProperty("--blur", `${(Math.round(p.fog * 8) / 2).toFixed(1)}px`);
      it.el.style.visibility = p.alpha < 0.01 ? "hidden" : "";
      it.el.tabIndex = Math.abs(u) < 0.5 ? 0 : -1;
    }
    // The aisle's name behind the products drifts against the loop, the slowest thing in the scene.
    if (word) word.style.transform = `translate3d(${(-(((pos % n) + n) % n) / n * 14 + 7).toFixed(2)}%, 0, 0)`;
    const f = ((Math.round(pos) % n) + n) % n;
    if (f !== front) { front = f; describe(); }
  };

  const describe = () => {
    if (!caption) return;
    const a = aisles[active]!;
    const b = a.items[front]?.el;
    if (!b) return;
    caption.classList.remove("swap");
    void caption.offsetWidth;
    caption.classList.add("swap");
    const set = (sel: string, v: string) => { const el = caption.querySelector(sel); if (el) el.textContent = v; };
    set(".ac-code", `${a.code}${front + 1}`);
    set(".ac-name", b.dataset.name ?? "");
    set(".ac-meta", b.dataset.meta ?? "");
  };

  // ------------------------------------------------------------------------------------------------------- motion
  let raf = 0;
  let last = 0;
  let demoing = false;
  let switching: { from: number; to: number; t0: number; p0: number } | null = null;
  let dragging = false;
  // The loop carries on by itself only when nobody is using it: not while the pointer is on the products, a product
  // is open, the loop is being dragged or an aisle is changing, and not for a few seconds after the visitor moved it.
  let hovering = false;
  let idleUntil = 0;
  let nextAt = 0;
  const hold = () => { idleUntil = performance.now() + RESUME * 1000; nextAt = 0; };
  const auto = (now: number) => {
    if (reduced.matches || hovering || dragging || switching || look.isOpen() || now < idleUntil || stage.contains(document.activeElement)) { nextAt = 0; return; }
    if (!nextAt) nextAt = now + HOLD * 1000;
    if (now >= nextAt) { goal = Math.round(goal) + 1; nextAt = now + (HOLD + 0.6) * 1000; }
  };
  const frame = (now: number) => {
    let dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    auto(now);
    if (switching) stepSwitch(now);
    else if (!dragging) {
      if (reduced.matches) { pos = goal; vel = 0; }
      // Sub-steps keep the spring exact on a slow frame.
      while (dt > 0) { const h = Math.min(dt, 1 / 120); [pos, vel] = spring(pos, vel, goal, h); dt -= h; }
    }
    paint(reduced.matches ? 0 : now / 1000);
    sky?.draw(now / 1000, colors);
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && !demoing) { last = performance.now(); nextAt = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  // Only while it is on screen: an aisle scrolled out of view costs nothing.
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));

  const step = (d: number) => { if (switching) return; hold(); goal = Math.round(goal) + d; run(); };
  stage.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hovering = true; });
  stage.addEventListener("pointerleave", () => { if (hovering) { hovering = false; nextAt = 0; } });
  root.querySelector(".an-prev")?.addEventListener("click", () => step(-1));
  root.querySelector(".an-next")?.addEventListener("click", () => step(1));

  // A sideways scroll (a trackpad swipe, or shift and the wheel) slides the loop and settles on the nearest product.
  // An up and down scroll is left alone: it belongs to the page.
  let settle = 0;
  stage.addEventListener("wheel", (e) => {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx || switching) return;
    e.preventDefault();
    hold();
    const px = e.deltaMode === 1 ? dx * 36 : e.deltaMode === 2 ? dx * W : dx;
    goal = clamp(goal + px / stepPx(), pos - 2.5, pos + 2.5);
    clearTimeout(settle);
    settle = window.setTimeout(() => { goal = Math.round(goal); }, 140);
    run();
  }, { passive: false });

  // A drag, with a mouse or a finger, moves the loop under the pointer and lets it coast to a product.
  let drag: { id: number; x0: number; x: number; t: number; v: number; moved: boolean } | null = null;
  let suppressClick = false;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || switching) return;
    drag = { id: e.pointerId, x0: e.clientX, x: e.clientX, t: performance.now(), v: 0, moved: false };
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) < 7) return;
      drag.moved = true;
      hold();
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("dragging");
    }
    const now = performance.now();
    const d = -(e.clientX - drag.x) / stepPx();
    pos += d;
    goal = pos;
    drag.v = lerp(drag.v, d / Math.max(0.008, (now - drag.t) / 1000), 0.5);
    drag.x = e.clientX;
    drag.t = now;
    run();
  });
  const release = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      vel = clamp(drag.v, -8, 8);
      goal = Math.round(pos + vel * 0.16);
      stage.classList.remove("dragging");
    }
    dragging = false;
    drag = null;
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  // A product: round to the front if it is not there, into the close look if it is.
  aisles.forEach((a) =>
    a.items.forEach((it) => {
      it.el.addEventListener("click", () => {
        if (switching || suppressClick) return;
        const u = wrap(it.i - pos, a.items.length);
        hold();
        if (Math.abs(u) < 0.5) return look.open(it.el, a, it.i);
        goal = Math.round(pos + u);
        run();
      });
    }),
  );
  root.addEventListener("keydown", (e) => {
    if (!(e.target as HTMLElement).closest(".aisle-item, .an-btn")) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    step(e.key === "ArrowRight" ? 1 : -1);
    if ((e.target as HTMLElement).closest(".aisle-item")) requestAnimationFrame(() => requestAnimationFrame(() => aisles[active]!.items[front]?.el.focus({ preventScroll: true })));
  });
  // The machine hands a vended pack to the close look by its code (A1, B3).
  if (lead) document.addEventListener("aisle:open", (e) => {
    const code = String((e as CustomEvent<{ code?: string }>).detail?.code ?? "");
    const a = aisles.find((x) => code.startsWith(x.code));
    const it = a?.items[Number(code.slice(a.code.length)) - 1];
    if (a && it) look.open(it.el, a, it.i);
  });

  // -------------------------------------------------------------------------------------------------- aisle switch
  // The loop runs the products off to the left while the colours turn, swaps the set out of sight, and runs the new
  // aisle in from the right.
  const selectTab = (n: number) => aisles.forEach((a, k) => {
    a.tab?.setAttribute("aria-selected", String(k === n));
    a.tab?.setAttribute("tabindex", k === n ? "0" : "-1");
  });
  const showAisle = (n: number, focusTab = false) => {
    if (n === active || switching || !aisles[n]) return;
    hold();
    switching = { from: active, to: n, t0: performance.now(), p0: pos };
    selectTab(n);
    if (focusTab) aisles[n]!.tab?.focus();
    if (reduced.matches) switching.t0 -= SWITCH * 1000;
    run();
  };
  function stepSwitch(now: number) {
    const s = switching!;
    const k = (now - s.t0) / 1000 / SWITCH;
    applySwitch(s, k);
    if (k >= 1) { switching = null; vel = 0; goal = pos = 0; }
  }
  function applySwitch(s: { from: number; to: number; p0: number }, k: number) {
    const from = aisles[s.from]!, to = aisles[s.to]!;
    const c = ease(k);
    colors = from.colors.map((h, i) => { const a = hex(h), b = hex(to.colors[i]!); return [lerp(a[0], b[0], c), lerp(a[1], b[1], c), lerp(a[2], b[2], c)]; }) as [number, number, number][];
    root.style.setProperty("--aisle-glow", `rgb(${colors[2]!.map((v) => Math.round(v * 255)).join(",")})`);
    root.style.setProperty("--aisle-mid", `rgb(${colors[1]!.map((v) => Math.round(v * 255)).join(",")})`);
    root.style.setProperty("--aisle-deep", `rgb(${colors[0]!.map((v) => Math.round(v * 255)).join(",")})`);
    if (k < 0.5) {
      if (active !== s.from) setActive(s.from);
      pos = s.p0 + easeIn(k / 0.5) * 2.6;
    } else {
      if (active !== s.to) setActive(s.to);
      pos = lerp(-2.6, 0, easeOut((k - 0.5) / 0.5));
    }
    if (word) word.style.opacity = String(Math.abs(k - 0.5) * 2);
  }
  function setActive(n: number) {
    active = n;
    aisles.forEach((a, k) => (a.root.hidden = k !== n));
    if (word) word.textContent = aisles[n]!.label;
    root.dataset.aisle = aisles[n]!.id;
    front = -1;
  }
  aisles.forEach((a, k) => {
    a.tab?.addEventListener("click", () => showAisle(k));
    a.tab?.addEventListener("keydown", (e) => {
      const to = e.key === "ArrowRight" ? (k + 1) % aisles.length : e.key === "ArrowLeft" ? (k - 1 + aisles.length) % aisles.length : null;
      if (to === null) return;
      e.preventDefault();
      showAisle(to, true);
    });
  });
  applySwitch({ from: 0, to: 0, p0: 0 }, 1);
  setActive(0);
  paint();

  // Ready to film once the first aisle's products are in.
  Promise.all(aisles[0]!.items.map((it) => it.el.querySelector("img")).filter((i): i is HTMLImageElement => Boolean(i)).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))).then(() => {
    document.body.classList.add("canvas-ready", "aisle-ready");
  });

  // ------------------------------------------------------------------------------------------------ card recording
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) installDemo();

  function installDemo() {
    const cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    cursor.id = "rec-cursor";
    cursor.setAttribute("viewBox", "0 0 22 30");
    cursor.innerHTML = '<path d="M2 2l16 13.5-7 .8 4.2 8.6-3.4 1.6-4.2-8.7L2 22.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>';
    document.body.appendChild(cursor);
    // The film: two presses of the next arrow, a click on the front pack, a click that turns it round, a related pack
    // from the strip, close, the next aisle, one press of the previous arrow, away.
    const T = { next1: 1.2, next2: 1.9, press: 3.0, open: 3.1, spin: 4.4, rel: 6.4, close: 7.6, tab: 8.8, prev: 10.75, end: 12.4 };
    type P = { x: number; y: number };
    const centre = (el: Element | null | undefined, fb: P): P => { const r = el?.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : fb; };
    const seg = (a: P, b: P, t: number, t0: number, t1: number) => { const k = ease((t - t0) / (t1 - t0)); return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }; };
    const relIndex = (f: number) => (f + 1) % aisles[0]!.items.length;
    // The loop's position and the pack's turn at a moment, replayed from the start on a fixed step.
    const sim = (t: number) => {
      const dt = 1 / 120;
      let p = 0, v = 0, g = 0, a = 0, av = 0, ag = 0;
      for (let s = 0; s <= Math.min(t, T.tab) + 1e-9; s += dt) {
        if (Math.abs(s - T.next1) < dt / 2 || Math.abs(s - T.next2) < dt / 2) g += 1;
        if (s >= T.spin && s < T.rel + 0.08) ag = 180;
        if (Math.abs(s - (T.rel + 0.16)) < dt / 2) { a = 0; av = 0; ag = 0; }
        [p, v] = spring(p, v, g, dt);
        [a, av] = spring(a, av, ag, dt, 9, 0.62);
      }
      let q = 0, qv = 0, qg = 0;
      for (let s = T.tab + SWITCH; s <= t + 1e-9; s += dt) {
        if (Math.abs(s - T.prev) < dt / 2) qg -= 1;
        [q, qv] = spring(q, qv, qg, dt);
      }
      return { p, ang: a, after: q };
    };
    const demo = (t: number) => {
      demoing = true;
      stop();
      root.classList.add("rec");
      document.body.classList.add("rec-hover");
      measure();
      const s = sim(t);
      const r = stage.getBoundingClientRect();
      if (t < T.tab) {
        setActive(0);
        applySwitch({ from: 0, to: 0, p0: 0 }, 1);
        pos = s.p;
        selectTab(0);
      } else if (t < T.tab + SWITCH && aisles.length > 1) {
        applySwitch({ from: 0, to: 1, p0: sim(T.tab).p }, (t - T.tab) / SWITCH);
        selectTab(1);
      } else {
        if (aisles.length > 1) { applySwitch({ from: 0, to: 1, p0: 0 }, 1); selectTab(1); }
        pos = s.after;
      }
      paint(t);
      const f = ((Math.round(sim(Math.min(t, T.open)).p) % aisles[0]!.items.length) + aisles[0]!.items.length) % aisles[0]!.items.length;
      // The look, open from T.open to T.close, swapping to a related pack at T.rel.
      const lookP = t < T.open ? 0 : t < T.close ? easeOut((t - T.open) / 0.55) : 1 - ease((t - T.close) / 0.45);
      const swapK = t < T.rel ? 0 : t < T.rel + 0.16 ? (t - T.rel) / 0.16 : t < T.rel + 0.42 ? 1 - (t - T.rel - 0.16) / 0.26 : 0;
      const shown = t < T.rel + 0.16 ? f : relIndex(f);
      const a0 = aisles[0]!;
      if (t < T.close + 0.46) look.demo(a0.items[shown]!.el, a0, shown, t < T.close ? lookP : Math.max(0, lookP), s.ang, swapK);
      else look.demo(a0.items[shown]!.el, a0, shown, 0, 0, 0);
      // The pointer, aimed at the real controls so the film stays true whatever the layout.
      const below = { x: r.left + r.width * 0.42, y: innerHeight + 40 };
      const next = centre(root.querySelector(".an-next"), below);
      const prev = centre(root.querySelector(".an-prev"), below);
      const pack = centre(aisles[0]!.items[f]?.el.querySelector("img"), below);
      const card = centre(root.querySelector(".al-card"), pack);
      // By its place in the strip, which holds the same slot before and after the swap rebuilds it.
      const rel = centre(root.querySelector(`.al-rel:nth-child(${f + 1})`), card);
      const tab = centre(aisles[1]?.tab ?? null, next);
      const away = { x: r.right + 60, y: r.top + r.height * 0.2 };
      let w: P;
      if (t < 0.9) w = seg(below, next, t, 0, 0.9);
      else if (t < 2.1) w = next;
      else if (t < 3.1) w = seg(next, pack, t, 2.1, 2.8);
      else if (t < 5.6) w = seg(pack, card, t, 3.7, 4.2);
      else if (t < 7.6) w = seg(card, rel, t, 5.6, 6.2);
      else if (t < 8.8) w = seg(rel, tab, t, 7.9, 8.6);
      else if (t < 11.6) w = seg(tab, prev, t, 10.0, 10.6);
      else w = seg(prev, away, t, 11.6, T.end);
      const press = (at: number) => (t >= at - 0.1 && t < at + 0.1 ? 1 - Math.sin(((t - at + 0.1) / 0.2) * Math.PI) * 0.14 : 1);
      const k = press(T.next1) * press(T.next2) * press(T.press) * press(T.spin) * press(T.rel) * press(T.tab) * press(T.prev);
      cursor.style.transform = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px) scale(${k.toFixed(3)})`;
      // An open dialog sits in the top layer, above everything in the page: the pointer goes in with it.
      const dlg = root.querySelector("dialog.aisle-look") as HTMLDialogElement | null;
      const host = dlg?.open ? dlg : document.body;
      if (cursor.parentElement !== host) host.appendChild(cursor);
      sky?.draw(t, colors);
    };
    (demo as unknown as { seconds: number }).seconds = T.end;
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

/**
 * The close look: the pack flies out of the aisle to the middle, large, with its name, facts and the rest of its
 * aisle in a strip underneath. A click on the pack turns it round to its label on a spring that overshoots a little and
 * settles, with a light that sweeps across the face as it turns, the pack's edge showing at the quarter turn and its
 * shadow narrowing; a drag turns it by hand and lets go to the nearest face. A pack from the strip takes its place.
 */
function createLook(root: HTMLElement) {
  const dlg = root.querySelector<HTMLDialogElement>("dialog.aisle-look");
  const none = { open: () => undefined, isOpen: () => false, demo: () => undefined };
  if (!dlg) return none;
  const card = dlg.querySelector<HTMLElement>(".al-card")!;
  // The flight moves the stage and the turn rotates the card inside it, so neither transform overwrites the other.
  const stage = dlg.querySelector<HTMLElement>(".al-stage") ?? card;
  const frontImg = dlg.querySelector<HTMLImageElement>(".al-front")!;
  const backImg = dlg.querySelector<HTMLImageElement>(".al-back")!;
  const turn = dlg.querySelector<HTMLButtonElement>(".al-turn");
  const relRow = dlg.querySelector<HTMLElement>(".al-rel-row");
  const relLabel = dlg.querySelector<HTMLElement>(".al-rel-label b");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let from: HTMLElement | null = null;
  let current: { a: Aisle; i: number } | null = null;
  let anim = 0;

  // ---------------------------------------------------------------------------------------------------- the turn
  let ang = 0, angVel = 0, angGoal = 0, spinRaf = 0, spinLast = 0;
  const hasBack = () => dlg.hasAttribute("data-has-back");
  const setAng = (d: number) => {
    ang = d;
    const r = (d * Math.PI) / 180;
    const c = Math.cos(r);
    const rest = Math.abs(d - Math.round(d / 180) * 180) / 90; // 0 on a face, 1 edge on
    card.style.setProperty("--ang", `${d.toFixed(2)}deg`);
    card.style.setProperty("--rest", rest.toFixed(3));
    card.style.setProperty("--sheen", ((((d % 180) + 180) % 180) / 180).toFixed(3));
    dlg.style.setProperty("--shadow", (0.42 + 0.58 * Math.abs(c)).toFixed(3));
    if (turn) turn.textContent = c < 0 ? (turn.dataset.front ?? "Front of pack") : (turn.dataset.back ?? "Turn it over");
  };
  const spinLoop = (now: number) => {
    let dt = Math.min(0.05, (now - spinLast) / 1000 || 0.016);
    spinLast = now;
    while (dt > 0) { const h = Math.min(dt, 1 / 120); [ang, angVel] = spring(ang, angVel, angGoal, h, 9, 0.62); dt -= h; }
    setAng(ang);
    if (Math.abs(angGoal - ang) < 0.05 && Math.abs(angVel) < 0.5) { setAng(angGoal); spinRaf = 0; return; }
    spinRaf = requestAnimationFrame(spinLoop);
  };
  const spinTo = (g: number) => {
    angGoal = g;
    if (reduced.matches) { angVel = 0; setAng(g); return; }
    if (!spinRaf) { spinLast = performance.now(); spinRaf = requestAnimationFrame(spinLoop); }
  };
  // Always round the same way, so a second click carries on rather than winding back.
  const spinOnce = () => { if (hasBack()) spinTo(Math.round(angGoal / 180) * 180 + 180); };
  turn?.addEventListener("click", spinOnce);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); spinOnce(); } });
  let hold: { id: number; x0: number; x: number; t: number; v: number; moved: boolean } | null = null;
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    hold = { id: e.pointerId, x0: e.clientX, x: e.clientX, t: performance.now(), v: 0, moved: false };
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", (e) => {
    if (!hold || e.pointerId !== hold.id || !hasBack()) return;
    if (!hold.moved && Math.abs(e.clientX - hold.x0) < 5) return;
    hold.moved = true;
    cancelAnimationFrame(spinRaf);
    spinRaf = 0;
    const now = performance.now();
    const d = (e.clientX - hold.x) * 0.55;
    hold.v = lerp(hold.v, d / Math.max(0.008, (now - hold.t) / 1000), 0.5);
    hold.x = e.clientX;
    hold.t = now;
    angGoal = ang + d;
    setAng(ang + d);
  });
  const letGo = (e: PointerEvent) => {
    if (!hold || e.pointerId !== hold.id) return;
    const h = hold;
    hold = null;
    if (!h.moved) return spinOnce();
    angVel = clamp(h.v, -1400, 1400);
    spinTo(Math.round((ang + angVel * 0.12) / 180) * 180);
  };
  card.addEventListener("pointerup", letGo);
  card.addEventListener("pointercancel", letGo);

  // ---------------------------------------------------------------------------------------------------- the pack
  const fit = () => {
    // The pack's real box inside the card (the picture is contained), for its edge and its light.
    const cw = card.clientWidth, ch = card.clientHeight;
    const nw = frontImg.naturalWidth, nh = frontImg.naturalHeight;
    if (!cw || !ch || !nw || !nh) return;
    const k = Math.min(cw / nw, ch / nh);
    card.style.setProperty("--pw", `${(nw * k).toFixed(1)}px`);
    card.style.setProperty("--ph", `${(nh * k).toFixed(1)}px`);
  };
  frontImg.addEventListener("load", fit);
  addEventListener("resize", fit);
  const fill = (a: Aisle, i: number) => {
    const b = a.items[i]!.el;
    current = { a, i };
    const set = (sel: string, v: string) => { const el = dlg.querySelector(sel); if (el) el.textContent = v; };
    set(".al-code", `${a.code}${i + 1}`);
    set(".al-name", b.dataset.name ?? "");
    set(".al-meta", b.dataset.meta ?? "");
    const facts = dlg.querySelector(".al-facts");
    if (facts) facts.innerHTML = (b.dataset.facts ?? "").split("|").filter(Boolean).map((f) => `<li>${f.replace(/[<>&]/g, "")}</li>`).join("");
    const fsrc = b.dataset.front ?? "", bsrc = b.dataset.back ?? "";
    if (frontImg.getAttribute("src") !== fsrc) frontImg.src = fsrc;
    frontImg.alt = `${b.dataset.name ?? ""}, front of pack`;
    if (backImg.getAttribute("src") !== bsrc) backImg.src = bsrc;
    backImg.alt = bsrc ? `${b.dataset.name ?? ""}, back of pack` : "";
    // Absolute: a relative url() held in a custom property resolves against the stylesheet that reads it (assets/),
    // not the page, and asked for assets/assets/products/... on the live demo.
    const abs = (s: string) => new URL(s, document.baseURI).href;
    card.style.setProperty("--sf", `url('${abs(fsrc)}')`);
    card.style.setProperty("--sb", bsrc ? `url('${abs(bsrc)}')` : "none");
    dlg.toggleAttribute("data-has-back", Boolean(bsrc));
    if (frontImg.complete) fit();
    if (relLabel) relLabel.textContent = a.label;
    if (relRow) {
      relRow.innerHTML = a.items.filter((it) => it.i !== i).map((it) => `<button type="button" class="al-rel" data-i="${it.i}" aria-label="${(it.el.dataset.name ?? "").replace(/[<>&"]/g, "")}"><img src="${it.el.dataset.front ?? ""}" alt="" decoding="async" draggable="false"></button>`).join("");
      relRow.querySelectorAll<HTMLButtonElement>(".al-rel").forEach((btn) => btn.addEventListener("click", () => swap(Number(btn.dataset.i))));
    }
    cancelAnimationFrame(spinRaf);
    spinRaf = 0;
    angVel = 0;
    angGoal = 0;
    setAng(0);
  };
  // A related pack takes the stage: the current one sinks away, the new one rises into its place.
  let swapAnim = 0;
  // On the dialog, not the card: fading the card itself would flatten its 3D and show the front through the back.
  const setSwap = (k: number) => dlg.style.setProperty("--swap", k.toFixed(3));
  const swap = (i: number) => {
    if (!current) return;
    const a = current.a;
    cancelAnimationFrame(swapAnim);
    if (reduced.matches) { fill(a, i); from = a.items[i]!.el; return; }
    const t0 = performance.now();
    let swapped = false;
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (t < 0.16) setSwap(easeIn(t / 0.16));
      else {
        if (!swapped) { swapped = true; fill(a, i); from = a.items[i]!.el; }
        setSwap(1 - easeOut((t - 0.16) / 0.3));
      }
      if (t < 0.46) swapAnim = requestAnimationFrame(tick);
      else setSwap(0);
    };
    swapAnim = requestAnimationFrame(tick);
  };

  // Opening flies the pack from where it stands in the aisle to the middle of the look.
  const place = (p: number) => {
    dlg.style.setProperty("--o", p.toFixed(3));
    stage.style.transform = "";
    if (!from) return;
    const img = from.querySelector("img");
    const a = img?.getBoundingClientRect();
    const b = frontImg.getBoundingClientRect();
    const ph = parseFloat(card.style.getPropertyValue("--ph")) || b.height;
    if (!a || !a.width || !b.width) return;
    const s = lerp(a.height / ph, 1, p);
    const dx = lerp(a.left + a.width / 2 - (b.left + b.width / 2), 0, p);
    const dy = lerp(a.top + a.height / 2 - (b.top + b.height / 2), 0, p);
    stage.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`;
  };
  const tween = (to: number, done?: () => void) => {
    cancelAnimationFrame(anim);
    const s = parseFloat(dlg.style.getPropertyValue("--o")) || 0;
    if (reduced.matches) { place(to); done?.(); return; }
    const t0 = performance.now();
    const ms = to > s ? 620 : 440;
    const tick = (now: number) => {
      const k = (now - t0) / ms;
      place(lerp(s, to, to > s ? easeOut(k) : ease(k)));
      if (k < 1) anim = requestAnimationFrame(tick);
      else done?.();
    };
    anim = requestAnimationFrame(tick);
  };
  let opener: HTMLElement | null = null;
  const open = (b: HTMLElement, a: Aisle, i: number, toBack = false) => {
    opener = b;
    from = b;
    fill(a, i);
    if (!dlg.open) dlg.showModal();
    document.documentElement.classList.add("look-open");
    place(0);
    tween(1, () => { if (toBack) spinOnce(); });
    dlg.querySelector<HTMLButtonElement>(".al-close")?.focus({ preventScroll: true });
  };
  const close = () => {
    if (!dlg.open) return;
    tween(0, () => {
      dlg.close();
      document.documentElement.classList.remove("look-open");
      opener?.focus({ preventScroll: true });
    });
  };
  dlg.querySelector(".al-close")?.addEventListener("click", close);
  dlg.querySelector(".al-veil")?.addEventListener("click", close);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.querySelector<HTMLAnchorElement>(".al-cta")?.addEventListener("click", (e) => {
    const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href") ?? "";
    if (!href.startsWith("#")) return;
    e.preventDefault();
    dlg.close();
    document.documentElement.classList.remove("look-open");
    dlg.style.setProperty("--o", "0");
    document.querySelector(href)?.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth" });
  });
  return {
    open,
    isOpen: () => dlg.open,
    /** The recorder's hold on the look: how far open, the turn in degrees, and a related swap's dip. */
    demo(b: HTMLElement, a: Aisle, i: number, p: number, turnDeg: number, swapK: number) {
      if (p <= 0.001) {
        if (dlg.open) { dlg.close(); document.documentElement.classList.remove("look-open"); }
        dlg.style.setProperty("--o", "0");
        return;
      }
      if (!dlg.open) {
        dlg.showModal();
        document.documentElement.classList.add("look-open");
        (document.activeElement as HTMLElement | null)?.blur();
      }
      if (!current || current.a !== a || current.i !== i) fill(a, i);
      from = b;
      place(p);
      setAng(turnDeg);
      setSwap(swapK);
    },
  };
}

