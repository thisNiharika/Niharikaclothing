// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Canopy: a round hedge of real leaves (the library's cut-outs) that parts from the middle as the page scrolls, the
// camera going through it into a clearing where the product stands on a stone. Its ingredients come out of the
// foliage and circle it while it turns to its back label; the leaves turn from summer to autumn and fall while the
// rest of the range rises out of the ground; and the camera looks down on the fallen leaves lying in a ring round the
// call to action. One three.js scene for the whole section; the timing and the foliage live in canopy-plan.ts.
//
// Every leaf is one instance of a bent plane. Its rest place, picture, size and seed are attributes; the parting, the
// rustle under the pointer, the change of season and the fall are all worked out in its vertex shader from a handful
// of uniforms, so twelve hundred leaves cost one draw. Leaves away from the focus are drawn from smaller mip levels
// of the atlas, a cheap depth of field, and leaves deep in the hedge are darker, so it reads as dense.

import * as THREE from "three";
import { loadImage } from "./img";
import { inflate } from "./solid";
import { HEDGE, foliage, marks, rangeAt, rng, stages, totalScreens, U } from "./canopy-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const cssv = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

type Product = { name: string; line: string; front: string; back: string; h: number };

export function initCanopy() {
  document.querySelectorAll<HTMLElement>("[data-canopy]").forEach((el) => setup(el, el.classList.contains("hero")));
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, x: c.getContext("2d")! };
}

/** The clearing's floor: moss, darker under the bank of foliage round it, fading out beyond the bank. */
function drawMoss(): HTMLCanvasElement {
  const { c, x } = canvas(512, 512);
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, "rgba(104,116,70,0.9)"); g.addColorStop(0.3, "rgba(84,98,56,0.95)"); g.addColorStop(0.55, "rgba(52,66,36,1)"); g.addColorStop(0.78, "rgba(52,66,36,0.7)"); g.addColorStop(1, "rgba(52,66,36,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  // A little dappling, so it reads as ground rather than as a gradient.
  const r = rng(31);
  for (let i = 0; i < 900; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 200;
    x.fillStyle = `rgba(${r() < 0.5 ? "30,40,20" : "150,160,110"},${0.05 + r() * 0.08})`;
    x.beginPath(); x.arc(256 + Math.cos(a) * d, 256 + Math.sin(a) * d, 2 + r() * 7, 0, Math.PI * 2); x.fill();
  }
  return c;
}

/** A soft dark pool for where a product stands on the ground. */
function drawContact(): HTMLCanvasElement {
  const { c, x } = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(0.5, "rgba(0,0,0,0.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return c;
}

/** A shaft of light through the canopy: bright at the top, gone by the ground, soft at its sides. */
function drawShaft(): HTMLCanvasElement {
  const { c, x } = canvas(64, 256);
  const v = x.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, "rgba(255,244,214,0.75)"); v.addColorStop(0.7, "rgba(255,240,205,0.18)"); v.addColorStop(1, "rgba(255,240,205,0)");
  x.fillStyle = v;
  x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = "destination-in";
  const h = x.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, "rgba(0,0,0,0)"); h.addColorStop(0.5, "rgba(0,0,0,1)"); h.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = h;
  x.fillRect(0, 0, 64, 256);
  return c;
}

