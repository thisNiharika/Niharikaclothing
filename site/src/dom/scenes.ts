// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Feature scenes: pinned product shots that play as the page scrolls through them. Each is a pure function of one
// number, the scroll's progress through its section (0 to 1), so a scene looks the same however fast it is scrolled
// and wherever it is stopped, and plays backwards on the way up. Nothing moves on its own.
//
//   tap      a phone, then a card, glides in and taps a contactless reader; the reader's screen lights with a tick
//   restock  a row of coils seen from the front; the slow sellers recede into their coils, their replacements come
//            forward out of the same coils
//   refill   one coil seen from the side; the front pack drops out and the rest move up until two are left, then a
//            tote comes in and its packs fill the coil from the back

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Up over [a, b], held, down over [c, d]. */
const win = (a: number, b: number, c: number, d: number, x: number) => smooth(a, b, x) * (1 - smooth(c, d, x));

type Scene = { root: HTMLElement; apply: (p: number) => void };

export function initScenes() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const scenes: Scene[] = [];
  for (const root of document.querySelectorAll<HTMLElement>("[data-scene]")) {
    const kind = root.dataset.scene;
    const apply = kind === "tap" ? tap(root) : kind === "restock" ? restock(root) : kind === "refill" ? refill(root) : null;
    if (apply) scenes.push({ root, apply });
  }
  for (const s of scenes) run(s, reduced);
}

/** Drives one scene from the scroll, eased a little so a jump of the wheel lands softly, only while it is on screen. */
function run({ root, apply }: Scene, reduced: MediaQueryList) {
  const target = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1);
  };
  let p = target(), raf = 0, last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const t = target();
    p = reduced.matches ? t : p + (t - p) * (1 - Math.exp(-dt / 0.09));
    apply(p);
    raf = Math.abs(t - p) > 0.0004 ? requestAnimationFrame(frame) : 0;
    if (!raf) apply(p = t);
  };
  const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  let on = false;
  new IntersectionObserver(([e]) => { on = Boolean(e?.isIntersecting); if (on) wake(); }).observe(root);
  addEventListener("scroll", () => { if (on) wake(); }, { passive: true });
  addEventListener("resize", () => apply(p));
  // Positions are measured from the pictures, so each one that arrives re-places the scene.
  root.querySelectorAll("img").forEach((img) => { if (!img.complete) img.addEventListener("load", () => apply(p), { once: true }); });
  apply(p);
  // The recorder and the screenshots set the scroll and look at once: a scene can be asked to settle at a progress.
  (root as HTMLElement & { __sceneAt?: (q: number) => void }).__sceneAt = (q: number) => { p = clamp(q, 0, 1); apply(p); };
}

/** The copy's beats: with two, the first holds the first half and the second the rest. */
function beats(root: HTMLElement) {
  const els = [...root.querySelectorAll<HTMLElement>(".scene-beat")];
  return (p: number) => els.forEach((el, k) => {
    const n = els.length;
    const v = n < 2 ? 1 : k === 0 ? 1 - smooth(0.47, 0.55, p) : smooth(0.52, 0.6, p);
    el.style.opacity = v.toFixed(3);
    el.style.transform = `translateY(${((1 - v) * 14).toFixed(1)}px)`;
  });
}

