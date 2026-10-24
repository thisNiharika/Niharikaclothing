// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Pour: drinks cans built in WebGL. Each can is an aluminium shell turned on a lathe with its flat 360 degree label
// wrapped round the body as a glossy printed cylinder, so it turns as a real can turns and the light runs round it.
//
// The page is one pinned scene driven by one number, `u`, how far the visitor has scrolled through it (in screens).
// It opens on the cans standing in an arch under the headline. Scrolling pours the first flavour in from below until
// the screen is that drink; its can rises through the surface and turns to show each part of its label while the copy
// beside it reads that part out: the front, the ingredients panel, then where it is made. The next flavour pours in
// over it, and so on; at the end the liquid drains and the cans drop into a row under a light that follows the
// pointer. Nothing moves unless the visitor scrolls or points, except the bubbles and the light in the liquid.
//
// Everything on screen is a function of `u`, the pointer and a clock, so the card recorder sets all three itself
// (window.__hoverDemo) and every captured frame is exact.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BAND, FOOT, HEIGHT, R, makeShell, makeTab } from "./can";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

// Screens of scroll: the opening, each can, the row at the end.
const U_INTRO = 1;
const U_CAN = 1.5;
const U_FIN = 1.3;
// Half the width of a pour between two cans, in cans.
const POUR = 0.17;
const DARK: [string, string, string] = ["#050607", "#0b0d10", "#1f242b"];

