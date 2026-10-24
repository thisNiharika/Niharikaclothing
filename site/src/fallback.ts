// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
import type { KitConfig } from "./config";

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Poster or 2D layers with pointer and scroll parallax. No WebGL. */
export function initFallback(cfg: KitConfig) {
  const poster = document.getElementById("poster") as HTMLImageElement;
  const layersEl = document.getElementById("layers")!;
  const layers = cfg.assets.layers ?? [];
  const reduced = prefersReducedMotion();
  const els: { el: HTMLElement; depth: number }[] = [];
  if (layers.length) {
    poster.style.opacity = "0";
    layers.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.decoding = "async";
      layersEl.appendChild(img);
      els.push({ el: img, depth: (i + 1) / layers.length });
    });
  } else {
    els.push({ el: poster, depth: 1 });
    poster.style.transform = "scale(1.06)";
  }
  if (reduced) return;
  const max = 12;
  let tx = 0, ty = 0, sy = 0;
  const apply = () => {
    for (const { el, depth } of els) el.style.transform = `translate3d(${tx * depth}px, ${(ty + sy) * depth}px, 0) scale(1.06)`;
  };
  window.addEventListener("pointermove", (e) => {
    tx = ((e.clientX / innerWidth) - 0.5) * max * 2;
    ty = ((e.clientY / innerHeight) - 0.5) * max * 2;
    apply();
  }, { passive: true });
  window.addEventListener("scroll", () => {
    sy = Math.min(60, scrollY * 0.06);
    apply();
  }, { passive: true });
  if ("DeviceOrientationEvent" in window && isMobile()) {
    window.addEventListener("deviceorientation", (e) => {
      tx = ((e.gamma ?? 0) / 45) * max;
      ty = ((e.beta ?? 0) / 90) * max;
      apply();
    });
  }
}
