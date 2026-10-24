// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Magazine: a lookbook printed as a magazine, whose pages turn as the page scrolls. Every page is drawn into a canvas
// from the garments' photographs and the page's own type (the cover, a photograph page and a details page for each
// garment, the back cover), and every leaf is one mesh bent by its vertex shader: the angle of the paper grows along
// its width while it turns, so the free edge leads and the leaf curls rather than swinging flat like a door. Hovering
// near the outer edge lifts the corner; a click on either page turns forward or back. The card recorder drives it.

import * as THREE from "three";
import { loadImage } from "./img";
import { leafTurn, phonePage, PHONE_SHARE, totalScreens, U_COVER, U_LEAF } from "./magazine-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

type Item = { name: string; meta: string; price: string; front: string; back: string; colour: string };

const PW = 720, PH = 936; // a page, in canvas pixels (the shape of the magazine: 1 to 1.3)

const VERT = /* glsl */ `
uniform float uP, uW, uZ;
varying vec2 vUv;
varying float vShade;
varying float vS;
void main() {
  vUv = uv;
  float s = uv.x * uW;
  float bend = 0.62 * 3.14159 * sin(uP * 3.14159);
  float a = uP * 3.14159 - bend * 0.5;
  float k = bend / uW;
  float ang = a + k * s;
  float x, z;
  if (abs(k) < 1e-4) { x = s * cos(a); z = s * sin(a); }
  else { x = (sin(a + k * s) - sin(a)) / k; z = (cos(a) - cos(a + k * s)) / k; }
  vec3 p = vec3(x, position.y, z + uZ);
  vec3 n = vec3(-sin(ang), 0.0, cos(ang));
  vShade = 0.72 + 0.28 * max(dot(n, normalize(vec3(-0.35, 0.3, 1.0))), 0.0);
  vS = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uFront, uBack;
varying vec2 vUv;
varying float vShade;
varying float vS;
void main() {
  vec4 c = gl_FrontFacing ? texture2D(uFront, vUv) : texture2D(uBack, vec2(1.0 - vUv.x, vUv.y));
  // The gutter: paper darkens as it runs into the spine.
  float gutter = 1.0 - 0.28 * exp(-vS / 0.05);
  gl_FragColor = vec4(c.rgb * vShade * gutter, 1.0);
  #include <colorspace_fragment>
}`;

export function initMagazine() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-magazine]")].entries()) setup(root, n === 0);
}

/** Lines of text that fit a width, broken at spaces. */
function wrap(x: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}


