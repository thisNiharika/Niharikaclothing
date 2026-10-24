// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Unwrap: a packaging studio's cans, whose labels peel off and unroll into flat prints. Each label is one mesh, a
// strip of narrow columns that the vertex shader places either wrapped round its can or flat on the screen, column by
// column from the seam, with a curl where it lifts away; so the label peels like a sleeve rather than fading into a
// picture. The cans stand in a row along the bottom; scrolling takes each in turn: its label peels and flies up to a
// print across the screen, with the label's own palette (measured from the artwork) and the facts printed on it, and
// a loupe for looking closely; then the print lifts away and the next can's turn comes, leaving the bare aluminium in
// the row. At the end every label lies flat on one press sheet. The card recorder drives it (window.__hoverDemo).

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BAND, FOOT, HEIGHT, R, makeShell, makeTab } from "./can";
import { loadImage } from "./img";
import { U_CAN, U_INTRO, palette, totalScreens, turn } from "./unwrap-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

const VERT = /* glsl */ `
uniform float uPeel, uSpin, uR, uBand, uLabelY;
uniform mat4 uCan;
uniform vec4 uFlat;   // centre x, y and width, height of the print, in world units on the z = 0 plane
varying vec2 vUv;
varying vec3 vN;
varying float vT;
void main() {
  vUv = uv;
  float theta = (uv.x - 0.5) * 6.2831853 + uSpin;
  vec3 wrapLocal = vec3(uR * sin(theta), (uv.y - 0.5) * uBand + uLabelY, uR * cos(theta));
  vec3 wrapped = (uCan * vec4(wrapLocal, 1.0)).xyz;
  vec3 wrapN = normalize(mat3(uCan) * vec3(sin(theta), 0.0, cos(theta)));
  vec3 flatP = vec3(uFlat.x + (uv.x - 0.5) * uFlat.z, uFlat.y + (uv.y - 0.5) * uFlat.w, 0.0);
  // Columns come away from the seam first (the label's ends), so it peels open rather than fading over.
  float edge = min(uv.x, 1.0 - uv.x) * 2.0;
  float t = smoothstep(0.0, 1.0, clamp(uPeel * 1.7 - edge * 0.7, 0.0, 1.0));
  vec3 p = mix(wrapped, flatP, t);
  // The curl where it lifts: pushed out along the can's normal and towards the camera mid-flight.
  p += (wrapN * 0.6 + vec3(0.0, 0.0, 1.2)) * sin(t * 3.14159) * 0.5;
  vT = t;
  vN = normalize(mix(wrapN, vec3(0.0, 0.0, 1.0), t));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uKey;
varying vec2 vUv;
varying vec3 vN;
varying float vT;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  if (!gl_FrontFacing) { gl_FragColor = vec4(vec3(0.93, 0.92, 0.89) * (0.82 + 0.18 * vT), 1.0); return; }
  vec3 n = normalize(vN);
  float d = max(dot(n, normalize(uKey)), 0.0);
  vec3 h = normalize(normalize(uKey) + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 60.0);
  // Wrapped, the label is a glossy can; flat, it is a print under even light.
  vec3 wrapped = c * (0.55 + 0.55 * d) + spec * 0.35;
  vec3 flatC = c * 1.0;
  gl_FragColor = vec4(mix(wrapped, flatC, vT), 1.0);
  #include <colorspace_fragment>
}`;

