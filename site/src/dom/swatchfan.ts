// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Swatchfan: a deck of colour swatches held at one corner that fans open as the page scrolls. Hovering or focusing a
// card draws it out of the fan and shows the garment in that colour beside it; the first card is shown to begin with.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A card's angle in degrees at fan opening k (0 closed, 1 open): from a near-stack to a spread of `spread` degrees. */
export function cardAngle(f: number, k: number, spread = 110) {
  return f * (6 + (spread - 6) * k);
}

export function initSwatchfan() {
  for (const root of document.querySelectorAll<HTMLElement>("[data-swatchfan]")) {
    const cards = [...root.querySelectorAll<HTMLButtonElement>(".sf-card")];
    const look = root.querySelector<HTMLElement>(".sf-look");
    const img = look?.querySelector<HTMLImageElement>("img");
    const name = look?.querySelector<HTMLElement>("strong");
    const code = look?.querySelector<HTMLElement>("figcaption span");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let active = 0, raf = 0;
    const show = (k: number) => {
      active = k;
      const c = cards[k];
      if (!c) return;
      cards.forEach((el, j) => el.classList.toggle("is-on", j === k));
      if (img && c.dataset.image) { img.src = c.dataset.image; img.alt = c.getAttribute("aria-label") ?? ""; }
      if (name) name.textContent = c.querySelector("strong")?.textContent ?? "";
      if (code) code.textContent = (c.getAttribute("aria-label") ?? "").split(", ").slice(1).join(" · ");
      look?.style.setProperty("--c", getComputedStyle(c).getPropertyValue("--c"));
    };
    const draw = () => {
      raf = 0;
      const r = root.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1);
      const k = reduced ? 1 : smooth(0.05, 0.6, p);
      cards.forEach((el) => {
        const f = parseFloat(el.style.getPropertyValue("--f")) || 0;
        el.style.setProperty("--a", `${cardAngle(f, k).toFixed(2)}deg`);
      });
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(draw); };
    cards.forEach((el, k) => {
      el.addEventListener("pointerenter", () => show(k));
      el.addEventListener("focus", () => show(k));
      el.addEventListener("click", () => show(k));
    });
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", ask);
    show(active);
    draw();
  }
}
