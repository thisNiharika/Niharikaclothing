// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Sprint: a running kit's range as a race the scroll runs. One piece of kit hangs mid-stride over a running track with
// speed lines streaming past it; scrolling is the run, the track and the lines rushing by while the rest of the range
// comes up from behind and overtakes one at a time, each smeared along its own speed with its colours split, its name
// thrown up huge behind it. Then the camera stands over the finish line and every piece crosses it while a slit camera
// builds the photo-finish print out of the one column of pixels on the line, a column a step, as a real one does: the
// still track becomes horizontal streaks and each piece is drawn by how fast it went through. The print ends the film,
// every lane named. Timing and the race live in sprint-plan.ts.

import * as THREE from "three";
import { loadImage } from "./img";
import { FINISH, TRACK, finishAt, marks, runAt, stages, totalScreens, U } from "./sprint-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const cssv = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

type Runner = { name: string; line: string; front: string; back: string };

export function initSprint() {
  document.querySelectorAll<HTMLElement>("[data-sprint]").forEach((el) => setup(el, el.classList.contains("hero")));
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".sp-pin")!;
  const cv = root.querySelector<HTMLCanvasElement>(".sp-gl")!;
  const intro = root.querySelector<HTMLElement>(".sp-intro");
  const lines = [...root.querySelectorAll<HTMLElement>(".sp-line")];
  const callout = root.querySelector<HTMLElement>(".sp-callout");
  const finale = root.querySelector<HTMLElement>(".sp-finale");
  const lanes = [...root.querySelectorAll<HTMLElement>(".sp-lanes li")];
  const ticks = root.querySelector<HTMLElement>(".sp-ticks");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const runners: Runner[] = [...root.querySelectorAll<HTMLElement>(".sp-item")].map((el) => ({
    name: el.dataset.name ?? "", line: el.dataset.line ?? "", front: el.dataset.front ?? "", back: el.dataset.back ?? "",
  }));
  const n = runners.length;
  const total = totalScreens(n);
  const M = marks(n);
  root.style.setProperty("--sp-screens", String(total + 1));

  let scene: ReturnType<typeof createScene> | null = null;
  try { scene = createScene(cv, runners); } catch (e) { console.warn("Sprint: no WebGL", e); }
  if (!scene) { root.classList.add("is-flat"); document.body.classList.add("canvas-ready"); return; }

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, y: 0.5, on: false };
  let uNow = 0, raf = 0, last = 0, t = 0, demoing = false, shown = -1;

  const apply = (u: number, time: number) => {
    const S = stages(u, n);
    const out = scene!.draw(u, S, time, ptr);
    const introK = S.hero;
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.visibility = introK > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateX(${((1 - introK) * -40).toFixed(1)}px)`; }
    const spans: [number, number][] = [[M.run0 + U.pass * 0.4, M.finish0 - U.hold * 0.3], [M.finish0 + U.finish * 0.12, M.print0 - U.finish * 0.04]];
    lines.forEach((el, j) => {
      const [a, b] = spans[j] ?? [9e9, 9e9];
      const k = smooth(a, a + 0.22, u) * (1 - smooth(b - 0.22, b, u));
      el.style.opacity = k.toFixed(3);
      el.style.visibility = k > 0.001 ? "visible" : "hidden";
    });
    // The name of whoever is overtaking, thrown up huge behind them.
    let who = -1, ck = 0;
    for (let i = 1; i < n; i++) { const p = S.pass(i); const k = smooth(0.12, 0.4, p) * (1 - smooth(0.8, 1, p)); if (k > ck) { ck = k; who = i; } }
    if (callout) {
      if (who !== shown && who >= 0) { callout.textContent = runners[who]!.name; shown = who; }
      callout.style.opacity = (ck * (1 - S.toLine)).toFixed(3);
      callout.style.transform = `translate(-50%, -50%) translateX(${((0.5 - (who >= 0 ? S.pass(who) : 0.5)) * 30).toFixed(1)}vw) skewX(-12deg)`;
    }
    // The print's lanes, named at their own rows, and the tick marks along its top.
    const pk = smooth(0.35, 1, S.print);
    lanes.forEach((li, i) => {
      const row = out.rows[i];
      li.style.opacity = (pk * (row ? 1 : 0)).toFixed(3);
      if (row) li.style.transform = `translateY(${row.toFixed(1)}px)`;
    });
    if (ticks) ticks.style.opacity = (smooth(0.0, 0.3, S.slit) * (1 - smooth(0, 0.25, S.print))).toFixed(3);
    const fk = smooth(M.print0 + U.print * 0.35, M.end - 0.1, u);
    if (finale) { finale.style.opacity = fk.toFixed(3); finale.style.visibility = fk > 0.001 ? "visible" : "hidden"; finale.style.pointerEvents = fk > 0.8 ? "auto" : "none"; }
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    uNow += (progress() - uNow) * (reduced.matches ? 1 : 1 - Math.exp(-dt / 0.12));
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
  // The pointer pushes the pace, then the run, the overtakes, the finish and the print.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const keys: [number, number][] = [[0, 0], [1.6, 0], [7.2, M.finish0], [12.6, M.print0], [14.2, total - 0.1], [16, total - 0.1]];
    const uAt = (time: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [ta, ua] = keys[k - 1]!, [tb, ub] = keys[k]!;
        if (time <= tb) return lerp(ua, ub, (time - ta) / (tb - ta) * 0.5 + smoother((time - ta) / (tb - ta)) * 0.5);
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
      const x = time < 1.8 ? lerp(W * 0.5, W * 0.9, k) : W * 0.95;
      const y = time < 1.8 ? lerp(H * 0.75, H * 0.55, k) : H * 0.94;
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

const TRACK_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TRACK_FRAG = /* glsl */ `uniform float uDist; uniform float uLane; uniform float uLanes; uniform float uFinish; uniform vec3 uGround; uniform vec3 uLine; uniform vec3 uAccent; uniform vec3 uFog; uniform vec3 uCam;
varying vec3 vW;
float band(float x, float w){ return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(x) * 1.2, abs(x)); }
void main(){
  float lz = -vW.z / uLane + 0.5;
  float inTrack = step(0.0, lz) * step(lz, uLanes);
  vec3 col = uGround * (0.9 + 0.1 * mod(floor(lz), 2.0));
  // Grain in the rubber, carried along with the run.
  float g = fract(sin(dot(floor(vec2(vW.x + uDist, vW.z) * 60.0), vec2(12.9898, 78.233))) * 43758.5453);
  col *= 0.94 + 0.08 * g;
  // Lane lines, and short marks across each lane every few metres, both carried by the run.
  float edge = band(abs(fract(lz + 0.5) - 0.5), 0.035 / uLane);
  float marksX = band(fract((vW.x + uDist) / 3.0) - 0.5, 0.05) * band(fract(lz) - 0.5, 0.25);
  col = mix(col, uLine, inTrack * max(edge, marksX * 0.35));
  // The finish line: a wide white band across every lane, with the accent along its leading edge.
  float fx = vW.x - uFinish;
  col = mix(col, uLine, inTrack * band(fx, 0.14));
  col = mix(col, uAccent, inTrack * band(fx - 0.11, 0.035));
  col = mix(col, uGround * 0.6, 1.0 - inTrack);
  float d = length(vW - uCam);
  col = mix(col, uFog, smoothstep(9.0, 26.0, d));
  gl_FragColor = vec4(col, 1.0);
}`;

const STREAK_VERT = /* glsl */ `attribute vec4 iA; uniform float uDist; uniform float uSpeed; uniform float uSpan;
varying float vA; varying float vX;
void main(){
  float len = 0.15 + uSpeed * uSpeed * 2.6 * (0.5 + iA.w);
  float x = mod(iA.x * uSpan - uDist * (0.8 + iA.w * 0.6), uSpan) - uSpan * 0.5;
  vec3 p = vec3(x + position.x * len, iA.y, iA.z);
  p.y += position.y * 0.012;
  vA = (0.25 + 0.75 * iA.w) * smoothstep(0.1, 0.6, uSpeed);
  vX = position.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const STREAK_FRAG = /* glsl */ `uniform vec3 uColor; varying float vA; varying float vX;
void main(){ gl_FragColor = vec4(uColor, vA * smoothstep(-0.5, 0.5, vX) * 0.55); }`;

// A piece of kit: its photograph on a card that reaches back behind it, so its smear can be drawn there. The smear
// averages the picture along its direction of travel, the colours pulled a little apart, fading towards the tail.
const KIT_VERT = /* glsl */ `uniform float uTail; varying vec2 vUv;
void main(){ vUv = vec2(mix(-uTail, 1.0, uv.x), uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const KIT_FRAG = /* glsl */ `uniform sampler2D uMap; uniform sampler2D uBack; uniform float uFlip; uniform float uSmear; uniform float uSplit; uniform float uFade;
varying vec2 vUv;
vec4 pic(vec2 uv){
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return uFlip > 0.5 ? texture2D(uBack, vec2(1.0 - uv.x, uv.y)) : texture2D(uMap, uv);
}
void main(){
  vec4 acc = vec4(0.0); float wsum = 0.0; float amax = 0.0;
  for (int k = 0; k < 14; k++) {
    float f = float(k) / 13.0;
    float w = 1.0 - f * 0.85;
    vec2 o = vec2(f * uSmear, 0.0);
    vec4 c = pic(vUv + o);
    float r = pic(vUv + o * (1.0 + uSplit)).r;
    float b = pic(vUv + o * (1.0 - uSplit) - vec2(uSplit * 0.02, 0.0)).b;
    c.rgb = vec3(mix(c.r, r, 0.8), c.g, mix(c.b, b, 0.8));
    acc += vec4(c.rgb * c.a, c.a) * w; wsum += w; amax = max(amax, c.a * w);
  }
  vec4 sharp = pic(vUv);
  float a = uSmear > 0.002 ? max(sharp.a, amax * 0.75) : sharp.a;
  vec3 rgb = uSmear > 0.002 ? mix(acc.rgb / max(acc.a, 0.0001), sharp.rgb, sharp.a * (1.0 - smoothstep(0.0, 0.2, uSmear))) : sharp.rgb;
  a *= uFade;
  if (a < 0.02) discard;
  gl_FragColor = vec4(rgb, a);
}`;

const PRINT_FRAG = /* glsl */ `uniform sampler2D uSrc; uniform float uOn; uniform vec4 uRect; uniform vec3 uBg; varying vec2 vUv;
void main(){
  vec4 c = texture2D(uSrc, vUv);
  // A thin paper edge, as a print has.
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  gl_FragColor = vec4(mix(uBg, c.rgb, smoothstep(0.0, 0.004, e)), uOn);
}`;

function createScene(cv: HTMLCanvasElement, runners: Runner[]) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const hex = (h: string) => { const c = new THREE.Color(h); const o = new THREE.Color(); c.getRGB(o, THREE.SRGBColorSpace); return new THREE.Vector3(o.r, o.g, o.b); };
  const bgHex = cssv("--c-bg", "#0e0f11");
  scene.background = new THREE.Color(bgHex);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const n = runners.length;
  const L = TRACK.LANE;

  // ---------------------------------------------------------------- the track
  const trackMat = new THREE.ShaderMaterial({
    vertexShader: TRACK_VERT, fragmentShader: TRACK_FRAG,
    uniforms: {
      uDist: { value: 0 }, uLane: { value: L }, uLanes: { value: n }, uFinish: { value: 999 },
      uGround: { value: hex(cssv("--c-surface", "#1b1d21")) }, uLine: { value: hex("#f2f2ee") }, uAccent: { value: hex(cssv("--c-accent", "#c8ff2e")) },
      uFog: { value: hex(bgHex) }, uCam: { value: new THREE.Vector3() },
    },
  });
  const track = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), trackMat);
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0, -20);
  scene.add(track);

  // ---------------------------------------------------------------- speed lines
  const STREAKS = 220;
  const sg = new THREE.InstancedBufferGeometry();
  const sbase = new THREE.PlaneGeometry(1, 1);
  sg.index = sbase.index; sg.setAttribute("position", sbase.getAttribute("position"));
  const sa = new Float32Array(STREAKS * 4);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < STREAKS; i++) sa.set([rnd(), 0.15 + rnd() * 2.6, -rnd() * L * n - 0.4 + 1.2, rnd()], i * 4);
  sg.setAttribute("iA", new THREE.InstancedBufferAttribute(sa, 4));
  sg.instanceCount = STREAKS;
  const streakMat = new THREE.ShaderMaterial({ vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uDist: { value: 0 }, uSpeed: { value: 0 }, uSpan: { value: 40 }, uColor: { value: hex("#f2f2ee") } } });
  const streaks = new THREE.Mesh(sg, streakMat);
  streaks.frustumCulled = false;
  scene.add(streaks);

  // ---------------------------------------------------------------- the kit
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const TAIL = 1.6;
  const kitGeo = new THREE.PlaneGeometry(1 + TAIL, 1);
  kitGeo.translate(-TAIL / 2, 0, 0);
  type Kit = { g: THREE.Group; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; shadow: THREE.Mesh; lastX: number; smear: number };
  const shadowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!; const g = x.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, "rgba(0,0,0,0.6)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const kits: Kit[] = runners.map((_, i) => {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ vertexShader: KIT_VERT, fragmentShader: KIT_FRAG, transparent: true, depthWrite: false,
      uniforms: { uMap: { value: blank }, uBack: { value: blank }, uFlip: { value: 0 }, uSmear: { value: 0 }, uSplit: { value: 0 }, uFade: { value: 1 }, uTail: { value: TAIL } } });
    const mesh = new THREE.Mesh(kitGeo, mat);
    mesh.scale.setScalar(TRACK.SIZE);
    mesh.position.y = TRACK.SIZE / 2 + 0.12;
    mesh.renderOrder = 10 + (n - i);
    g.add(mesh);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    g.add(shadow);
    g.position.z = -i * L;
    scene.add(g);
    return { g, mesh, shadow, lastX: 0, smear: 0 };
  });

  const ready = (async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    await Promise.all(runners.map(async (r, i) => {
      const [f, b] = await Promise.all([loadImage(r.front), loadImage(r.back)]);
      const tex = (img: HTMLImageElement) => { const t = new THREE.Texture(img); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };
      const u = kits[i]!.mesh.material.uniforms;
      if (f) u.uMap!.value = tex(f);
      if (b) u.uBack!.value = tex(b);
    }));
  })();

  // ---------------------------------------------------------------- the slit camera and the print
  // One print column per screen pixel or so, so the print keeps the proportions the line camera saw.
  let HIST_W = 900;
  let rtHist = new THREE.WebGLRenderTarget(HIST_W, 4);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const slitCam = new THREE.PerspectiveCamera();
  const printMat = new THREE.ShaderMaterial({ vertexShader: `uniform vec4 uRect; varying vec2 vUv; void main(){ vUv = uv; vec2 p = uRect.xy + uv * uRect.zw; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`, fragmentShader: PRINT_FRAG,
    uniforms: { uSrc: { value: rtHist.texture }, uOn: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uBg: { value: hex("#f2f2ee") } }, transparent: true, depthTest: false, depthWrite: false });
  const printScene = new THREE.Scene(); printScene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), printMat));
  // The ground as geometry rather than a clear: a backdrop far behind the track for the scene, and a quad for a fresh
  // print, both writing the ground's colour raw.
  const groundMat = new THREE.ShaderMaterial({ vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: `uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`, uniforms: { uC: { value: hex(bgHex) } } });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), groundMat);
  backdrop.position.set(0, 0, -60);
  scene.add(backdrop);
  const fillScene = new THREE.Scene();
  fillScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`, fragmentShader: `uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`, uniforms: { uC: { value: hex(bgHex) } }, depthTest: false, depthWrite: false })));
  let written = -1;

  let cw = 1, ch = 1, wide = true;
  const resize = () => {
    const rect = cv.getBoundingClientRect();
    cw = Math.max(1, rect.width); ch = Math.max(1, rect.height);
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    wide = cw / ch > 1.05;
    const lh = Math.round(Math.min(720, ch));
    HIST_W = Math.round(clamp(cw, 360, 900));
    rtHist.dispose();
    rtHist = new THREE.WebGLRenderTarget(HIST_W, lh, { depthBuffer: true });
    rtHist.texture.colorSpace = THREE.SRGBColorSpace;
    printMat.uniforms.uSrc!.value = rtHist.texture;
    written = -1;
  };
  resize();

  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const camAt = (p: THREE.Vector3, t: THREE.Vector3, ox: number, oy: number) => {
    camera.position.copy(p); camera.lookAt(t);
    camera.setViewOffset(cw, ch, -ox * cw, -oy * ch, cw, ch);
    camera.updateProjectionMatrix();
  };
  const v = new THREE.Vector3();
  let dist = 0, lastTime = 0, lastU = 0;

  const draw = (u: number, S: Stages, time: number, ptr: Ptr) => {
    const dt = clamp(time - lastTime, 0, 0.1); lastTime = time;
    // The run: distance comes from the scroll while running, plus an idle jog in the hero, plus the pointer's push.
    const push = ptr.on ? clamp((ptr.x - 0.4) * 1.6, 0, 1) * S.hero : 0;
    const speed = S.speed + push * 0.6;
    dist += Math.max(0, u - lastU) * 14 + dt * (0.6 + push * 4) * S.hero;
    lastU = u;
    const atLine = S.toLine;
    // Before the line, the camera runs with the pack; at the line it stands over it, side on, as the slit camera does.
    // The camera runs with the hero's piece, then rises and pulls back so the lanes open out one above the other.
    const rise = smooth(0, 0.35, S.run);
    const runP = V3(lerp(0.3, -0.4, S.run) + (wide ? 0 : 0.8 * rise), lerp(1.35, 4.4, rise), lerp(5.4, 10.5, rise) + (wide ? 0 : lerp(4, 2.5, rise)));
    const runT = V3(lerp(0.6, 0.2, S.run), lerp(1.2, 0.4, rise), lerp(0, -3.8, rise));
    const lineP = V3(0, 5.2, 9.8 + (wide ? 0 : 4));
    const lineT = V3(0, 0.6, -(n - 1) * L * 0.5);
    const p = runP.lerp(lineP, smoother(atLine));
    const t = runT.lerp(lineT, smoother(atLine));
    // A little camera shake at pace, and a lean towards the pointer in the hero.
    const shake = (speed - 0.35) * 0.02 * (1 - atLine);
    p.x += Math.sin(time * 23) * shake + (ptr.on ? (ptr.x - 0.5) * 0.4 * S.hero : 0);
    p.y += Math.cos(time * 19) * shake;
    camAt(p, t, wide ? lerp(0.12, 0, Math.max(1 - S.hero, atLine)) : 0, wide ? 0 : lerp(0.1, 0, atLine));

    trackMat.uniforms.uDist!.value = dist;
    trackMat.uniforms.uCam!.value.copy(camera.position);
    // The line is painted just short of the slit, so the slit sees dark track and the print's ground is dark.
    trackMat.uniforms.uFinish!.value = atLine > 0.01 ? -0.16 : 999;
    streakMat.uniforms.uDist!.value = dist * 1.1;
    streakMat.uniforms.uSpeed!.value = speed * (1 - atLine * 0.6);

    // The kit: in the run, each overtaking in turn; at the line, each crossing at its own moment.
    kits.forEach((k, i) => {
      const r = runAt(i, n, S.pass(i), S.run);
      const runX = r.x;
      const lineX = finishAt(i, n, S.slit);
      const x = lerp(runX, lineX, smoother(atLine));
      const vel = lerp(r.v * 0.08 + (i === 0 ? push * 0.35 : 0), FINISH.SPEED * 0.012, atLine);
      k.g.position.x = x;
      // The stride: a quick bob, each to its own rhythm.
      const bob = Math.abs(Math.sin(time * (7 + i * 0.4) + i)) * 0.05 * speed;
      k.mesh.position.y = TRACK.SIZE / 2 + 0.12 + bob;
      k.mesh.rotation.z = -0.04 * speed;
      const smear = clamp(vel * 0.9 + (speed - 0.35) * 0.08, 0, TAIL * 0.85);
      k.smear = lerp(k.smear, smear, 0.25);
      const u2 = k.mesh.material.uniforms;
      u2.uSmear!.value = k.smear;
      u2.uSplit!.value = clamp(k.smear * 0.6, 0, 0.35);
      // Only the hero's piece in the hero; the rest come in as they overtake.
      const visible = i === 0 || S.pass(i) > 0.001 || atLine > 0.01;
      u2.uFade!.value = visible ? 1 : 0;
      k.g.visible = visible;
      k.shadow.scale.x = 1 + k.smear;
      k.lastX = x;
    });

    // The slit camera: once everyone is lined up, each new column of the print is the one column of pixels on the line
    // at its own moment. The field is placed for that instant, every piece sharp (the exposure is a single column, so
    // the shape speed draws is all there is), and only that column is rendered, straight into the print.
    const rows: (number | null)[] = kits.map(() => null);
    if (S.slit > 0 && atLine > 0.999) {
      const col = Math.min(HIST_W - 1, Math.floor(S.slit * HIST_W));
      const from = Math.max(0, written + 1), to = Math.min(col, from + 360);
      if (to >= from) {
        v.set(0, 0, 0).project(camera);
        const slitPx = Math.round((v.x * 0.5 + 0.5) * cw);
        slitCam.copy(camera);
        slitCam.setViewOffset(cw, ch, slitPx, 0, 1, ch);
        slitCam.updateProjectionMatrix();
        streaks.visible = false;
        for (const k of kits) { k.mesh.material.uniforms.uSmear!.value = 0; k.mesh.material.uniforms.uSplit!.value = 0; }
        // Drawing by hand, three leaves the background to the clear, so the clear is the page's ground.
        // A fresh print starts as the ground, drawn the same raw way as everything else on it.
        if (from === 0) { rtHist.scissorTest = false; rtHist.viewport.set(0, 0, HIST_W, rtHist.height); renderer.setRenderTarget(rtHist); renderer.autoClear = false; renderer.render(fillScene, ortho); }
        renderer.autoClear = false;
        for (let c = from; c <= to; c++) {
          const at = (c + 0.5) / HIST_W;
          kits.forEach((k, i) => { k.g.position.x = finishAt(i, n, at); });
          rtHist.viewport.set(HIST_W - 1 - c, 0, 1, rtHist.height);
          rtHist.scissor.set(HIST_W - 1 - c, 0, 1, rtHist.height);
          rtHist.scissorTest = true;
          renderer.setRenderTarget(rtHist);
          renderer.clearDepth();
          renderer.render(scene, slitCam);
        }
        renderer.autoClear = true;
        renderer.setRenderTarget(null);
        streaks.visible = true;
        // Back to this instant for the screen.
        kits.forEach((k, i) => { k.g.position.x = finishAt(i, n, S.slit); k.mesh.material.uniforms.uSmear!.value = k.smear; k.mesh.material.uniforms.uSplit!.value = clamp(k.smear * 0.6, 0, 0.35); });
        written = to;
      }
    } else if (S.slit <= 0) written = -1;

    renderer.render(scene, camera);
    // The print: a strip across the foot of the screen while it is written, then the whole screen.
    const pk = smoother(S.print);
    const stripH = wide ? 0.3 : 0.24;
    const rect = printMat.uniforms.uRect!.value as THREE.Vector4;
    rect.set(lerp(0.04, 0, pk), lerp(0.05, 0, pk), lerp(0.92, 1, pk), lerp(stripH, 1, pk));
    printMat.uniforms.uOn!.value = smooth(0, 0.08, S.slit) * (written >= 0 ? 1 : 0);
    if ((printMat.uniforms.uOn!.value as number) > 0) {
      renderer.autoClear = false;
      renderer.render(printScene, ortho);
      renderer.autoClear = true;
      // Each lane's row on the print, for its name: the lane's middle, as the line camera saw it.
      kits.forEach((_, i) => {
        v.set(0, TRACK.SIZE * 0.55, -i * L).project(camera);
        const fy = 1 - (v.y * 0.5 + 0.5);
        rows[i] = (1 - (rect.y + rect.w * (1 - fy))) * ch;
      });
    }
    return { rows };
  };

  return { draw, resize, ready };
}