function mix(a: string, b: string, t: number) {
  const p = (h: string) => { const v = parseInt(h.replace("#", ""), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i]!, t))).join(",")})`;
}
const lum = (h: string) => { const v = parseInt(h.replace("#", ""), 16); return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".mg-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".mg-gl")!;
  const intro = root.querySelector<HTMLElement>(".mg-intro");
  const caps = [...root.querySelectorAll<HTMLElement>(".mg-cap")];
  const finale = root.querySelector<HTMLElement>(".mg-finale");
  const hint = root.querySelector<HTMLElement>(".mg-hint");
  const hits = { prev: root.querySelector<HTMLButtonElement>(".mg-prev"), next: root.querySelector<HTMLButtonElement>(".mg-next") };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const items: Item[] = [...root.querySelectorAll<HTMLElement>(".mg-item")].map((el) => ({
    name: el.dataset.name ?? "", meta: el.dataset.meta ?? "", price: el.dataset.price ?? "", front: el.dataset.front ?? "", back: el.dataset.back ?? "", colour: el.dataset.colour ?? "#cccccc",
  }));
  const n = items.length;
  const leaves = n + 1;
  const total = totalScreens(n);
  root.style.setProperty("--mg-screens", String(total + 1));
  const brand = root.dataset.brand ?? "";
  const issue = root.dataset.issue ?? "";
  const title = root.dataset.title ?? "";
  const closing = root.dataset.closing ?? "";
  const css = getComputedStyle(document.documentElement);
  const v = (k: string, fb: string) => css.getPropertyValue(k).trim() || fb;
  const paper = v("--c-bg", "#f3efe7"), ink = v("--c-text", "#1b1a18"), accent = v("--c-accent", "#a3492f");
  const fDisplay = v("--f-display", "serif"), fBody = v("--f-body", "sans-serif"), fMono = v("--f-mono", "monospace");

  // ------------------------------------------------------------------------------------------------ the pages
  const page = () => { const c = document.createElement("canvas"); c.width = PW; c.height = PH; return c; };
  const folio = (x: CanvasRenderingContext2D, n: number, right: boolean, col = ink) => {
    x.fillStyle = col;
    x.globalAlpha = 0.6;
    x.font = `500 15px ${fMono}`;
    x.textAlign = right ? "right" : "left";
    x.fillText(`${String(n).padStart(2, "0")}  ${brand.toUpperCase()}  ${issue.toUpperCase()}`, right ? PW - 48 : 48, PH - 40);
    x.globalAlpha = 1;
    x.textAlign = "left";
  };
  const drawCover = (img: HTMLImageElement | null) => {
    const c = page(), x = c.getContext("2d")!;
    // The cover is printed in the page's accent, with the first garment hung under the masthead.
    x.fillStyle = accent;
    x.fillRect(0, 0, PW, PH);
    if (img) { const h = PH * 0.7, w = h * (img.width / img.height); x.drawImage(img, (PW - w) / 2, PH * 0.29, w, h); }
    x.fillStyle = paper;
    x.font = `${v("--f-display-weight", "500")} 176px ${fDisplay}`;
    x.textAlign = "center";
    x.fillText(brand, PW / 2, 196);
    x.font = `500 17px ${fMono}`;
    x.fillText(`${issue.toUpperCase()}   ·   ${title.toUpperCase()}`, PW / 2, 248);
    x.textAlign = "left";
    return c;
  };
  const drawPhoto = (it: Item, img: HTMLImageElement | null, no: number) => {
    const c = page(), x = c.getContext("2d")!;
    const dark = lum(it.colour) < 0.45;
    x.fillStyle = mix(it.colour, dark ? "#ffffff" : paper, dark ? 0.72 : 0.45);
    x.fillRect(0, 0, PW, PH);
    if (img) { const h = PH * 0.9, w = h * (img.width / img.height); x.drawImage(img, (PW - w) / 2, PH * 0.02, w, h); }
    folio(x, no, false);
    return c;
  };
  const drawDetails = (it: Item, back: HTMLImageElement | null, no: number) => {
    const c = page(), x = c.getContext("2d")!;
    x.fillStyle = paper;
    x.fillRect(0, 0, PW, PH);
    x.fillStyle = accent;
    x.font = `500 16px ${fMono}`;
    x.fillText(it.meta.toUpperCase(), 64, 110);
    x.fillStyle = ink;
    x.font = `${v("--f-display-weight", "500")} 92px ${fDisplay}`;
    let y = 210;
    for (const line of wrap(x, it.name, PW - 128)) { x.fillText(line, 64, y); y += 92; }
    x.font = `400 30px ${fBody}`;
    x.fillText(it.price, 64, y + 6);
    // The back of the garment, with its colour as a swatch beside it.
    if (back) { const h = PH * 0.5, w = h * (back.width / back.height); x.drawImage(back, PW - w - 40, PH - h - 90, w, h); }
    x.fillStyle = it.colour;
    x.fillRect(64, PH - 250, 120, 120);
    x.strokeStyle = "rgba(0,0,0,0.12)";
    x.strokeRect(64.5, PH - 249.5, 119, 119);
    x.fillStyle = ink;
    x.globalAlpha = 0.7;
    x.font = `500 14px ${fMono}`;
    x.fillText(it.colour.toUpperCase(), 64, PH - 108);
    x.fillText("BACK", PW - 110, PH - 70);
    x.globalAlpha = 1;
    folio(x, no, true);
    return c;
  };
  const drawBackCover = () => {
    const c = page(), x = c.getContext("2d")!;
    x.fillStyle = ink;
    x.fillRect(0, 0, PW, PH);
    x.fillStyle = paper;
    x.textAlign = "center";
    x.font = `${v("--f-display-weight", "500")} 120px ${fDisplay}`;
    x.fillText(brand, PW / 2, PH / 2);
    x.font = `400 24px ${fBody}`;
    x.globalAlpha = 0.75;
    for (const [k, line] of wrap(x, closing, PW - 160).entries()) x.fillText(line, PW / 2, PH / 2 + 60 + k * 34);
    x.globalAlpha = 1;
    x.textAlign = "left";
    return c;
  };

  let three: ReturnType<typeof createBook> | null = null;
  try { three = createBook(canvas, leaves); } catch (e) { console.warn("Magazine: no WebGL", e); }
  if (!three) root.classList.add("is-flat");

  const pages = (async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    const fronts = await Promise.all(items.map((it) => loadImage(it.front)));
    const backs = await Promise.all(items.map((it) => loadImage(it.back)));
    // Leaf j: its front is the cover or garment j-1's details; its back is garment j's photograph, or the back cover.
    const sides: { front: HTMLCanvasElement; back: HTMLCanvasElement }[] = [];
    for (let j = 0; j < leaves; j++) {
      const front = j === 0 ? drawCover(fronts[0] ?? null) : drawDetails(items[j - 1]!, backs[j - 1] ?? null, j * 2 + 1);
      const back = j < n ? drawPhoto(items[j]!, fronts[j] ?? null, j * 2 + 2) : drawBackCover();
      sides.push({ front, back });
    }
    three?.setPages(sides);
  })();

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: -1, y: -1, k: 0 };
  let uNow = 0, raf = 0, last = 0, demoing = false, corner = 0;

  const apply = (u: number, lift: number) => {
    const wide = pin.clientWidth / Math.max(1, pin.clientHeight) > 1.05;
    const turns = Array.from({ length: leaves }, (_, j) => leafTurn(u, j, wide ? 0.82 : PHONE_SHARE));
    const next = turns.findIndex((p) => p < 0.5);
    // The corner of the next leaf lifts while the pointer is near the outer edge.
    if (next >= 0 && lift > 0) turns[next] = Math.max(turns[next]!, lift * 0.09);
    const open = smooth(0, 1, turns[0]!) - smooth(0, 1, turns[leaves - 1]!);
    three?.draw(turns, open, turns[leaves - 1]!, phonePage(u, n));
    const introK = 1 - smooth(0.25, 0.7, u);
    for (const el of [intro, hint]) if (el) { el.style.opacity = (introK * (el === hint ? 0.6 : 1)).toFixed(3); el.style.visibility = introK > 0.001 ? "visible" : "hidden"; }
    caps.forEach((el, j) => {
      // Garment j's caption while its spread is open: after leaf j has turned, before leaf j+1 does.
      const k = smooth(0.8, 1, turns[j]!) * (1 - smooth(0.1, 0.35, turns[j + 1] ?? 0));
      el.style.opacity = k.toFixed(3);
      el.style.visibility = k > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - k) * 14).toFixed(1)}px)`;
    });
    const fin = smooth(0.85, 1, turns[leaves - 1]!);
    if (finale) { finale.style.opacity = fin.toFixed(3); finale.style.pointerEvents = fin > 0.8 ? "auto" : "none"; finale.style.visibility = fin > 0.001 ? "visible" : "hidden"; }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const still = reduced.matches;
    uNow += (progress() - uNow) * (still ? 1 : 1 - Math.exp(-dt / 0.14));
    const near = three && ptr.x >= 0 ? three.nearEdge(ptr.x, ptr.y) : 0;
    corner += ((still ? 0 : near) - corner) * (1 - Math.exp(-dt / 0.18));
    apply(uNow, corner);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  addEventListener("pointermove", (e) => { const r = pin.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.x = -1; });
  // Turning by hand: to the next leaf, or back to the last one.
  const scrollToU = (u: number) => {
    const top = root.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (u / total) * (root.offsetHeight - innerHeight), behavior: reduced.matches ? "auto" : "smooth" });
  };
  const leafNow = () => Math.round((uNow - U_COVER) / U_LEAF);
  hits.next?.addEventListener("click", () => scrollToU(clamp(U_COVER + (leafNow() + 1) * U_LEAF, 0, total)));
  hits.prev?.addEventListener("click", () => scrollToU(clamp(U_COVER + (leafNow() - 1) * U_LEAF, 0, total)));
  addEventListener("resize", () => { three?.resize(); apply(uNow, corner); });
  uNow = progress();
  apply(uNow, 0);
  pages.then(() => { apply(uNow, corner); document.body.classList.add("canvas-ready"); });

  // ------------------------------------------------------------------------------------------------ card recording
  // The pointer lifts the cover's corner, and the magazine is leafed through to the back cover.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const keys: [number, number][] = [[0, 0], [2.2, 0]];
    let tt = 2.2;
    for (let j = 0; j < leaves; j++) { tt += 1.15; keys.push([tt, U_COVER + (j + 1) * U_LEAF - 0.02]); tt += 0.55; keys.push([tt, U_COVER + (j + 1) * U_LEAF - 0.02]); }
    keys.push([tt + 1.2, total]);
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
      const edge = three?.edgePoint() ?? { x: W * 0.75, y: H * 0.8 };
      const k = smoother((t - 0.3) / 1.4);
      const x = lerp(W * 0.95, edge.x, k), y = lerp(H * 0.95, edge.y, k);
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      apply(uAt(t), t < 2.4 ? smooth(1.0, 1.7, t) : 0);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

