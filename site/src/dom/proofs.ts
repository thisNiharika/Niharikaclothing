// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Proofs: one artwork pinned while its proofs wipe over each other (line, flat colour, full colour, varnish), driven
// by how far the section has scrolled. Pegboard: packs on hooks that turn over when pressed.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Which proof is showing at progress p (0 to 1 through the section), and how far the next one has wiped over it. */
export function proofAt(p: number, stages: number) {
  const x = clamp(p, 0, 1) * (stages - 1) * 1.15;
  const k = Math.min(stages - 1, Math.floor(x));
  return { k, wipe: k >= stages - 1 ? 0 : smooth(0.35, 1, x - k) };
}

export function initProofs() {
  for (const root of document.querySelectorAll<HTMLElement>("[data-proofs]")) {
    const layers = [...root.querySelectorAll<HTMLElement>(".pf-layer")];
    const items = [...root.querySelectorAll<HTMLElement>(".pf-stages li")];
    const wipe = root.querySelector<HTMLElement>(".pf-wipe");
    const sheen = root.querySelector<HTMLElement>(".pf-sheen");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const r = root.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1);
      const { k, wipe: w } = proofAt(p, layers.length);
      // Each layer above the one showing is clipped from the right; the next one wipes in from the left edge.
      layers.forEach((el, j) => {
        const show = j < k ? 1 : j === k ? 1 : j === k + 1 ? w : 0;
        el.style.clipPath = `inset(0 ${((1 - show) * 100).toFixed(2)}% 0 0)`;
        el.style.zIndex = String(j);
      });
      if (wipe) { wipe.style.left = `${(w * 100).toFixed(2)}%`; wipe.style.opacity = w > 0.001 && w < 0.999 ? "1" : "0"; }
      items.forEach((el, j) => el.classList.toggle("is-on", j === (w > 0.5 ? k + 1 : k)));
      if (sheen) sheen.style.transform = `translateX(${(-60 + smooth(0.86, 1, p) * 220).toFixed(1)}%) skewX(-18deg)`;
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(draw); };
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", ask);
    if (reduced) layers.forEach((el) => (el.style.clipPath = "none"));
    draw();
  }
}

export function initPegboard() {
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-pegboard] .pg-pack:not([disabled])")) {
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(on));
    });
  }
}
