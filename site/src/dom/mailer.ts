// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Mailer: a subscription box built from its own flat net, in one three.js scene driven by the scroll. The page opens
// on the printed sheet lying on a table; the sheet lifts, its walls fold down under it, the lid curls over and the
// tuck goes in, and the folded box rolls over onto its base while the camera comes round to the front. The lid opens,
// the tissue parts, and the packs come out one at a time, each turning once as it hops out to stand on the table
// behind the box. Then the camera looks straight down and the packs lie knolled on the table, each naming itself under the pointer;
// the empty box falls open flat, kraft side up, and the camera dives into the message printed inside its lid.
//
// Every face is a thin board: print outside, kraft inside and on its edges, its pictures from the kit (art) or drawn
// here when the kit gives none. The packs are solid: each is two halves inflated from its front and back cut-outs
// (dom/solid.ts), shown as photographed (unlit) while casting shadows on the table. The table is the page's own
// ground with only the shadows drawn on it, a studio sweep rather than a photographed surface. Timing lives in mailer-plan.ts.

import * as THREE from "three";
import { loadImage } from "./img";
import { createSky, rgb, type Rgb } from "./sky";
import { inflate } from "./solid";
import { BOX, U, knoll, lineAt, marks, netSize, stages, totalScreens } from "./mailer-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

type Pack = { name: string; line: string; front: string; back: string; h: number };
type Art = { lid: string; pattern: string; inside: string; kraft: string; table: string; tissue: string };

export function initMailer() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-mailer]")].entries()) setup(root, n === 0);
}

// ---------------------------------------------------------------------------------------------- drawn pictures
// What the box wears when the kit brings no artwork of its own: drawn once, in the page's fonts and colours.

const css = () => getComputedStyle(document.documentElement);
const cssv = (k: string, fb: string) => css().getPropertyValue(k).trim() || fb;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, x: c.getContext("2d")! };
}

/** Seeded noise, so the drawn board is the same board every visit. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function drawKraft(): HTMLCanvasElement {
  const { c, x } = canvas(512, 512);
  x.fillStyle = "#b98f62";
  x.fillRect(0, 0, 512, 512);
  const r = rng(77);
  for (let i = 0; i < 2600; i++) {
    const px = r() * 512, py = r() * 512, l = 4 + r() * 18, a = r() * Math.PI;
    x.strokeStyle = r() < 0.5 ? `rgba(90,58,28,${0.05 + r() * 0.08})` : `rgba(235,205,160,${0.05 + r() * 0.08})`;
    x.lineWidth = 0.6 + r();
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  return c;
}

/** A soft dark pool, darkest in the middle, for the shadow where a box meets the table. */
function drawContact(): HTMLCanvasElement {
  const { c, x } = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.45, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return c;
}

function drawTissue(brand: string, ink: string): HTMLCanvasElement {
  const { c, x } = canvas(512, 512);
  x.fillStyle = "#f7f6f2";
  x.fillRect(0, 0, 512, 512);
  const r = rng(5);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(0,0,0,${0.025 + r() * 0.03})`;
    x.lineWidth = 1 + r() * 2;
    x.beginPath(); x.moveTo(r() * 512, r() * 512); x.lineTo(r() * 512, r() * 512); x.stroke();
  }
  x.fillStyle = ink; x.globalAlpha = 0.5;
  x.font = `600 22px ${cssv("--f-display", "sans-serif")}`;
  x.textAlign = "center";
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) x.fillText(brand.toUpperCase(), 85 + i * 171 + (j % 2) * 85, 70 + j * 128);
  return c;
}

/** The repeating print on the walls and the base: small snack shapes in two colours on the accent. */
function drawPattern(bg: string, a: string, b: string): HTMLCanvasElement {
  const { c, x } = canvas(512, 512);
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 512);
  const r = rng(19);
  const shapes = [
    (s: number) => { x.beginPath(); x.ellipse(0, 0, s, s * 0.62, 0, 0, Math.PI * 2); x.fill(); },
    (s: number) => { x.beginPath(); x.roundRect(-s * 0.55, -s, s * 1.1, s * 2, s * 0.3); x.fill(); },
    (s: number) => { x.beginPath(); x.arc(0, 0, s * 0.8, 0, Math.PI * 2); x.fill(); x.fillStyle = bg; x.beginPath(); x.arc(0, 0, s * 0.3, 0, Math.PI * 2); x.fill(); },
    (s: number) => { x.beginPath(); x.moveTo(-s, s * 0.7); x.quadraticCurveTo(0, -s * 1.4, s, s * 0.7); x.closePath(); x.fill(); },
  ];
  const step = 128;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const px = gx * step + (gy % 2) * step * 0.5 + 32, py = gy * step + 40;
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0]]) {
      x.save();
      x.translate(px + ox!, py + oy!);
      x.rotate((r() - 0.5) * 1.4);
      x.fillStyle = r() < 0.5 ? a : b;
      shapes[(gx + gy * 2) % shapes.length]!(14 + r() * 8);
      x.restore();
    }
  }
  return c;
}

/** The lid: the club's name set large and centred inside a printed frame, the box number on a round sticker. */
function drawLid(brand: string, lid: string, bg: string, a: string, b: string): HTMLCanvasElement {
  const W = 1280, H = 960;
  const { c, x } = canvas(W, H);
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  // A frame of the pattern's shapes around the edge, the middle left clear for the name.
  const pat = x.createPattern(drawPattern(bg, a, b), "repeat");
  if (pat) { x.fillStyle = pat; x.fillRect(0, 0, W, H); }
  x.fillStyle = bg;
  x.fillRect(W * 0.1, H * 0.16, W * 0.8, H * 0.68);
  x.strokeStyle = a;
  x.lineWidth = 6;
  x.strokeRect(W * 0.1, H * 0.16, W * 0.8, H * 0.68);
  x.fillStyle = a;
  const words = brand.toUpperCase().split(/\s+/);
  const fam = cssv("--f-display", "sans-serif"), wt = cssv("--f-display-weight", "700");
  let size = 220;
  x.font = `${wt} ${size}px ${fam}`;
  const widest = Math.max(...words.map((w) => x.measureText(w).width));
  size = Math.min(size, ((W * 0.66) / Math.max(1, widest)) * size, (H * 0.5) / (words.length * 0.95));
  x.font = `${wt} ${size}px ${fam}`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  words.forEach((w, i) => x.fillText(w, W / 2, H * 0.5 + (i - (words.length - 1) / 2) * size * 0.95));
  if (lid) {
    const cx = W * 0.85, cy = H * 0.2, rr = 118;
    x.fillStyle = b;
    x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
    x.fillStyle = a;
    x.font = `700 38px ${cssv("--f-mono", "monospace")}`;
    const [first, ...rest] = lid.toUpperCase().split(/\s+/);
    x.fillText(first ?? "", cx, cy - 22);
    x.fillText(rest.join(" "), cx, cy + 24);
  }
  return c;
}

/** A colour mixed towards another: `k` of `b` into `a`. */
function mixHex(a: string, b: string, k: number) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return `#${ca.lerp(cb, k).getHexString()}`;
}

