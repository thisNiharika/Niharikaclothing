// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The rail: garments hang side on along a rod. The one under the pointer (or keyboard focus, or the middle of the
// screen on a touch device) turns to face the visitor while its neighbours slide apart to make room; a click opens it
// large with the rail blurred behind, front and back, and a link to buy it.
//
// Every slot keeps one width whatever is turned, and the room an opening garment needs is made by moving its
// neighbours with transforms. Nothing reflows, so a touch strip snaps to stable positions, and the empty space either
// side of an open garment belongs to no garment, which gives the pointer some slack between them.
//
// Each garment's turn is a number from 0 (side on) to 1 (facing) that eases towards its target. The page's own frames
// move it by real time; the card recorder moves it by a clock it controls (window.__hoverDemo), so every captured frame
// is exact.

type Item = { el: HTMLButtonElement; t: number; target: number; i: number };
type Track = { el: HTMLElement; items: Item[]; tab: HTMLButtonElement | null };

const TAU = 0.11; // seconds for a turn to cover about two thirds of the way
const R = 0.17;
const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function initRails() {
  const roots = [...document.querySelectorAll<HTMLElement>("[data-rail]")];
  roots.forEach((root, n) => setup(root, n === 0));
}

function setup(root: HTMLElement, lead: boolean) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const touch = matchMedia("(hover: none), (max-width: 767px)");
  const tracks: Track[] = [...root.querySelectorAll<HTMLElement>("[data-rail-track]")].map((el) => ({
    el,
    tab: root.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="${el.id}"]`),
    items: [...el.querySelectorAll<HTMLButtonElement>(".rail-item")].map((b, i) => ({ el: b, t: 0, target: 0, i })),
  }));
  if (!tracks.length) return;
  const total = tracks.reduce((n, t) => n + t.items.length, 0);
  let active = Math.max(0, tracks.findIndex((t) => !t.el.hidden));
  let focused: number | null = null;
  const caption = root.querySelector<HTMLElement>(".rail-caption");
  const look = createLook(root);

  // Layout: how far each garment is pushed aside by the others that are turning.
  const geometry = () => {
    const s = getComputedStyle(root);
    const h = parseFloat(s.getPropertyValue("--rail-h")) || 520;
    return { open: h * (parseFloat(s.getPropertyValue("--open")) || 0.6), slot: h * (parseFloat(s.getPropertyValue("--slot")) || 0.12) };
  };
  let geo = geometry();
  const paint = (items: Item[]) => {
    const extra = Math.max(0, geo.open - geo.slot);
    for (const it of items) {
      let x = 0;
      for (const o of items) if (o !== it && o.t > 0) x += (o.i < it.i ? 1 : -1) * o.t * extra * 0.5;
      // The turn as a picture: the garment's width grows as a turning body's does (a sine of the angle) while the side
      // view hands over to the face. R is about how wide a garment is side on against face on.
      const w = R + (1 - R) * Math.sin((it.t * Math.PI) / 2);
      it.el.style.setProperty("--t", it.t.toFixed(4));
      it.el.style.setProperty("--s", w.toFixed(4));
      it.el.style.setProperty("--fo", ease((it.t - 0.12) / 0.56).toFixed(4));
      it.el.style.setProperty("--x", `${x.toFixed(2)}px`);
      it.el.style.zIndex = it.t > 0.02 ? String(2 + Math.round(it.t * 10)) : "";
    }
  };

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;
    const items = tracks[active]!.items;
    const k = reduced.matches ? 1 : 1 - Math.exp(-dt / TAU);
    for (const it of items) {
      it.t += (it.target - it.t) * k;
      if (Math.abs(it.target - it.t) < 0.002) it.t = it.target;
      else moving = true;
    }
    paint(items);
    raf = moving ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => {
    if (raf || demoing) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const describe = (idx: number | null) => {
    if (!caption) return;
    if (idx === null) { delete root.dataset.focus; return; }
    const b = tracks[active]!.items[idx]!.el;
    root.dataset.focus = "";
    const set = (sel: string, v: string) => { const el = caption.querySelector(sel); if (el) el.textContent = v; };
    set(".rc-count", `${String(globalIndex(active, idx) + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`);
    set(".rc-name", b.dataset.name ?? "");
    set(".rc-meta", [b.dataset.meta, b.dataset.price].filter(Boolean).join("  ·  "));
  };
  const globalIndex = (track: number, idx: number) => tracks.slice(0, track).reduce((n, t) => n + t.items.length, 0) + idx;

  const turn = (idx: number | null) => {
    if (focused === idx) return;
    focused = idx;
    tracks[active]!.items.forEach((it, j) => (it.target = j === idx ? 1 : 0));
    describe(idx);
    kick();
  };

  // Pointer: entering a garment turns it; leaving the rail turns it back. The gap an open garment makes is nobody's,
  // so crossing it changes nothing.
  for (const tr of tracks) {
    tr.items.forEach((it, j) => {
      it.el.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch" && !touch.matches) turn(j); });
      it.el.addEventListener("focus", () => turn(j));
      it.el.addEventListener("click", () => look.open(tracks[active]!, j));
      it.el.addEventListener("keydown", (e) => {
        const items = tracks[active]!.items;
        const to = e.key === "ArrowRight" ? j + 1 : e.key === "ArrowLeft" ? j - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
        if (to === null || to < 0 || to >= items.length) return;
        e.preventDefault();
        items.forEach((o, k) => o.el.setAttribute("tabindex", k === to ? "0" : "-1"));
        items[to]!.el.focus();
      });
    });
    tr.el.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch" && !touch.matches) turn(null); });
    tr.el.addEventListener("focusout", (e) => { if (!tr.el.contains(e.relatedTarget as Node | null) && !look.isOpen()) turn(null); });
  }

  // Touch, or a narrow screen: the rail is a strip that scrolls sideways, and the garment nearest the middle turns.
  let scrollRaf = 0;
  const nearest = () => {
    scrollRaf = 0;
    if (!touch.matches) return;
    const tr = tracks[active]!;
    const mid = tr.el.scrollLeft + tr.el.clientWidth / 2;
    let best = 0, dist = Infinity;
    tr.items.forEach((it, j) => {
      const c = it.el.offsetLeft + it.el.offsetWidth / 2;
      if (Math.abs(c - mid) < dist) { dist = Math.abs(c - mid); best = j; }
    });
    turn(best);
  };
  for (const tr of tracks) tr.el.addEventListener("scroll", () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(nearest); }, { passive: true });
  const onMode = () => { geo = geometry(); if (touch.matches) nearest(); else turn(null); paint(tracks[active]!.items); };
  touch.addEventListener("change", onMode);
  addEventListener("resize", () => { geo = geometry(); paint(tracks[active]!.items); });

  // Rails: one shows at a time. The tabs follow the WAI-ARIA tabs pattern: arrows move between them, and the rail
  // that comes in swings a little, as garments do when a rail is pushed along.
  const show = (n: number, focusTab = false) => {
    if (n === active || !tracks[n]) return;
    tracks[active]!.items.forEach((it) => { it.t = it.target = 0; });
    paint(tracks[active]!.items);
    focused = null;
    describe(null);
    tracks.forEach((tr, k) => {
      tr.el.hidden = k !== n;
      tr.tab?.setAttribute("aria-selected", String(k === n));
      tr.tab?.setAttribute("tabindex", k === n ? "0" : "-1");
    });
    active = n;
    const el = tracks[n]!.el;
    el.classList.remove("swing");
    void el.offsetWidth;
    if (!reduced.matches) el.classList.add("swing");
    if (focusTab) tracks[n]!.tab?.focus();
    if (touch.matches) { el.scrollLeft = 0; nearest(); }
  };
  tracks.forEach((tr, k) => {
    tr.tab?.addEventListener("click", () => show(k));
    tr.tab?.addEventListener("keydown", (e) => {
      const to = e.key === "ArrowRight" ? (k + 1) % tracks.length : e.key === "ArrowLeft" ? (k - 1 + tracks.length) % tracks.length : null;
      if (to === null) return;
      e.preventDefault();
      show(to, true);
    });
  });

  // The page is ready to film once the garments on the first rail have arrived.
  const imgs = [...tracks[active]!.el.querySelectorAll<HTMLImageElement>("img")];
  Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))).then(() => {
    document.body.classList.add("canvas-ready", "rail-ready");
    if (touch.matches) nearest();
  });

  // ------------------------------------------------------------------------------------------------- card recording
  let demoing = false;
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) installDemo();

  function installDemo() {
    const cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    cursor.id = "rec-cursor";
    cursor.setAttribute("viewBox", "0 0 22 30");
    cursor.innerHTML = '<path d="M2 2l16 13.5-7 .8 4.2 8.6-3.4 1.6-4.2-8.7L2 22.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>';
    document.body.appendChild(cursor);
    const ARRIVE = 0.9, SWEEP = 5.4, SETTLE = 0.8, PRESS = 0.3, OPEN = 0.6, HOLD = 2.2, CLOSE = 0.55, LEAVE = 0.9;
    const tSweep = ARRIVE, tSettle = tSweep + SWEEP, tPress = tSettle + SETTLE, tOpen = tPress + PRESS, tHold = tOpen + OPEN, tClose = tHold + HOLD, tLeave = tClose + CLOSE, END = tLeave + LEAVE + 0.4;
    const items = () => tracks[active]!.items;
    const pick = () => Math.min(items().length - 1, Math.max(0, Math.round(items().length * 0.62)));

    // Where the pointer is at time t, in viewport pixels, from the garments' resting positions.
    const path = (t: number) => {
      const its = items();
      const r0 = its[0]!.el.getBoundingClientRect(), r1 = its.at(-1)!.el.getBoundingClientRect();
      const y = r0.top + r0.height * 0.42;
      const left = r0.left + r0.width / 2 - geo.open * 0.35, right = r1.left + r1.width / 2 + geo.open * 0.35;
      const target = its[pick()]!.el.getBoundingClientRect();
      const tx = target.left + target.width / 2, ty = y + r0.height * 0.08;
      const from = { x: Math.max(20, r0.left - 140), y: innerHeight + 40 };
      const out = { x: Math.min(innerWidth - 20, r1.right + 160), y: innerHeight + 40 };
      if (t < tSweep) { const k = ease(t / ARRIVE); return { x: lerp(from.x, left, k), y: lerp(from.y, y, k) }; }
      if (t < tSettle) { const k = (t - tSweep) / SWEEP; return { x: lerp(left, right, ease(k) * 0.35 + k * 0.65), y: y + Math.sin(k * Math.PI * 2) * 6 }; }
      if (t < tPress) { const k = ease((t - tSettle) / SETTLE); return { x: lerp(right, tx, k), y: lerp(y, ty, k) }; }
      if (t < tLeave) return { x: tx, y: ty };
      const k = ease((t - tLeave) / LEAVE);
      return { x: lerp(tx, out.x, k), y: lerp(ty, out.y, k) };
    };
    // Which garment the pointer is over, by resting slot; nobody's while it is outside the rail.
    const over = (x: number, y: number) => {
      const its = items();
      const r0 = its[0]!.el.getBoundingClientRect();
      if (y < r0.top || y > r0.bottom) return null;
      let best: number | null = null, dist = Infinity;
      its.forEach((it, j) => { const r = it.el.getBoundingClientRect(); const c = r.left + r.width / 2 - (parseFloat(it.el.style.getPropertyValue("--x")) || 0); const d = Math.abs(c - x); if (d < dist) { dist = d; best = j; } });
      return dist < geo.open * 0.6 ? best : null;
    };

    const demo = (t: number) => {
      demoing = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      document.body.classList.add("rec-hover");
      root.classList.add("rec");
      geo = geometry();
      const its = items();
      // Re-run the turn from the start of the clip to t on a fixed step, so the same t always draws the same frame.
      its.forEach((it) => { it.t = 0; it.target = 0; });
      paint(its);
      const step = 1 / 120;
      let target: number | null = null;
      for (let s = 0; s <= t + 1e-9; s += step) {
        const p = path(s);
        const o = s < tLeave ? (s >= tSettle ? pick() : over(p.x, p.y)) : null;
        if (o !== null || s >= tLeave || s < tSweep) target = o;
        const k = 1 - Math.exp(-step / TAU);
        for (const it of its) it.t += ((it.i === target ? 1 : 0) - it.t) * k;
      }
      paint(its);
      describe(target);
      const p = path(t);
      const pressed = t >= tPress && t < tOpen ? 1 - Math.sin(((t - tPress) / PRESS) * Math.PI) * 0.12 : 1;
      cursor.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${pressed.toFixed(3)})`;
      // The look: open, hold (turning to the back halfway), close.
      const lookP = t < tOpen ? 0 : t < tHold ? easeOut((t - tOpen) / OPEN) : t < tClose ? 1 : t < tLeave ? 1 - ease((t - tClose) / CLOSE) : 0;
      const back = t > tHold + HOLD * 0.45 && t < tClose ? ease((t - tHold - HOLD * 0.45) / 0.3) : 0;
      look.demo(tracks[active]!, pick(), lookP, back);
      cursor.style.visibility = lookP > 0.02 ? "hidden" : "visible";
    };
    (demo as unknown as { seconds: number }).seconds = END;
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

/** The close look: one dialog per rail, filled with whichever garment was opened. */
function createLook(root: HTMLElement) {
  const dlg = root.querySelector<HTMLDialogElement>("dialog.rail-look");
  const noop = { open: () => undefined, isOpen: () => false, demo: () => undefined };
  if (!dlg) return noop;
  const img = dlg.querySelector<HTMLImageElement>(".look-img")!;
  const imgBack = dlg.querySelector<HTMLImageElement>(".look-img-back")!;
  const views = [...dlg.querySelectorAll<HTMLButtonElement>(".look-views button")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let track: Track | null = null;
  let index = 0;
  let from: HTMLElement | null = null;
  let anim = 0;

  const fill = (tr: Track, i: number) => {
    track = tr;
    index = i;
    const b = tr.items[i]!.el;
    const set = (sel: string, v: string) => { const el = dlg.querySelector(sel); if (el) el.textContent = v; };
    const all = [...root.querySelectorAll<HTMLButtonElement>(".rail-item")];
    set(".look-count", `${String(all.indexOf(b) + 1).padStart(2, "0")} / ${String(all.length).padStart(2, "0")}`);
    set(".look-name", b.dataset.name ?? "");
    set(".look-meta", b.dataset.meta ?? "");
    set(".look-price", b.dataset.price ?? "");
    img.src = b.dataset.front ?? "";
    img.alt = `${b.dataset.name ?? ""}, front`;
    const back = b.dataset.back ?? "";
    imgBack.src = back;
    imgBack.alt = back ? `${b.dataset.name ?? ""}, back` : "";
    dlg.toggleAttribute("data-has-back", Boolean(back));
    view(0);
    const link = dlg.querySelector<HTMLAnchorElement>(".look-link");
    if (link) {
      const href = b.dataset.link || link.dataset.fallback || "#";
      link.href = href;
      const external = /^https?:/i.test(href);
      link.target = external ? "_blank" : "";
      link.rel = external ? "noopener" : "";
      link.querySelector(".look-link-label")!.textContent = b.dataset.link ? (link.dataset.shop ?? "View in the shop") : (link.dataset.ask ?? "Ask about this");
    }
  };
  const view = (back: number) => {
    dlg.style.setProperty("--back", back.toFixed(3));
    views.forEach((v) => v.setAttribute("aria-pressed", String((v.dataset.view === "back") === back > 0.5)));
  };
  views.forEach((v) => v.addEventListener("click", () => {
    const want = v.dataset.view === "back" ? 1 : 0;
    const start = parseFloat(dlg.style.getPropertyValue("--back")) || 0;
    if (reduced.matches) return view(want);
    const t0 = performance.now();
    const tick = (now: number) => { const k = ease((now - t0) / 260); view(lerp(start, want, k)); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));

  // Opening flies the garment from its place on the rail to the middle of the screen; closing flies it back.
  const place = (p: number) => {
    dlg.style.setProperty("--o", p.toFixed(3));
    if (!from) { img.parentElement!.style.transform = ""; return; }
    const a = from.getBoundingClientRect();
    const fig = img.parentElement!;
    fig.style.transform = "";
    const b = fig.getBoundingClientRect();
    if (!b.width || !a.width) return;
    const s = lerp(a.height / b.height, 1, p);
    const dx = lerp(a.left + a.width / 2 - (b.left + b.width / 2), 0, p);
    const dy = lerp(a.top - b.top, 0, p);
    fig.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`;
  };
  const tween = (to: number, done?: () => void) => {
    cancelAnimationFrame(anim);
    const start = parseFloat(dlg.style.getPropertyValue("--o")) || 0;
    if (reduced.matches) { place(to); done?.(); return; }
    const t0 = performance.now();
    const ms = to > start ? 560 : 420;
    const tick = (now: number) => {
      const k = (now - t0) / ms;
      place(lerp(start, to, to > start ? easeOut(k) : ease(k)));
      if (k < 1) anim = requestAnimationFrame(tick);
      else done?.();
    };
    anim = requestAnimationFrame(tick);
  };
  let opener: HTMLElement | null = null;
  const open = (tr: Track, i: number) => {
    opener = tr.items[i]!.el;
    from = opener.querySelector<HTMLElement>(".ri-front");
    fill(tr, i);
    if (!dlg.open) dlg.showModal();
    document.documentElement.classList.add("look-open");
    place(0);
    tween(1);
    dlg.querySelector<HTMLButtonElement>(".look-close")?.focus({ preventScroll: true });
  };
  const close = () => {
    if (!dlg.open) return;
    if (track) from = track.items[index]!.el.querySelector<HTMLElement>(".ri-front");
    tween(0, () => {
      dlg.close();
      document.documentElement.classList.remove("look-open");
      from = null;
      opener?.focus({ preventScroll: true });
    });
  };
  const go = (d: number) => {
    if (!track) return;
    const n = (index + d + track.items.length) % track.items.length;
    dlg.classList.add("swap");
    setTimeout(() => { fill(track!, n); from = track!.items[n]!.el.querySelector<HTMLElement>(".ri-front"); dlg.classList.remove("swap"); }, reduced.matches ? 0 : 140);
  };
  dlg.querySelector(".look-close")?.addEventListener("click", close);
  dlg.querySelector(".look-veil")?.addEventListener("click", close);
  dlg.querySelector(".look-prev")?.addEventListener("click", () => go(-1));
  dlg.querySelector(".look-next")?.addEventListener("click", () => go(1));
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  });
  // An in-page link (Ask about this) closes the look before the page moves to it.
  dlg.querySelector<HTMLAnchorElement>(".look-link")?.addEventListener("click", (e) => {
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
    // For the recorder: the look at progress p and the back view at b, drawn without any timers.
    demo(tr: Track, i: number, p: number, b: number) {
      if (p <= 0.001) {
        if (dlg.open) { dlg.close(); document.documentElement.classList.remove("look-open"); }
        dlg.style.setProperty("--o", "0");
        return;
      }
      if (!dlg.open) {
        dlg.showModal();
        document.documentElement.classList.add("look-open");
        // Opening a modal focuses its first control; nobody pressed a key, so the film shows no focus ring.
        (document.activeElement as HTMLElement | null)?.blur();
      }
      if (track !== tr || index !== i) fill(tr, i);
      from = tr.items[i]!.el.querySelector<HTMLElement>(".ri-front");
      place(p);
      view(b);
    },
  };
}