// ---------------------------------------------------------------------------------------------- the page

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".cn-pin")!;
  const cv = root.querySelector<HTMLCanvasElement>(".cn-gl")!;
  const intro = root.querySelector<HTMLElement>(".cn-intro");
  const lines = [...root.querySelectorAll<HTMLElement>(".cn-line")];
  const rangeItems = [...root.querySelectorAll<HTMLElement>(".cn-range li")];
  const finale = root.querySelector<HTMLElement>(".cn-finale");
  const scrim = root.querySelector<HTMLElement>(".cn-scrim");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const leaves = [...root.querySelectorAll<HTMLElement>(".cn-leaf")].map((el) => ({ src: el.dataset.src ?? "", autumn: el.dataset.season === "autumn" }));
  const products: Product[] = [...root.querySelectorAll<HTMLElement>(".cn-item")].map((el) => ({
    name: el.dataset.name ?? "", line: el.dataset.line ?? "", front: el.dataset.front ?? "", back: el.dataset.back ?? "", h: Number(el.dataset.h) || 12,
  }));
  const pieces = [...root.querySelectorAll<HTMLElement>(".cn-piece")].map((el) => ({ src: el.dataset.src ?? "", soft: el.dataset.soft ?? "" }));
  const others = Math.max(0, products.length - 1);
  const total = totalScreens();
  const M = marks();
  root.style.setProperty("--cn-screens", String(total + 1));

  let scene: ReturnType<typeof createScene> | null = null;
  try { scene = createScene(cv, leaves, products, pieces, root.dataset.stone ?? ""); } catch (e) { console.warn("Canopy: no WebGL", e); }
  if (!scene) { root.classList.add("is-flat"); document.body.classList.add("canvas-ready"); return; }

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, y: 0.5, on: false };
  let uNow = 0, uLast = 0, raf = 0, last = 0, t = 0, demoing = false;

  const apply = (u: number, time: number, vel: number) => {
    const S = stages(u, others);
    scene!.draw(u, S, time, ptr, vel);
    const introK = 1 - smooth(M.through0 * 0.4, M.through0 + U.through * 0.18, u);
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.visibility = introK > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateY(${((1 - introK) * -24).toFixed(1)}px)`; }
    const spans: [number, number][] = [[M.clearing0 - 0.1, M.inside0 + 0.1], [M.inside0 + 0.2, M.range0 + 0.05], [M.range0 + 0.2, M.settle0 + 0.15]];
    let words = 0;
    lines.forEach((el, j) => {
      const [a, b] = spans[j] ?? [9e9, 9e9];
      const k = smooth(a, a + 0.25, u) * (1 - smooth(b - 0.25, b, u));
      words = Math.max(words, k);
      el.style.opacity = k.toFixed(3);
      el.style.visibility = k > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - k) * 18).toFixed(1)}px)`;
    });
    rangeItems.forEach((li, i) => li.classList.toggle("is-up", S.rise(i) > 0.6));
    // A wash of the page's colour behind the copy while an act's words are up, so they read over the foliage.
    if (scrim) scrim.style.opacity = words.toFixed(3);
    const fk = smooth(M.settle0 + U.settle * 0.45, M.end - 0.2, u);
    if (finale) { finale.style.opacity = fk.toFixed(3); finale.style.visibility = fk > 0.001 ? "visible" : "hidden"; finale.style.pointerEvents = fk > 0.8 ? "auto" : "none"; }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    uNow += (progress() - uNow) * (reduced.matches ? 1 : 1 - Math.exp(-dt / 0.14));
    const vel = Math.min(2.5, Math.abs(uNow - uLast) / dt);
    uLast = uNow;
    if (!reduced.matches) t += dt;
    apply(uNow, t, vel);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  pin.addEventListener("pointermove", (e) => {
    const r = pin.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / Math.max(1, r.width); ptr.y = (e.clientY - r.top) / Math.max(1, r.height);
    ptr.on = e.pointerType === "mouse";
  }, { passive: true });
  pin.addEventListener("pointerleave", () => { ptr.on = false; });
  addEventListener("resize", () => { scene!.resize(); apply(uNow, t, 0); });
  uNow = uLast = progress();
  scene.ready.then(() => { apply(uNow, t, 0); document.body.classList.add("canvas-ready"); });

  // ---------------------------------------------------------------------------------------------- card recording
  // The pointer rustles the hedge, then the whole film plays: through the hedge, the product, its ingredients, the
  // leaves turning and falling as the range comes up, and the view from above.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const keys: [number, number][] = [[0, 0], [1.8, 0], [6.4, M.clearing0 + 0.25], [7.2, M.clearing0 + 0.4], [9.2, M.inside0 + U.inside * 0.7], [12.6, M.settle0 - 0.1], [14.8, total - U.hold * 0.5], [16, total - U.hold * 0.5]];
    const uAt = (time: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [ta, ua] = keys[k - 1]!, [tb, ub] = keys[k]!;
        if (time <= tb) return lerp(ua, ub, smoother((time - ta) / (tb - ta)));
      }
      return keys.at(-1)![1];
    };
    let cursor: SVGSVGElement | null = null;
    let uPrev = 0;
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
      // Across the hedge's face at first, so it rustles; then off to the corner while the film plays.
      const k = smoother(time / 1.8);
      const sweep = time < 2 ? k : 1;
      const x = time < 2 ? lerp(W * 0.86, W * 0.56, sweep) : W * 0.95;
      const y = time < 2 ? lerp(H * 0.7, H * 0.42, sweep) : H * 0.92;
      ptr.x = x / W; ptr.y = y / H; ptr.on = time < 2.2;
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const vel = Math.min(2.5, Math.abs(u - uPrev) * 30);
      uPrev = u;
      apply(u, time, vel);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

// ---------------------------------------------------------------------------------------------- the scene

type Stages = ReturnType<typeof stages>;
type Ptr = { x: number; y: number; on: boolean };