/** The floor's type: the club's name set huge and stacked, tone on tone, cropped by the floor's edge like a poster. */
function drawFloorType(brand: string, tone: string): HTMLCanvasElement {
  const S = 2048;
  const { c, x } = canvas(S, S);
  const words = brand.toUpperCase().split(/\s+/).filter(Boolean);
  const fam = cssv("--f-display", "sans-serif"), wt = cssv("--f-display-weight", "700");
  x.fillStyle = tone;
  x.textAlign = "center";
  x.textBaseline = "middle";
  let size = 400;
  x.font = `${wt} ${size}px ${fam}`;
  const widest = Math.max(...words.map((w) => x.measureText(w).width));
  size = Math.min((S * 1.04) / Math.max(1, widest) * size, (S * 0.98) / (words.length * 0.86));
  x.font = `${wt} ${size}px ${fam}`;
  words.forEach((w, i) => x.fillText(w, S / 2, S / 2 + (i - (words.length - 1) / 2) * size * 0.86));
  return c;
}

/** A pool of light: clear in the middle, the floor darkening towards the edges of the frame. */
function drawPool(): HTMLCanvasElement {
  const { c, x } = canvas(512, 512);
  // Laid across the whole 30 m floor, so its edge is never in view: clear for about a metre and a half round the box,
  // then evenly dim out to the horizon, where the fog takes over.
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.045, "rgba(0,0,0,0.03)"); g.addColorStop(0.12, "rgba(0,0,0,0.26)"); g.addColorStop(1, "rgba(0,0,0,0.26)");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return c;
}

/** Inside the lid: a message printed straight onto the kraft. */
function drawInside(kraft: HTMLCanvasElement | HTMLImageElement, hello: string, sub: string, ink: string): HTMLCanvasElement {
  const W = 1280, H = 960;
  const { c, x } = canvas(W, H);
  const pat = x.createPattern(kraft as CanvasImageSource, "repeat");
  x.fillStyle = pat ?? "#b98f62";
  x.fillRect(0, 0, W, H);
  x.fillStyle = ink;
  x.globalAlpha = 0.92;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `${cssv("--f-display-weight", "700")} 260px ${cssv("--f-display", "sans-serif")}`;
  x.fillText(hello, W / 2, H * 0.44);
  x.font = `500 46px ${cssv("--f-body", "sans-serif")}`;
  x.fillText(sub, W / 2, H * 0.7);
  return c;
}

