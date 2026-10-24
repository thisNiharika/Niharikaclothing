// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Peel: a yoghurt range whose pots are built in code and wear their own flat artwork. Each pot is a lathed cup with a
// rolled rim; its printed wrap is a strip of the flat label bent round it in the vertex shader, and its foil lid is the
// flat lid picture laid on top. Scrolling peels the lid back from its tab, curling round a moving roll as foil does, to
// show the yoghurt (drawn in the shader, cream with a ripple of the flavour); then the wrap unwinds off the pot from its
// seam, leaving along the tangent like a real label, and flies flat to the front as the whole print; it rolls back on,
// the flavours come forward in turn while the sky behind them (sky.ts) turns to each one's colour, and the pots stack for the close.
// Timing and the unwinding live in pot-plan.ts, which the shader mirrors.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadImage } from "./img";
import { createSky, mixSky, skyOf } from "./sky";
import { POT, lineAt, marks, stackAt, stages, totalScreens, U } from "./pot-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const cssv = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

type Flavour = { name: string; line: string; wrap: string; lid: string; colour: string };

export function initPot() {
  document.querySelectorAll<HTMLElement>("[data-pot]").forEach((el) => setup(el, el.classList.contains("hero")));
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".pt-pin")!;
  const cv = root.querySelector<HTMLCanvasElement>(".pt-gl")!;
  const intro = root.querySelector<HTMLElement>(".pt-intro");
  const lines = [...root.querySelectorAll<HTMLElement>(".pt-line")];
  const flavourItems = [...root.querySelectorAll<HTMLElement>(".pt-flavours li")];
  const finale = root.querySelector<HTMLElement>(".pt-finale");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const flavours: Flavour[] = [...root.querySelectorAll<HTMLElement>(".pt-item")].map((el) => ({
    name: el.dataset.name ?? "", line: el.dataset.line ?? "", wrap: el.dataset.wrap ?? "", lid: el.dataset.lid ?? "", colour: el.dataset.colour ?? "#e8dcc0",
  }));
  const n = flavours.length;
  const total = totalScreens(n);
  const M = marks(n);
  root.style.setProperty("--pt-screens", String(total + 1));

  let scene: ReturnType<typeof createScene> | null = null;
  try { scene = createScene(cv, flavours); } catch (e) { console.warn("Peel: no WebGL", e); }
  if (!scene) { root.classList.add("is-flat"); document.body.classList.add("canvas-ready"); return; }

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, y: 0.5, on: false };
  let uNow = 0, raf = 0, last = 0, t = 0, demoing = false;
  const wash = flavours.map((f) => new THREE.Color(f.colour));
  const tmpC = new THREE.Color();
  // The sky behind the pots: a slow liquid of the flavour in focus, deep at the edges and glowing behind the pots.
  const sky = createSky(root.querySelector<HTMLCanvasElement>(".pt-sky"));
  const skies = flavours.map((f) => skyOf(f.colour, 0.3, 0.62));

  const apply = (u: number, time: number) => {
    const S = stages(u, n);
    scene!.draw(S, time, ptr);
    if (intro) { intro.style.opacity = S.hero.toFixed(3); intro.style.visibility = S.hero > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateY(${((1 - S.hero) * -24).toFixed(1)}px)`; }
    const spans: [number, number][] = [[M.peel0 + U.peel * 0.2, M.unwrap0 + 0.05], [M.unwrap0 + U.unwrap * 0.3, M.flavours0 - U.rewrap * 0.5], [M.flavours0 - 0.05, M.stack0 + U.stack * 0.2]];
    lines.forEach((el, j) => {
      const [a, b] = spans[j] ?? [9e9, 9e9];
      const k = smooth(a, a + 0.22, u) * (1 - smooth(b - 0.22, b, u));
      el.style.opacity = k.toFixed(3);
      el.style.visibility = k > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - k) * 18).toFixed(1)}px)`;
    });
    flavourItems.forEach((li, i) => li.classList.toggle("is-now", S.flavours > 0.5 && Math.abs(S.flavour - i) < 0.5));
    // The page washes to the colour of the flavour in focus.
    const f = S.flavour, i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1);
    tmpC.copy(wash[i0] ?? wash[0]!).lerp(wash[i1] ?? wash[0]!, f - i0);
    const strength = 0.32 + 0.4 * S.flavours + 0.15 * S.stack;
    pin.style.setProperty("--pt-wash", `#${tmpC.getHexString()}`);
    if (sky) sky.draw(time, mixSky(skies[i0] ?? skies[0]!, skies[i1] ?? skies[0]!, f - i0));
    pin.style.setProperty("--pt-wash-k", `${Math.round(strength * 100)}%`);
    const fk = smooth(M.stack0 + U.stack * 0.55, M.end - 0.1, u);
    if (finale) { finale.style.opacity = fk.toFixed(3); finale.style.visibility = fk > 0.001 ? "visible" : "hidden"; finale.style.pointerEvents = fk > 0.8 ? "auto" : "none"; }
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
    ptr.x = (e.clientX - r.left) / Math.max(1, r.width); ptr.y = (e.clientY - r.top) / Math.max(1, r.height);
    ptr.on = e.pointerType === "mouse";
  }, { passive: true });
  pin.addEventListener("pointerleave", () => { ptr.on = false; });
  addEventListener("resize", () => { scene!.resize(); apply(uNow, t); });
  uNow = progress();
  scene.ready.then(() => { apply(uNow, t); document.body.classList.add("canvas-ready"); });

  // ---------------------------------------------------------------------------------------------- card recording
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const keys: [number, number][] = [[0, 0], [1.6, 0], [4.2, M.unwrap0], [7.4, M.flavours0 - U.rewrap - 0.05], [8.2, M.flavours0], [11.6, M.stack0], [14.4, total - 0.1], [16, total - 0.1]];
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
      const k = smoother(time / 1.6);
      const x = time < 1.8 ? lerp(W * 0.52, W * 0.82, k) : W * 0.95;
      const y = time < 1.8 ? lerp(H * 0.66, H * 0.55, k) : H * 0.94;
      ptr.x = x / W; ptr.y = y / H; ptr.on = time < 1.9;
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      apply(uAt(time), time);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

