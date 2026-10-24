// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Wear: one person, and the range worn on him. The man stands in his base layer; the jackets hang on an invisible rail
// across the screen at his shoulder height, the one in the middle on his body and its neighbours a jacket's width
// either side, faint. Scrolling moves the rail, one jacket per stretch of the pin, on a spring. As a jacket arrives its
// cut-out (the ghost) slides onto him and fades while the photograph of him wearing it crossfades in over the base, so
// what he wears is the worn photograph itself and the only thing that changes is the jacket. The ground takes a tint
// of the jacket in focus, the counter rolls, and the name under it changes. Every jacket is a button: a ghost brings
// itself onto him, the one he wears goes to the shop with that jacket chosen (options:choose), as does Shop No. 0n.
// The rail follows the scroll on an underdamped spring, so a jacket overshoots its place a little and snaps back; it is
// small out on the rail and grows as it comes in from the right, and shrinks as it leaves to the left. Under everything,
// a pebbled leather ground with giant letters pressed into it that lean away from the pointer, and each jacket's name
// set huge along the bottom edge, cropped by it, sliding with the rail. Timing lives in wear-plan.ts.

import { demoRailAt, demoSeconds, layerAt, nearest, railAt, screensFor, smooth, tintAt, totalScreens, wordAt } from "./wear-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

type Jacket = { id: string; name: string; meta: string; price: string; colour: [number, number, number]; worn: HTMLImageElement; ghost: HTMLButtonElement };

export function initWear() {
  document.querySelectorAll<HTMLElement>("[data-wear]").forEach((el) => setup(el, el.classList.contains("hero")));
}