// ---------------------------------------------------------------------------------------------- the page

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".ml-pin")!;
  const cv = root.querySelector<HTMLCanvasElement>(".ml-gl")!;
  const intro = root.querySelector<HTMLElement>(".ml-intro");
  const lines = [...root.querySelectorAll<HTMLElement>(".ml-line")];
  const listItems = [...root.querySelectorAll<HTMLElement>(".ml-list li")];
  const finale = root.querySelector<HTMLElement>(".ml-finale");
  const tag = root.querySelector<HTMLElement>(".ml-tag");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const packs: Pack[] = [...root.querySelectorAll<HTMLElement>(".ml-item")].map((el) => ({
    name: el.dataset.name ?? "", line: el.dataset.line ?? "", front: el.dataset.front ?? "", back: el.dataset.back ?? "", h: Number(el.dataset.h) || 18,
  }));
  const art: Art = { lid: root.dataset.lid ?? "", pattern: root.dataset.pattern ?? "", inside: root.dataset.inside ?? "", kraft: root.dataset.kraft ?? "", table: root.dataset.table ?? "", tissue: root.dataset.tissue ?? "" };
  const backdrop = root.dataset.backdrop ?? "studio";
  // The sky backdrop: a slow liquid of the accent behind the scene (sky.ts), deep at the edges, the accent itself, and
  // a glow of it shifted towards cyan and lifted, with the scene drawn over it on a clear canvas. The glow stays in the
  // accent's own family: mixing a red second colour into a blue made purple, which the design rules forbid.
  const sky = backdrop === "sky" ? createSky(root.querySelector<HTMLCanvasElement>(".ml-sky")) : null;
  const css = (k: string, f: string) => getComputedStyle(document.documentElement).getPropertyValue(k).trim() || f;
  const a1 = rgb(css("--c-accent", "#2a4bff"));
  const glow: Rgb = [a1[0] * 0.3 + 0.38, Math.min(1, a1[1] + 0.5), Math.min(1, a1[2] * 0.95 + 0.08)];
  const skyCols: Rgb[] = [a1.map((v) => v * 0.2) as Rgb, a1, glow];
  const brand = root.dataset.brand ?? "";
  const lidText = root.dataset.lidText ?? "";
  const hello = root.dataset.hello ?? "Hello.";
  const helloSub = root.dataset.helloSub ?? "";
  const n = packs.length;
  const total = totalScreens(n);
  const M = marks(n);
  root.style.setProperty("--ml-screens", String(total + 1));

  let scene: ReturnType<typeof createScene> | null = null;
  try { scene = createScene(cv, packs, art, { brand, lidText, hello, helloSub, backdrop }); } catch (e) { console.warn("Mailer: no WebGL", e); }
  if (!scene) { root.classList.add("is-flat"); document.body.classList.add("canvas-ready"); return; }

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, y: 0.5, on: false, px: -1, py: -1 };
  let uNow = 0, raf = 0, last = 0, t = 0, demoing = false, hover = -1;

  const apply = (u: number, time: number) => {
    const S = stages(u, n);
    if (sky) sky.draw(time, skyCols);
    const hit = scene!.draw(u, S, time, ptr, demoing ? hover : -1);
    if (!demoing) hover = hit;
    // The copy for each act, in and out by the scroll.
    const introK = 1 - smooth(M.fold0 * 0.55, M.fold0 + U.lift * 0.6, u);
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.visibility = introK > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateY(${((1 - introK) * -24).toFixed(1)}px)`; }
    const spans: [number, number][] = [[M.fold0 + U.lift * 0.6, M.open0 + U.open * 0.2], [M.rise0 - 0.15, M.lay0 + U.lay * 0.35], [M.lay0 + U.lay * 0.6, M.unfold0 + U.unfold * 0.3]];
    lines.forEach((el, j) => {
      const [a, b] = spans[j] ?? [9e9, 9e9];
      const k = smooth(a, a + 0.25, u) * (1 - smooth(b - 0.25, b, u));
      el.style.opacity = k.toFixed(3);
      el.style.visibility = k > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - k) * 18).toFixed(1)}px)`;
    });
    listItems.forEach((li, i) => {
      const k = S.rise(i);
      li.classList.toggle("is-out", k > 0.98);
      li.classList.toggle("is-now", k > 0.02 && k <= 0.98);
    });
    const fk = smooth(M.dive0 + U.dive * 0.45, M.end - 0.05, u);
    if (finale) { finale.style.opacity = fk.toFixed(3); finale.style.visibility = fk > 0.001 ? "visible" : "hidden"; finale.style.pointerEvents = fk > 0.8 ? "auto" : "none"; }
    if (tag) {
      if (hover >= 0 && ptr.px >= 0 && S.lay > 0.98 && S.unfold < 0.5) {
        tag.hidden = false;
        tag.textContent = [packs[hover]!.name, packs[hover]!.line].filter(Boolean).join(" · ");
        tag.style.transform = `translate(${(ptr.px + 14).toFixed(0)}px, ${(ptr.py - 34).toFixed(0)}px)`;
      } else tag.hidden = true;
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    uNow += (progress() - uNow) * (reduced.matches ? 1 : 1 - Math.exp(-dt / 0.13));
    if (!reduced.matches) t += dt;
    apply(uNow, t);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  pin.addEventListener("pointermove", (e) => {
    const r = pin.getBoundingClientRect();
    ptr.px = e.clientX - r.left; ptr.py = e.clientY - r.top;
    ptr.x = ptr.px / Math.max(1, r.width); ptr.y = ptr.py / Math.max(1, r.height);
    ptr.on = e.pointerType === "mouse";
  }, { passive: true });
  pin.addEventListener("pointerleave", () => { ptr.on = false; ptr.px = -1; });
  addEventListener("resize", () => { scene!.resize(); apply(uNow, t); });
  uNow = progress();
  scene.ready.then(() => { apply(uNow, t); document.body.classList.add("canvas-ready"); });

  // ---------------------------------------------------------------------------------------------- card recording
  // The pointer tips the printed sheet, then the whole sequence plays through to the packs laid out, one named.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    // The fold and the roll get three seconds of their own: they are what the box is about.
    const keys: [number, number][] = [[0, 0], [1.4, 0], [4.4, M.open0], [5.4, M.open0 + U.open], [5.9, M.open0 + U.open], [9.6, M.lay0 - 0.02], [11.2, M.lay0 + U.lay], [13.2, M.lay0 + U.lay + 0.05], [15.4, total]];
    const uAt = (time: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [ta, ua] = keys[k - 1]!, [tb, ub] = keys[k]!;
        if (time <= tb) return lerp(ua, ub, smoother((time - ta) / (tb - ta)));
      }
      return keys.at(-1)![1];
    };
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
      const u = uAt(time);
      let x: number, y: number;
      // Over the sheet at first, so it tips; then off to the side; then onto a laid-out pack.
      if (time < 1.6) { const k = smoother(time / 1.4); x = lerp(W * 0.9, W * 0.62, k); y = lerp(H * 0.85, H * 0.55, k); hover = -1; }
      else if (time < 11.4) { x = W * 0.95; y = H * 0.92; hover = -1; }
      else {
        // Place the camera for this instant first, so the pack's place on screen is measured from where it now is.
        apply(u, time);
        const target = scene!.screenOf(2);
        const k = smoother((time - 11.4) / 1.0);
        x = lerp(W * 0.95, target.x, k); y = lerp(H * 0.92, target.y, k);
        hover = time > 12.2 && time < 13.8 ? 2 : -1;
      }
      ptr.px = x; ptr.py = y; ptr.x = x / W; ptr.y = y / H; ptr.on = time < 1.6;
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      apply(u, time);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