export function initPour() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-pour]")].entries()) setup(root, n === 0);
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".pour-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".pour-gl")!;
  const intro = root.querySelector<HTMLElement>(".pour-intro");
  const finale = root.querySelector<HTMLElement>(".pour-finale");
  const index = root.querySelector<HTMLElement>(".pour-index");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const articles = [...root.querySelectorAll<HTMLElement>(".pour-can")];
  const n = articles.length;
  const total = U_INTRO + n * U_CAN + U_FIN;
  root.style.setProperty("--pour-screens", String(total + 1));

  let gl: WebGLRenderer | null = null;
  try { gl = createRenderer(canvas, articles, n); } catch (e) { console.warn("Pour: no WebGL", e); }
  if (!gl) root.classList.add("is-flat");

  // ------------------------------------------------------------------------------------------------- the state
  let uNow = 0, uGoal = 0;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const darkCols = DARK.map((h) => new THREE.Color(h));

  /** The whole scene and copy at a moment: `u` screens in, the pointer at (px, py), the clock at t seconds. */
  const apply = (u: number, px: number, py: number, t: number) => {
    const cp = (u - U_INTRO) / U_CAN; // chapter position: 0 is the first can's start, n the end of the last
    const introK = 1 - smooth(-0.55, -0.05, cp);
    const finK = smooth(n - 0.05, n + 0.45, cp);
    // The liquid: which flavour is above the surface, which below, and how high the surface has risen.
    let prev = darkCols, next = darkCols, fill = 1;
    const colsOf = (k: number) => (gl ? gl.cans[clamp(k, 0, n - 1)]!.colors : darkCols);
    if (cp < 0) { prev = darkCols; next = colsOf(0); fill = 1 - introK; }
    else if (cp >= n - 0.05) { prev = colsOf(n - 1); next = darkCols; fill = finK; }
    else {
      const k = Math.round(cp);
      if (k >= 1 && k <= n - 1 && Math.abs(cp - k) < POUR) { prev = colsOf(k - 1); next = colsOf(k); fill = smooth(k - POUR, k + POUR, cp); }
      else { prev = next = colsOf(Math.floor(cp)); fill = 1; }
    }
    const current = clamp(Math.floor(cp + POUR), 0, n - 1);
    pin.dataset.tone = cp < -0.3 || finK > 0.5 ? "light" : (articles[current]?.dataset.tone ?? "light");
    gl?.draw({ cp, introK, finK, prev, next, fill, px, py, t });
    if (!gl) pin.style.setProperty("--flat", `#${(fill > 0.5 ? next : prev)[1]!.getHexString()}`);

    // The copy: the opening, each can's three beats in turn, the row's line at the end.
    if (intro) { intro.style.opacity = String(smooth(0.25, 0.85, introK)); intro.style.transform = `translateY(${((1 - introK) * -40).toFixed(1)}px)`; }
    articles.forEach((a, i) => {
      const d = cp - i;
      const show = (lo: number, hi: number) => smooth(lo, lo + 0.07, d) * (1 - smooth(hi - 0.07, hi, d));
      const beats = [show(0.08, 0.4), show(0.44, 0.7), show(0.74, 0.98)];
      a.style.visibility = beats.some((b) => b > 0.001) ? "visible" : "hidden";
      a.querySelectorAll<HTMLElement>(".pb").forEach((el, k) => {
        const b = beats[k] ?? 0;
        el.style.opacity = b.toFixed(3);
        el.style.transform = `translateY(${((1 - b) * 22).toFixed(1)}px)`;
        el.style.pointerEvents = b > 0.5 ? "auto" : "none";
      });
    });
    if (finale) { finale.style.opacity = String(smooth(0.45, 1, finK)); finale.style.transform = `translateY(${((1 - finK) * 30).toFixed(1)}px)`; finale.style.pointerEvents = finK > 0.8 ? "auto" : "none"; }
    if (index) {
      index.style.opacity = String((1 - introK) * (1 - finK));
      index.querySelectorAll<HTMLElement>("li").forEach((li, k) => li.classList.toggle("on", k === current));
    }
  };

  // ------------------------------------------------------------------------------------------------- the loop
  const progress = () => {
    const r = root.getBoundingClientRect();
    const travel = Math.max(1, root.offsetHeight - innerHeight);
    return clamp(-r.top / travel, 0, 1) * total;
  };
  let raf = 0, last = 0, demoing = false;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    uGoal = progress();
    const k = reduced.matches ? 1 : 1 - Math.exp(-dt / 0.11);
    uNow += (uGoal - uNow) * k;
    if (!reduced.matches) { ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt / 0.25)); ptr.y += (ptr.ty - ptr.y) * (1 - Math.exp(-dt / 0.25)); }
    apply(uNow, ptr.x, ptr.y, reduced.matches ? 0 : now / 1000);
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  addEventListener("pointermove", (e) => { ptr.tx = (e.clientX / innerWidth) * 2 - 1; ptr.ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  addEventListener("resize", () => { gl?.resize(); apply(uNow, ptr.x, ptr.y, performance.now() / 1000); });
  uNow = uGoal = progress();
  apply(uNow, 0, 0, 0);

  const ready = () => document.body.classList.add("canvas-ready");
  if (gl) gl.loaded.then(() => { apply(uNow, ptr.x, ptr.y, performance.now() / 1000); ready(); });
  else ready();

  // ------------------------------------------------------------------------------------------------ card recording
  // The card: the opening, the first flavour poured and turned all the way round, the next two poured and turned
  // part way, the rest poured through quickly, and the row at the end with the light passing along it.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const at = (cp: number) => U_INTRO + cp * U_CAN;
    const keys: [number, number][] = [[0, 0], [1.0, 0], [2.2, at(0.12)], [4.4, at(0.86)], [5.4, at(1.12)], [6.8, at(1.56)], [7.6, at(2.12)], [8.6, at(3.12)], [9.5, at(4.12)], [10.4, at(5.14)], [11.8, at(n + 0.62)], [13.6, at(n + 0.62)]];
    const uAt = (t: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [t0, u0] = keys[k - 1]!, [t1, u1] = keys[k]!;
        if (t <= t1) return lerp(u0, u1, smoother((t - t0) / (t1 - t0)));
      }
      return keys.at(-1)![1];
    };
    const demo = (t: number) => {
      demoing = true;
      stop();
      // The pointer drifts a little through the turns and sweeps the row at the end.
      const sweep = smooth(11.9, 13.4, t);
      const px = t < 11.6 ? Math.sin(t * 0.7) * 0.25 : lerp(-0.85, 0.85, sweep);
      const py = t < 11.6 ? Math.cos(t * 0.5) * 0.15 : -0.1;
      apply(uAt(t), px, py, t);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

// ----------------------------------------------------------------------------------------------------- WebGL
type DrawState = { cp: number; introK: number; finK: number; prev: THREE.Color[]; next: THREE.Color[]; fill: number; px: number; py: number; t: number };
type WebGLRenderer = ReturnType<typeof createRenderer>;

function createRenderer(canvas: HTMLCanvasElement, articles: HTMLElement[], n: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;

  // The liquid, drawn first on a quad of its own.
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) }, uT: { value: 0 }, uFill: { value: 1 }, uPtr: { value: new THREE.Vector2() },
      uA0: { value: new THREE.Color() }, uA1: { value: new THREE.Color() }, uA2: { value: new THREE.Color() },
      uB0: { value: new THREE.Color() }, uB1: { value: new THREE.Color() }, uB2: { value: new THREE.Color() },
    },
    vertexShader: "void main(){ gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: LIQUID,
    depthWrite: false,
    depthTest: false,
  });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

  // The cans, lit by a soft studio environment, a key light, a rim in the flavour's colour and a light that follows
  // the pointer.
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff3e6, 1.6);
  key.position.set(-4, 6, 6);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(5, 3, -6);
  const rim2 = new THREE.DirectionalLight(0xffffff, 1.2);
  rim2.position.set(-6, -1, -4);
  const follow = new THREE.PointLight(0xffffff, 26, 30, 1.6);
  scene.add(key, rim, rim2, follow);

  // Bubbles rising through the liquid: positions are a function of the clock, so a moment always looks the same.
  const bubbles = makeBubbles();
  scene.add(bubbles.points);

  const metal = new THREE.MeshStandardMaterial({ color: 0xd6dade, metalness: 1, roughness: 0.24 });
  const shell = makeShell();
  const tab = makeTab();
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const cans = articles.map((el, i) => {
    const colors = (el.dataset.colors ?? "#111111,#333333,#999999").split(",").map((h) => new THREE.Color(h));
    const group = new THREE.Group();
    const body = new THREE.Group(); // the can itself, turned about its own axis
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.07 });
    const label = new THREE.Mesh(new THREE.CylinderGeometry(R, R, BAND, 128, 1, true), mat);
    label.position.y = FOOT + BAND / 2;
    const foot = new THREE.Mesh(shell.lower, metal);
    const crown = new THREE.Mesh(shell.upper, metal);
    const tabMesh = new THREE.Mesh(tab, metal);
    tabMesh.position.set(0, HEIGHT - 0.075, 0.18);
    body.add(label, foot, crown, tabMesh);
    body.position.y = -HEIGHT / 2;
    group.add(body);
    scene.add(group);
    return { el, i, label: el.dataset.label ?? "", colors, group, body, mat };
  });
  const loaded = Promise.all(cans.map((c) => new Promise<void>((done) => {
    loader.load(c.label, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.wrapS = THREE.RepeatWrapping;
      c.mat.map = tex;
      c.mat.needsUpdate = true;
      done();
    }, undefined, () => done());
  })));

  let W = 1, H = 1;
  const resize = () => {
    W = canvas.clientWidth || 1;
    H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    bgMat.uniforms.uRes!.value.set(W * renderer.getPixelRatio(), H * renderer.getPixelRatio());
  };
  resize();

  const tanHalf = Math.tan(THREE.MathUtils.degToRad(14));
  /** Which part of the label faces the viewer during a can's own chapter: the front, the ingredients, the back. */
  const facing = (d: number, e: number, x: number) => {
    const s1 = smooth(0.32, 0.46, d), s2 = smooth(0.62, 0.76, d);
    return 0.5 - 0.36 * s1 - 0.23 * s2 - (d - 0.5) * 0.03 + (1 - e) * 0.28 - x * 0.22;
  };
  // In the opening arch the cans stand in pairs either side of the middle, the first pair nearest and lowest, so the
  // arch is even whatever the count; the first can is just left of centre.
  const archSlot = (i: number) => (i % 2 ? 1 : -1) * (Math.floor(i / 2) + 0.5);

  const draw = (s: DrawState) => {
    const aspect = W / H;
    const wide = aspect > 1.05;
    // The camera: close for a can's chapter, further for the arch, far enough at the end to fit the row.
    const zCan = wide ? 11.5 : 15;
    const zIntro = wide ? 17 : 26;
    const rowCols = wide ? n : Math.ceil(n / 2);
    const spacing = 2.65;
    const rowW = (rowCols - 1) * spacing + 2.4;
    const zFin = Math.max(zCan, rowW / 2 / (tanHalf * aspect) / 0.86 + (wide ? 0 : 2));
    const camZ = lerp(lerp(zCan, zIntro, s.introK), zFin, s.finK);
    camera.position.set(s.px * 0.35, -s.py * 0.2, camZ);
    camera.lookAt(0, 0, 0);
    const visH = (z: number) => 2 * z * tanHalf;
    const cx = wide ? visH(zCan) * aspect * 0.17 : 0;
    const cy = wide ? -0.1 : -0.75;

    const rimCol = s.fill > 0.5 ? s.next[2]! : s.prev[2]!;
    rim.color.copy(rimCol).lerp(new THREE.Color(0xffffff), 0.35);
    rim2.color.copy(s.fill > 0.5 ? s.next[1]! : s.prev[1]!);
    follow.position.set(s.px * 7, -s.py * 4 + 1, 7);

    for (const c of cans) {
      const i = c.i;
      const d = s.cp - i;
      const e = i === 0 ? 1 : smooth(i - POUR, i + POUR, s.cp);
      const x = i === n - 1 ? 0 : smooth(i + 1 - POUR, i + 1 + POUR, s.cp);
      const Y = visH(zCan) * 0.95;
      // Its own chapter: rising from below through the surface, turning, then carried up and out as the next pours in.
      let px = cx, py = cy - (1 - e) * Y + x * Y, pz = 0, spin = -facing(d, e, x) * Math.PI * 2, tilt = 0;
      // The opening arch.
      if (s.introK > 0.001) {
        const slot = archSlot(i), a = Math.abs(slot);
        const zI = -(a - 0.5) * 2.2;
        const ax = Math.sign(slot) * visH(zIntro) * aspect * (wide ? 0.34 : 0.46) * Math.tanh(a * 0.62) * ((zIntro - zI) / zIntro);
        const ay = (wide ? -1.15 : -0.5) + (wide ? 1.9 : 1.2) * Math.pow(a / 3, 1.35);
        const aspin = -(0.5 + slot * 0.045) * Math.PI * 2;
        const k = s.introK;
        px = lerp(px, ax, k); py = lerp(py, ay, k); pz = lerp(pz, zI, k); spin = lerp(spin, aspin, k);
      }
      // The row at the end, the cans dropping in from above.
      if (s.finK > 0.001) {
        const col = wide ? i : i % rowCols, row = wide ? 0 : Math.floor(i / rowCols);
        const rx = (col - (rowCols - 1) / 2) * spacing;
        const ry = (wide ? -0.75 : -0.3 - row * 4.1 + 1.6);
        const rspin = -(0.5 + (i - (n - 1) / 2) * 0.02) * Math.PI * 2;
        const k = smoother(clamp((s.finK - i * 0.04) / (1 - (n - 1) * 0.04), 0, 1));
        const from = i === n - 1 ? py : Y * 1.1;
        px = lerp(px, rx, k); py = lerp(from, ry, k); pz = lerp(pz, 0, k); spin = lerp(spin, rspin, k);
      }
      tilt = (1 - s.introK) * (1 - s.finK);
      c.group.position.set(px, py, pz);
      c.body.rotation.y = spin;
      c.group.rotation.set(s.py * 0.09 * tilt + 0.04, 0, -s.px * 0.05 * tilt);
      c.group.visible = Math.abs(py) < Y * 1.05 || s.introK > 0.01 || s.finK > 0.01;
    }

    const u = bgMat.uniforms;
    u.uT!.value = s.t;
    u.uFill!.value = s.fill;
    u.uPtr!.value.set(s.px, s.py);
    (["uA0", "uA1", "uA2"] as const).forEach((k, j) => u[k]!.value.copy(s.prev[j]!));
    (["uB0", "uB1", "uB2"] as const).forEach((k, j) => u[k]!.value.copy(s.next[j]!));
    const liquid = (1 - s.introK) * (1 - s.finK);
    bubbles.set(s.t, liquid, s.fill > 0.5 ? s.next[2]! : s.prev[2]!);

    renderer.clear();
    renderer.render(bgScene, bgCam);
    renderer.clearDepth();
    renderer.render(scene, camera);
  };

  return { draw, resize, loaded, cans: cans.map((c) => ({ colors: c.colors })) };
}