/** Tell the shop which jacket was chosen and go there. The options section listens for options:choose. */
export function chooseAndShop(index: number) {
  document.dispatchEvent(new CustomEvent("options:choose", { detail: { index } }));
  document.dispatchEvent(new CustomEvent("wear:choose", { detail: { index } }));
  const shop = document.querySelector<HTMLElement>("[data-options]")?.closest("section");
  shop?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".wr-pin")!;
  const figure = root.querySelector<HTMLElement>(".wr-figure")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const recording = new URLSearchParams(location.search).has("record") || new URLSearchParams(location.search).has("poster");
  const hex = (c: string): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); const v = m ? parseInt(m[1]!, 16) : 0x888888; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const jackets: Jacket[] = [...root.querySelectorAll<HTMLElement>(".wr-data i")].map((d, i) => ({
    id: d.dataset.id ?? String(i), name: d.dataset.name ?? "", meta: d.dataset.meta ?? "", price: d.dataset.price ?? "", colour: hex(d.dataset.colour ?? ""),
    worn: root.querySelector<HTMLImageElement>(`.wr-worn[data-i="${i}"]`)!, ghost: root.querySelector<HTMLButtonElement>(`.wr-ghost[data-i="${i}"]`)!,
  })).filter((j) => j.worn && j.ghost);
  const n = jackets.length;
  if (!n) return;
  const total = totalScreens(n);
  root.style.setProperty("--wr-screens", String(1 + total));
  const on = root.querySelector<HTMLButtonElement>(".wr-on");
  const onLabel = root.querySelector<HTMLElement>(".wr-on-label");
  const roll = root.querySelector<HTMLElement>(".wr-roll");
  const names = [...root.querySelectorAll<HTMLElement>(".wr-names span")];
  const shopBtns = [...root.querySelectorAll<HTMLElement>("[data-wr-shop]")];
  const navCta = document.querySelector<HTMLAnchorElement>("#nav .btn-nav");
  const jw = Number(root.dataset.jw) || 0.47; // a jacket's width as a fraction of the figure's canvas
  const words = [...root.querySelectorAll<HTMLElement>(".wr-word span")];
  const mono = root.querySelector<HTMLElement>(".wr-mono");
  const nums = [...root.querySelectorAll<HTMLElement>(".wr-mono .m-num span")];
  // The ground's texture is a picture under assets/, named on the section; it is set here as an absolute address so
  // the stylesheet, which lives elsewhere, never resolves it (see tests/template-sandbox.test.ts).
  const ground = root.querySelector<HTMLElement>(".wr-ground");
  if (ground && root.dataset.ground) ground.style.backgroundImage = `url(${new URL(root.dataset.ground, location.href).href})`;

  const ptr = { x: 0.5, y: 0.5, on: false };
  let pNow = 0, vNow = 0, raf = 0, last = 0, demoing = false, chosen = -1, hovered = -1;

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, innerHeight), 0, total);
  };

  const choose = (i: number) => {
    if (i === chosen) return;
    chosen = i;
    const j = jackets[i]!;
    const text = `Shop No. ${j.id}`;
    for (const b of shopBtns) b.textContent = text;
    // The nav's button follows the jacket until the bag has something in it, when the options script owns it.
    if (navCta && !navCta.querySelector(".bag-count")) navCta.textContent = text;
    if (on) on.setAttribute("aria-label", `${text}, ${j.name}, ${j.price}`);
    if (onLabel) onLabel.textContent = `No. ${j.id} · ${j.price} · Shop`;
    if (hovered < 0) names.forEach((el, k) => el.classList.toggle("on", k === i));
    nums.forEach((el, k) => el.classList.toggle("on", k === i));
    root.dataset.chosen = String(i);
  };

  const apply = (p: number) => {
    const W = figure.clientWidth;
    const lean = ptr.on && !reduced.matches ? (ptr.x - 0.5) * 2 : 0;
    for (let i = 0; i < n; i++) {
      const j = jackets[i]!;
      const L = layerAt(i - p);
      j.worn.style.opacity = L.worn.toFixed(3);
      j.worn.style.visibility = L.worn > 0.002 ? "visible" : "hidden";
      j.worn.style.transform = L.wornScale > 1.0005 ? `scale(${L.wornScale.toFixed(4)})` : "";
      const Wd = wordAt(i - p);
      const word = words[i];
      if (word) { word.style.opacity = Wd.show.toFixed(3); word.style.visibility = Wd.show > 0.002 ? "visible" : "hidden"; word.style.transform = `translate3d(${Wd.x.toFixed(2)}vw, 0, 0)`; }
      const ghost = reduced.matches ? 0 : L.ghost;
      j.ghost.style.opacity = ghost.toFixed(3);
      j.ghost.style.visibility = ghost > 0.002 ? "visible" : "hidden";
      // Ghosts lean away from the pointer by up to 10 px, the near ones most; the worn one by 3.
      const x = L.x * jw * W - lean * 10 * Math.min(1, Math.abs(L.x));
      const y = 4 * smooth(0.12, 0.5, Math.abs(i - p));
      j.ghost.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${L.scale.toFixed(4)})`;
      j.ghost.style.zIndex = String(10 - Math.round(Math.min(5, Math.abs(i - p)) * 2));
      j.ghost.tabIndex = ghost > 0.2 ? 0 : -1;
    }
    figure.style.setProperty("--lean", `${(-lean * 3).toFixed(1)}px`);
    // The letters pressed into the ground lean away from the pointer, further than anything else, so the ground has depth.
    if (mono) mono.style.transform = `translate3d(${(-lean * 20).toFixed(1)}px, ${(ptr.on && !reduced.matches ? (ptr.y - 0.5) * -26 : 0).toFixed(1)}px, 0)`;
    // The ground's tint: a tenth of the jacket in focus, mixed between neighbours as the rail moves, laid over the leather.
    const T = tintAt(p, n);
    const a = jackets[T.i0]!.colour, b = jackets[T.i1]!.colour;
    const mix = a.map((v, k) => Math.round(lerp(v, b[k]!, T.t)));
    pin.style.setProperty("--wr-tint", `rgba(${mix.join(",")}, 0.1)`);
    if (roll) roll.style.transform = `translateY(${(-p).toFixed(4)}em)`;
    const N = nearest(p);
    choose(clamp(N.i, 0, n - 1));
    // The hit area over the jacket he wears only works while one is on him.
    if (on) { on.style.opacity = N.hold > 0.6 ? "1" : "0"; on.style.pointerEvents = N.hold > 0.6 ? "auto" : "none"; }
  };

  // An underdamped spring (natural period about half a second, damping ratio 0.62): the rail overshoots a landing by a
  // few percent and snaps back, which is the feel of a jacket arriving rather than a slide coming to rest.
  const K = 160, C = 2 * 0.62 * Math.sqrt(K);
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const p = railAt(progress(), n);
    if (reduced.matches) { pNow = p; vNow = 0; }
    else {
      vNow += (K * (p - pNow) - C * vNow) * dt;
      pNow += vNow * dt;
      if (Math.abs(p - pNow) < 0.0005 && Math.abs(vNow) < 0.002) { pNow = p; vNow = 0; }
    }
    apply(pNow);
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));

  pin.addEventListener("pointermove", (e) => {
    const r = pin.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / Math.max(1, r.width); ptr.y = (e.clientY - r.top) / Math.max(1, r.height);
    ptr.on = e.pointerType === "mouse";
  }, { passive: true });
  pin.addEventListener("pointerleave", () => { ptr.on = false; });
  addEventListener("resize", () => apply(pNow));

  // Scroll the page so jacket i is on him. The section's top plus its screens; the spring does the rest.
  const goTo = (i: number) => {
    const y = root.getBoundingClientRect().top + scrollY + screensFor(clamp(i, 0, n - 1)) * innerHeight;
    scrollTo({ top: y, behavior: reduced.matches ? "auto" : "smooth" });
  };
  jackets.forEach((j, i) => j.ghost.addEventListener("click", () => goTo(i)));
  // A ghost takes no pointer events of its own (a cut-out's transparent pixels would), so the figure works out which
  // one is under the pointer from the garment's box moved by each ghost's offset, and the one he wears has its own
  // button over that box.
  const frac = (name: string, fallback: number) => { const v = parseFloat(getComputedStyle(figure).getPropertyValue(name)); return Number.isFinite(v) ? v / 100 : fallback; };
  const hitGhost = (cx: number, cy: number): number => {
    const fr = figure.getBoundingClientRect();
    const bx = frac("--bx", 0.27), by = frac("--by", 0.14), bw = frac("--bw", 0.48), bh = frac("--bh", 0.38);
    if (cy < fr.top + by * fr.height || cy > fr.top + (by + bh) * fr.height) return -1;
    let best = -1, bestD = 9;
    for (let i = 0; i < n; i++) {
      const L = layerAt(i - pNow);
      if (L.ghost < 0.1 || L.worn > 0.5) continue;
      const left = fr.left + bx * fr.width + L.x * jw * fr.width;
      if (cx >= left && cx <= left + bw * fr.width && Math.abs(i - pNow) < bestD) { best = i; bestD = Math.abs(i - pNow); }
    }
    return best;
  };
  const hover = (i: number) => {
    if (i === hovered) return;
    if (hovered >= 0) jackets[hovered]?.ghost.classList.remove("is-hover");
    hovered = i;
    if (i >= 0) jackets[i]!.ghost.classList.add("is-hover");
    figure.classList.toggle("is-ghost", i >= 0);
    names.forEach((el, k) => el.classList.toggle("on", k === (i >= 0 ? i : chosen)));
  };
  figure.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hover(hitGhost(e.clientX, e.clientY)); }, { passive: true });
  figure.addEventListener("pointerleave", () => hover(-1));
  figure.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest(".wr-on")) return; const i = hitGhost(e.clientX, e.clientY); if (i >= 0) goTo(i); });
  // Anything on the page marked data-choose="n" (a caption in a strip, a pin) chooses that garment for the shop.
  for (const b of document.querySelectorAll<HTMLElement>("[data-choose]")) b.addEventListener("click", (e) => { e.preventDefault(); chooseAndShop(Number(b.dataset.choose) || 0); });
  on?.addEventListener("click", () => chooseAndShop(chosen < 0 ? 0 : chosen));
  for (const b of shopBtns) b.addEventListener("click", (e) => { e.preventDefault(); chooseAndShop(chosen < 0 ? 0 : chosen); });
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const r = root.getBoundingClientRect();
    if (r.bottom < innerHeight * 0.5 || r.top > innerHeight * 0.5) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(Math.round(pNow) + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(Math.round(pNow) - 1); }
  });

  // First paint: the base and the first worn photograph. Everything else follows.
  pNow = railAt(progress(), n);
  apply(pNow);
  root.classList.add("wear-ready");
  const first = [jackets[0]!.worn, root.querySelector<HTMLImageElement>(".wr-base")].filter((im): im is HTMLImageElement => !!im);
  Promise.all(first.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => undefined)))).then(() => {
    apply(pNow);
    document.body.classList.add("canvas-ready");
    // Arrival: tiles of the page ground lift off the hero from the top left once the type and the man are in. Never
    // for the recorder or the poster, which want the page at rest, and never for reduced motion.
    if (!recording && !reduced.matches) arrive(pin);
  });

  // ---------------------------------------------------------------------------------------------- card recording
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const seconds = demoSeconds(n);
    let cursor: SVGSVGElement | null = null;
    const demo = (time: number) => {
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
      const W = pin.clientWidth, H = pin.clientHeight;
      const fr = figure.getBoundingClientRect();
      // The pointer drifts in from the right ghost to the man, then rests on the jacket he wears, which lifts its label.
      const k = smoother(time / 2.2);
      const x = lerp(fr.left + fr.width * 1.15, fr.left + fr.width * 0.56, k), y = lerp(fr.top + fr.height * 0.42, fr.top + fr.height * 0.3, k);
      ptr.x = x / W; ptr.y = y / H; ptr.on = true;
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const p = demoRailAt(time, n);
      apply(p);
      const N = nearest(p);
      on?.classList.toggle("is-hover", time > seconds - 2.2 && N.hold > 0.9);
    };
    (demo as unknown as { seconds: number }).seconds = seconds;
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

/** Tiles of the page ground over the hero lifting off in a diagonal stagger from the top left, then removed. */
function arrive(pin: HTMLElement) {
  const cols = 6, rows = 4;
  const wrap = document.createElement("div");
  wrap.className = "wr-tiles";
  wrap.setAttribute("aria-hidden", "true");
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = document.createElement("i");
    t.style.setProperty("--d", `${((r + c) * 40).toFixed(0)}ms`);
    wrap.appendChild(t);
  }
  pin.appendChild(wrap);
  const go = () => { wrap.classList.add("off"); setTimeout(() => wrap.remove(), 1400); };
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  let done = false;
  const once = () => { if (!done) { done = true; requestAnimationFrame(go); } };
  (fonts?.ready ?? Promise.resolve()).then(once, once);
  setTimeout(once, 900);
}
