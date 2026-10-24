// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Conveyor: boxes riding a belt past each step as the page scrolls. The belt's surface and rollers move with the
// scroll, every box keeps the same spacing, and a station lights while a box is passing it.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Where box k (of n) sits along the belt at progress p, from 0 (off the left) to 1 (off the right). */
export function boxAt(p: number, k: number, n: number) {
  return -0.12 + ((p * 1.6 + (n - 1 - k) / n) % 1) * 1.24;
}

export function initConveyor() {
  for (const root of document.querySelectorAll<HTMLElement>("[data-conveyor]")) {
    const boxes = [...root.querySelectorAll<HTMLElement>(".cv-box")];
    const steps = [...root.querySelectorAll<HTMLElement>(".cv-steps li")];
    const surface = root.querySelector<HTMLElement>(".cv-surface");
    const rollers = [...root.querySelectorAll<HTMLElement>(".cv-rollers i")];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const r = root.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1);
      const line = root.querySelector<HTMLElement>(".cv-line");
      const w = line?.clientWidth ?? innerWidth;
      const xs = boxes.map((el, k) => {
        const x = boxAt(reduced ? 0.3 : p, k, boxes.length);
        el.style.transform = `translateX(${(x * w).toFixed(1)}px)`;
        return x;
      });
      steps.forEach((el) => {
        const sx = parseFloat(getComputedStyle(el).getPropertyValue("--x")) || 0;
        el.classList.toggle("is-on", xs.some((x) => Math.abs(x + 0.04 - sx) < 0.07));
      });
      if (surface) surface.style.backgroundPositionX = `${(p * w * 1.6).toFixed(1)}px`;
      rollers.forEach((el) => (el.style.transform = `rotate(${(p * 1440).toFixed(1)}deg)`));
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(draw); };
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", ask);
    draw();
  }
}
