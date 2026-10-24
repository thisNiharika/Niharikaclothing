// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Unzip: a close-up of two hands on the front edges of an open jacket, split along the gap into a left half and a
// right half on one canvas. The section pins; the halves part with the scroll and the label's name stands huge in the
// gap on black; the black panel lifts out and the street photograph behind it settles from a push-in; the halves clear
// the frame; the headline rises on its own dark panel and a pin draws to the jacket, which goes to the shop with that
// jacket chosen. The panel dissolves rather than slides, so the street comes up through the name. Reduced motion
// shows the end state. The halves, the plate and the words are all in the markup.

import { chooseAndShop } from "./wear";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x, 0, 1)));

/** Where everything stands at u, 0 to 1 through the pin. Exported for the tests. */
export function unzipAt(u: number) {
  const part = smooth(0, 0.35, u);
  const clear = smooth(0.6, 0.95, u);
  return {
    half: 18 * part + 46 * clear, // percent of the width each half has moved outward
    tilt: 2 * part - 1 * clear, // degrees, away from the centre
    mark: 0.9 + 0.1 * part, // the wordmark's scale in the gap
    panel: easeOutExpo(smooth(0.35, 0.6, u)), // the black panel's dissolve, 0 in place to 1 gone
    plate: 1.12 - 0.12 * smooth(0.3, 0.72, u), // the street photograph's scale
    copy: smooth(0.62, 0.8, u),
    pin: smooth(0.8, 0.95, u),
  };
}

export function initUnzip() {
  document.querySelectorAll<HTMLElement>("[data-unzip]").forEach((root) => setup(root));
}

function setup(root: HTMLElement) {
  const pin = root.querySelector<HTMLElement>(".uz-pin")!;
  const left = root.querySelector<HTMLElement>(".uz-left"), right = root.querySelector<HTMLElement>(".uz-right");
  const panel = root.querySelector<HTMLElement>(".uz-panel"), mark = root.querySelector<HTMLElement>(".uz-mark");
  const plate = root.querySelector<HTMLElement>(".uz-plate"), copy = root.querySelector<HTMLElement>(".uz-copy");
  const dot = root.querySelector<HTMLElement>(".uz-pin-dot");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const ptr = { x: 0.5, on: false };
  let uNow = 0, raf = 0, last = 0;

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1);
  };
  const apply = (u: number) => {
    const S = unzipAt(u);
    const lean = ptr.on ? (ptr.x - 0.5) * 4 : 0;
    if (left) left.style.transform = `translate3d(${(-S.half).toFixed(2)}%, 0, 0) translateX(${lean.toFixed(1)}px) rotate(${(-S.tilt).toFixed(2)}deg)`;
    if (right) right.style.transform = `translate3d(${S.half.toFixed(2)}%, 0, 0) translateX(${lean.toFixed(1)}px) rotate(${S.tilt.toFixed(2)}deg)`;
    if (panel) { panel.style.opacity = (1 - S.panel).toFixed(3); panel.style.visibility = S.panel > 0.995 ? "hidden" : "visible"; }
    if (mark) mark.style.transform = `scale(${S.mark.toFixed(3)})`;
    if (plate) plate.style.transform = `scale(${S.plate.toFixed(4)})`;
    if (copy) { copy.style.opacity = S.copy.toFixed(3); copy.style.transform = `translate3d(0, ${((1 - S.copy) * 28).toFixed(1)}px, 0)`; copy.style.pointerEvents = S.copy > 0.8 ? "auto" : "none"; }
    if (dot) { dot.style.setProperty("--draw", S.pin.toFixed(3)); dot.style.pointerEvents = S.pin > 0.8 ? "auto" : "none"; }
    root.classList.toggle("is-open", S.panel > 0.5);
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    uNow += (progress() - uNow) * (reduced.matches ? 1 : 1 - Math.exp(-dt / 0.12));
    apply(uNow);
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  if (reduced.matches) { apply(1); root.classList.add("is-still"); }
  else {
    new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
    pin.addEventListener("pointermove", (e) => { const r = pin.getBoundingClientRect(); ptr.x = (e.clientX - r.left) / Math.max(1, r.width); ptr.on = e.pointerType === "mouse"; }, { passive: true });
    pin.addEventListener("pointerleave", () => { ptr.on = false; });
    uNow = progress();
    apply(uNow);
  }
  for (const b of root.querySelectorAll<HTMLElement>("[data-uz-shop]")) b.addEventListener("click", (e) => { e.preventDefault(); chooseAndShop(Number(b.dataset.uzShop) || 0); });
}