// ---------------------------------------------------------------------------------------------- the scene

type Stages = ReturnType<typeof stages>;
type Ptr = { x: number; y: number; on: boolean };

// The wrap: a strip of the flat label. Wrapped, each column sits on the pot at its angle; unwinding, the part let go
// leaves along the tangent from the seam (pot-plan.ts unwindAt, mirrored here); flat, it faces the viewer in front.
const WRAP_VERT = /* glsl */ `uniform float uR; uniform float uFoot; uniform float uH; uniform float uBand; uniform float uY; uniform float uFree; uniform float uFlat; uniform vec3 uFlatAt;
varying vec2 vUv; varying vec3 vN; varying float vFree;
const float PI = 3.14159265;
void main(){
  vUv = uv;
  float C = 2.0 * PI * uR;
  float s = uv.x * C;
  float sd = C - clamp(uFree, 0.0, C);
  float a = -PI + min(s, sd) / uR;
  // Wrapped, it follows the cup's taper, narrower towards the foot, just proud of the wall.
  float y = uY + (uv.y - 0.5) * uBand;
  float rr = mix(uFoot * uR, uR, pow(clamp((y - 0.04) / (uH - 0.08), 0.0, 1.0), 0.8)) + 0.006;
  vec3 p = vec3(rr * sin(a), y, rr * cos(a));
  vec3 n = vec3(sin(a), 0.0, cos(a));
  float d = max(0.0, s - sd);
  if (d > 0.0) {
    vec3 tng = vec3(cos(a), 0.0, -sin(a));
    p += tng * d + n * (0.06 * d * d / C);
  }
  vFree = step(0.001, d);
  vec3 flatP = uFlatAt + vec3((uv.x - 0.5) * C, (uv.y - 0.5) * uBand, 0.0);
  // On its way to the print each column swings round, so the sheet turns to face the viewer rather than sliding.
  float t = smoothstep(0.0, 1.0, clamp(uFlat * 1.35 - abs(uv.x - 0.5) * 0.35, 0.0, 1.0));
  p = mix(p, flatP, t);
  p.z += sin(t * PI) * 0.6;
  n = normalize(mix(n, vec3(0.0, 0.0, 1.0), t));
  vN = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const WRAP_FRAG = /* glsl */ `uniform sampler2D uMap; uniform float uFlat; varying vec2 vUv; varying vec3 vN; varying float vFree;