export function initUnwrap() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-unwrap]")].entries()) setup(root, n === 0);
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".uw-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".uw-gl")!;
  const intro = root.querySelector<HTMLElement>(".uw-intro");
  const arts = [...root.querySelectorAll<HTMLElement>(".uw-art")];
  const finale = root.querySelector<HTMLElement>(".uw-finale");
  const loupe = root.querySelector<HTMLElement>(".uw-loupe");
  const marks = root.querySelector<HTMLElement>(".uw-marks");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const n = arts.length;
  const total = totalScreens(n);
  root.style.setProperty("--uw-screens", String(total + 1));

  let three: ReturnType<typeof createScene> | null = null;
  try { three = createScene(canvas, arts.map((a) => a.dataset.label ?? "")); } catch (e) { console.warn("Unwrap: no WebGL", e); }
  if (!three) root.classList.add("is-flat");

  // Each label's palette, measured from its own artwork once it has loaded.
  arts.forEach((a) => {
    const chips = a.querySelector<HTMLElement>(".uw-chips");
    const src = a.dataset.label;
    if (!chips || !src) return;
    loadImage(src).then((img) => {
      if (!img) return;
      const c = document.createElement("canvas");
      c.width = 104; c.height = 40;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, c.width, c.height);
      const cols = palette(x.getImageData(0, 0, c.width, c.height).data);
      chips.innerHTML = cols.map((h) => `<li style="--c:${h}"><i></i><span class="mono">${h.toUpperCase()}</span></li>`).join("");
    }).catch(() => undefined);
  });

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, tx: 0.5, k: 0, on: 0, px: -1, py: -1 };
  let uNow = 0, clock = 0, raf = 0, last = 0, demoing = false;

  /** The print's rectangle on the screen, in px: across the top, as wide as the screen allows at the label's shape. */
  const printRect = (W: number, H: number) => {
    const wide = W / H > 1.05;
    const w = wide ? Math.min(W * 0.8, H * 0.4 * 2.6) : W * 0.92;
    const h = w / 2.6;
    return { x: (W - w) / 2, y: 64 + H * (wide ? 0.07 : 0.05), w, h };
  };
  /** The press sheet at the end: two columns of labels, as large as fits under the closing line. */
  const sheetRect = (i: number, W: number, H: number) => {
    const wide = W / H > 1.05;
    const cols = wide ? 2 : 1, rows = Math.ceil(n / cols);
    const top = 64 + H * (wide ? 0.27 : 0.3), bottom = H * 0.96;
    const gap = wide ? 18 : 10;
    const ch = (bottom - top - gap * (rows - 1)) / rows;
    const cw = Math.min(ch * 2.6, (W * (wide ? 0.78 : 0.9) - gap * (cols - 1)) / cols);
    const hh = cw / 2.6;
    const gw = cols * cw + (cols - 1) * gap, gh = rows * hh + (rows - 1) * gap;
    const x0 = (W - gw) / 2, y0 = top + (bottom - top - gh) / 2;
    return { x: x0 + (i % cols) * (cw + gap), y: y0 + Math.floor(i / cols) * (hh + gap), w: cw, h: hh };
  };

  const apply = (u: number, px: number, pk: number, t: number) => {
    const W = pin.clientWidth, H = pin.clientHeight;
    const pr = printRect(W, H);
    const states = arts.map((_, i) => turn(u, i, n));
    three?.draw({ u, t, spin: (px - 0.5) * 2.2 * pk, states, print: pr, sheet: (i) => sheetRect(i, W, H), W, H });
    const introK = 1 - smooth(0.3, 0.8, u);
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.visibility = introK > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateY(${((1 - introK) * -30).toFixed(1)}px)`; }
    arts.forEach((a, i) => {
      const s = states[i]!;
      const k = smooth(0.94, 1, s.peel) * (1 - smooth(0.0, 0.3, s.away));
      a.style.opacity = k.toFixed(3);
      a.style.visibility = k > 0.001 ? "visible" : "hidden";
      a.style.transform = `translateY(${((1 - k) * 18).toFixed(1)}px)`;
      a.style.setProperty("--top", `${(pr.y + pr.h + 22).toFixed(0)}px`);
    });
    const fin = states[0]?.fin ?? 0;
    if (finale) { finale.style.opacity = smooth(0.5, 1, fin).toFixed(3); finale.style.pointerEvents = fin > 0.9 ? "auto" : "none"; }
    if (marks) {
      marks.style.opacity = smooth(0.7, 1, fin).toFixed(3);
      marks.innerHTML = fin > 0.01 ? arts.map((_, i) => { const r = sheetRect(i, W, H); return `<i style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;width:${r.w.toFixed(1)}px;height:${r.h.toFixed(1)}px"></i>`; }).join("") : "";
    }
    // The loupe: over the print in hand, three times as large.
    if (loupe) {
      const j = states.findIndex((s) => s.show > 0.97);
      const over = j >= 0 && ptr.px >= pr.x && ptr.px <= pr.x + pr.w && ptr.py >= pr.y && ptr.py <= pr.y + pr.h;
      loupe.hidden = !over;
      if (over) {
        const z = 3, size = loupe.offsetWidth || 170;
        const lx = ptr.px - pr.x, ly = ptr.py - pr.y;
        loupe.style.transform = `translate(${(ptr.px - size / 2).toFixed(1)}px, ${(ptr.py - size / 2).toFixed(1)}px)`;
        loupe.style.backgroundImage = `url("${arts[j]!.dataset.label}")`;
        loupe.style.backgroundSize = `${(pr.w * z).toFixed(0)}px ${(pr.h * z).toFixed(0)}px`;
        loupe.style.backgroundPosition = `${(-lx * z + size / 2).toFixed(1)}px ${(-ly * z + size / 2).toFixed(1)}px`;
      }
    }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    const still = reduced.matches;
    uNow += (progress() - uNow) * (still ? 1 : 1 - Math.exp(-dt / 0.12));
    ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt / 0.3));
    ptr.k += ((still ? 0 : ptr.on) - ptr.k) * (1 - Math.exp(-dt / 0.4));
    if (!still) clock += dt;
    apply(uNow, ptr.x, ptr.k, clock);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  const point = (e: PointerEvent) => { const r = pin.getBoundingClientRect(); ptr.px = e.clientX - r.left; ptr.py = e.clientY - r.top; ptr.tx = ptr.px / Math.max(1, r.width); };
  addEventListener("pointermove", (e) => { point(e); ptr.on = e.pointerType === "mouse" || e.buttons ? 1 : 0; }, { passive: true });
  addEventListener("pointerdown", (e) => point(e), { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.on = 0; ptr.px = -1; });
  addEventListener("resize", () => { three?.resize(); apply(uNow, ptr.x, ptr.k, clock); });
  uNow = progress();
  apply(uNow, 0.5, 0, 0);
  if (three) three.loaded.then(() => { apply(uNow, ptr.x, ptr.k, clock); document.body.classList.add("canvas-ready"); });
  else document.body.classList.add("canvas-ready");

  // ------------------------------------------------------------------------------------------------ card recording
  // The pointer turns the row of cans, the first label peels into a print and the loupe crosses it, the rest peel in
  // turn, and the sheet closes it.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const at = (i: number, f: number) => U_INTRO + (i + f) * U_CAN;
    const keys: [number, number][] = [[0, 0], [2.4, 0], [4.0, at(0, 0.75)], [6.4, at(0, 0.75)]];
    let tt = 6.4;
    for (let i = 1; i < n; i++) { tt += 1.0; keys.push([tt, at(i, 0.78)]); tt += 0.8; keys.push([tt, at(i, 0.78)]); }
    keys.push([tt + 1.8, total], [tt + 3.6, total]);
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
      const pr = printRect(W, H);
      let x: number, y: number;
      if (t < 2.4) { x = W * lerp(0.2, 0.8, smoother((t - 0.2) / 2.0)); y = H * 0.72; }
      else if (t < 4.2) { const k = smoother((t - 2.6) / 1.4); x = lerp(W * 0.8, pr.x + pr.w * 0.3, k); y = lerp(H * 0.72, pr.y + pr.h * 0.45, k); }
      else if (t < 6.4) { const k = smoother((t - 4.2) / 2.0); x = pr.x + pr.w * lerp(0.3, 0.62, k); y = pr.y + pr.h * (0.45 + 0.12 * Math.sin(k * 3)); }
      else { const k = smoother((t - 6.4) / 0.8); x = lerp(pr.x + pr.w * 0.62, W * 0.95, k); y = lerp(pr.y + pr.h * 0.5, H * 0.92, k); }
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      ptr.px = x; ptr.py = y;
      apply(uAt(t), x / W, t < 2.6 ? 1 : 0, t);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}

