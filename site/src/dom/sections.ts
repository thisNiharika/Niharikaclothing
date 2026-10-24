// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { KitConfig } from "../config";
import { prefersReducedMotion } from "../fallback";

gsap.registerPlugin(ScrollTrigger);

/** One scroll driver for the whole page: reveals, progress HUD, magnetic CTA, material swatches. */
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };

export function initScroll(cfg: KitConfig) {
  const reduced = prefersReducedMotion();
  const recording = new URLSearchParams(location.search).has("record");
  // The scroll cue disappears once the visitor has moved.
  const onScroll = () => document.body.classList.toggle("scrolled", scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Beats on a pinned hero: copy fades by the hero's own scroll progress, the same way film chapters do.
  const hero = document.querySelector<HTMLElement>("section.hero.beats-hero");
  if (hero) {
    const beats = [...hero.querySelectorAll<HTMLElement>(".beat")];
    if (hero.dataset.tone) document.body.dataset.tone = hero.dataset.tone;
    const fade = (progress: number) => beats.forEach((b) => {
      const from = Number(b.dataset.from), to = Number(b.dataset.to);
      // The copy reaches full opacity quickly and holds: a quarter of the span fades it in, a fifth fades it out.
          const w = Math.min(0.05, (to - from) / 4);
      const fadeIn = from <= 0 ? 1 : smooth(from, from + w, progress);
      const o = fadeIn * (1 - smooth(to - w, to, progress));
      b.style.opacity = String(o);
      b.style.transform = `translateY(${(1 - o) * 16}px)`;
      if (o < 0.01) b.setAttribute("data-off", ""); else b.removeAttribute("data-off");
    });
    ScrollTrigger.create({ trigger: hero, start: "top top", end: "bottom bottom", scrub: recording ? true : 0.3, onUpdate: (st) => fade(st.progress), onLeave: () => fade(1), onLeaveBack: () => fade(0) });
  }
  // Engraver: the initials typed appear on the ring face in the chosen lettering.
  for (const box of document.querySelectorAll<HTMLElement>("[data-engraver]")) {
    const mark = box.querySelector<HTMLElement>(".engraver-mark");
    const input = box.querySelector<HTMLInputElement>("input");
    if (!mark || !input) continue;
    // The cap and the allowed characters come from the markup, so the same component takes three initials on a ring or
    // a shop name on a fascia. `--mark-ch` lets the stylesheet size the lettering to how much of it there is.
    const max = input.maxLength > 0 ? input.maxLength : 3;
    const allow = box.dataset.allow === "words" ? /[^a-z0-9 &'.-]/gi : /[^a-z]/gi;
    const set = () => {
      const v = input.value.replace(allow, "").slice(0, max).toUpperCase();
      const shown = v || input.defaultValue.toUpperCase();
      mark.textContent = shown;
      mark.style.setProperty("--mark-ch", String(Math.max(1, shown.length)));
    };
    input.addEventListener("input", set);
    for (const b of box.querySelectorAll<HTMLButtonElement>(".engraver-styles button")) b.addEventListener("click", () => {
      for (const o of box.querySelectorAll<HTMLButtonElement>(".engraver-styles button")) o.setAttribute("aria-pressed", String(o === b));
      mark.dataset.style = b.dataset.style ?? "script";
    });
  }
  const progress = document.getElementById("progress");
  ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      if (progress) progress.textContent = String(Math.round(self.progress * 100)).padStart(2, "0");
    },
  });

  // Reveals watch the viewport directly: the page's height changes after the film chapters set their pin length, and
  // an observer does not care, where a measured trigger position would go stale.
  const reveals = [...document.querySelectorAll<HTMLElement>(".reveal")];
  if (reduced) reveals.forEach((el) => el.classList.add("in"));
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.01 });
    reveals.forEach((el) => io.observe(el));
  }

  const magnetic = cfg.interactions.find((i) => i.type === "magnetic-cta");
  if (magnetic && !reduced && matchMedia("(pointer:fine)").matches) {
    const btn = document.querySelector<HTMLElement>(magnetic.target) ?? document.querySelector<HTMLElement>(".hero .btn");
    if (btn) {
      const range = magnetic.range_px ?? 8;
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = ((e.clientX - (r.left + r.width / 2)) / r.width) * range * 2;
        const dy = ((e.clientY - (r.top + r.height / 2)) / r.height) * range * 2;
        gsap.to(btn, { x: dx, y: dy, duration: 0.25, ease: "power2.out" });
      });
      btn.addEventListener("pointerleave", () => gsap.to(btn, { x: 0, y: 0, duration: 0.35, ease: "power2.out" }));
    }
  }

  // Material swatches dispatch a custom event the WebGL scene listens to.
  document.querySelectorAll<HTMLButtonElement>(".swatch").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      window.dispatchEvent(new CustomEvent("kit:material", { detail: { material: b.dataset.material, color: b.dataset.color } }));
    });
  });

  initOptions();

  // Horizontal strips: the track moves left by exactly its overflow while the section is pinned. Phones swipe instead.
  if (!matchMedia("(max-width: 767px)").matches) {
    // A pan strip travels one wide picture past a fixed view while the section is pinned, and lights the finding whose
    // dot is nearest the middle of that view. The dot positions are fractions of the picture, so the note that lights is
    // decided by where the reader is on the subject rather than by which paragraph is on screen.
    document.querySelectorAll<HTMLElement>("[data-panstrip]").forEach((track) => {
      const section = track.closest<HTMLElement>("section.panstrip");
      const view = track.parentElement;
      if (!section || !view) return;
      const dots = [...track.querySelectorAll<HTMLElement>(".panstrip-pin-dot")];
      const notes = [...section.querySelectorAll<HTMLElement>(".panstrip-notes li")];
      const distance = () => Math.max(0, track.offsetWidth - view.clientWidth);
      const light = () => {
        const mid = view.getBoundingClientRect().left + view.clientWidth / 2;
        let near = -1;
        let best = Infinity;
        dots.forEach((d, n) => {
          const r = d.getBoundingClientRect();
          const gap = Math.abs(r.left + r.width / 2 - mid);
          if (gap < best) { best = gap; near = n; }
        });
        // Only within a third of the view, so between findings nothing is lit and the wall is just the wall.
        const on = best < view.clientWidth / 3 ? near : -1;
        dots.forEach((d, n) => d.classList.toggle("on", n === on));
        notes.forEach((li, n) => li.classList.toggle("on", n === on));
      };
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: recording ? true : 0.4,
        onUpdate: (st) => {
          track.style.transform = `translate3d(${(-distance() * st.progress).toFixed(1)}px, 0, 0)`;
          light();
        },
      });
      light();
    });

    document.querySelectorAll<HTMLElement>("[data-hstrip]").forEach((track) => {
      const section = track.closest<HTMLElement>("section.hstrip");
      if (!section) return;
      const distance = () => Math.max(0, track.scrollWidth - track.clientWidth);
      ScrollTrigger.create({ trigger: section, start: "top top", end: "bottom bottom", scrub: recording ? true : 0.4, onUpdate: (st) => { track.style.transform = `translate3d(${(-distance() * st.progress).toFixed(1)}px, 0, 0)`; } });
    });
  }

  // Index list: the row under the pointer (or nearest the middle of the screen on a phone) fills the pane beside it.
  document.querySelectorAll<HTMLElement>("[data-index]").forEach((box) => {
    const rows = [...box.querySelectorAll<HTMLElement>(".idx-rows li")];
    const shots = [...box.querySelectorAll<HTMLImageElement>(".idx-pane img")];
    if (!rows.length) return;
    const show = (n: number) => {
      box.classList.add("has-active");
      rows.forEach((r, k) => r.classList.toggle("on", k === n));
      shots.forEach((im, k) => im.classList.toggle("on", k === n));
    };
    rows.forEach((r, n) => {
      r.addEventListener("pointerenter", () => show(n), { passive: true });
      r.addEventListener("focusin", () => show(n));
    });
    box.addEventListener("pointerleave", () => { box.classList.remove("has-active"); rows.forEach((r) => r.classList.remove("on")); }, { passive: true });
  });

  // Sticky steps and the timeline both follow the reading position: the step nearest the middle of the screen is the
  // live one, and the line fills to match. One observer each, no work while they are off screen.
  document.querySelectorAll<HTMLElement>("[data-steps]").forEach((box) => {
    const items = [...box.querySelectorAll<HTMLElement>(".steps-copy li")];
    const shots = [...box.querySelectorAll<HTMLImageElement>(".steps-media img")];
    if (!items.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = Number((e.target as HTMLElement).dataset.idx);
        items.forEach((it, k) => it.classList.toggle("on", k === n));
        shots.forEach((im, k) => im.classList.toggle("on", k === n));
      }
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    items.forEach((it) => io.observe(it));
  });

  // A film held beside the kinds of a thing, answering them by rate rather than by swapping pictures. Both the speed
  // and the crop are interpolated between the kind above and the kind below rather than switched at a boundary, so
  // scrolling the scale is a continuous change in what the water is doing rather than four states cutting between each
  // other. The rate is read back out by the sequence player, which owns the clock.
  document.querySelectorAll<HTMLElement>("[data-split]").forEach((box) => {
    const kinds = [...box.querySelectorAll<HTMLElement>(".split-kinds li")];
    const pane = box.querySelector<HTMLElement>(".split-film");
    const tag = box.querySelector<HTMLElement>(".split-tag");
    if (!kinds.length || !pane) return;
    const at = (li: HTMLElement, key: "rate" | "zoom", fallback: number) => Number(li.dataset[key]) || fallback;
    // A phone lays the kinds out flat under the film, so there is no scale to follow and the film simply runs.
    if (matchMedia("(max-width: 900px)").matches) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const mid = innerHeight / 2;
      // Where the reader is on the scale, as a fractional index between the kinds.
      let pos = 0;
      let nearest = Infinity;
      kinds.forEach((li, n) => {
        const r = li.getBoundingClientRect();
        const centre = r.top + r.height / 2;
        const d = (mid - centre) / Math.max(1, r.height);
        if (Math.abs(d) < Math.abs(nearest)) { nearest = d; pos = n + Math.max(-0.5, Math.min(0.5, d)); }
        li.classList.toggle("on", Math.abs(d) < 0.5);
      });
      const lo = kinds[Math.max(0, Math.floor(pos))]!;
      const hi = kinds[Math.min(kinds.length - 1, Math.ceil(pos))]!;
      const f = pos - Math.floor(pos);
      const mix = (key: "rate" | "zoom", fallback: number) => at(lo, key, fallback) + (at(hi, key, fallback) - at(lo, key, fallback)) * f;
      pane.style.setProperty("--rate", mix("rate", 1).toFixed(3));
      pane.style.setProperty("--zoom", mix("zoom", 1).toFixed(3));
      const lead = kinds[Math.round(pos)];
      if (tag && lead) { tag.textContent = lead.dataset.tag ?? ""; tag.classList.add("on"); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    paint();
  });

  // Exploded views: the object separates over the first half of the pin, holds apart while the parts are read, and
  // closes again before the section leaves. One custom property drives every layer and every label.
  document.querySelectorAll<HTMLElement>("[data-exploded]").forEach((box) => {
    // A phone lays this section out flat with the parts already apart, so nothing here should touch it.
    if (reduced || matchMedia("(max-width: 900px)").matches) { return; }
    const section = box.closest<HTMLElement>("section.exploded");
    if (!section) return;
    ScrollTrigger.create({
      trigger: section, start: "top top", end: "bottom bottom", scrub: recording ? true : 0.3,
      onUpdate: (st) => {
        const open = smooth(0, 0.4, st.progress);
        const shut = smooth(0.72, 0.9, st.progress);
        box.style.setProperty("--sep", (open * (1 - shut)).toFixed(3));
      },
    });
  });

  // Film decks are driven from here only for the deal; the films themselves are drawn by the sequence players, which
  // read the same per-card --t. One scroll position does both, so a card's film and its exit are one gesture.
  document.querySelectorAll<HTMLElement>("[data-deck]").forEach((box) => {
    const section = box.closest<HTMLElement>("section.deck");
    const cards = [...box.querySelectorAll<HTMLElement>(".deck-card")];
    const caps = [...box.querySelectorAll<HTMLElement>(".deck-cap")];
    if (!section || !cards.length) return;
    const n = cards.length;
    const lay = (slot: number) => {
      cards.forEach((card, i) => {
        const t = slot - i;                                  // 0 as it reaches the top, 1 as it leaves
        card.style.setProperty("--t", Math.max(0, Math.min(1, t)).toFixed(4));
        if (t >= 1) {                                        // dealt: gone to the right, turned off its corner
          card.style.transform = "translate(78%, -6%) rotate(7deg)";
          card.style.opacity = "0";
        } else if (t <= 0) {                                 // still in the deck, stepped back behind the top card
          const back = Math.min(3, -t);
          card.style.transform = `translateY(${(back * 16).toFixed(1)}px) scale(${(1 - back * 0.035).toFixed(3)})`;
          card.style.opacity = back > 2.6 ? "0" : "1";
        } else {                                             // on top: held still while its film runs, then dealt
          const out = Math.max(0, (t - 0.78) / 0.22);
          card.style.transform = `translate(${(out * 78).toFixed(1)}%, ${(out * -6).toFixed(1)}%) rotate(${(out * 7).toFixed(2)}deg)`;
          card.style.opacity = (1 - out * out).toFixed(3);
        }
        card.style.zIndex = String(100 - i);
      });
      // The caption belongs to whichever card is on top, and the last one stays up once the deck is spent.
      const live = Math.max(0, Math.min(n - 1, Math.floor(slot)));
      caps.forEach((c, i) => c.classList.toggle("on", i === live));
    };
    lay(0);
    if (reduced) return;
    ScrollTrigger.create({
      trigger: section, start: "top top", end: "bottom bottom", scrub: recording ? true : 0.25,
      onUpdate: (st) => lay(st.progress * n),
    });
  });

  // The wipe: the range input is the control, and it writes the one custom property both the clip and the bar read.
  document.querySelectorAll<HTMLElement>("[data-wipe]").forEach((box) => {
    const input = box.querySelector<HTMLInputElement>("input[type=range]");
    if (!input) return;
    const apply = () => box.style.setProperty("--w", input.value);
    input.addEventListener("input", apply, { passive: true });
    apply();
  });

  document.querySelectorAll<HTMLElement>("[data-timeline]").forEach((box) => {
    if (reduced) { box.style.setProperty("--tl", "1"); return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = box.getBoundingClientRect();
      const p = (innerHeight * 0.62 - r.top) / Math.max(1, r.height);
      box.style.setProperty("--tl", Math.max(0, Math.min(1, p)).toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    update();
  });

  // Iris: the section opens through a circle that grows as it rises. The mask is dropped when it is fully open, so a
  // finished section costs nothing to composite.
  document.querySelectorAll<HTMLElement>("[data-iris]").forEach((box) => {
    const section = box.closest<HTMLElement>("section");
    if (!section) return;
    if (reduced) { box.classList.add("open"); return; }
    const set = (p: number) => {
      const open = p >= 0.999;
      box.classList.toggle("open", open);
      if (!open) box.style.setProperty("--ir", (p * 96).toFixed(2));
    };
    set(0);
    ScrollTrigger.create({
      trigger: section,
      start: "top 92%",
      end: "top 34%",
      scrub: recording ? true : 0.3,
      onUpdate: (st) => set(st.progress),
      onLeave: () => set(1),
      onLeaveBack: () => set(0),
    });
  });

  // Pixels: the section's first picture assembles from blocks as it rises. The picture is drawn small into a canvas
  // laid over it and scaled back up with no smoothing; the block size falls from 48 to 1 across the entry, and while
  // the blocks are coarse only some of them are drawn, in a fixed shuffled order, so the picture is put together
  // rather than sharpened. Once it is whole the canvas goes and the picture stands on its own.
  document.querySelectorAll<HTMLElement>("[data-pixels]").forEach((box) => {
    const section = box.closest<HTMLElement>("section");
    const img = box.querySelector<HTMLImageElement>("img");
    if (!section || !img) return;
    if (reduced) return;
    const holder = img.parentElement;
    if (!holder) return;
    holder.classList.add("px-holder");
    const cv = document.createElement("canvas");
    cv.className = "px-canvas";
    cv.setAttribute("aria-hidden", "true");
    holder.appendChild(cv);
    const small = document.createElement("canvas");
    let done = false, pending = 0;
    const order: number[] = [];
    const draw = (q: number) => {
      if (done) return;
      if (q >= 0.995) { done = true; cv.remove(); img.classList.remove("px-hidden"); return; }
      if (!img.complete || !img.naturalWidth) { pending = q; return; }
      const r = img.getBoundingClientRect();
      const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.left = `${img.offsetLeft}px`; cv.style.top = `${img.offsetTop}px`; cv.style.width = `${W}px`; cv.style.height = `${H}px`; }
      const N = Math.max(1, Math.round(48 * (1 - q) * (1 - q)));
      const sw = Math.max(1, Math.round(W / N)), sh = Math.max(1, Math.round(H / N));
      small.width = sw; small.height = sh;
      const sc = small.getContext("2d")!;
      sc.clearRect(0, 0, sw, sh);
      // The picture as the img shows it: contained in its box.
      const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      sc.drawImage(img, ((W - dw) / 2) * (sw / W), ((H - dh) / 2) * (sh / H), dw * (sw / W), dh * (sh / H));
      const c = cv.getContext("2d")!;
      c.clearRect(0, 0, W, H);
      c.imageSmoothingEnabled = false;
      if (N > 8) {
        // Coarse: a fixed shuffled order of blocks, of which the first `fill` are drawn.
        const total = sw * sh;
        if (order.length !== total) { order.length = 0; for (let i = 0; i < total; i++) order.push(i); for (let i = total - 1; i > 0; i--) { const j = Math.floor(((i * 9301 + 49297) % 233280) / 233280 * (i + 1)); const t = order[i]!; order[i] = order[j]!; order[j] = t; } }
        const fill = Math.min(total, Math.round(total * Math.min(1, q * 1.7)));
        const bw = W / sw, bh = H / sh;
        for (let k = 0; k < fill; k++) { const i = order[k]!; const bx = i % sw, by = Math.floor(i / sw); c.drawImage(small, bx, by, 1, 1, bx * bw, by * bh, bw + 0.5, bh + 0.5); }
      } else {
        c.drawImage(small, 0, 0, sw, sh, 0, 0, W, H);
      }
      img.classList.add("px-hidden");
    };
    img.addEventListener("load", () => draw(pending), { once: true });
    draw(0);
    ScrollTrigger.create({
      trigger: section,
      start: "top 88%",
      end: "top 28%",
      scrub: recording ? true : 0.25,
      onUpdate: (st) => draw(st.progress),
      onLeave: () => draw(1),
      onLeaveBack: () => draw(0),
    });
  });

  // Word reveal: one custom property per frame; the words work out their own opacity from it in CSS.
  document.querySelectorAll<HTMLElement>("[data-wordreveal]").forEach((box) => {
    const section = box.closest<HTMLElement>("section.wordreveal");
    if (!section) return;
    if (reduced) { box.style.setProperty("--p", "1"); return; }
    box.style.setProperty("--p", "0");
    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      scrub: recording ? true : 0.25,
      onUpdate: (st) => box.style.setProperty("--p", st.progress.toFixed(4)),
      onLeave: () => box.style.setProperty("--p", "1"),
      onLeaveBack: () => box.style.setProperty("--p", "0"),
    });
  });

  // Spotlight: the circle follows the pointer; with no pointer it drifts on a slow figure of eight.
  document.querySelectorAll<HTMLElement>("[data-spotlight]").forEach((box) => {
    const r = () => Math.max(120, Math.min(260, box.clientWidth * 0.18));
    let idle = 0, t0 = 0;
    const drift = (t: number) => {
      if (!t0) t0 = t;
      const k = (t - t0) / 1000;
      box.style.setProperty("--mx", `${(50 + Math.sin(k * 0.5) * 30).toFixed(1)}%`);
      box.style.setProperty("--my", `${(50 + Math.sin(k * 0.9) * 22).toFixed(1)}%`);
      box.style.setProperty("--r", `${r()}px`);
      idle = requestAnimationFrame(drift);
    };
    if (!matchMedia("(hover: hover)").matches) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { if (!idle) idle = requestAnimationFrame(drift); } else if (idle) { cancelAnimationFrame(idle); idle = 0; } });
      io.observe(box);
      return;
    }
    box.addEventListener("pointermove", (e) => {
      const b = box.getBoundingClientRect();
      box.style.setProperty("--mx", `${(((e.clientX - b.left) / b.width) * 100).toFixed(1)}%`);
      box.style.setProperty("--my", `${(((e.clientY - b.top) / b.height) * 100).toFixed(1)}%`);
      box.style.setProperty("--r", `${r()}px`);
    }, { passive: true });
    box.addEventListener("pointerleave", () => box.style.setProperty("--r", "0px"));
  });

  // Before and after slider
  document.querySelectorAll<HTMLElement>(".slider").forEach((s) => {
    const after = s.querySelector<HTMLElement>(".after");
    const range = s.querySelector<HTMLInputElement>("input");
    range?.addEventListener("input", () => after && (after.style.width = `${range.value}%`));
  });
}

