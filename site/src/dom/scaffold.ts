// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Lift: a scaffolding firm's page whose scaffold goes up on a house front as the page scrolls, in the order a gang puts
// one up: base plates and sole boards, then lift by lift the standards dropped in, ledgers run along, transoms pushed
// across, couplers on, five boards to a lift, guard rails, toe boards and braces up the face. The camera climbs with
// the work while the list of steps names each part as it goes on; then it walks round the finished scaffold and
// hovering any part names it. Tubes wear the library's galvanised tube photograph, the couplers are its coupler cut-out
// and the boards its oak; the house is built in code from its plaster. Every part is one instance of a shared mesh,
// placed each frame as it arrives, with real shadows falling on the wall. Timing and the rig live in scaffold-plan.ts.

import * as THREE from "three";
import { loadImage } from "./img";
import { RIG, arrived, kindAt, marks, rig, stages, totalScreens, U, type Kind, type Part } from "./scaffold-plan";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const backOut = (x: number) => { const t = clamp(x, 0, 1) - 1; return 1 + t * t * (2.2 * t + 1.2); };
const cssv = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function initScaffold() {
  document.querySelectorAll<HTMLElement>("[data-scaffold]").forEach((el) => setup(el, el.classList.contains("hero")));
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".sf-pin")!;
  const cv = root.querySelector<HTMLCanvasElement>(".sf-gl")!;
  const intro = root.querySelector<HTMLElement>(".sf-intro");
  const lines = [...root.querySelectorAll<HTMLElement>(".sf-line")];
  const steps = [...root.querySelectorAll<HTMLElement>(".sf-steps li")];
  const finale = root.querySelector<HTMLElement>(".sf-finale");
  const tag = root.querySelector<HTMLElement>(".sf-tag");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const names: Record<string, string> = JSON.parse(root.dataset.names ?? "{}");
  const art = { tube: root.dataset.tube ?? "", coupler: root.dataset.coupler ?? "", board: root.dataset.board ?? "", wall: root.dataset.wall ?? "", ground: root.dataset.ground ?? "" };
  const total = totalScreens();
  const M = marks();
  root.style.setProperty("--sf-screens", String(total + 1));

  let scene: ReturnType<typeof createScene> | null = null;
  try { scene = createScene(cv, art); } catch (e) { console.warn("Lift: no WebGL", e); }
  if (!scene) { root.classList.add("is-flat"); document.body.classList.add("canvas-ready"); return; }

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const ptr = { x: 0.5, y: 0.5, on: false, px: -1, py: -1 };
  let uNow = 0, raf = 0, last = 0, t = 0, demoing = false, forced = -1;

  const apply = (u: number, time: number) => {
    const S = stages(u);
    const hit = scene!.draw(S, time, ptr, forced);
    if (intro) { intro.style.opacity = S.hero.toFixed(3); intro.style.visibility = S.hero > 0.001 ? "visible" : "hidden"; intro.style.transform = `translateY(${((1 - S.hero) * -24).toFixed(1)}px)`; }
    const spans: [number, number][] = [[M.build0 + U.build * 0.1, M.inspect0 + 0.1], [M.inspect0 + 0.2, M.finale0]];
    lines.forEach((el, j) => {
      const [a, b] = spans[j] ?? [9e9, 9e9];
      const k = smooth(a, a + 0.22, u) * (1 - smooth(b - 0.22, b, u));
      el.style.opacity = k.toFixed(3);
      el.style.visibility = k > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - k) * 18).toFixed(1)}px)`;
    });
    // The steps: the kind going on now is lit, the ones done are ticked.
    const now = kindAt(S.build, scene!.parts);
    const done = new Set(scene!.parts.filter((p) => arrived(p, S.build) >= 1).map((p) => p.kind));
    const pending = new Set(scene!.parts.filter((p) => arrived(p, S.build) < 1).map((p) => p.kind));
    steps.forEach((li) => {
      const kinds = (li.dataset.kinds ?? "").split(" ") as Kind[];
      li.classList.toggle("is-now", kinds.includes(now as Kind));
      li.classList.toggle("is-done", kinds.every((k) => done.has(k) && !pending.has(k)));
    });
    if (tag) {
      if (hit) {
        tag.hidden = false;
        tag.textContent = names[hit.kind] ?? hit.kind;
        tag.style.transform = `translate(${(hit.x + 14).toFixed(0)}px, ${(hit.y - 34).toFixed(0)}px)`;
      } else tag.hidden = true;
    }
    const fk = smooth(M.finale0 - 0.1, M.end - 0.15, u);
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
    ptr.px = e.clientX - r.left; ptr.py = e.clientY - r.top;
    ptr.x = ptr.px / Math.max(1, r.width); ptr.y = ptr.py / Math.max(1, r.height);
    ptr.on = e.pointerType === "mouse";
  }, { passive: true });
  pin.addEventListener("pointerleave", () => { ptr.on = false; ptr.px = -1; });
  addEventListener("resize", () => { scene!.resize(); apply(uNow, t); });
  uNow = progress();
  scene.ready.then(() => { apply(uNow, t); document.body.classList.add("canvas-ready"); });

  // ---------------------------------------------------------------------------------------------- card recording
  // The scaffold goes up, the camera walks round it, and a coupler and a board are named under the pointer.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const keys: [number, number][] = [[0, 0], [1.2, 0], [10.4, M.inspect0], [13.2, M.inspect0 + U.inspect * 0.8], [15, total - 0.1], [16, total - 0.1]];
    const uAt = (time: number) => {
      for (let k = 1; k < keys.length; k++) {
        const [ta, ua] = keys[k - 1]!, [tb, ub] = keys[k]!;
        if (time <= tb) return lerp(ua, ub, (time - ta) / (tb - ta) * 0.4 + smoother((time - ta) / (tb - ta)) * 0.6);
      }
      return keys.at(-1)![1];
    };
    let cursor: SVGSVGElement | null = null;
    const pick = scene.parts.findIndex((p) => p.kind === "coupler" && p.lift === 2 && p.a[2] > 1 && p.a[0] === RIG.bay * 2);
    const pick2 = scene.parts.findIndex((p) => p.kind === "board" && p.lift === 1);
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
      // Place the camera for this instant first, so the part's place on screen is measured from where it now is.
      forced = -1;
      apply(u, time);
      let x = W * 0.95, y = H * 0.94;
      const target = time > 10.6 && time < 12.4 ? pick : time >= 12.4 && time < 14.2 ? pick2 : -1;
      if (target >= 0) {
        const s = scene!.screenOf(target);
        const k = smoother((time - (target === pick ? 10.6 : 12.4)) / 0.6);
        x = lerp(W * 0.95, s.x, k); y = lerp(H * 0.94, s.y, k);
        forced = k > 0.9 ? target : -1;
      }
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

const COUPLER_VERT = /* glsl */ `attribute vec4 iP; varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = iP.xyz + (right * position.x + up * position.y) * iP.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const COUPLER_FRAG = /* glsl */ `uniform sampler2D uMap; varying vec2 vUv;
void main(){ vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb, 1.0); }`;