// ---------------------------------------------------------------------------------------------------------------- tap
function tap(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>(".scene-stage")!;
  const reader = root.querySelector<HTMLElement>(".tap-reader");
  const phone = root.querySelector<HTMLElement>(".tap-phone");
  const card = root.querySelector<HTMLElement>(".tap-card");
  const screen = root.querySelector<HTMLElement>(".tap-screen");
  const ring = root.querySelector<HTMLElement>(".tap-ring");
  const led = root.querySelector<HTMLElement>(".tap-led");
  const light = root.querySelector<HTMLElement>(".tap-light");
  const copy = beats(root);
  if (!reader || !phone) return null;
  const two = Boolean(card);
  // Where each thing is in the scroll: the phone comes in, taps and leaves; the card comes in and taps and stays.
  const T = two
    ? { pIn: [0.04, 0.3], tap1: 0.31, pOut: [0.42, 0.56], cIn: [0.56, 0.8], tap2: 0.81 }
    : { pIn: [0.08, 0.55], tap1: 0.56, pOut: [2, 3], cIn: [2, 3], tap2: 2 };
  // The point on the reader a phone or card is held to: its contactless mark.
  const mark = () => {
    const sx = parseFloat(getComputedStyle(reader).getPropertyValue("--sx")) / 100 || 0.44;
    const sy = parseFloat(getComputedStyle(reader).getPropertyValue("--sy")) / 100 || 0.7;
    // Measured on screen: the reader is centred by a translate, which its offsets do not include.
    const r = reader.getBoundingClientRect(), st = stage.getBoundingClientRect();
    return { x: r.left - st.left + r.width * sx, y: r.top - st.top + r.height * sy };
  };
  const place = (el: HTMLElement, x: number, y: number, rot: number, sc: number, shadow: number) => {
    el.style.transform = `translate3d(${(x - el.offsetWidth / 2).toFixed(1)}px, ${(y - el.offsetHeight / 2).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
    el.style.setProperty("--shadow", shadow.toFixed(3));
  };
  // A tap: a small push in towards the reader and back.
  const press = (p: number, at: number) => Math.sin(clamp((p - at) / 0.06, 0, 1) * Math.PI) * 0.035;
  return (p: number) => {
    copy(p);
    const W = stage.clientWidth, H = stage.clientHeight;
    const m = mark();
    // The phone: from below and to the right, held over the mark tilted a little, then away to the left.
    const pi = smooth(T.pIn[0]!, T.pIn[1]!, p), po = smooth(T.pOut[0]!, T.pOut[1]!, p);
    const px = lerp(lerp(m.x + W * 0.55, m.x + phone.offsetWidth * 0.04, pi), m.x - W * 0.75, po);
    const py = lerp(lerp(m.y + H * 0.62, m.y + phone.offsetHeight * 0.16, pi), m.y + H * 0.45, po);
    place(phone, px, py, lerp(lerp(24, -4, pi), -30, po), lerp(1.14, 1, pi) - press(p, T.tap1) + po * 0.06, pi * (1 - po));
    phone.style.opacity = String(smooth(T.pIn[0]!, T.pIn[0]! + 0.04, p) * (1 - smooth(T.pOut[1]! - 0.04, T.pOut[1]!, p)));
    if (card) {
      const ci = smooth(T.cIn[0]!, T.cIn[1]!, p);
      const cx = lerp(m.x + W * 0.6, m.x + card.offsetWidth * 0.1, ci);
      const cy = lerp(m.y + H * 0.5, m.y + card.offsetHeight * 0.12, ci);
      place(card, cx, cy, lerp(-20, 8, ci), lerp(1.12, 1, ci) - press(p, T.tap2), ci);
      card.style.opacity = String(smooth(T.cIn[0]!, T.cIn[0]! + 0.04, p));
    }
    // The reader answers each tap: the screen lights with a tick, the status light brightens, one ring leaves the mark.
    const lit = Math.max(win(T.tap1, T.tap1 + 0.03, T.pOut[0]! + 0.02, T.pOut[0]! + 0.07, p), smooth(T.tap2, T.tap2 + 0.03, p));
    const drawn = Math.max(smooth(T.tap1 + 0.01, T.tap1 + 0.07, p) * (1 - smooth(T.pOut[0]! + 0.02, T.pOut[0]! + 0.07, p)), smooth(T.tap2 + 0.01, T.tap2 + 0.07, p));
    if (screen) { screen.style.opacity = lit.toFixed(3); screen.style.setProperty("--draw", (1 - drawn).toFixed(3)); }
    if (led) led.style.setProperty("--on", lit.toFixed(3));
    if (light) light.style.setProperty("--on", lit.toFixed(3));
    if (ring) {
      const r = Math.max(clamp((p - T.tap1) / 0.1, 0, 1) * (p < T.tap1 + 0.1 ? 1 : 0), clamp((p - T.tap2) / 0.1, 0, 1) * (p < T.tap2 + 0.1 ? 1 : 0));
      ring.style.transform = `translate(-50%, -50%) scale(${(0.4 + r * 2.2).toFixed(3)})`;
      ring.style.opacity = (r > 0 ? (1 - r) * 0.7 : 0).toFixed(3);
    }
  };
}

// ------------------------------------------------------------------------------------------------------------ restock
function restock(root: HTMLElement) {
  const slots = [...root.querySelectorAll<HTMLElement>(".rs-slot.is-swap")];
  if (!slots.length) return null;
  return (p: number) => {
    slots.forEach((slot, k) => {
      // Each swap a beat after the one before, so the row reads as a restock rather than one switch.
      const d = k * 0.06;
      const a = smooth(0.12 + d, 0.42 + d, p), b = smooth(0.5 + d, 0.8 + d, p);
      const pa = slot.querySelector<HTMLElement>(".rs-a"), pb = slot.querySelector<HTMLElement>(".rs-b");
      if (pa) {
        pa.style.transform = `translateY(${(-a * 4).toFixed(2)}%) scale(${(1 - 0.66 * a).toFixed(4)})`;
        pa.style.filter = `drop-shadow(0 14px 18px rgba(0, 0, 0, 0.45)) blur(${(a * 5).toFixed(2)}px) brightness(${(1 - 0.6 * a).toFixed(3)})`;
        pa.style.opacity = (1 - smooth(0.34 + d, 0.46 + d, p)).toFixed(3);
        // Past the second turn it is inside the coil: the turns cross in front of it.
        pa.classList.toggle("deep", a > 0.42);
      }
      if (pb) {
        pb.style.transform = `translateY(${(-(1 - b) * 4).toFixed(2)}%) scale(${(0.34 + 0.66 * b).toFixed(4)})`;
        pb.style.filter = `drop-shadow(0 14px 18px rgba(0, 0, 0, 0.45)) blur(${((1 - b) * 5).toFixed(2)}px) brightness(${(0.4 + 0.6 * b).toFixed(3)})`;
        pb.style.opacity = smooth(0.48 + d, 0.58 + d, p).toFixed(3);
        pb.classList.toggle("deep", b < 0.58);
      }
      slot.style.setProperty("--na", (1 - smooth(0.36 + d, 0.46 + d, p)).toFixed(3));
      slot.style.setProperty("--nb", smooth(0.62 + d, 0.72 + d, p).toFixed(3));
    });
  };
}

// ------------------------------------------------------------------------------------------------------------- refill
function refill(root: HTMLElement) {
  const coil = root.querySelector<HTMLElement>(".rf-coil");
  const tote = root.querySelector<HTMLElement>(".rf-tote");
  if (!coil || !tote) return null;
  const packs = [...coil.querySelectorAll<HTMLElement>(".rf-pack")];
  const totePacks = [...tote.querySelectorAll<HTMLElement>(".rf-pack")];
  const dots = [...root.querySelectorAll<HTMLElement>(".rf-level li")];
  const states = [...root.querySelectorAll<HTMLElement>(".rf-status [data-k]")];
  const ax = (coil.dataset.axis ?? "0.25,0.6,0.8,0.33").split(",").map(Number) as [number, number, number, number];
  const N = packs.length, VENDS = Math.max(0, N - 2), FILLS = Math.min(totePacks.length, VENDS);
  // A gap between two turns of the coil, 0 at the front: where it is on the coil's picture, and how far away.
  const gap = (s: number) => { const t = 0.05 + s * 0.17; return { x: lerp(ax[0], ax[2], t), y: lerp(ax[1], ax[3], t), sc: lerp(1, 0.6, t) }; };
  const TURN = 34; // the packs face down the coil
  const put = (el: HTMLElement, x: number, y: number, sc: number, turn: number, rz: number) => {
    el.style.transform = `translate3d(${(x - el.offsetWidth / 2).toFixed(1)}px, ${(y - el.offsetHeight / 2).toFixed(1)}px, 0) rotateY(${turn.toFixed(1)}deg) rotate(${rz.toFixed(1)}deg) scale(${sc.toFixed(4)})`;
  };
  return (p: number) => {
    const W = coil.clientWidth, H = coil.clientHeight;
    // Four vends: each moves every pack up one gap and drops the front one out.
    let v = 0;
    for (let k = 0; k < VENDS; k++) v += smooth(0.08 + k * 0.1, 0.16 + k * 0.1, p);
    // The tote comes in from the right, waits while its packs go up into the coil, and leaves.
    const tin = smooth(0.48, 0.6, p), tout = smooth(0.9, 0.99, p);
    tote.style.transform = `translate3d(${((1 - tin) * 70 + tout * 70).toFixed(2)}%, ${((1 - tin) * 8).toFixed(2)}%, 0)`;
    tote.style.opacity = (smooth(0.48, 0.52, p) * (1 - smooth(0.95, 0.99, p))).toFixed(3);
    const coilBox = coil.getBoundingClientRect();
    let filled = 0;
    packs.forEach((el, i) => {
      const s = i - v;
      const r = i < FILLS ? smooth(0.62 + i * 0.065, 0.71 + i * 0.065, p) : 0;
      filled += r;
      if (r > 0.001) {
        // Up out of the tote, over, and into the gap at the back of the coil.
        const from = totePacks[i]!.getBoundingClientRect();
        const to = gap(N - VENDS + i);
        const fx = from.left + from.width / 2 - coilBox.left, fy = from.top + from.height / 2 - coilBox.top;
        const sc0 = from.height / Math.max(1, el.offsetHeight);
        put(el, lerp(fx, to.x * W, r), lerp(fy, to.y * H, r) - Math.sin(r * Math.PI) * H * 0.22, lerp(sc0, to.sc, r), lerp(0, TURN, r), 0);
        el.style.opacity = "1";
        el.style.zIndex = String(10 - (N - VENDS + i));
        return;
      }
      if (s >= 0) {
        const g = gap(s);
        put(el, g.x * W, g.y * H, g.sc, TURN, 0);
        el.style.opacity = "1";
        el.style.zIndex = String(Math.round(10 - s));
        return;
      }
      // Off the front of the coil and down into the tray.
      const f = Math.min(1, -s), g = gap(0);
      put(el, g.x * W - f * W * 0.06, g.y * H + f * f * H * 0.9, g.sc, TURN + f * 20, f * 28);
      el.style.opacity = (1 - smooth(0.55, 1, f)).toFixed(3);
      el.style.zIndex = "11";
    });
    totePacks.forEach((el, i) => { el.style.opacity = (i < FILLS && smooth(0.62 + i * 0.065, 0.71 + i * 0.065, p) > 0.001) ? "0" : "1"; });
    const level = N - v + filled;
    dots.forEach((d, k) => d.style.setProperty("--on", clamp(level - k, 0, 1).toFixed(3)));
    const st = p < 0.5 ? 0 : p < 0.9 ? 1 : 2;
    states.forEach((el, k) => el.classList.toggle("on", k === st));
  };
}