type Rect = { x: number; y: number; w: number; h: number };
type DrawState = { u: number; t: number; spin: number; states: ReturnType<typeof turn>[]; print: Rect; sheet: (i: number) => Rect; W: number; H: number };

function createScene(canvas: HTMLCanvasElement, labels: string[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const FOV = 26, DIST = 30;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, DIST);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-4, 6, 8);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dbdf, metalness: 1, roughness: 0.22 });
  const bare = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.34 });
  const shell = makeShell();
  const tab = makeTab();
  const loader = new THREE.TextureLoader();
  const cans = labels.map((src) => {
    const group = new THREE.Group();
    const foot = new THREE.Mesh(shell.lower, metal);
    const crown = new THREE.Mesh(shell.upper, metal);
    const tabMesh = new THREE.Mesh(tab, metal);
    tabMesh.position.set(0, HEIGHT - 0.075, 0.18);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.995, R * 0.995, BAND, 96, 1, true), bare);
    body.position.y = FOOT + BAND / 2;
    group.add(foot, crown, tabMesh, body);
    scene.add(group);
    const uniforms = {
      uMap: { value: null as THREE.Texture | null }, uPeel: { value: 0 }, uSpin: { value: 0 }, uR: { value: R * 1.003 }, uBand: { value: BAND },
      uLabelY: { value: FOOT + BAND / 2 }, uCan: { value: new THREE.Matrix4() }, uFlat: { value: new THREE.Vector4() }, uKey: { value: new THREE.Vector3(-0.4, 0.6, 0.8) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 200, 1), mat);
    label.frustumCulled = false;
    scene.add(label);
    return { group, label, uniforms, src };
  });
  const loaded = Promise.all(cans.map((c) => new Promise<void>((done) => {
    loader.load(c.src, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); c.uniforms.uMap.value = tex; done(); }, undefined, () => done());
  })));

  let W = 1, H = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  resize();
  // World units on the z = 0 plane per screen pixel, so a rectangle in px becomes one in the scene.
  const worldOf = (r: Rect) => {
    const vh = 2 * DIST * Math.tan((FOV * Math.PI) / 360), s = vh / H;
    return new THREE.Vector4((r.x + r.w / 2 - W / 2) * s, (H / 2 - (r.y + r.h / 2)) * s, r.w * s, r.h * s);
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();

  const draw = (st: DrawState) => {
    const wide = st.W / st.H > 1.05;
    const vh = 2 * DIST * Math.tan((FOV * Math.PI) / 360), vw = vh * (st.W / st.H);
    const N = cans.length;
    // The row: along the bottom, the can in hand lifted and turned to face the camera.
    const scale = wide ? vh * 0.06 : Math.min(vh * 0.045, (vw * 0.88) / N / 2.7);
    const rowY = -vh / 2 + vh * (wide ? 0.115 : 0.1);
    const span = wide ? Math.min(vw * 0.62, N * scale * 3.1) : vw * 0.88 - scale * 2.2;
    cans.forEach((c, i) => {
      const s = st.states[i]!;
      const x = (N === 1 ? 0 : (i / (N - 1) - 0.5) * span);
      const active = smooth(0, 0.15, s.peel) * (1 - s.away);
      const sink = s.fin;
      const sc = scale * (1 + active * 0.12);
      const y = rowY + active * vh * 0.015 - sink * vh * 0.35;
      e.set(0.08, st.spin + Math.sin(st.t * 0.4 + i) * 0.15 * (1 - active), 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y - (HEIGHT / 2) * sc, 0), q, new THREE.Vector3(sc, sc, sc));
      c.group.matrixAutoUpdate = false;
      c.group.matrix.copy(m);
      c.uniforms.uCan.value.copy(m);
      c.uniforms.uSpin.value = 0;
      // Where the print goes: across the top in its turn, lifted off the top after it, and onto the sheet at the end.
      // The print eases up and off the top as its turn ends, rather than jumping there.
      const away = { ...st.print, y: st.print.y - st.H * 1.1 };
      const base = lerpRect(st.print, away, smoother(s.away));
      const r = s.fin > 0 ? lerpRect(base, st.sheet(i), smoother(s.fin)) : base;
      c.uniforms.uFlat.value.copy(worldOf(r));
      // A label already peeled stays peeled: it waits off the top until the sheet brings it back.
      c.uniforms.uPeel.value = Math.max(s.peel, s.fin);
      c.label.visible = true;
    });
    renderer.render(scene, camera);
  };
  return { draw, resize, loaded };
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}