function createBook(canvas: HTMLCanvasElement, leaves: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  const W = 1, H = PH / PW;
  const blank = new THREE.DataTexture(new Uint8Array([240, 236, 228, 255]), 1, 1);
  blank.needsUpdate = true;
  const mats = Array.from({ length: leaves }, () => new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uW: { value: W }, uZ: { value: 0 }, uFront: { value: blank as THREE.Texture }, uBack: { value: blank as THREE.Texture } },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  }));
  const geo = new THREE.PlaneGeometry(W, H, 48, 1);
  geo.translate(W / 2, 0, 0);
  const book = new THREE.Group();
  mats.forEach((m) => { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; book.add(mesh); });
  // The page block's shadow on the table: a soft rectangle, drawn once.
  const sc = document.createElement("canvas");
  sc.width = sc.height = 256;
  const sx = sc.getContext("2d")!;
  sx.filter = "blur(10px)";
  sx.fillStyle = "#000";
  sx.fillRect(22, 22, 212, 212);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.42, H * 1.21), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), color: 0x2a2116, transparent: true, opacity: 0.3, depthWrite: false }));
  book.add(shadow);
  scene.add(book);

  let cw = 1, ch = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  };
  resize();
  let offset = 0.5, dist = 4;

  const fit = (open: number, end: number, page: number) => {
    const wide = cw / ch > 1.05;
    // Closed, the book is one page wide and sits centred on it; open, a spread is two pages wide.
    const span = wide ? lerp(W * 1.08, W * 2.12, Math.min(open + end * 0, 1)) : W * 1.12;
    const vfov = (camera.fov * Math.PI) / 180;
    const byW = span / (2 * Math.tan(vfov / 2) * camera.aspect);
    const byH = (H * 1.12) / (2 * Math.tan(vfov / 2));
    dist = Math.max(byW, byH) / (wide ? 0.8 : 0.94);
    // Centre on the cover, then the spread, then the back cover; a phone stays on the right-hand page.
    offset = wide ? lerp(lerp(W * 0.5, 0, open), -W * 0.5, end) : W * page;
  };

  const draw = (turns: number[], open: number, end: number, page: number) => {
    fit(clamp(open + end, 0, 1) * (1 - end), end, page);
    camera.position.set(offset, -H * 0.08, dist);
    camera.lookAt(offset, 0, 0);
    book.rotation.x = -0.08;
    const eps = 0.004;
    turns.forEach((p, j) => {
      const m = mats[j]!;
      m.uniforms.uP.value = p;
      m.uniforms.uZ.value = lerp((leaves - j) * eps, j * eps, smoother(p));
    });
    shadow.position.set(lerp(W * 0.5, 0, Math.min(1, open)) - W * end + 0.025, -0.03, -0.02);
    shadow.scale.x = lerp(0.5, 1, Math.min(1, open));
    renderer.render(scene, camera);
  };

  const v = new THREE.Vector3();
  const toScreen = (x: number, y: number) => { v.set(x, y, 0).applyMatrix4(book.matrixWorld).project(camera); return { x: (v.x * 0.5 + 0.5) * cw, y: (-v.y * 0.5 + 0.5) * ch }; };
  return {
    draw,
    resize,
    setPages(sides: { front: HTMLCanvasElement; back: HTMLCanvasElement }[]) {
      sides.forEach((s, j) => {
        const f = new THREE.CanvasTexture(s.front), b = new THREE.CanvasTexture(s.back);
        for (const t of [f, b]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
        mats[j]!.uniforms.uFront.value = f;
        mats[j]!.uniforms.uBack.value = b;
      });
    },
    /** How close a point (px) is to the right-hand page's outer edge, 0 to 1. */
    nearEdge(px: number, py: number) {
      const a = toScreen(W, H / 2), top = toScreen(W, H / 2), bottom = toScreen(W, -H / 2);
      const d = Math.abs(px - a.x);
      const within = py > top.y - 20 && py < bottom.y + 20 ? 1 : 0;
      return within * (1 - smooth(20, 140, d));
    },
    edgePoint() { const p = toScreen(W * 0.94, -H * 0.3); return p; },
  };
}
