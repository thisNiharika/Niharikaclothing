// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Unbox: a subscription box opened by the scroll, in CSS 3D. The box is built from its faces on a table that the
// camera looks down at; scrolling cuts the tape, opens the flaps (front and back first, then the sides, as a box is
// folded), parts the tissue, and lifts the packs out one at a time, each turning once to show its back, into a fan
// over the box. Then the camera tips to look straight down and the packs lie in a tidy flat lay, knolled by size, with
// the box beside them; hovering a pack there names it. The card recorder drives it (window.__hoverDemo).

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

/** The scene's stages at u (screens scrolled): the tape, the flaps, the tissue, each pack's rise, the flat lay. */
export function stages(u: number, n: number) {
  const riseStart = 2.0, riseStep = 0.24;
  const layAt = riseStart + n * riseStep + 0.75;
  return {
    cut: smooth(0.55, 0.95, u),
    fb: smooth(0.9, 1.45, u),
    lr: smooth(1.2, 1.75, u),
    tissue: smooth(1.6, 2.1, u),
    rise: (i: number) => smooth(riseStart + i * riseStep, riseStart + i * riseStep + 0.55, u),
    lay: smooth(layAt, layAt + 1.0, u),
    fin: smooth(layAt + 0.9, layAt + 1.5, u),
    layAt,
  };
}

export function totalScreens(n: number) {
  return stages(0, n).layAt + 1.9;
}

/** Knolling: packs in rows, tallest first, every row centred and the rows stacked, within a width. Sizes in px. */
export function knoll(sizes: { w: number; h: number }[], width: number, gap: number) {
  const order = sizes.map((s, i) => ({ ...s, i })).sort((a, b) => b.h - a.h);
  const rows: { items: typeof order; w: number; h: number }[] = [];
  for (const it of order) {
    const row = rows.at(-1);
    if (row && row.w + gap + it.w <= width) { row.items.push(it); row.w += gap + it.w; row.h = Math.max(row.h, it.h); }
    else rows.push({ items: [it], w: it.w, h: it.h });
  }
  const total = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
  const out: { x: number; y: number }[] = new Array(sizes.length);
  let y = -total / 2;
  for (const r of rows) {
    let x = -r.w / 2;
    for (const it of r.items) { out[it.i] = { x: x + it.w / 2, y: y + r.h / 2 }; x += it.w + gap; }
    y += r.h + gap;
  }
  return { at: out, height: total };
}