const LEAF_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec3 iRot; attribute float iSize; attribute vec2 iCell; attribute float iSeed; attribute float iWall; attribute vec2 iGround;
uniform float uTime; uniform float uCamZ; uniform float uPart; uniform float uSeason; uniform float uFall; uniform float uPtrOn; uniform vec3 uPtr;
uniform float uR; uniform float uDepth; uniform float uGroundY; uniform vec3 uC; uniform float uWallR;
varying vec2 vUv; varying vec3 vN; varying vec2 vCell; varying float vSeason; varying float vDeep; varying float vDist;
mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 ry(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rz(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
void main(){
  vUv = uv;
  // The leaf's own shape: folded along its midrib and bowed along its length, each a little differently.
  float fold = 0.16 + 0.22 * fract(iSeed * 7.31);
  float bow = 0.08 + 0.3 * fract(iSeed * 13.7);
  vec3 p = position;
  p.z = -fold * abs(p.x) + bow * p.y * p.y;
  vec3 n = normalize(vec3(fold * sign(p.x), -2.0 * bow * p.y, 1.0));
  p *= iSize;

  float fl = sin(uTime * 1.6 + iSeed * 40.0) * 0.07 + sin(uTime * 0.7 + iSeed * 17.0) * 0.05;
  vec3 pos = iPos;
  float k = 0.0;
  float deep = 0.0;
  if (iWall < 0.5) {
    // The hedge parts from the middle (an iris whose radius grows with uPart, the front first), and wherever the
    // camera comes close every leaf is pushed out past the camera's way through, tumbling as it goes.
    float rad = length(iPos.xy);
    float an = iSeed * 6.2832;
    vec2 dir = rad > 0.001 ? iPos.xy / rad : vec2(cos(an), sin(an));
    float depthN = clamp((0.55 - iPos.z) / (uDepth + 0.55), 0.0, 1.0);
    float hole = uPart * uR * (0.62 + 0.3 * (1.0 - depthN));
    float d = uCamZ - iPos.z;
    float near = 1.0 - smoothstep(0.25, 3.2, d);
    float tunnel = near * uR * (0.85 + 0.45 * iSeed);
    float target = max(hole, tunnel);
    float push = max(0.0, target - rad);
    pos.xy = dir * (rad + push * (1.0 + 0.55 * iSeed));
    pos.z += push * 0.35 * (iSeed - 0.25);
    k = clamp(push / 0.7, 0.0, 1.0);
    // Under the pointer the face of the hedge rustles aside.
    vec2 off = pos.xy - uPtr.xy;
    float pd = length(off);
    float rn = rad / uR;
    float faceZ = 0.55 * (1.0 - rn * rn);
    float rust = uPtrOn * (1.0 - smoothstep(0.0, 0.6, pd)) * (1.0 - smoothstep(0.2, 1.2, faceZ - iPos.z));
    pos.xy += (pd > 0.001 ? off / pd : dir) * rust * 0.22;
    k = max(k, rust * 0.35);
    deep = depthN * (1.0 - k);
  } else {
    // The clearing's bank darkens towards its back and its foot, as a thick hedge does.
    float back = clamp((length(iPos.xz - uC.xz) - uWallR) / 1.6, 0.0, 1.0);
    float low = 1.0 - clamp((iPos.y - uC.y) / 2.2, 0.0, 1.0);
    deep = clamp(back * 0.8 + low * 0.35, 0.0, 0.85);
  }
  mat3 R = rz(iRot.z + fl) * ry(iRot.y + fl * 0.6) * rx(iRot.x);
  // Tumbling as it is pushed aside: a turn about its own random axis.
  R = rx(k * (1.2 + 2.4 * iSeed)) * ry(k * (2.0 - 3.0 * fract(iSeed * 3.1))) * R;

  // The fall: the clearing's leaves let go one after another, swing down and lie flat in a ring on the ground.
  float f = iWall > 0.5 ? clamp(uFall * 1.7 - iSeed * 0.7, 0.0, 1.0) : 0.0;
  float fe = f * f * (3.0 - 2.0 * f);
  if (f > 0.0) {
    vec3 g = vec3(iGround.x, uGroundY + 0.012 + iSeed * 0.01, iGround.y);
    vec3 path = mix(pos, g, fe);
    path.x += sin(f * 9.0 + iSeed * 20.0) * 0.28 * (1.0 - fe) * f;
    path.z += cos(f * 7.0 + iSeed * 11.0) * 0.18 * (1.0 - fe) * f;
    pos = path;
    mat3 lying = rx(-1.5708) * rz(iRot.z);
    mat3 spin = ry(f * 6.0 * (iSeed - 0.5)) * rx(f * 3.0 * (0.5 - iSeed));
    mat3 m = spin * R;
    vec3 c0 = normalize(mix(m[0], lying[0], fe)), c1 = normalize(mix(m[1], lying[1], fe));
    vec3 c2 = normalize(cross(c0, c1));
    c1 = cross(c2, c0);
    R = mat3(c0, c1, c2);
  }

  deep *= 1.0 - fe;
  vSeason = clamp(uSeason * 1.6 - iSeed * 0.6, 0.0, 1.0);
  vCell = iCell;
  vDeep = deep;
  vN = normalize(normalMatrix * (R * n));
  vec4 mv = modelViewMatrix * vec4(pos + R * p, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const LEAF_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uCells; uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
uniform float uFocus; uniform float uVel;
varying vec2 vUv; varying vec3 vN; varying vec2 vCell; varying float vSeason; varying float vDeep; varying float vDist;
vec2 cellUv(float c, vec2 uv){
  float cx = mod(c, uCells), cy = floor(c / uCells);
  return vec2((cx + uv.x) / uCells, 1.0 - (cy + 1.0 - uv.y) / uCells);
}
void main(){
  float blur = clamp(abs(vDist - uFocus) * 0.3 + uVel * 0.8 - 0.5, 0.0, 2.0);
  vec4 a = texture2D(uMap, cellUv(vCell.x, vUv), blur);
  vec4 b = texture2D(uMap, cellUv(vCell.y, vUv), blur);
  vec4 c = mix(a, b, vSeason);
  // A blurred edge spreads its alpha thin, so the cut is lowered as the blur grows; otherwise a soft leaf breaks up.
  if (c.a < mix(0.45, 0.2, blur / 2.0)) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float diff = max(dot(n, uSun), 0.0);
  float through = max(dot(-n, uSun), 0.0);
  // Lit from the front, and glowing where the sun comes through from behind, as a leaf does.
  vec3 col = c.rgb * (0.5 + 0.62 * diff) + c.rgb * through * vec3(0.55, 0.5, 0.18);
  col *= mix(1.0, 0.42, vDeep);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist));
  gl_FragColor = vec4(col, 1.0);
}`;

// Products and ingredients: shaded relative to the light already in their photographs (as the storm's packs are),
// with a highlight that slides as they turn; a piece away from the focus is drawn from its pre-blurred copy.
const SOLID_VERT = /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDist;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`;
const SOLID_FRAG = /* glsl */ `uniform sampler2D map; uniform sampler2D soft; uniform float uSoftOn; uniform float uFocus; uniform float uAlpha; uniform float uSpec;
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDist;
  void main(){
    vec4 c = texture2D(map, vUv);
    if (uSoftOn > 0.5) c = mix(c, texture2D(soft, (vUv - 0.5) / 1.3 + 0.5), smoothstep(0.35, 1.4, abs(vDist - uFocus)));
    if (c.a * uAlpha < 0.5) discard;
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 l = normalize(vec3(-0.45, 0.6, 0.75));
    float shade = clamp((0.35 + 0.65 * max(dot(n, l), 0.0)) / 0.8375, 0.3, 1.14);
    float sp = pow(max(dot(n, normalize(l + normalize(vV))), 0.0), 36.0) * uSpec;
    vec3 col = mix(c.rgb * shade + sp, uFog, smoothstep(uFogNear, uFogFar, vDist));
    gl_FragColor = vec4(col, 1.0);
  }`;

function createScene(cv: HTMLCanvasElement, leafPics: { src: string; autumn: boolean }[], products: Product[], pieces: { src: string; soft: string }[], stoneSrc: string) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const bgHex = cssv("--c-bg", "#f4f1ec");
  const bg = new THREE.Color(bgHex);
  scene.background = bg;
  const fogRGB = new THREE.Color(); bg.getRGB(fogRGB, THREE.SRGBColorSpace);
  const fogV = new THREE.Vector3(fogRGB.r, fogRGB.g, fogRGB.b);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  const C = HEDGE.clearing;

  scene.add(new THREE.HemisphereLight(0xfff6e4, 0x4c5a35, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
  sun.position.set(1.5, 4, -9);
  scene.add(sun);

  const texOf = (c: HTMLCanvasElement | HTMLImageElement, raw = false) => {
    const t = c instanceof HTMLCanvasElement ? new THREE.CanvasTexture(c) : new THREE.Texture(c);
    t.colorSpace = raw ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.needsUpdate = true;
    return t;
  };

  // ---------------------------------------------------------------- the ground, the stone and the light
  // The ground is the page's own colour, so the hedge stands on the page; the clearing's moss comes up only once the
  // camera is through, reaching out under the bank of foliage so the bank stands on it.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: bg }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(C.x, C.y - 0.002, C.z + 4);
  scene.add(ground);
  const moss = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: texOf(drawMoss()), transparent: true, depthWrite: false, opacity: 0 }));
  moss.rotation.x = -Math.PI / 2;
  moss.position.set(C.x, C.y, C.z);
  scene.add(moss);
  const stoneMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(cssv("--c-surface", "#e7e0d4")) });
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.3, 48, 1), stoneMat);
  stone.position.set(C.x, C.y + 0.15, C.z);
  scene.add(stone);
  // A fill from the viewer's side, so the stone's face is not lost to the sun behind it.
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.9);
  fill.position.set(-1, 2, 6);
  scene.add(fill);
  const contactTex = texOf(drawContact());
  const contact = (w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.7 }));
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
  };
  const stoneShade = contact(0.95, 0.95);
  stoneShade.position.set(C.x, C.y + 0.004, C.z);
  // Shafts of light falling into the clearing from the canopy above.
  const shaftTex = texOf(drawShaft());
  const shafts: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7 + i * 0.12, 5), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    m.position.set(C.x - 1.4 + i * 0.7, C.y + 2.3, C.z - 0.6 - (i % 2) * 0.5);
    m.rotation.z = -0.32;
    scene.add(m);
    shafts.push(m);
  }

  // ---------------------------------------------------------------- the leaves
  const order = [...leafPics.filter((l) => !l.autumn), ...leafPics.filter((l) => l.autumn)];
  const summerN = Math.max(1, order.filter((l) => !l.autumn).length);
  const autumnN = Math.max(1, order.filter((l) => l.autumn).length);
  const CELLS = 4;
  const atlasC = canvas(2048, 2048);
  const atlas = texOf(atlasC.c, true);
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  const narrow = () => (cv.getBoundingClientRect().width || innerWidth) < 760;
  const leaves = foliage(narrow() ? 760 : 1050, narrow() ? 800 : 1250, summerN, autumnN);
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1, 6, 6);
  geo.index = base.index;
  geo.setAttribute("position", base.getAttribute("position"));
  geo.setAttribute("uv", base.getAttribute("uv"));
  const n = leaves.length;
  const at = (k: number) => new Float32Array(n * k);
  const iPos = at(3), iRot = at(3), iSize = at(1), iCell = at(2), iSeed = at(1), iWall = at(1), iGround = at(2);
  leaves.forEach((l, i) => {
    iPos.set([l.x, l.y, l.z], i * 3); iRot.set([l.rx, l.ry, l.rz], i * 3); iSize[i] = l.size;
    iCell.set([Math.min(l.summer, order.length - 1), Math.min(l.autumn, order.length - 1)], i * 2);
    iSeed[i] = l.seed; iWall[i] = l.wall ? 1 : 0; iGround.set([l.gx, l.gz], i * 2);
  });
  const attr = (a: Float32Array, k: number) => new THREE.InstancedBufferAttribute(a, k);
  geo.setAttribute("iPos", attr(iPos, 3)); geo.setAttribute("iRot", attr(iRot, 3)); geo.setAttribute("iSize", attr(iSize, 1));
  geo.setAttribute("iCell", attr(iCell, 2)); geo.setAttribute("iSeed", attr(iSeed, 1)); geo.setAttribute("iWall", attr(iWall, 1)); geo.setAttribute("iGround", attr(iGround, 2));
  geo.instanceCount = n;
  const sunDir = new THREE.Vector3(0.35, 0.55, -0.75).normalize();
  const leafMat = new THREE.ShaderMaterial({
    vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: atlas }, uCells: { value: CELLS }, uTime: { value: 0 }, uCamZ: { value: 10 }, uPart: { value: 0 }, uSeason: { value: 0 }, uFall: { value: 0 },
      uPtr: { value: new THREE.Vector3(99, 99, 0) }, uPtrOn: { value: 0 }, uC: { value: new THREE.Vector3(C.x, C.y, C.z) }, uWallR: { value: HEDGE.wall }, uR: { value: HEDGE.R }, uDepth: { value: HEDGE.DEPTH }, uGroundY: { value: C.y },
      uSun: { value: sunDir }, uFog: { value: fogV }, uFogNear: { value: 9 }, uFogFar: { value: 16 }, uFocus: { value: 5 }, uVel: { value: 0 },
    },
  });
  const foliageMesh = new THREE.Mesh(geo, leafMat);
  foliageMesh.frustumCulled = false;
  scene.add(foliageMesh);

  // ---------------------------------------------------------------- the products and the ingredients
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const solidMat = (spec: number) => new THREE.ShaderMaterial({
    vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, side: THREE.DoubleSide,
    uniforms: { map: { value: blank }, soft: { value: blank }, uSoftOn: { value: 0 }, uFocus: { value: 3 }, uAlpha: { value: 1 }, uSpec: { value: spec }, uFog: { value: fogV }, uFogNear: { value: 9 }, uFogFar: { value: 16 } },
  });
  type Solid = { g: THREE.Group; h: number; w: number; shade: THREE.Mesh };
  const flat = new THREE.PlaneGeometry(1, 1);
  const solids: Solid[] = products.map((p) => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(flat, solidMat(0.35));
    const b = new THREE.Mesh(flat, solidMat(0.35));
    b.rotation.y = Math.PI;
    g.add(f, b);
    scene.add(g);
    const h = (p.h / 100) * 5.6;
    return { g, h, w: h * 0.4, shade: contact(0.5, 0.36) };
  });
  type Piece = { m: THREE.Mesh; from: THREE.Vector3; a: number; r: number; y: number; spin: number; size: number };
  const bits: Piece[] = [];
  const pieceSet = pieces.length ? pieces : [];
  for (let i = 0; i < (pieceSet.length ? 9 : 0); i++) {
    const m = new THREE.Mesh(flat, solidMat(0.2));
    scene.add(m);
    const a0 = (i / 9) * Math.PI * 2 + 0.3;
    const wallA = Math.PI / 2 + 1 + (i / 9) * (Math.PI * 2 - 2);
    bits.push({
      m, a: a0, r: 0.42 + (i % 3) * 0.2, y: C.y + 0.62 + ((i * 7) % 5) * 0.11, spin: (i % 2 ? -1 : 1) * (0.4 + (i % 4) * 0.2), size: 0.13 + (i % 3) * 0.05,
      from: new THREE.Vector3(C.x + Math.cos(wallA) * HEDGE.wall, C.y + 1 + (i % 3) * 0.6, C.z + Math.sin(wallA) * HEDGE.wall),
    });
  }

  const ready = (async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    if (stoneSrc) { const si = await loadImage(stoneSrc); if (si) { const t = texOf(si); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 0.5); stoneMat.map = t; stoneMat.color.set(0xffffff); stoneMat.needsUpdate = true; } }
    // The leaf atlas: each picture fitted into its cell with a margin, so smaller mip levels do not bleed.
    const imgs = await Promise.all(order.map((l) => loadImage(l.src)));
    const cell = 2048 / CELLS;
    imgs.forEach((img, i) => {
      if (!img) return;
      const cx = (i % CELLS) * cell, cy = Math.floor(i / CELLS) * cell;
      const k = (cell * 0.88) / Math.max(img.width, img.height);
      const w = img.width * k, h = img.height * k;
      atlasC.x.drawImage(img, cx + (cell - w) / 2, cy + (cell - h) / 2, w, h);
    });
    atlas.needsUpdate = true;
    await Promise.all(products.map(async (p, i) => {
      const [fi, bi] = await Promise.all([loadImage(p.front), loadImage(p.back)]);
      if (!fi) return;
      const s = solids[i]!;
      const [fm, bm] = s.g.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
      fm!.material.uniforms.map!.value = texOf(fi, true);
      bm!.material.uniforms.map!.value = texOf(bi ?? fi, true);
      s.w = s.h * (fi.width / fi.height);
      try {
        const sh = inflate(fi, 72, false, 0.3, false);
        fm!.geometry = sh.geo; bm!.geometry = sh.geo;
      } catch (e) { console.warn("Canopy: kept a flat product", e); }
      s.g.scale.set(s.w, s.h, s.w);
    }));
    await Promise.all(bits.map(async (b, i) => {
      const src = pieceSet[i % pieceSet.length]!;
      const [img, soft] = await Promise.all([loadImage(src.src), loadImage(src.soft)]);
      if (!img) return;
      const mat = b.m.material as THREE.ShaderMaterial;
      mat.uniforms.map!.value = texOf(img, true);
      if (soft) { mat.uniforms.soft!.value = texOf(soft, true); mat.uniforms.uSoftOn!.value = 1; }
      try { b.m.geometry = inflate(img, 40, false, 0.12, true).geo; } catch { /* a flat card is fine */ }
      const k = b.size / Math.max(img.width, img.height);
      b.m.scale.set(img.width * k, img.height * k, b.size);
    }));
  })();

  let cw = 1, ch = 1, wide = true;
  const resize = () => {
    const rect = cv.getBoundingClientRect();
    cw = Math.max(1, rect.width); ch = Math.max(1, rect.height);
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    wide = cw / ch > 1.05;
  };
  resize();

  // ---------------------------------------------------------------- the camera
  type View = { p: THREE.Vector3; t: THREE.Vector3; r: number; ox: number; oy: number };
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // `r` is how much must fit across the narrower side of the screen at the target; the camera stands back along its
  // direction to fit it. ox moves the subject right and oy down, clear of the copy.
  const views = () => {
    const hero: View = { p: V3(0, 0.05, 1), t: V3(0, -0.05, 0), r: HEDGE.R * (wide ? 1.28 : 1.22), ox: wide ? 0.19 : 0, oy: wide ? 0.03 : 0.17 };
    const clearing: View = { p: V3(0, 0.16, 1), t: V3(C.x, C.y + 0.62, C.z), r: wide ? 0.78 : 0.7, ox: wide ? 0.16 : 0, oy: wide ? 0 : 0.14 };
    const inside: View = { p: V3(0.45, 0.22, 1), t: V3(C.x, C.y + 0.66, C.z), r: wide ? 0.62 : 0.64, ox: wide ? 0.17 : 0, oy: wide ? 0 : 0.14 };
    const range: View = { p: V3(0, 0.85, 1), t: V3(C.x, C.y + 0.42, C.z - 0.35), r: wide ? 1.3 : 1.35, ox: wide ? 0.17 : 0, oy: wide ? 0 : 0.14 };
    const top: View = { p: V3(0, 1, 0.08), t: V3(C.x, C.y, C.z), r: wide ? 2.4 : 2.0, ox: 0, oy: 0 };
    return { hero, clearing, inside, range, top };
  };
  const place = (pos: THREE.Vector3, tgt: THREE.Vector3, ox: number, oy: number) => {
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(tgt);
    camera.setViewOffset(cw, ch, -ox * cw, -oy * ch, cw, ch);
    camera.updateProjectionMatrix();
  };
  const fitPos = (v: View) => {
    const vf = (camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = v.r / Math.tan(Math.min(vf, hf) / 2);
    return v.t.clone().add(v.p.clone().normalize().multiplyScalar(dist));
  };
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
  const ptrWorld = new THREE.Vector3();

  const draw = (u: number, S: Stages, time: number, ptr: Ptr, vel: number) => {
    const V = views();
    const heroP = fitPos(V.hero), clearP = fitPos(V.clearing), insideP = fitPos(V.inside), rangeP = fitPos(V.range), topP = fitPos(V.top);
    // Through the hedge: straight in along its axis, eased so the camera slows as it comes out into the clearing.
    const th = S.through;
    const gate = V3(0, 0.02, -HEDGE.DEPTH - 0.4);
    const p1 = th < 0.7 ? tmpP.copy(heroP).lerp(gate, smoother(th / 0.7)) : tmpP.copy(gate).lerp(clearP, smoother((th - 0.7) / 0.3));
    const t1 = tmpT.copy(V.hero.t).lerp(V.clearing.t, smoother(clamp(th * 1.3 - 0.15, 0, 1)));
    let ox = lerp(V.hero.ox, V.clearing.ox, th), oy = lerp(V.hero.oy, V.clearing.oy, th);
    const toInside = smoother(S.inside), toRange = smooth(0.0, 0.6, S.season), toTop = smoother(S.settle);
    p1.lerp(insideP, toInside); t1.lerp(V.inside.t, toInside);
    ox = lerp(ox, V.inside.ox, toInside); oy = lerp(oy, V.inside.oy, toInside);
    p1.lerp(rangeP, toRange * (1 - toInside)); t1.lerp(V.range.t, toRange * (1 - toInside));
    ox = lerp(ox, V.range.ox, toRange * (1 - toInside)); oy = lerp(oy, V.range.oy, toRange * (1 - toInside));
    p1.lerp(topP, toTop); t1.lerp(V.top.t, toTop);
    ox = lerp(ox, 0, toTop); oy = lerp(oy, 0, toTop);
    // A slow drift and a little lean towards the pointer, so the scene is never quite still.
    const lean = ptr.on ? 1 : 0;
    p1.x += Math.sin(time * 0.23) * 0.04 + (ptr.x - 0.5) * 0.18 * lean * (1 - toTop);
    p1.y += Math.cos(time * 0.19) * 0.03 - (ptr.y - 0.5) * 0.1 * lean * (1 - toTop);
    place(p1, t1, ox, oy);

    // Where the pointer lies on the hedge's face, for the rustle.
    if (ptr.on && th < 0.2) {
      const ndc = new THREE.Vector3(ptr.x * 2 - 1, -(ptr.y * 2 - 1), 0.5).unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      const k = (0.3 - camera.position.z) / dir.z;
      ptrWorld.copy(camera.position).addScaledVector(dir, k);
    }
    const U2 = leafMat.uniforms;
    U2.uTime!.value = time;
    U2.uCamZ!.value = camera.position.z;
    U2.uPart!.value = S.part;
    U2.uSeason!.value = S.season;
    U2.uFall!.value = S.fall;
    U2.uPtr!.value.copy(ptrWorld);
    U2.uPtrOn!.value = lerp(U2.uPtrOn!.value as number, ptr.on && th < 0.2 ? 1 : 0, 0.12);
    U2.uVel!.value = Math.min(1.6, vel * 0.9) * (th > 0.02 && th < 0.98 ? 1 : 0.3);
    const focus = camera.position.distanceTo(t1);
    U2.uFocus!.value = focus - 0.4 * (1 - th);
    // Close fog in the hero hides the clearing's bank behind the hedge, so the page opens on a clean round hedge; it
    // draws back as the camera goes in.
    // Measured from the hero camera's own distance, which a narrow phone screen pushes much further back.
    const deepFog = smooth(0, 0.45, th);
    const d0 = heroP.distanceTo(V.hero.t);
    const fogFar = lerp(d0 + 4.3, 15, deepFog) + toTop * 4;
    const fogNear = lerp(d0 + 1.2, 8, deepFog) + toTop * 4;
    U2.uFogNear!.value = fogNear; U2.uFogFar!.value = fogFar;

    // The light in the clearing comes up as the camera comes through, and the moss under it.
    const light = smooth(0.55, 0.95, th) * (1 - toTop * 0.7);
    (moss.material as THREE.MeshBasicMaterial).opacity = smooth(0.3, 0.7, th);
    shafts.forEach((m, i) => { (m.material as THREE.MeshBasicMaterial).opacity = light * (0.16 + 0.06 * Math.sin(time * 0.5 + i * 1.7)); m.lookAt(camera.position.x, m.position.y, camera.position.z); m.rotateZ(-0.32); });

    // The product on its stone, turning round to its back label while its ingredients are out.
    const hero = solids[0];
    const hy = C.y + 0.3;
    if (hero) {
      hero.g.position.set(C.x, hy + hero.h / 2, C.z);
      hero.g.rotation.y = Math.PI * smoother(S.turn) + Math.sin(time * 0.4) * 0.12 * (1 - S.turn);
      hero.shade.visible = false;
    }
    // The rest of the range comes up out of the ground behind it.
    solids.slice(1).forEach((s, i) => {
      const k = S.rise(i);
      const at = rangeAt(i, solids.length - 1);
      const ke = smoother(k);
      s.g.visible = k > 0.001;
      s.g.position.set(at.x, at.y + s.h / 2 - (1 - ke) * (s.h + 0.05), at.z);
      s.g.rotation.y = Math.atan2(camera.position.x - at.x, camera.position.z - at.z) * 0.4 + (1 - ke) * 1.2 * (i % 2 ? 1 : -1);
      s.shade.visible = k > 0.001;
      s.shade.position.set(at.x, at.y + 0.004, at.z);
      s.shade.scale.setScalar(0.5 + ke * 0.5);
      (s.shade.material as THREE.MeshBasicMaterial).opacity = 0.6 * ke;
    });
    for (const s of solids) for (const m of s.g.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[]) {
      m.material.uniforms.uFogNear!.value = fogNear; m.material.uniforms.uFogFar!.value = fogFar;
    }
    // The ingredients come out of the foliage, circle the product, and go back as autumn comes.
    bits.forEach((b, i) => {
      const k = smoother(clamp(S.inside * 1.3 - (i / bits.length) * 0.3, 0, 1));
      b.m.visible = k > 0.001;
      const a = b.a + time * 0.18 * (i % 2 ? 1 : -1) * 0.6;
      const orbit = V3(C.x + Math.cos(a) * b.r, b.y + Math.sin(time * 0.6 + i) * 0.03, C.z + Math.sin(a) * b.r * 0.8);
      b.m.position.copy(b.from).lerp(orbit, k);
      b.m.rotation.set(time * b.spin * 0.5, time * b.spin, i);
      const mat = b.m.material as THREE.ShaderMaterial;
      mat.uniforms.uFocus!.value = focus;
      mat.uniforms.uFogNear!.value = fogNear; mat.uniforms.uFogFar!.value = fogFar;
    });
    for (const s of solids) for (const m of s.g.children as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[]) m.material.uniforms.uFocus!.value = focus;

    renderer.render(scene, camera);
  };

  return { draw, resize, ready };
}