/** Product options: finish, size and quantity feed a summary line; adding opens the bag drawer. Nothing leaves the page. */
function initOptions() {
  const box = document.querySelector<HTMLElement>("[data-options]");
  const bag = document.getElementById("bag");
  if (!box || !bag) return;
  const name = box.dataset.name ?? "";
  const price = box.dataset.price ?? "";
  const parse = (p: string) => ({ amount: Number((p.match(/[\d.,]+/)?.[0] ?? "0").replace(/,/g, "")), currency: p.replace(/[\d.,\s]+/g, "") });
  let { amount, currency } = parse(price);
  const state = { finish: box.querySelector<HTMLButtonElement>(".finish[aria-pressed=\"true\"]")?.dataset.finish ?? "", size: "", qty: 1 };
  const line = box.querySelector<HTMLElement>("[data-line]");
  const hint = box.querySelector<HTMLElement>(".opt-hint");
  const qtyOut = box.querySelector<HTMLOutputElement>(".opt-qty output");
  const add = box.querySelector<HTMLButtonElement>(".opt-add");
  const items: { finish: string; size: string; qty: number; amount: number; img: string }[] = [];
  const summaryImg = box.querySelector<HTMLImageElement>(".opt-summary img");
  const priceOut = box.querySelector<HTMLElement>("[data-price-out]");
  const addPrice = box.querySelector<HTMLElement>(".opt-add-price");
  let img = summaryImg?.src ?? "";
  const navCta = document.querySelector<HTMLAnchorElement>("#nav .btn-nav");
  const navText = navCta?.textContent ?? "";
  const money = (n: number) => `${currency}${n.toLocaleString("en-GB")}`;
  const sizePrefix = box.dataset.sizePrefix ?? "UK ";
  const sizePlaceholder = box.dataset.sizePlaceholder ?? "choose a size";
  const summary = () => { if (line) line.textContent = `${state.finish} · ${state.size ? `${sizePrefix}${state.size}` : sizePlaceholder} · ${state.qty}`; };
  const openBag = (open: boolean) => { bag.setAttribute("aria-hidden", String(!open)); document.body.classList.toggle("bag-open", open); };
  const renderBag = () => {
    const list = bag.querySelector<HTMLElement>(".bag-items");
    const total = bag.querySelector<HTMLElement>("[data-total]");
    const count = items.reduce((n, i) => n + i.qty, 0);
    if (list) list.innerHTML = items.length ? items.map((i) => `<li>${i.img ? `<img src="${i.img}" alt="">` : "<span></span>"}<span><strong>${name}</strong><span class="mono">${i.finish} · ${sizePrefix}${i.size} · ${i.qty}</span></span><span class="price">${money(amount * i.qty)}</span></li>`).join("") : `<li class="bag-empty">Nothing in the bag yet.</li>`;
    if (total) total.textContent = money(items.reduce((n, i) => n + i.amount * i.qty, 0));
    if (navCta) { navCta.innerHTML = count ? `Bag<span class="bag-count">${count}</span>` : navText; navCta.onclick = count ? (e) => { e.preventDefault(); openBag(true); } : null; }
  };
  const finishes = [...box.querySelectorAll<HTMLButtonElement>(".finish")];
  const pickFinish = (b: HTMLButtonElement) => {
    for (const o of finishes) o.setAttribute("aria-pressed", String(o === b));
    state.finish = b.dataset.finish ?? "";
    // A finish that brings its own picture and price swaps the summary and the button to them.
    if (b.dataset.image && summaryImg) { summaryImg.src = b.dataset.image; img = b.dataset.image; }
    if (b.dataset.price) {
      ({ amount, currency } = parse(b.dataset.price));
      if (priceOut) priceOut.textContent = b.dataset.price;
      if (addPrice) addPrice.textContent = b.dataset.price;
    }
    summary();
  };
  for (const b of finishes) b.addEventListener("click", () => pickFinish(b));
  // Another section choosing for the shop (the jacket he wears in the hero, a pin on a plate, a caption in a strip).
  document.addEventListener("options:choose", (e) => {
    const d = (e as CustomEvent<{ index?: number; name?: string }>).detail ?? {};
    const b = typeof d.index === "number" ? finishes[d.index] : finishes.find((f) => f.dataset.finish === d.name);
    if (b) pickFinish(b);
  });
  for (const b of box.querySelectorAll<HTMLButtonElement>(".opt-sizes button")) b.addEventListener("click", () => {
    for (const o of box.querySelectorAll<HTMLButtonElement>(".opt-sizes button")) o.setAttribute("aria-pressed", String(o === b));
    state.size = b.dataset.size ?? ""; hint?.setAttribute("hidden", ""); summary();
  });
  for (const b of box.querySelectorAll<HTMLButtonElement>("[data-qty]")) b.addEventListener("click", () => {
    state.qty = Math.max(1, Math.min(9, state.qty + Number(b.dataset.qty))); if (qtyOut) qtyOut.value = String(state.qty); summary();
  });
  add?.addEventListener("click", () => {
    if (!state.size) { hint?.removeAttribute("hidden"); box.querySelector<HTMLElement>(".opt-sizes")?.scrollIntoView({ block: "nearest" }); return; }
    const same = items.find((i) => i.finish === state.finish && i.size === state.size);
    if (same) same.qty = Math.min(9, same.qty + state.qty); else items.push({ ...state, amount, img });
    renderBag(); openBag(true);
    add.classList.add("is-added"); const label = add.firstChild; const was = label?.textContent ?? ""; if (label) label.textContent = "Added ";
    setTimeout(() => { add.classList.remove("is-added"); if (label) label.textContent = was; }, 1600);
  });
  bag.querySelector(".bag-close")?.addEventListener("click", () => openBag(false));
  bag.querySelector(".bag-keep")?.addEventListener("click", () => openBag(false));
  document.querySelector(".bag-veil")?.addEventListener("click", () => openBag(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") openBag(false); });
  summary(); renderBag();
}

export { gsap, ScrollTrigger };