function makeBubbles() {
  const N = 260;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    pos.set([rnd() * 22 - 11, rnd() * 14 - 7, rnd() * 10 - 8], i * 3);
    seed.set([0.35 + rnd() * 1.1, 0.5 + rnd() * 2.2, rnd() * 6.28], i * 3); // rise speed, size, phase
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAmt: { value: 0 }, uCol: { value: new THREE.Color() }, uScale: { value: devicePixelRatio || 1 } },
    vertexShader: `attribute vec3 seed; uniform float uT; uniform float uScale; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + 7.0 + uT * seed.x, 14.0) - 7.0;
        p.x += sin(uT * 0.9 + seed.z) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = seed.y * uScale * 34.0 / -mv.z;
        vA = smoothstep(7.0, 4.0, abs(p.y));
      }`,
    fragmentShader: `uniform float uAmt; uniform vec3 uCol; varying float vA;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float r = length(q);
        float ring = smoothstep(0.5, 0.42, r) - smoothstep(0.42, 0.28, r) * 0.75;
        float glint = smoothstep(0.14, 0.0, length(q - vec2(-0.14, -0.16)));
        float a = (ring * 0.55 + glint * 0.8) * uAmt * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uCol, vec3(1.0), 0.65), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return {
    points,
    set(t: number, amt: number, col: THREE.Color) { mat.uniforms.uT!.value = t; mat.uniforms.uAmt!.value = amt; mat.uniforms.uCol!.value.copy(col); },
  };
}

/**
 * The liquid. Each flavour is three colours: deep below, the drink's own colour, and the light from the surface far
 * above, falling as shafts and caustics. A pour is the next flavour rising from the bottom of the screen with a wavy,
 * bright surface; above it the last flavour, below it the next.
 */
const LIQUID = `precision highp float;
uniform vec2 uRes; uniform float uT; uniform float uFill; uniform vec2 uPtr;
uniform vec3 uA0; uniform vec3 uA1; uniform vec3 uA2; uniform vec3 uB0; uniform vec3 uB1; uniform vec3 uB2;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int k = 0; k < 5; k++) { v += a * n(p); p = p * 2.02 + vec2(1.7, 9.2); a *= .5; } return v; }
vec3 field(vec3 c0, vec3 c1, vec3 c2, vec2 uv, float t){
  float g = smoothstep(-0.1, 1.35, uv.y);
  vec3 col = mix(c0, c1, g);
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y) * 2.6;
  float a = fbm(p + vec2(t * 0.04, t * 0.07));
  float b = fbm(p * 1.6 - vec2(t * 0.06, -t * 0.02) + a);
  // Caustics: thin, soft threads of light, strongest near the surface and gone in the deep.
  float caus = pow(abs(sin((a - b) * 9.0)), 16.0);
  col += c2 * caus * (0.02 + 0.13 * g * g);
  col += c1 * 0.06 * (a - 0.5);
  float rays = fbm(vec2(uv.x * 5.0 + uv.y * 1.2 + uPtr.x * 0.3, t * 0.04));
  col += c2 * smoothstep(0.55, 1.0, rays) * g * g * 0.35;
  col += c2 * 0.18 * exp(-pow((uv.x - 0.5 - uPtr.x * 0.12) * 2.2, 2.0)) * g;
  return col;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float mid = 1.0 - abs(uFill * 2.0 - 1.0);
  // Waves counted across the screen's real width, so a phone gets fewer rather than sharper ones.
  float wx = uv.x * min(uRes.x / uRes.y, 1.8) / 1.8;
  float wave = (0.028 * sin(wx * 8.0 + uT * 1.7) + 0.014 * sin(wx * 21.0 - uT * 2.4) + 0.006 * sin(wx * 47.0 + uT * 3.1)) * mid;
  float level = mix(-0.1, 1.1, uFill) + wave;
  vec3 a = field(uA0, uA1, uA2, uv, uT);
  vec3 b = field(uB0, uB1, uB2, uv, uT + 3.0);
  float below = smoothstep(level + 0.003, level - 0.003, uv.y);
  vec3 col = mix(a, b, below);
  float edge = exp(-pow((uv.y - level) * 170.0, 2.0)) * mid;
  col += mix(uB2, vec3(1.0), 0.6) * edge * 0.7;
  float foam = smoothstep(0.0, 0.015, level - uv.y) * smoothstep(0.07, 0.0, level - uv.y) * fbm(vec2(uv.x * 46.0, uT * 0.8)) * mid;
  col += mix(uB2, vec3(1.0), 0.5) * foam * 0.4;
  col *= mix(0.5, 1.0, smoothstep(1.3, 0.25, length((uv - vec2(0.5, 0.55)) * vec2(1.15, 1.5))));
  gl_FragColor = vec4(col, 1.0);
}`;