// ---------------------------------------------------------------------------------------------- the scene

type Stages = ReturnType<typeof stages>;
type Ptr = { x: number; y: number; on: boolean; px: number; py: number };

function createScene(cv: HTMLCanvasElement, packs: Pack[], art: Art, words: { brand: string; lidText: string; hello: string; helloSub: string; backdrop: string }) {
  const clear = words.backdrop === "sky";
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: clear, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // No tone mapping: the print must come out at the brand's own colour. ACES pulls a saturated blue towards violet and
  // Neutral crushes its dark channels; the lights below are set so a face turned to the sun shows about its own colour.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  // Soft, wide shadows as in a studio with one large light: variance shadow maps blurred over many texels.
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  const bg = new THREE.Color(cssv("--c-bg", "#f4eee3"));
  scene.background = clear ? null : bg;
  // A seamless studio ground in the page's own colour: the table is the background itself, with only the shadows drawn
  // on it, so there is no horizon and no texture to give the scene away as a render. A kit that names a table picture
  // gets that instead, running away into fog.
  const fog = new THREE.Fog(bg, 2.2, 7);
  scene.fog = clear ? null : fog;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);

  // Light from the upper left and behind the viewer, throwing soft shadows across the table.
  // Card is matte: every surface is diffuse only (no environment, no specular), so the print shows at its own colour.
  // A glossy material reflected the room in white and turned the cobalt lavender.
  const sun = new THREE.DirectionalLight(0xfff6ec, 2.2);
  sun.position.set(-0.9, 2.2, 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 0.5, far: 5 });
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 14;
  sun.shadow.blurSamples = 20;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xfffaf2, 0x8a7560, 1.35));

  const accent = cssv("--c-accent", "#2a4bff"), cream = cssv("--c-bg", "#f4eee3"), red = cssv("--c-accent-2", "#e8432c"), ink = cssv("--c-text", "#191714");
  const texOf = (c: HTMLCanvasElement | HTMLImageElement, repeat?: [number, number]) => {
    const t = c instanceof HTMLCanvasElement ? new THREE.CanvasTexture(c) : new THREE.Texture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.needsUpdate = true;
    return t;
  };

  // Materials start on drawn pictures and switch to the kit's own once they load.
  const kraftC = drawKraft();
  const mat = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map });
  const kraftMat = mat(texOf(kraftC, [1, 1]));
  const tableMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const patternC = drawPattern(accent, cream, red);
  const lidMat = mat(texOf(drawLid(words.brand, words.lidText, accent, cream, red)));
  const insideMat = mat(texOf(drawInside(kraftC, words.hello, words.helloSub, accent)));
  const tissueMat = new THREE.MeshLambertMaterial({ map: texOf(drawTissue(words.brand, accent)), side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
  const patternMats: THREE.MeshLambertMaterial[] = [];
  const patternFor = (w: number, d: number) => { const m = mat(texOf(patternC, [w / 0.14, d / 0.14])); patternMats.push(m); return m; };

  // The ground: shadows only, on the page's colour. A table picture, when the kit has one, is laid over it.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x2a1f12, opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.0005;
  table.receiveShadow = true;
  table.visible = false;
  scene.add(table);
  // The backdrop is the floor, since the camera looks down on it in almost every view. "pattern" prints the box's own
  // pattern across it tone on tone, "type" sets the club's name across it huge, "studio" leaves it bare; all three sit
  // under a pool of light that darkens towards the edges of the frame.
  const tone = mixHex(cream, ink, 0.07);
  if (words.backdrop === "pattern" || words.backdrop === "type") {
    ground.material.opacity = 0.16;
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    if (words.backdrop === "pattern") floorMat.map = texOf(drawPattern(cream, tone, mixHex(cream, ink, 0.045)), [30 / 0.5, 30 / 0.5]);
    else floorMat.color.set(cream);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    floor.receiveShadow = true;
    scene.add(floor);
    if (words.backdrop === "type") {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshLambertMaterial({ map: texOf(drawFloorType(words.brand, tone)), transparent: true, depthWrite: false }));
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(0.15, -0.0006, -0.2);
      decal.receiveShadow = true;
      scene.add(decal);
    }
  }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: texOf(drawPool()), transparent: true, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.2, 0.0004, -0.15);
  if (!clear) scene.add(pool);

  // Where the standing box meets the table, a pool of shade the sun's shadow alone does not give.
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texOf(drawContact()), color: 0x2a1f12, transparent: true, opacity: 0, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.0008;
  contact.scale.set(BOX.w * 1.5, BOX.d * 1.6, 1);
  scene.add(contact);

  // ------------------------------------------------------------------ the box, hinged as its net is cut
  const B = BOX;
  /** One face's surface, lying in x-z: `up` faces +y (outside of the flat sheet), otherwise -y. */
  const face = (w: number, d: number, m: THREE.Material, up: boolean, flipUv: boolean) => {
    const g = new THREE.PlaneGeometry(w, d);
    if (flipUv) { const uv = g.attributes.uv!; for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i)); }
    const me = new THREE.Mesh(g, m);
    me.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
    me.position.y = (up ? 1 : -1) * B.board * 0.5;
    me.castShadow = true;
    me.receiveShadow = true;
    return me;
  };
  /** A board panel: print outside, kraft inside, a kraft edge between. Centred on its own origin. */
  const panel = (w: number, d: number, out: THREE.Material, inside: THREE.Material, flipOut = false, flipIn = false) => {
    const g = new THREE.Group();
    g.add(face(w, d, out, true, flipOut), face(w, d, inside, false, flipIn));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, B.board * 0.94, d), kraftMat);
    edge.castShadow = true;
    g.add(edge);
    return g;
  };
  const rig = new THREE.Group();
  const box = new THREE.Group();
  box.position.y = B.h / 2;
  rig.add(box);
  scene.add(rig);
  const base = panel(B.w, B.d, patternFor(B.w, B.d), kraftMat);
  box.add(base);
  const hinge = (x: number, z: number) => { const h = new THREE.Group(); h.position.set(x, 0, z); return h; };
  const hBack = hinge(0, -B.d / 2), hFront = hinge(0, B.d / 2), hLeft = hinge(-B.w / 2, 0), hRight = hinge(B.w / 2, 0);
  const back = panel(B.w, B.h, patternFor(B.w, B.h), kraftMat); back.position.z = -B.h / 2; hBack.add(back);
  const front = panel(B.w, B.h, patternFor(B.w, B.h), kraftMat); front.position.z = B.h / 2; hFront.add(front);
  const left = panel(B.h, B.d, patternFor(B.h, B.d), kraftMat); left.position.x = -B.h / 2; hLeft.add(left);
  const right = panel(B.h, B.d, patternFor(B.h, B.d), kraftMat); right.position.x = B.h / 2; hRight.add(right);
  const hLid = hinge(0, -B.h); hBack.add(hLid);
  // The lid's print reads from behind the flat sheet (where the page opens) and from the front once it is closed.
  const lid = panel(B.w, B.d, lidMat, insideMat, true, true); lid.position.z = -B.d / 2; hLid.add(lid);
  const hTuck = hinge(0, -B.d); hLid.add(hTuck);
  const tuck = panel(B.w, B.tuck, patternFor(B.w, B.tuck), kraftMat); tuck.position.z = -B.tuck / 2; hTuck.add(tuck);
  box.add(hBack, hFront, hLeft, hRight);

  // Tissue: two leaves inside the box, hinged at the side walls' tops, folded over the packs.
  const tissue = new THREE.Group();
  const leaf = (sgn: number) => {
    const g = new THREE.PlaneGeometry(B.w * 0.52, B.d * 0.92, 12, 6);
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.006 * Math.sin(x * 40 + y * 23) + 0.004 * Math.sin(y * 61)); }
    g.translate(B.w * 0.26, 0, 0);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, tissueMat);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = true;
    const h = new THREE.Group();
    h.position.set(sgn * B.w * 0.5, B.h - 0.012, 0);
    h.scale.x = -sgn;
    h.add(m);
    return h;
  };
  const tissueL = leaf(-1), tissueR = leaf(1);
  tissue.add(tissueL, tissueR);
  tissue.visible = false;
  scene.add(tissue);

  // ------------------------------------------------------------------ the packs
  type P = { group: THREE.Group; w: number; h: number; rest: THREE.Vector3; restRot: number; arc: { x: number; y: number; z: number }; lay: { x: number; z: number }; spin: number };
  const flatGeo = new THREE.PlaneGeometry(1, 1);
  // A pack photograph is lit already, as if facing the viewer, so lighting it again from the sun pasted it flat on the
  // scene. It is shaded relative to that instead (the storm's packs do the same): a face of the pillow turned to the
  // light brightens a little, one turned away darkens, and foil catches a highlight that slides as the pack turns.
  // The light is fixed to the view, so a pack reads as solid from wherever the camera stands.
  const LIGHT = new THREE.Vector3(-0.45, 0.6, 0.75).normalize();
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const packMat = () => new THREE.ShaderMaterial({
    uniforms: { map: { value: blank } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 l = vec3(${LIGHT.x.toFixed(4)}, ${LIGHT.y.toFixed(4)}, ${LIGHT.z.toFixed(4)});
        float shade = clamp((0.35 + 0.65 * max(dot(n, l), 0.0)) / ${(0.35 + 0.65 * LIGHT.z).toFixed(4)}, 0.3, 1.14);
        float sp = pow(max(dot(n, normalize(l + normalize(vV))), 0.0), 36.0) * 0.32;
        gl_FragColor = vec4(c.rgb * shade + sp, 1.0);
      }`,
  });
  const P: P[] = packs.map((p, i) => {
    const g = new THREE.Group();
    const frontM = new THREE.Mesh(flatGeo, packMat());
    const backM = new THREE.Mesh(flatGeo, packMat());
    backM.rotation.y = Math.PI;
    for (const m of [frontM, backM]) { m.castShadow = true; g.add(m); }
    g.visible = false;
    scene.add(g);
    const hM = p.h / 100;
    return { group: g, w: hM * 0.6, h: hM, rest: new THREE.Vector3(), restRot: 0, arc: lineAt(i, packs.length), lay: { x: 0, z: 0 }, spin: (i % 2 ? -1 : 1) * Math.PI * 2 };
  });
  const r = rng(1234);
  P.forEach((p, i) => {
    // Lying flat in the box, stacked under the tissue.
    p.rest.set((r() - 0.5) * B.w * 0.35, 0.012 + i * 0.006, (r() - 0.5) * B.d * 0.3);
    p.restRot = (r() - 0.5) * 0.8;
  });

  // Where the packs lie when they are laid out: beside the box, to its right on a wide screen and below it on a tall one.
  let wide = true;
  const layout = () => {
    const sizes = P.map((p) => ({ w: p.w, h: p.h }));
    const k = knoll(sizes, wide ? 0.78 : 0.62, 0.03);
    P.forEach((p, i) => { const a = k.at[i]!; p.lay = wide ? { x: 0.7 + a.x, z: a.y * 0.92 - 0.06 } : { x: a.x, z: 0.6 + a.y }; });
  };

  const ready = (async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    // Redraw the printed faces now the page's fonts are in.
    lidMat.map = texOf(drawLid(words.brand, words.lidText, accent, cream, red));
    insideMat.map = texOf(drawInside(kraftC, words.hello, words.helloSub, accent));
    const [lidI, patI, insI, krI, tabI, tisI] = await Promise.all([art.lid, art.pattern, art.inside, art.kraft, art.table, art.tissue].map((s) => loadImage(s)));
    if (lidI) lidMat.map = texOf(lidI);
    if (insI) insideMat.map = texOf(insI);
    if (krI) kraftMat.map = texOf(krI, [1, 1]);
    if (tabI) {
      // A photographed table top is about 60 cm across: tile it at that size on the 30 m plane, mirrored so each seam
      // meets its own reflection, and take a little warmth out so the wood sits behind the print rather than over it.
      const t = texOf(tabI, [50, 50 * (tabI.width / tabI.height)]);
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      tableMat.map = t;
      tableMat.color.set("#e9e3da");
      table.visible = true;
    } else scene.fog = null;
    if (tisI) tissueMat.map = texOf(tisI);
    if (patI) for (const m of patternMats) { const rep = m.map!.repeat.clone(); m.map = texOf(patI, [rep.x, rep.y]); }
    for (const m of [lidMat, insideMat, kraftMat, tableMat, tissueMat, ...patternMats]) m.needsUpdate = true;
    await Promise.all(P.map(async (p, i) => {
      const [fi, bi] = await Promise.all([loadImage(packs[i]!.front), loadImage(packs[i]!.back)]);
      if (!fi) return;
      const aspect = fi.width / fi.height;
      p.w = p.h * aspect;
      const [fm, bm] = p.group.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
      // Sampled as stored and written as they are: the shader does no colour conversion, so neither does the texture.
      const raw = (img: HTMLImageElement) => { const t = texOf(img); t.colorSpace = THREE.NoColorSpace; return t; };
      fm!.material.uniforms.map!.value = raw(fi);
      bm!.material.uniforms.map!.value = raw(bi ?? fi);
      try {
        const sh = inflate(fi, 72, true, 0.1, false);
        fm!.geometry = sh.geo;
        bm!.geometry = sh.geo;
      } catch (e) { console.warn("Mailer: kept a flat pack", e); }
      p.group.scale.set(p.w, p.h, p.h);
    }));
    layout();
  })();

  let cw = 1, ch = 1;
  const resize = () => {
    const rect = cv.getBoundingClientRect();
    cw = Math.max(1, rect.width); ch = Math.max(1, rect.height);
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    const was = wide;
    wide = cw / ch > 1.05;
    if (was !== wide) layout();
  };
  resize();

  // ------------------------------------------------------------------ the camera
  type View = { az: number; el: number; tx: number; ty: number; tz: number; r: number; ox: number; oy: number };
  const net = netSize();
  const views = () => {
    const netC = -(B.d / 2 + B.h + B.d + B.tuck - (B.d / 2 + B.h)) / 2; // centre of the sheet along z
    const sheetR = Math.hypot(net.x, net.z) * 0.5;
    // ox moves the subject right and oy moves it down (as fractions of the screen), clear of the copy beside or above it.
    const hero: View = { az: Math.PI, el: 1.08, tx: 0, ty: 0, tz: netC, r: sheetR * (wide ? 1.0 : 0.98), ox: wide ? 0.2 : 0, oy: wide ? 0 : 0.17 };
    const fold: View = { az: Math.PI * 0.13, el: 0.62, tx: 0, ty: 0.1, tz: 0, r: 0.3, ox: wide ? 0.16 : 0, oy: wide ? 0 : 0.14 };
    const open: View = { az: Math.PI * 0.05, el: 0.78, tx: 0, ty: 0.06, tz: 0.02, r: wide ? 0.3 : 0.25, ox: wide ? 0.14 : 0, oy: wide ? 0 : 0.13 };
    const fan: View = { az: 0, el: 0.82, tx: 0, ty: 0.04, tz: -0.34, r: wide ? 0.6 : 0.5, ox: wide ? 0.17 : 0, oy: wide ? 0 : 0.12 };
    const lay: View = { az: 0, el: 1.555, tx: wide ? 0.4 : 0, ty: 0, tz: wide ? -0.1 : 0.22, r: wide ? 0.6 : 0.68, ox: wide ? 0.08 : 0, oy: wide ? 0 : 0.08 };
    // The message inside the lid, once the box lies open: the lid's centre after the box has rolled over and fallen flat.
    const hz = -(B.d / 2 + B.h + B.d / 2);
    // Held high on the screen, so the closing line sits beneath the message rather than over it.
    const dive: View = { az: 0, el: 1.565, tx: 0, ty: 0, tz: hz, r: B.d * 0.5, ox: 0, oy: -0.16 };
    return { hero, fold, open, fan, lay, dive };
  };
  const mix = (a: View, b: View, t: number): View => ({ az: lerp(a.az, b.az, t), el: lerp(a.el, b.el, t), tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t), tz: lerp(a.tz, b.tz, t), r: lerp(a.r, b.r, t), ox: lerp(a.ox, b.ox, t), oy: lerp(a.oy, b.oy, t) });
  const place = (v: View, ptr: Ptr) => {
    const vf = (camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = v.r / Math.sin(Math.min(vf, hf) / 2);
    const az = v.az + (ptr.on ? (ptr.x - 0.5) * 0.12 : 0), el = clamp(v.el + (ptr.on ? (ptr.y - 0.5) * -0.06 : 0), 0.1, 1.566);
    camera.position.set(v.tx + Math.sin(az) * Math.cos(el) * dist, v.ty + Math.sin(el) * dist, v.tz + Math.cos(az) * Math.cos(el) * dist);
    fog.near = dist + 0.9;
    fog.far = dist + 5;
    camera.up.set(0, 1, 0);
    camera.lookAt(v.tx, v.ty, v.tz);
    camera.setViewOffset(cw, ch, -v.ox * cw, -v.oy * ch, cw, ch);
    camera.updateProjectionMatrix();
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const v3 = new THREE.Vector3();

  const draw = (u: number, S: Stages, _time: number, ptr: Ptr, forced: number) => {
    const n = P.length;
    const m = marks(n);
    // ---- the folds. Fractions become angles; once the box lies open on its base, `unfold` lays it flat again.
    const un = S.unfold;
    const H90 = Math.PI / 2;
    hLeft.rotation.z = lerp(S.sides * H90, 0, un);
    hRight.rotation.z = -lerp(S.sides * H90, 0, un);
    hFront.rotation.x = lerp(S.ends * H90, 0, un);
    hBack.rotation.x = -lerp(S.ends * H90, 0, un);
    // Open, the lid swings back until its tuck rests on the table behind the box (lid and tuck, 30 cm, leaning down from a
    // 10 cm wall), so the packs standing behind it are seen over the open box.
    hLid.rotation.x = lerp(-S.lid * H90 + S.open * (Math.PI - Math.asin(B.h / (B.d + B.tuck)) - 0.02), 0, un);
    hTuck.rotation.x = lerp(-S.tuck * H90 * (1 - S.untuck), 0, un);
    // ---- the roll: lifted off the table, over onto its base, set down.
    const lift = S.lift;
    rig.rotation.z = S.flip * Math.PI;
    const arc = Math.sin(Math.PI * S.flip) * 0.12;
    rig.position.y = lerp(-B.h / 2, B.h / 2, S.flip) + lift * (B.h + 0.05) * (1 - S.flip) + arc;
    // A small sway under the pointer while the sheet lies flat.
    const sway = ptr.on && S.lift < 0.05 ? (ptr.x - 0.5) * 0.05 : 0;
    rig.rotation.y = lerp(rig.rotation.y, sway, 0.08);
    // ---- the tissue, once the box is right way up, parting as it opens.
    tissue.visible = S.flip > 0.999 && un < 0.2;
    tissueL.rotation.z = S.tissue * 2.55;
    tissueR.rotation.z = -S.tissue * 2.55;
    // ---- where the standing box meets the table: only once it is down on its base, gone as it falls flat.
    contact.material.opacity = 0.38 * S.ends * (1 - S.lift) * smooth(0.9, 1, S.flip) * (1 - un);
    contact.position.x = rig.position.x;
    // ---- the packs: in the box, then out and turning once to stand behind it, then down flat onto the table.
    let hit = -1;
    if (S.lay > 0.98 && un < 0.5 && ptr.px >= 0 && forced < 0) {
      ndc.set((ptr.px / cw) * 2 - 1, -(ptr.py / ch) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(P.map((p) => p.group), true);
      if (hits.length) { const g = hits[0]!.object.parent; hit = P.findIndex((p) => p.group === g); }
    }
    if (forced >= 0) hit = forced;
    P.forEach((p, i) => {
      const k = S.rise(i);
      const l = clamp((S.lay * 1.35 - (i / Math.max(1, n - 1)) * 0.35), 0, 1);
      const le = smoother(l), ke = smoother(k);
      p.group.visible = S.flip > 0.999 && (k > 0 || S.open > 0.6);
      // In the box: flat, a little rotated. Behind it: standing on the table, facing the viewer, turned a touch towards
      // the middle. On the table: flat, face up. A phone's view is narrow, so the line closes in.
      const ax = p.arc.x * (wide ? 1 : 0.8), ay = p.arc.y + p.h * 0.5, az = p.arc.z;
      // Up out of the box, over the back wall and down onto its foot, with a small settle as it lands.
      const land = Math.max(0, ke - 0.86) / 0.14;
      const hop = Math.sin(Math.PI * Math.min(1, ke / 0.86)) * (B.h + 0.1) + Math.sin(Math.PI * land) * 0.006;
      let x = lerp(p.rest.x, ax, ke), y = lerp(p.rest.y, ay, ke) + hop, z = lerp(p.rest.z, az, ke);
      let rx = lerp(-Math.PI / 2, 0, smoother(clamp(k * 1.6, 0, 1))), ry = p.spin * ke + Math.atan2(ax, 1.6) * -0.5 * ke, rz = lerp(p.restRot, 0, ke);
      if (l > 0) {
        const lift = Math.sin(Math.PI * le) * 0.14;
        x = lerp(x, p.lay.x, le); z = lerp(z, p.lay.z, le);
        y = lerp(y, 0.012, le) + lift + (i === hit ? 0.025 : 0);
        rx = lerp(rx, -Math.PI / 2, le); ry = lerp(ry, Math.round(ry / (Math.PI * 2)) * Math.PI * 2, le); rz = lerp(rz, 0, le);
      }
      p.group.position.set(x, y, z);
      p.group.rotation.set(rx, ry, rz, "YXZ");
    });
    // ---- the camera through its views.
    const V = views();
    const toFold = smooth(m.fold0, m.flip0 + U.flip, u);
    const toOpen = smooth(m.open0, m.open0 + U.open * 0.6, u);
    const toFan = smooth(m.rise0 - 0.1, m.rise0 + U.rise * 3, u);
    const toLay = smooth(m.lay0, m.lay0 + U.lay * 0.8, u);
    const toDive = smooth(m.dive0, m.dive0 + U.dive * 0.9, u);
    let v = mix(V.hero, V.fold, toFold);
    v = mix(v, V.open, toOpen);
    v = mix(v, V.fan, toFan);
    v = mix(v, V.lay, toLay);
    v = mix(v, V.dive, toDive);
    place(v, ptr);
    renderer.render(scene, camera);
    return hit;
  };

  /** Where pack i lies on screen once laid out, for the card's pointer. */
  const screenOf = (i: number) => {
    const p = P[i];
    if (!p) return { x: cw / 2, y: ch / 2 };
    v3.set(p.lay.x, 0.02, p.lay.z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * cw, y: (-v3.y * 0.5 + 0.5) * ch };
  };

  return { draw, resize, ready, screenOf };
}