void main(){
  vec4 c = texture2D(uMap, vUv);
  vec3 n = normalize(vN);
  // The back of the label is plain white paper.
  if (!gl_FrontFacing) { gl_FragColor = vec4(vec3(0.97, 0.96, 0.94) * (0.93 + 0.07 * abs(n.z)), 1.0); return; }
  vec3 l = normalize(vec3(-0.4, 0.5, 0.8));
  float d = max(dot(n, l), 0.0);
  float sp = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 50.0) * 0.25 * (1.0 - uFlat);
  vec3 lit = c.rgb * mix(0.62 + 0.45 * d, 1.0, uFlat) + sp;
  gl_FragColor = vec4(lit, 1.0);
}`;

// The foil lid: the flat lid picture on a plane over the rim. Peeling, the part past the roll curls round a cylinder
// and lies back over itself, as foil pulled from its tab does.
const LID_VERT = /* glsl */ `uniform float uPeel; uniform float uSize; uniform vec2 uDir;
varying vec2 vUv; varying vec3 vN; varying float vCurl;
const float PI = 3.14159265;
void main(){
  vUv = uv;
  vec2 q = (uv - 0.5) * uSize; q.y = -q.y;
  // Distance along the peel from the line of the roll, which travels from the tab across the lid.
  float along = dot(q, uDir);
  float line = mix(uSize * 0.55, -uSize * 0.3, uPeel);
  float r = 0.13 + 0.09 * uPeel;
  float s = along - line;
  vec3 p = vec3(q.x, 0.0, q.y);
  vec3 n = vec3(0.0, 1.0, 0.0);
  vCurl = 0.0;
  if (s > 0.0 && uPeel > 0.0) {
    vec2 side = q - uDir * along;
    float ang = s / r;
    float u2, h;
    if (ang < PI) { u2 = line + r * sin(ang); h = r * (1.0 - cos(ang)); n = vec3(-uDir.x * sin(ang), cos(ang), -uDir.y * sin(ang)); }
    else { u2 = line - (s - PI * r); h = 2.0 * r; n = vec3(0.0, -1.0, 0.0); }
    vec2 xy = side + uDir * u2;
    p = vec3(xy.x, h, xy.y);
    vCurl = clamp(ang / PI, 0.0, 1.0);
  }
  vN = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const LID_FRAG = /* glsl */ `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vN; varying float vCurl;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  vec3 n = normalize(vN);
  vec3 l = normalize(vec3(-0.3, 0.9, 0.5));
  vec3 v = vec3(0.0, 0.6, 0.8);
  // Foil: its print on top, bright silver underneath, a sheen that runs along the curl.
  vec3 top = c.rgb * (0.8 + 0.3 * max(dot(n, l), 0.0)) + pow(max(dot(reflect(-l, n), normalize(v)), 0.0), 20.0) * 0.25;
  vec3 under = vec3(0.86, 0.87, 0.9) * (0.65 + 0.45 * abs(dot(n, l)));
  gl_FragColor = vec4(gl_FrontFacing ? top : under, 1.0);
}`;

// The yoghurt: cream with a ripple of the flavour folded through it, glossy where the light catches it.
const YOG_FRAG = /* glsl */ `uniform vec3 uFruit; uniform float uTime; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p), a = atan(p.y, p.x);
  // Thin streaks folded through, as a fruit ripple is: two sets of spiral bands, broken up so none runs all the way.
  float w1 = sin(a * 1.0 + r * 26.0 + noise(p * 5.0) * 4.0);
  float w2 = sin(-a * 2.0 + r * 17.0 + noise(p * 7.0 + 3.1) * 3.0);
  float ripple = max(smoothstep(0.86, 0.99, w1) * noise(p * 4.0 + 1.7), smoothstep(0.9, 0.995, w2) * noise(p * 3.0 + 7.3) * 0.8);
  ripple *= smoothstep(0.47, 0.25, r);
  vec3 cream = vec3(0.97, 0.95, 0.9);
  vec3 col = mix(cream, uFruit, ripple * 0.75);
  // Soft peaks: the surface is not quite flat.
  float h = noise(p * 9.0 + uTime * 0.02);
  col *= 0.94 + 0.08 * h;
  col += pow(max(0.0, 1.0 - length(p - vec2(-0.12, 0.14)) * 4.0), 3.0) * 0.18;
  col *= mix(0.86, 1.0, smoothstep(0.5, 0.36, r));
  gl_FragColor = vec4(col, 1.0);
}`;

function createScene(cv: HTMLCanvasElement, flavours: Flavour[]) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc0, 0.9));
  const key = new THREE.DirectionalLight(0xfff8ee, 1.4);
  key.position.set(-2, 5, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  const n = flavours.length;
  const R = POT.R, H = POT.H;
  const C = 2 * Math.PI * R;

  const texOf = (img: HTMLImageElement) => { const t = new THREE.Texture(img); t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true; return t; };
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;

  // ---------------------------------------------------------------- the pot, in code
  // A lathed cup: foot, a wall flaring to the rim, a rolled lip, and the inside a little greyer.
  const profile: THREE.Vector2[] = [];
  const steps = 18;
  profile.push(new THREE.Vector2(0, 0));
  profile.push(new THREE.Vector2(R * POT.foot - 0.06, 0));
  profile.push(new THREE.Vector2(R * POT.foot, 0.04));
  for (let i = 0; i <= steps; i++) { const t = i / steps; profile.push(new THREE.Vector2(lerp(R * POT.foot, R, Math.pow(t, 0.8)), 0.04 + t * (H - 0.08))); }
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 1.5; profile.push(new THREE.Vector2(R + 0.035 + Math.cos(a) * 0.035, H - 0.04 + 0.035 + Math.sin(a) * 0.035)); }
  profile.push(new THREE.Vector2(R - 0.035, H - 0.05));
  profile.push(new THREE.Vector2(R * POT.foot - 0.06, 0.08));
  profile.push(new THREE.Vector2(0, 0.08));
  const cupGeo = new THREE.LatheGeometry(profile, 96);
  cupGeo.computeVertexNormals();
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.32, metalness: 0, envMapIntensity: 0.7, side: THREE.DoubleSide });
  const contactTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!; const g = x.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, "rgba(40,30,20,0.45)"); g.addColorStop(1, "rgba(40,30,20,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

  type Pot = { g: THREE.Group; spin: THREE.Group; wrap: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; lid: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; yog: THREE.Mesh; shade: THREE.Mesh; band: number };
  const pots: Pot[] = flavours.map((f) => {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    spin.add(new THREE.Mesh(cupGeo, cupMat));
    const wrapMat = new THREE.ShaderMaterial({ vertexShader: WRAP_VERT, fragmentShader: WRAP_FRAG, side: THREE.DoubleSide,
      uniforms: { uMap: { value: blank }, uR: { value: R }, uFoot: { value: POT.foot }, uH: { value: H }, uBand: { value: H * 0.7 }, uY: { value: H * 0.5 }, uFree: { value: 0 }, uFlat: { value: 0 }, uFlatAt: { value: new THREE.Vector3(0, H * 0.55, R + 1.2) } } });
    const wrap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 192, 2), wrapMat);
    wrap.frustumCulled = false;
    spin.add(wrap);
    const yog = new THREE.Mesh(new THREE.CircleGeometry(R - 0.04, 64), new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: YOG_FRAG, uniforms: { uFruit: { value: new THREE.Color(f.colour) }, uTime: { value: 0 } } }));
    yog.rotation.x = -Math.PI / 2;
    yog.position.y = H - 0.12;
    spin.add(yog);
    const lidSize = R * 2 * 1.13;
    const lidMat = new THREE.ShaderMaterial({ vertexShader: LID_VERT, fragmentShader: LID_FRAG, side: THREE.DoubleSide,
      uniforms: { uMap: { value: blank }, uPeel: { value: 0 }, uSize: { value: lidSize }, uDir: { value: new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2) } } });
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 72, 72), lidMat);
    lid.frustumCulled = false;
    lid.position.y = H + 0.012;
    spin.add(lid);
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(R * 3, R * 3), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.002;
    g.add(shade);
    scene.add(g);
    return { g, spin, wrap, lid, yog, shade, band: H * 0.7 };
  });

  const ready = (async () => {
    await Promise.all(flavours.map(async (f, i) => {
      const [w, l] = await Promise.all([loadImage(f.wrap), loadImage(f.lid)]);
      const p = pots[i]!;
      if (w) {
        p.wrap.material.uniforms.uMap!.value = texOf(w);
        // The wrap keeps its own proportions: its height is the circumference over its aspect, centred on the wall.
        const band = Math.min(H * 0.86, C / (w.width / w.height));
        p.band = band;
        p.wrap.material.uniforms.uBand!.value = band;
      }
      if (l) p.lid.material.uniforms.uMap!.value = texOf(l);
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

  type View = { az: number; el: number; t: THREE.Vector3; r: number; ox: number; oy: number };
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const views = () => ({
    hero: { az: 0.18, el: 0.3, t: V3(0.2, H * 0.55, -0.4), r: wide ? 2.6 : 2.9, ox: wide ? 0.17 : 0, oy: wide ? 0 : 0.15 } as View,
    peel: { az: 0.35, el: 0.95, t: V3(0, H, 0), r: wide ? 1.3 : 1.35, ox: wide ? 0.16 : 0, oy: wide ? 0 : 0.14 } as View,
    unwrap: { az: 0, el: 0.16, t: V3(0, H * 0.55, 0.6), r: wide ? C * 0.56 : C * 0.55, ox: wide ? 0.08 : 0, oy: wide ? 0 : 0.12 } as View,
    flavours: { az: 0, el: 0.22, t: V3(0, H * 0.6, 0.2), r: wide ? 3.7 : 2.8, ox: wide ? 0.14 : 0, oy: wide ? 0 : 0.16 } as View,
    stack: { az: 0.3, el: 0.42, t: V3(0, H * n * 0.5, 0), r: wide ? H * n * 0.62 : H * n * 0.7, ox: wide ? 0.16 : 0, oy: wide ? 0 : 0.1 } as View,
    top: { az: 0.3, el: 1.25, t: V3(0, H * n + 0.02, 0), r: wide ? 1.55 : 1.45, ox: 0, oy: wide ? -0.17 : -0.16 } as View,
  });
  const mix = (a: View, b: View, k: number): View => ({ az: lerp(a.az, b.az, k), el: lerp(a.el, b.el, k), t: a.t.clone().lerp(b.t, k), r: lerp(a.r, b.r, k), ox: lerp(a.ox, b.ox, k), oy: lerp(a.oy, b.oy, k) });
  const place = (v: View) => {
    const vf = (camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = v.r / Math.tan(Math.min(vf, hf) / 2);
    camera.position.set(v.t.x + Math.sin(v.az) * Math.cos(v.el) * dist, v.t.y + Math.sin(v.el) * dist, v.t.z + Math.cos(v.az) * Math.cos(v.el) * dist);
    camera.lookAt(v.t);
    camera.setViewOffset(cw, ch, -v.ox * cw, -v.oy * ch, cw, ch);
    camera.updateProjectionMatrix();
  };
  // Where the others wait in the opening: behind the first, either side.
  const heroAt = (i: number) => (i === 0 ? V3(0, 0, 0) : V3((i % 2 ? -1 : 1) * (2.3 + Math.floor((i - 1) / 2) * 1.6), 0, -1.6 - Math.floor((i - 1) / 2) * 1.2));

  const draw = (S: Stages, time: number, ptr: Ptr) => {
    const V = views();
    const toPeel = smoother(clamp((1 - S.hero) * 1.4, 0, 1)) * (1 - smooth(0, 0.3, S.unwind));
    const toUnwrap = smooth(0, 0.35, S.unwind) * (1 - S.rewrap);
    let v = mix(V.hero, V.peel, toPeel);
    v = mix(v, V.unwrap, toUnwrap);
    v = mix(v, V.flavours, smoother(S.flavours > 0 ? Math.max(S.flavours, S.rewrap * 0.6) : S.rewrap * 0.6));
    const toStack = smoother(clamp(S.stack * 1.6, 0, 1));
    v = mix(v, V.stack, toStack);
    v = mix(v, V.top, smoother(clamp(S.stack * 1.6 - 0.6, 0, 1)));
    if (ptr.on) { v.az += (ptr.x - 0.5) * 0.25 * S.hero; v.el += (0.5 - ptr.y) * 0.08 * S.hero; }
    place(v);

    pots.forEach((p, i) => {
      // Where it stands: the opening's arrangement, then the flavour line, then the stack.
      const hero = heroAt(i);
      const aside = i === 0 ? hero : hero.clone().add(V3((i % 2 ? -1 : 1) * 4.6, 0, -1.2).multiplyScalar(Math.max(toPeel, toUnwrap)));
      const line = lineAt(i, n, S.flavour);
      const inLine = smoother(S.flavours > 0 ? S.flavours : 0) * (1 - toStack);
      const pos = aside.clone().lerp(V3(line.x, 0, line.z), inLine);
      const st = stackAt(i);
      // Into the stack in order, each arcing up and over.
      const ks = smoother(clamp(S.stack * 1.8 - i * 0.22, 0, 1));
      pos.lerp(V3(st.x, st.y, st.z), ks);
      pos.y += Math.sin(Math.PI * ks) * 0.9 + line.lift * 0.25 * inLine;
      p.g.position.copy(pos);
      // A turn: the first pot follows the pointer in the opening; the one in focus turns once as it comes forward.
      const lean = i === 0 && ptr.on ? (ptr.x - 0.5) * 1.4 * S.hero : 0;
      // Each turns once as it comes into focus and stops facing the front.
      const focusSpin = inLine * Math.PI * 2 * smoother(clamp(S.flavour - (i - 1), 0, 1));
      const turn = lean + focusSpin + Math.sin(time * 0.35 + i) * 0.1;
      p.spin.rotation.y = lerp(lerp(p.spin.rotation.y, turn, 0.15), i * 0.5, ks);
      p.shade.visible = pos.y < 0.05;
      // The lid and the wrap: only the first pot peels and unwinds.
      const peel = i === 0 ? S.peel : 0;
      p.lid.material.uniforms.uPeel!.value = peel;
      p.yog.visible = peel > 0.02;
      (p.yog.material as THREE.ShaderMaterial).uniforms.uTime!.value = time;
      const wu = p.wrap.material.uniforms;
      wu.uFree!.value = i === 0 ? S.unwind * C : 0;
      wu.uFlat!.value = i === 0 ? S.flat : 0;
      wu.uY!.value = H * 0.5;
    });
    renderer.render(scene, camera);
  };

  return { draw, resize, ready };
}