export function initUnbox() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-unbox]")].entries()) setup(root, n === 0);
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".ub-pin")!;
  const stageEl = root.querySelector<HTMLElement>(".ub-stage")!;
  const table = root.querySelector<HTMLElement>(".ub-table")!;
  const box = root.querySelector<HTMLElement>(".ub-box")!;
  const face = (c: string) => root.querySelector<HTMLElement>(`.${c}`)!;
  const parts = {
    bottom: face("ub-bottom"), front: face("ub-front"), back: face("ub-back"), left: face("ub-left"), right: face("ub-right"),
    ff: face("ub-flap-f"), fbk: face("ub-flap-b"), fl: face("ub-flap-l"), fr: face("ub-flap-r"), tape: face("ub-tape"),
    tl: face("ub-tissue-l"), tr: face("ub-tissue-r"), shadow: face("ub-shadow"),
  };
  const items = [...root.querySelectorAll<HTMLElement>(".ub-item")];
  const intro = root.querySelector<HTMLElement>(".ub-intro");
  const lines = [...root.querySelectorAll<HTMLElement>(".ub-line")];
  const list = [...root.querySelectorAll<HTMLElement>(".ub-list li")];
  const finale = root.querySelector<HTMLElement>(".ub-finale");
  const tag = root.querySelector<HTMLElement>(".ub-tag");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const n = items.length;
  const total = totalScreens(n);
  root.style.setProperty("--ub-screens", String(total + 1));
  const heights = items.map((el) => parseFloat(el.dataset.h ?? "18") || 18);
  const aspect = items.map(() => 0.72);
  // Each pack's shape, from its picture once it has loaded.
  items.forEach((el, i) => {
    const img = el.querySelector<HTMLImageElement>("img");
    if (!img) return;
    const set = () => { if (img.naturalWidth) aspect[i] = img.naturalWidth / img.naturalHeight; };
    if (img.complete) set(); else img.addEventListener("load", () => { set(); apply(uNow, ptr.x, ptr.k); }, { once: true });
  });
  // Where each pack starts inside the box and how it is turned there: fixed per pack, so a moment always looks the same.
  const seed = items.map((_, i) => ({ x: Math.sin(i * 12.9898) * 0.5, y: Math.cos(i * 78.233) * 0.5, r: Math.sin(i * 3.7) * 14 }));

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, k: 0, on: 0 };
  let uNow = 0, raf = 0, last = 0, demoing = false, hoverI = -1;

  const apply = (u: number, px: number, pk: number) => {
    const W = pin.clientWidth, H = pin.clientHeight;
    const wide = W / H > 1.05;
    const st = stages(u, n);
    const S = wide ? Math.min(W * 0.5, H * 0.92) : Math.min(W * 0.92, H * 0.6);
    const bw = S * 0.62, bd = bw * 0.68, bh = bw * 0.34;
    root.style.setProperty("--ub-bw", `${bw.toFixed(1)}px`);
    root.style.setProperty("--ub-bd", `${bd.toFixed(1)}px`);
    root.style.setProperty("--ub-bh", `${bh.toFixed(1)}px`);
    // The camera: three quarters from above, tipping to straight down for the flat lay; the pointer sways it a little.
    const tilt = lerp(58, 0, smoother(st.lay));
    const sway = (px - 0.5) * 16 * pk * (1 - st.lay) + Math.sin(u * 0.7) * 4 * (1 - st.lay);
    const cx = W * (wide ? lerp(0.64, 0.5, st.lay) : 0.5), cy = H * (wide ? lerp(0.66, 0.64, st.lay) : lerp(0.68, 0.64, st.lay));
    stageEl.style.perspective = `${(S * 3.4).toFixed(0)}px`;
    // Look from over the table, not the screen's middle, or things near the camera slide off towards the corner.
    stageEl.style.perspectiveOrigin = `${cx.toFixed(1)}px ${(cy - S * 0.45).toFixed(1)}px`;
    table.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) rotateX(${tilt.toFixed(2)}deg) rotateZ(${sway.toFixed(2)}deg)`;
    // The box moves aside for the flat lay and shrinks a little.
    const bx = lerp(0, wide ? S * 0.56 : 0, smoother(st.lay)), by = lerp(0, wide ? S * 0.04 : -S * 0.56, smoother(st.lay));
    const bs = lerp(1, wide ? 0.5 : 0.42, smoother(st.lay));
    box.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0) scale3d(${bs.toFixed(3)}, ${bs.toFixed(3)}, ${bs.toFixed(3)})`;
    const P = (x: number, y: number, z: number) => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px)`;
    parts.bottom.style.transform = P(0, 0, 0);
    parts.front.style.transform = `${P(0, bd / 2, bh / 2)} rotateX(-90deg)`;
    parts.back.style.transform = `${P(0, -bd / 2, bh / 2)} rotateX(90deg)`;
    parts.left.style.transform = `${P(-bw / 2, 0, bh / 2)} rotateZ(90deg) rotateX(-90deg)`;
    parts.right.style.transform = `${P(bw / 2, 0, bh / 2)} rotateZ(-90deg) rotateX(-90deg)`;
    const fb = smoother(st.fb) * 212, lr = smoother(st.lr) * 206;
    parts.ff.style.transform = `${P(0, bd / 2, bh + 1.5)} rotateX(${(-fb).toFixed(2)}deg) translateY(${(-bd / 4).toFixed(1)}px)`;
    parts.fbk.style.transform = `${P(0, -bd / 2, bh + 1.5)} rotateX(${fb.toFixed(2)}deg) translateY(${(bd / 4).toFixed(1)}px)`;
    parts.fl.style.transform = `${P(-bw / 2, 0, bh + 0.5)} rotateY(${(-lr).toFixed(2)}deg) translateX(${(bw / 4).toFixed(1)}px)`;
    parts.fr.style.transform = `${P(bw / 2, 0, bh + 0.5)} rotateY(${lr.toFixed(2)}deg) translateX(${(-bw / 4).toFixed(1)}px)`;
    parts.tape.style.transform = P(0, 0, bh + 3);
    parts.tape.style.setProperty("--cut", st.cut.toFixed(3));
    parts.tape.style.opacity = String(1 - smooth(0.05, 0.4, st.fb));
    const tz = bh * 0.86, part = smoother(st.tissue);
    parts.tl.style.transform = `${P(-bw * 0.25 - part * bw * 0.32, 0, tz + part * bh * 0.5)} rotateY(${(-part * 70).toFixed(2)}deg)`;
    parts.tr.style.transform = `${P(bw * 0.25 + part * bw * 0.32, 0, tz + part * bh * 0.5)} rotateY(${(part * 70).toFixed(2)}deg)`;
    parts.tl.style.opacity = parts.tr.style.opacity = String(1 - smooth(0.35, 1, part) * 0.85);
    parts.shadow.style.transform = P(0, 0, -0.5);
    // The packs: out of the box into a fan, each turning once on the way, then down flat into the knolled lay.
    const unit = bh / 18;
    const sizes = items.map((_, i) => ({ h: heights[i]! * unit * (wide ? 1.15 : 1.05), w: heights[i]! * unit * (wide ? 1.15 : 1.05) * aspect[i]! }));
    const lay = knoll(sizes.map((z) => ({ w: z.w * 0.82, h: z.h * 0.82 })), wide ? S * 1.0 : S * 0.82, wide ? S * 0.035 : S * 0.03);
    const layOff = { x: wide ? -S * 0.24 : 0, y: wide ? S * 0.02 : S * 0.12 };
    items.forEach((el, i) => {
      const k = smoother(st.rise(i));
      const f = n === 1 ? 0 : i / (n - 1) - 0.5;
      const inside = { x: seed[i]!.x * bw * 0.5, y: seed[i]!.y * bd * 0.4, z: bh * 0.3 };
      const fan = { x: f * S * (wide ? 0.88 : 0.74) + (wide ? S * 0.08 : 0), y: -bd * 0.1 - Math.abs(f) * bd * 0.5, z: bh * 1.05 + S * 0.12 - Math.abs(f) * S * 0.06 };
      const L = smoother(st.lay);
      const flat = { x: lay.at[i]!.x + layOff.x, y: lay.at[i]!.y + layOff.y, z: 1 + i * 0.2 };
      const x = lerp(lerp(inside.x, fan.x, k), flat.x, L), y = lerp(lerp(inside.y, fan.y, k), flat.y, L), z = lerp(lerp(inside.z, fan.z, k), flat.z, L);
      // Standing, a pack faces the camera (it is turned back against the table's tilt); laid, it lies flat.
      const stand = -tilt * (1 - L);
      const spin = (1 - k) * 360 * (k > 0 ? 1 : 0) + (1 - L) * Math.sin(u * 1.3 + i) * 6 * k;
      const lean = lerp(seed[i]!.r * (1 - k) + f * -10 * k, 0, L);
      const sc = lerp(0.6, 1, k) * lerp(1, 0.82, L);
      el.style.width = `${sizes[i]!.w.toFixed(1)}px`;
      el.style.height = `${sizes[i]!.h.toFixed(1)}px`;
      el.style.transform = `${P(x, y, z)} rotateZ(${lean.toFixed(2)}deg) rotateX(${stand.toFixed(2)}deg) rotateY(${spin.toFixed(2)}deg) scale(${sc.toFixed(3)}) translate(-50%, -50%)`;
      el.style.opacity = k > 0.001 || L > 0 ? "1" : "0";
      el.classList.toggle("is-laid", L > 0.98);
    });
    // The copy.
    const introK = 1 - smooth(0.35, 0.8, u);
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.visibility = introK > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateY(${((1 - introK) * -26).toFixed(1)}px)`; }
    const shows = [smooth(0.9, 1.2, u) * (1 - smooth(1.85, 2.1, u)), smooth(2.15, 2.45, u) * (1 - smooth(st.layAt - 0.1, st.layAt + 0.25, u))];
    lines.forEach((el, j) => { const k = shows[j] ?? 0; el.style.opacity = k.toFixed(3); el.style.visibility = k > 0.001 ? "visible" : "hidden"; el.style.transform = `translateY(${((1 - k) * 18).toFixed(1)}px)`; });
    list.forEach((el, i) => { const r = st.rise(i); el.classList.toggle("is-out", r > 0.5); el.classList.toggle("is-now", r > 0.05 && r < 0.98); });
    const fin = st.fin;
    if (finale) { finale.style.opacity = fin.toFixed(3); finale.style.transform = `translateY(${((1 - fin) * 24).toFixed(1)}px)`; finale.style.pointerEvents = fin > 0.8 ? "auto" : "none"; }
    // The name tag over the pack under the pointer, once they lie flat.
    if (tag) {
      const el = hoverI >= 0 ? items[hoverI] : undefined;
      if (el && el.classList.contains("is-laid")) {
        const r = el.getBoundingClientRect(), pr = pin.getBoundingClientRect();
        tag.hidden = false;
        tag.textContent = el.dataset.name ?? "";
        tag.style.transform = `translate(${(r.left - pr.left + r.width / 2).toFixed(1)}px, ${(r.top - pr.top - 10).toFixed(1)}px) translate(-50%, -100%)`;
      } else tag.hidden = true;
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const still = reduced.matches;
    uNow += (progress() - uNow) * (still ? 1 : 1 - Math.exp(-dt / 0.12));
    ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt / 0.3));
    ptr.k += ((still ? 0 : ptr.on) - ptr.k) * (1 - Math.exp(-dt / 0.4));
    apply(uNow, ptr.x, ptr.k);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  addEventListener("pointermove", (e) => { ptr.tx = e.clientX / Math.max(1, innerWidth); ptr.on = e.pointerType === "mouse" ? 1 : 0; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.on = 0; });
  items.forEach((el, i) => {
    el.addEventListener("pointerenter", () => { hoverI = i; });
    el.addEventListener("pointerleave", () => { if (hoverI === i) hoverI = -1; });
    el.addEventListener("focus", () => { hoverI = i; });
    el.addEventListener("blur", () => { if (hoverI === i) hoverI = -1; });
  });
  addEventListener("resize", () => apply(uNow, ptr.x, ptr.k));
  uNow = progress();
  apply(uNow, 0.5, 0);
  const imgs = [...root.querySelectorAll<HTMLImageElement>(".ub-item img")];
  Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => undefined)))).then(() => { apply(uNow, ptr.x, ptr.k); document.body.classList.add("canvas-ready"); });

  // ------------------------------------------------------------------------------------------------ card recording
  // The box sways under the pointer, opens, the packs come out one after another and lie down flat, and the pointer
  // rests on one so its name shows.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const st0 = stages(0, n);
    const keys: [number, number][] = [[0, 0], [1.6, 0], [3.6, 1.9], [4.0, 1.95], [4.0 + n * 0.42, st0.layAt - 0.2], [4.0 + n * 0.42 + 1.8, st0.layAt + 1.2], [4.0 + n * 0.42 + 4.2, st0.layAt + 1.4]];
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
      const W = pin.clientWidth, H = pin.clientHeight;
      const tEnd = keys.at(-1)![0];
      const pick = Math.min(2, n - 1);
      let x = W * lerp(0.3, 0.75, smoother(t / 1.6)), y = H * 0.55;
      const hoverAt = tEnd - 2.0;
      if (t > 1.6 && t < hoverAt) { const k = smoother((t - 1.6) / 1.2); x = lerp(W * 0.75, W * 0.92, k); y = lerp(H * 0.55, H * 0.85, k); }
      apply(uAt(t), x / W, t < 1.8 ? 1 : 0);
      if (t >= hoverAt) {
        const r = items[pick]!.getBoundingClientRect(), pr = pin.getBoundingClientRect();
        const k = smoother((t - hoverAt) / 0.8);
        x = lerp(W * 0.92, r.left - pr.left + r.width / 2, k); y = lerp(H * 0.85, r.top - pr.top + r.height / 2, k);
        hoverI = k > 0.9 ? pick : -1;
        apply(uAt(t), x / W, 0);
      } else hoverI = -1;
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}