function createScene(cv: HTMLCanvasElement, art: { tube: string; coupler: string; board: string; wall: string; ground: string }) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const bg = new THREE.Color(cssv("--c-bg", "#eeeeea"));
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 22, 46);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  const W = RIG.bays * RIG.bay;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a5, 1.25));
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
  sun.position.set(W / 2 + 7, 13, 9);
  sun.target.position.set(W / 2, 3, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 10, bottom: -6, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const texOf = (img: HTMLImageElement | HTMLCanvasElement, rep?: [number, number]) => {
    const t = img instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    t.needsUpdate = true;
    return t;
  };

  // ---------------------------------------------------------------- the house, in code
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xece5d8 });
  const house = new THREE.Group();
  scene.add(house);
  const HW = W + 1.2, HH = 9.6, HD = 6;
  const front = new THREE.Mesh(new THREE.BoxGeometry(HW, HH, 0.3), wallMat);
  front.position.set(W / 2, HH / 2, -0.15);
  front.receiveShadow = true; front.castShadow = true;
  const body = new THREE.Mesh(new THREE.BoxGeometry(HW, HH, HD), wallMat);
  body.position.set(W / 2, HH / 2, -HD / 2 - 0.15);
  body.receiveShadow = true;
  house.add(front, body);
  // The roof: a slate gable along the front.
  const roofShape = new THREE.Shape([new THREE.Vector2(-HD / 2 - 0.35, 0), new THREE.Vector2(HD / 2 + 0.35, 0), new THREE.Vector2(0, 3.1)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: HW + 0.5, bevelEnabled: false }), new THREE.MeshLambertMaterial({ color: 0x4a4f55 }));
  roof.rotation.y = -Math.PI / 2;
  roof.position.set(W / 2 + HW / 2 + 0.25, HH, -HD / 2 - 0.15);
  roof.castShadow = true; roof.receiveShadow = true;
  house.add(roof);
  // Windows and a door: dark glass set back in the wall, white frames and sills.
  const glass = new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.18, metalness: 0.35 });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xf7f6f2 });
  const opening = (x: number, y: number, w: number, h: number, door = false) => {
    const g = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), door ? new THREE.MeshLambertMaterial({ color: 0x23395b }) : glass);
    pane.position.set(0, 0, 0.02);
    pane.receiveShadow = true;
    g.add(pane);
    const bar = (bw: number, bh: number, bx: number, by: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), frameMat); m.position.set(bx, by, 0.05); m.castShadow = true; m.receiveShadow = true; g.add(m); };
    bar(w + 0.12, 0.07, 0, h / 2); bar(0.07, h, -w / 2, 0); bar(0.07, h, w / 2, 0);
    if (!door) { bar(w + 0.12, 0.07, 0, -h / 2); bar(0.05, h, 0, 0); bar(w, 0.05, 0, h * 0.12); const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.07, 0.22), frameMat); sill.position.set(0, -h / 2 - 0.05, 0.1); sill.castShadow = true; g.add(sill); }
    g.position.set(x, y, 0);
    house.add(g);
  };
  const cols = [W * 0.18, W * 0.5, W * 0.82];
  [1.25, 4.35, 7.35].forEach((y, f) => cols.forEach((x, i) => { if (f === 0 && i === 1) opening(x, 1.15, 1.1, 2.2, true); else opening(x, y + 0.2, 1.1, 1.55); }));

  // ---------------------------------------------------------------- the yard
  const groundMat = new THREE.MeshLambertMaterial({ color: 0xdedbd3 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, 0, 6);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------------------------------------------------------- the scaffold
  const parts = rig();
  const tubes = parts.map((p, i) => ({ p, i })).filter(({ p }) => ["standard", "ledger", "transom", "rail", "brace"].includes(p.kind));
  const planks = parts.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === "board" || p.kind === "toe");
  const bases = parts.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === "base");
  const fits = parts.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === "coupler");

  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.42, metalness: 0.55 });
  const tubeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1), tubeMat, tubes.length);
  const boardMat = new THREE.MeshLambertMaterial({ color: 0xc8a676 });
  const plankMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boardMat, planks.length);
  const baseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boardMat, bases.length);
  for (const m of [tubeMesh, plankMesh, baseMesh]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  // The couplers: the library's coupler cut-out, always facing the camera, at every junction.
  const cg = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  cg.index = quad.index; cg.setAttribute("position", quad.getAttribute("position")); cg.setAttribute("uv", quad.getAttribute("uv"));
  const iP = new THREE.InstancedBufferAttribute(new Float32Array(fits.length * 4), 4);
  iP.setUsage(THREE.DynamicDrawUsage);
  cg.setAttribute("iP", iP);
  cg.instanceCount = fits.length;
  const blank = new THREE.DataTexture(new Uint8Array([160, 165, 170, 255]), 1, 1);
  blank.needsUpdate = true;
  const couplerMat = new THREE.ShaderMaterial({ vertexShader: COUPLER_VERT, fragmentShader: COUPLER_FRAG, uniforms: { uMap: { value: blank } } });
  const couplerMesh = new THREE.Mesh(cg, couplerMat);
  couplerMesh.frustumCulled = false;
  scene.add(couplerMesh);

  const ready = (async () => {
    const [tube, coupler, board, wall, gr] = await Promise.all([loadImage(art.tube), loadImage(art.coupler), loadImage(art.board), loadImage(art.wall), loadImage(art.ground)]);
    if (tube) {
      // The tube photograph runs along its length; turned on its side it wraps round a cylinder, its length up the tube.
      const c = document.createElement("canvas");
      c.width = tube.height; c.height = Math.min(2048, tube.width);
      const x = c.getContext("2d")!;
      x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(tube, -c.height / 2, -c.width / 2, c.height, c.width);
      tubeMat.map = texOf(c); tubeMat.color.set(0xffffff); tubeMat.metalness = 0.25; tubeMat.needsUpdate = true;
    }
    if (coupler) couplerMat.uniforms.uMap!.value = texOf(coupler);
    if (board) { boardMat.map = texOf(board); boardMat.color.set(0xffffff); boardMat.needsUpdate = true; }
    if (wall) { wallMat.map = texOf(wall, [HW / 2.2, HH / 2.2]); wallMat.needsUpdate = true; }
    if (gr) { groundMat.map = texOf(gr, [80 / 2.5, 80 / 2.5]); groundMat.color.set(0xffffff); groundMat.needsUpdate = true; }
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

  // ---------------------------------------------------------------- placing the parts
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  // Where a part comes from before it is in place: standards drop in, runs slide along the wall, transoms and boards
  // are pushed in from outside, braces swing in from beyond the face.
  const from = (k: Kind) => (k === "standard" ? [0, 2.6, 0] : k === "base" ? [0, 0.8, 0] : k === "ledger" || k === "rail" || k === "toe" ? [-2.6, 0, 0] : k === "transom" || k === "board" ? [0, 0.15, 2.4] : k === "brace" ? [0, 0, 1.6] : [0, 0, 0]);
  const place = (p: Part, b: number) => {
    const k = arrived(p, b);
    const e = p.kind === "standard" || p.kind === "base" ? backOut(k) : smoother(k);
    const o = from(p.kind);
    A.set(...p.a); B.set(...p.b);
    const off = new THREE.Vector3(o[0]! * (1 - e), o[1]! * (1 - e), o[2]! * (1 - e));
    return { k, A: A.clone().add(off), B: B.clone().add(off) };
  };
  const tubeAt = (pa: THREE.Vector3, pb: THREE.Vector3, rad: number, vis: boolean) => {
    D.subVectors(pb, pa);
    const len = D.length();
    q.setFromUnitVectors(Y, D.normalize());
    p3.addVectors(pa, pb).multiplyScalar(0.5);
    s3.set(vis ? rad : 0, vis ? len : 0, vis ? rad : 0);
    return m4.compose(p3, q, s3);
  };
  const plankAt = (pa: THREE.Vector3, pb: THREE.Vector3, w: number, toe: boolean, vis: boolean) => {
    p3.addVectors(pa, pb).multiplyScalar(0.5);
    q.identity();
    const len = pa.distanceTo(pb);
    s3.set(vis ? len : 0, vis ? (toe ? w : 0.04) : 0, vis ? (toe ? 0.03 : w) : 0);
    return m4.compose(p3, q, s3);
  };

  // ---------------------------------------------------------------- the camera
  type View = { az: number; el: number; t: THREE.Vector3; r: number; ox: number; oy: number };
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mix = (a: View, b: View, k: number): View => ({ az: lerp(a.az, b.az, k), el: lerp(a.el, b.el, k), t: a.t.clone().lerp(b.t, k), r: lerp(a.r, b.r, k), ox: lerp(a.ox, b.ox, k), oy: lerp(a.oy, b.oy, k) });
  const placeCam = (v: View) => {
    const vf = (camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = v.r / Math.tan(Math.min(vf, hf) / 2);
    camera.position.set(v.t.x + Math.sin(v.az) * Math.cos(v.el) * dist, v.t.y + Math.sin(v.el) * dist, v.t.z + Math.cos(v.az) * Math.cos(v.el) * dist);
    camera.lookAt(v.t);
    camera.setViewOffset(cw, ch, -v.ox * cw, -v.oy * ch, cw, ch);
    camera.updateProjectionMatrix();
    // The yard fades into the page some way beyond the house, however far back a narrow screen stands the camera.
    const fog = scene.fog as THREE.Fog;
    fog.near = dist + 6; fog.far = dist + 30;
  };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const v = new THREE.Vector3();

  const draw = (S: Stages, _time: number, ptr: Ptr, forced: number) => {
    const b = S.build;
    // The camera: the house front at rest, climbing with the work while it goes up, then walking round it.
    const hero: View = { az: 0.55, el: 0.14, t: V3(W / 2, 5.4, 0.4), r: wide ? 7.6 : 5.4, ox: wide ? 0.17 : 0, oy: wide ? 0 : 0.16 };
    const work: View = { az: lerp(0.5, -0.3, smoother(b)), el: lerp(0.1, 0.3, b), t: V3(W / 2 + lerp(-1.2, 1.2, b), 1.6 + b * 6.2, 0.9), r: wide ? 4.0 : 3.4, ox: wide ? 0.16 : 0, oy: wide ? 0 : 0.14 };
    const round: View = { az: lerp(-0.3, 0.95, S.inspect), el: lerp(0.3, 0.2, S.inspect), t: V3(W / 2, 4.6, 0.8), r: wide ? 5.6 : 5.0, ox: wide ? 0.16 : 0, oy: wide ? 0 : 0.14 };
    const back: View = { az: 0.42, el: 0.28, t: V3(W / 2, 5.2, 0), r: wide ? 7.2 : 5.6, ox: 0, oy: wide ? -0.06 : -0.1 };
    let view = mix(hero, work, smooth(0, 0.08, b) * (1 - S.inspect));
    if (S.inspect > 0) view = mix(view, round, smoother(clamp(S.inspect * 1.5, 0, 1)));
    view = mix(view, back, smoother(S.finale));
    if (ptr.on) { view.az += (ptr.x - 0.5) * 0.12; view.el += (0.5 - ptr.y) * 0.05; }
    placeCam(view);

    tubes.forEach(({ p }, j) => { const r = place(p, b); tubeMesh.setMatrixAt(j, tubeAt(r.A, r.B, RIG.tube, r.k > 0)); });
    planks.forEach(({ p }, j) => { const r = place(p, b); plankMesh.setMatrixAt(j, plankAt(r.A, r.B, p.w ?? 0.22, p.kind === "toe", r.k > 0)); });
    bases.forEach(({ p }, j) => {
      const r = place(p, b);
      p3.copy(r.A).add(V3(0, 0.02, 0)); q.identity(); s3.set(r.k > 0 ? 0.24 : 0, r.k > 0 ? 0.04 : 0, r.k > 0 ? 0.6 : 0);
      baseMesh.setMatrixAt(j, m4.compose(p3, q, s3));
    });
    fits.forEach(({ p }, j) => {
      const k = arrived(p, b);
      const pop = k <= 0 ? 0 : backOut(k);
      // A coupler sits just proud of its junction, towards the viewer.
      iP.setXYZW(j, p.a[0], p.a[1], p.a[2] + 0.05, 0.2 * pop);
    });
    tubeMesh.instanceMatrix.needsUpdate = plankMesh.instanceMatrix.needsUpdate = baseMesh.instanceMatrix.needsUpdate = true;
    iP.needsUpdate = true;

    // Naming a part under the pointer, once the scaffold is up.
    let hit: { kind: Kind; x: number; y: number } | null = null;
    if (forced >= 0) {
      const sp = screenOf(forced);
      hit = { kind: parts[forced]!.kind, x: sp.x, y: sp.y };
    } else if (b >= 1 && ptr.px >= 0) {
      ndc.set((ptr.px / cw) * 2 - 1, -(ptr.py / ch) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects([tubeMesh, plankMesh, baseMesh], false);
      const h0 = hits[0];
      if (h0 && h0.instanceId != null) {
        const list = h0.object === tubeMesh ? tubes : h0.object === plankMesh ? planks : bases;
        const part = list[h0.instanceId]?.p;
        // A tube near a junction is named as its coupler.
        let kind: Kind | undefined = part?.kind;
        if (part) for (const f of fits) if (h0.point.distanceTo(V3(...f.p.a)) < 0.16) kind = "coupler";
        if (kind) hit = { kind, x: ptr.px, y: ptr.py };
      }
    }
    renderer.render(scene, camera);
    return hit;
  };

  /** Where part i is on screen now, for the card's pointer. */
  const screenOf = (i: number) => {
    const p = parts[i];
    if (!p) return { x: cw / 2, y: ch / 2 };
    v.set((p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2 + (p.kind === "coupler" ? 0.05 : 0)).project(camera);
    return { x: (v.x * 0.5 + 0.5) * cw, y: (-v.y * 0.5 + 0.5) * ch };
  };

  return { draw, resize, ready, parts, screenOf };
}
