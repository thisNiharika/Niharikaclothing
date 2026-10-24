// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// Sundial: a range standing on a stone shelf against a plaster wall, lit through a window, and the day running as the
// page scrolls. Everything is drawn in one full-screen shader from the products' own photographs (whole canvases at
// one scale, kept in a texture array):
//   - the wall and the shelf, in the room's light for the hour;
//   - the patch of sun through the window (four panes, with leaves outside dappling it and stirring slowly);
//   - each product's shadow on the wall: its silhouette moved by the sun's direction and softened with distance, and
//     tinted with the product's own colour where it is glass, so a blue bottle throws blue light;
//   - the products, lit by the sun where the window's light reaches them, and by a lamp after dark.
// Scrolling runs the clock from dawn to night; each step of the routine brings its product forward into the light
// with its own instructions, morning then evening. The pointer moves the sun a little. A timeline of the day jumps
// to any step. Hovering, focusing or tapping a product runs the day to that product's own time and brings it forward,
// with the time large at the top centre. The card recorder drives it (window.__hoverDemo).

import { loadImage } from "./img";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x: number) => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Screens of scroll from the opening to the first step, between steps, and from the last step to the night. */
export const U_OPEN = 1.1, U_STEP = 0.85, U_END = 1.4;

type Key = { h: number; sun: string; k: number; amb: string; lamp: number; ink: number };
/** The light through the day: the sun's colour and strength, the room's ambient colour, the lamp, and the copy's ink
 *  (0 dark on a light room, 1 light on a dark one). */
export const DAY: Key[] = [
  { h: 6.0, sun: "#ffad8a", k: 0.75, amb: "#cfc3bd", lamp: 0, ink: 0 },
  { h: 7.5, sun: "#ffd9b4", k: 1.0, amb: "#e2d8cd", lamp: 0, ink: 0 },
  { h: 10, sun: "#fff0d8", k: 1.0, amb: "#e9e2d7", lamp: 0, ink: 0 },
  { h: 13, sun: "#fff8ec", k: 0.85, amb: "#ece6dc", lamp: 0, ink: 0 },
  { h: 17.5, sun: "#ffc68a", k: 1.0, amb: "#e4d4c1", lamp: 0, ink: 0 },
  { h: 19.6, sun: "#ff8c5e", k: 0.85, amb: "#c9b0a2", lamp: 0.2, ink: 0 },
  { h: 20.4, sun: "#ff7a5a", k: 0.2, amb: "#5d5d68", lamp: 0.85, ink: 1 },
  { h: 23.5, sun: "#ff7a5a", k: 0.0, amb: "#2c303c", lamp: 1, ink: 1 },
];

const hexRgb = (h: string) => { const v = parseInt(h.replace("#", ""), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };

/** The light at an hour, blended between the keys either side. */
export function lightAt(h: number) {
  let a = DAY[0]!, b = DAY[DAY.length - 1]!;
  for (let i = 1; i < DAY.length; i++) if (h <= DAY[i]!.h) { a = DAY[i - 1]!; b = DAY[i]!; break; }
  const t = h <= a.h ? 0 : h >= b.h ? 1 : smooth(0, 1, (h - a.h) / (b.h - a.h));
  const ca = hexRgb(a.sun), cb = hexRgb(b.sun), aa = hexRgb(a.amb), ab = hexRgb(b.amb);
  return { sun: [0, 1, 2].map((i) => lerp(ca[i]!, cb[i]!, t)), k: lerp(a.k, b.k, t), amb: [0, 1, 2].map((i) => lerp(aa[i]!, ab[i]!, t)), lamp: lerp(a.lamp, b.lamp, t), ink: lerp(a.ink, b.ink, t) };
}

/** The sun's direction at an hour (towards the sun: x to the right, y up, z out of the wall), and a nudge from the
 *  pointer. It rises on the left and sets on the right, highest at half past one. */
export function sunAt(h: number, nudge = 0) {
  const f = clamp((h - 6.2) / 14.2, 0, 1);
  const az = lerp(-1.05, 1.05, f) + nudge;
  const el = 0.12 + Math.sin(f * Math.PI) * 0.72;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

/** The hour at scroll position u, through the opening, each step's hour and the night. */
export function hourAt(u: number, hours: number[]) {
  const keys: [number, number][] = [[0, 6.4]];
  hours.forEach((h, j) => keys.push([U_OPEN + j * U_STEP, h]));
  const last = U_OPEN + (hours.length - 1) * U_STEP;
  keys.push([last + U_END * 0.55, 21.9], [last + U_END, 22.6]);
  if (u <= 0) return keys[0]![1];
  for (let k = 1; k < keys.length; k++) {
    const [ua, ha] = keys[k - 1]!, [ub, hb] = keys[k]!;
    if (u <= ub) return lerp(ha, hb, smooth(0, 1, (u - ua) / (ub - ua)));
  }
  return keys.at(-1)![1];
}

export function totalScreens(steps: number) {
  return U_OPEN + (steps - 1) * U_STEP + U_END;
}

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
out vec4 o;
uniform vec2 uRes;
uniform float uDpr, uT;
uniform sampler2DArray uTex;
uniform int uN;
uniform vec4 uRect[8];   // product canvas on the screen: x, y, w, h (css px, y down)
uniform vec4 uInfo[8];   // glass, dim, lift, foot (0..1 down the canvas)
uniform vec3 uL;         // towards the sun
uniform vec3 uSun, uAmb;
uniform float uSunK, uLamp;
uniform vec2 uLampP;
uniform float uShelf, uDepth;
uniform vec4 uWin;       // the window's patch on the wall when the sun is straight out: centre x, y, w, h

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

vec2 sunShift() { return uDepth * vec2(-uL.x / max(uL.z, 0.25), min(uL.y / max(uL.z, 0.25), 1.6)); }

// Sun through the window onto a plane: four panes, soft edges, and leaves outside.
float windowLight(vec2 p, vec2 shift, float pen) {
  vec2 c = uWin.xy + shift * 2.0;
  vec2 d = abs(p - c) - uWin.zw * 0.5;
  float inside = 1.0 - smoothstep(-pen, pen, max(d.x, d.y));
  vec2 q = p - c;
  float bar = max(1.0 - smoothstep(uWin.z * 0.012, uWin.z * 0.012 + pen, abs(q.x)), 1.0 - smoothstep(uWin.w * 0.012, uWin.w * 0.012 + pen, abs(q.y + uWin.w * 0.06)));
  float leaves = smoothstep(0.38, 0.62, fbm(p / 210.0 + vec2(uT * 0.03, sin(uT * 0.4) * 0.05)));
  return inside * (1.0 - bar * 0.92) * mix(1.0, 0.38, leaves);
}

vec4 prod(int i, vec2 p, float lod) {
  vec4 r = uRect[i];
  vec2 uv = (p - r.xy) / r.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return textureLod(uTex, vec3(uv, float(i)), lod);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 res = uRes / uDpr;
  vec2 shift = sunShift();
  float pen = 3.0 + length(shift) * 0.05;
  float sunK = uSunK;
  // The wall: plaster, a little uneven, in the room's light.
  float grain = fbm(p / 3.0) * 0.06 + fbm(p / 60.0) * 0.07;
  vec3 wallAlb = vec3(0.95, 0.93, 0.9) * (0.94 + grain);
  float lit = windowLight(p, shift, pen) * sunK;
  // Shadows on the wall: each product's silhouette moved by the sun, softer the further it falls; glass lets its own
  // colour through.
  vec3 through = vec3(1.0);
  float blur = log2(1.0 + length(shift) * 0.05);
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    vec4 t = prod(i, p - shift, blur);
    float g = uInfo[i].x;
    // Premultiplied: the glass's own colour, brightened, is the light that comes through it.
    vec3 tint = clamp(t.rgb / max(t.a, 1e-3) * 1.7, 0.0, 1.6);
    through *= mix(vec3(1.0), mix(vec3(0.06), tint, g * 0.85), t.a);
  }
  // The lamp after dark, low on the right (the copy is on the left, and stays on the darker side): a warm pool on the wall and its own soft shadows.
  vec2 lp = uLampP;
  float lampPool = uLamp * (1.0 - smoothstep(0.0, res.y * 1.05, length((p - lp) * vec2(0.8, 1.0))));
  vec3 lampThrough = vec3(1.0);
  if (uLamp > 0.01) {
    for (int i = 0; i < 8; i++) {
      if (i >= uN) break;
      vec4 r = uRect[i];
      vec2 sh = (r.xy + r.zw * vec2(0.5, uInfo[i].w) - lp) * 0.16;
      vec4 t = prod(i, p - sh, 3.0);
      lampThrough *= 1.0 - t.a * 0.8;
    }
  }
  vec3 lampCol = vec3(1.0, 0.72, 0.42);
  vec3 wall = wallAlb * (uAmb * 0.86 + uSun * lit * through * 1.0 + lampCol * lampPool * lampThrough * 0.9);
  // The shelf: a stone ledge across the room, its top catching the light, its front in shade, and its shadow below.
  float topH = max(8.0, res.y * 0.018), faceH = max(18.0, res.y * 0.05);
  vec3 col = wall;
  if (p.y > uShelf - topH) {
    float stone = 0.9 + fbm(p / vec2(9.0, 2.5)) * 0.12 + fbm(p / 40.0) * 0.06;
    vec3 alb = vec3(0.86, 0.83, 0.78) * stone;
    if (p.y < uShelf) {
      // The top: contact shadows under each product.
      float contact = 1.0;
      for (int i = 0; i < 8; i++) {
        if (i >= uN) break;
        vec4 r = uRect[i];
        vec2 foot = vec2(r.x + r.z * 0.5, r.y + r.w * uInfo[i].w);
        vec2 d = (p - foot - vec2(shift.x * 0.25, 0.0)) / vec2(r.z * 0.26, topH * 0.9);
        contact *= 1.0 - 0.55 * exp(-dot(d, d));
      }
      float topLit = windowLight(p + vec2(0.0, -shift.y * 0.2), shift * 0.6, pen) * sunK;
      col = alb * (uAmb * 1.05 + uSun * topLit * 0.7 + lampCol * lampPool * 0.8) * contact;
    } else if (p.y < uShelf + faceH) {
      col = alb * (uAmb * 0.72 + lampCol * lampPool * 0.35);
      col *= 1.0 - 0.25 * smoothstep(uShelf + faceH * 0.7, uShelf + faceH, p.y);
    } else {
      float under = smoothstep(uShelf + faceH + res.y * 0.25, uShelf + faceH, p.y);
      col = wallAlb * (uAmb * (0.82 - under * 0.28) + lampCol * lampPool * 0.4);
    }
  }
  // The products, front to back in the order given, lit where the window's light reaches them.
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    vec4 t = prod(i, p, 0.0);
    if (t.a < 0.003) continue;
    vec3 c = t.rgb / max(t.a, 1e-3);
    float l = windowLight(p + shift, shift, pen) * sunK;
    vec4 r = uRect[i];
    float side = (p.x - (r.x + r.z * 0.5)) / (r.z * 0.25);
    float shade = 0.82 + 0.18 * clamp(-side * sign(uL.x + 1e-4) * 0.5 + 0.5, 0.0, 1.0);
    vec3 light = uAmb * 1.12 * shade + uSun * l * 0.55 + lampCol * lampPool * 0.8;
    c *= light;
    float dim = uInfo[i].y;
    c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))) * 0.9, dim * 0.35) * (1.0 - dim * 0.28);
    col = mix(col, c, t.a);
  }
  float vig = 1.0 - 0.18 * smoothstep(0.55, 1.25, length((p / res - 0.5) * vec2(1.2, 1.0)));
  o = vec4(col * vig, 1.0);
}`;

type Item = { id: string; front: string; glass: boolean; name: string; line: string; when: string; use: string; ing: string; foot: number; box: [number, number, number, number] };

export function initSundial() {
  for (const [n, root] of [...document.querySelectorAll<HTMLElement>("[data-sundial]")].entries()) setup(root, n === 0);
}

/** Load a product photograph, draw it into a canvas of a set size, and find its foot and the box its picture fills. */
async function loadItem(src: string, w: number, h: number) {
  const img = await loadImage(src);
  if (!img) throw new Error(`Sundial: could not load ${src}`);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, w, h);
  const a = x.getImageData(0, 0, w, h).data;
  let top = h, bottom = 0, left = w, right = 0;
  for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) {
    if (a[(yy * w + xx) * 4 + 3]! > 40) { if (yy < top) top = yy; if (yy > bottom) bottom = yy; if (xx < left) left = xx; if (xx > right) right = xx; }
  }
  return { canvas: c, foot: (bottom + 1) / h, box: [left / w, top / h, (right + 1) / w, (bottom + 1) / h] as [number, number, number, number] };
}

function setup(root: HTMLElement, lead: boolean) {
  const pin = root.querySelector<HTMLElement>(".sd-pin")!;
  const canvas = root.querySelector<HTMLCanvasElement>(".sd-gl")!;
  const intro = root.querySelector<HTMLElement>(".sd-intro");
  const steps = [...root.querySelectorAll<HTMLElement>(".sd-step")];
  const finale = root.querySelector<HTMLElement>(".sd-finale");
  const hits = [...root.querySelectorAll<HTMLButtonElement>(".sd-hit")];
  const card = root.querySelector<HTMLElement>(".sd-card");
  const marks = [...root.querySelectorAll<HTMLButtonElement>(".sd-mark")];
  const clockEl = root.querySelector<HTMLElement>(".sd-clock");
  const nowEl = root.querySelector<HTMLElement>(".sd-now");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const hours = steps.map((s) => parseFloat(s.dataset.hour ?? "8"));
  const stepIds = steps.map((s) => s.dataset.id ?? "");
  const total = totalScreens(Math.max(1, steps.length));
  root.style.setProperty("--sd-screens", String(total + 1));

  const items: Item[] = hits.map((b) => ({
    id: b.dataset.id ?? "", front: b.dataset.front ?? "", glass: b.hasAttribute("data-glass"), name: b.dataset.name ?? "", line: b.dataset.line ?? "",
    when: b.dataset.when ?? "", use: b.dataset.use ?? "", ing: b.dataset.ing ?? "", foot: 0.95, box: [0.2, 0.1, 0.8, 0.95],
  }));
  const n = Math.min(8, items.length);

  // --------------------------------------------------------------------------------------------------- the shader
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  let ready = false;
  type U = Record<string, WebGLUniformLocation | null>;
  let U: U = {};
  if (gl) {
    try {
      const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? "shader"); return x; };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const name of ["uRes", "uDpr", "uT", "uTex", "uN", "uRect", "uInfo", "uL", "uSun", "uAmb", "uSunK", "uLamp", "uLampP", "uShelf", "uDepth", "uWin"]) U[name] = gl.getUniformLocation(prog, name);
      gl.uniform1i(U.uTex!, 0);
    } catch (e) {
      console.warn("Sundial: shader", e);
      U = {};
    }
  }
  if (!gl || !U.uRes) root.classList.add("is-flat");

  const TW = 466, TH = 700;
  Promise.all(items.slice(0, n).map((it) => loadItem(it.front, TW, TH))).then((loaded) => {
    loaded.forEach((l, i) => { items[i]!.foot = l.foot; items[i]!.box = l.box; });
    if (gl && U.uRes) {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TW, TH, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      loaded.forEach((l, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TW, TH, 1, gl.RGBA, gl.UNSIGNED_BYTE, l.canvas));
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
    }
    apply(uNow, ptr.x, ptr.k, clock);
    document.body.classList.add("canvas-ready");
  }).catch((e) => { console.warn("Sundial: pictures", e); root.classList.add("is-flat"); document.body.classList.add("canvas-ready"); });

  let dpr = 1;
  const resize = () => {
    const r = pin.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    gl?.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  // ------------------------------------------------------------------------------------------------ the layout
  /** Where each product stands at u: in a row on the shelf, the one whose step it is brought forward and larger. */
  const layout = (u: number, W: number, H: number, fi = -1, fk = 0, uPos = u) => {
    const wide = W / H > 1.05;
    const shelf = H * (wide ? 0.8 : 0.74);
    const ph = wide ? H * 0.5 : Math.min(H * 0.3, W * 0.62);
    // Where the row stands follows the scroll only, so a product under the pointer stays under it while focus runs the day.
    const stepK = smooth(U_OPEN - 0.6, U_OPEN - 0.1, uPos);
    const centre = W * (wide ? lerp(0.5, 0.62, stepK) : 0.5);
    const span = wide ? Math.min(W * lerp(0.62, 0.56, stepK), H * 1.3) : W * 0.8;
    // Each step's weight: rises as its turn comes, falls as the next one's does.
    const weight = items.map((it) => {
      let w = 0;
      stepIds.forEach((id, j) => { if (id !== it.id) return; const c = U_OPEN + j * U_STEP; w = Math.max(w, smooth(c - U_STEP * 0.62, c - U_STEP * 0.15, u) * (1 - smooth(c + U_STEP * 0.15, c + U_STEP * 0.62, u))); });
      return w;
    });
    const any = Math.max(0, ...weight);
    const last = U_OPEN + (steps.length - 1) * U_STEP;
    const endK = smooth(last + 0.3, last + U_END * 0.7, u);
    return items.slice(0, n).map((it, i) => {
      const w = weight[i]! * (1 - endK);
      // A product under the pointer comes further forward than its step alone would bring it.
      const s = ph * (1 + w * (wide ? 0.16 : 0.32) + (i === fi ? fk * (wide ? 0.14 : 0.12) : 0));
      const cw = s * (TW / TH);
      const x = centre + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span);
      const cx = x - ((it.box[0] + it.box[2]) / 2 - 0.5) * cw;
      const dim = Math.max(any * (1 - endK) * (1 - weight[i]!), fi >= 0 && i !== fi ? fk * 0.6 : 0);
      return { x: cx - cw / 2, y: shelf - s * it.foot + w * H * 0.012, w: cw, h: s, dim, shelf };
    });
  };

  // ------------------------------------------------------------------------------------------------ drawing
  const ptr = { x: 0.5, tx: 0.5, on: 0, k: 0 };
  let uNow = 0, clock = 0, raf = 0, last = 0, demoing = false, hover = -1;
  // Focus: hovering, focusing or tapping a product runs the day to that product's own time and brings it forward, with
  // the time large at the top and its writing under it. fk eases in and out; fi stays on the last product while it does.
  let fk = 0, fi = -1;
  /** The scroll position of a product's step nearest to u (a product used morning and evening has two), or u itself. */
  const stepU = (i: number, u: number) => {
    let best = u, d = Infinity;
    stepIds.forEach((id, j) => { if (id !== items[i]?.id) return; const c = U_OPEN + j * U_STEP; if (Math.abs(c - u) < d) { d = Math.abs(c - u); best = c; } });
    return best;
  };
  const inkDark = getComputedStyle(document.documentElement).getPropertyValue("--c-text").trim() || "#1c2125";

  const progress = () => {
    const r = root.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight), 0, 1) * total;
  };
  const clockText = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

  const apply = (uScroll: number, px: number, pk: number, t: number) => {
    const W = pin.clientWidth, H = pin.clientHeight;
    const k = fi >= 0 ? smoother(fk) : 0;
    const u = fi >= 0 ? lerp(uScroll, stepU(fi, uScroll), k) : uScroll;
    const h = hourAt(u, hours);
    const li = lightAt(h);
    const L = sunAt(h, (px - 0.5) * 0.7 * pk * (1 - smooth(0.5, 1.2, u)));
    const rows = layout(u, W, H, fi, k, uScroll);
    if (gl && ready && U.uRes) {
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uDpr!, dpr);
      gl.uniform1f(U.uT!, t);
      gl.uniform1i(U.uN!, rows.length);
      const R = new Float32Array(32), I = new Float32Array(32);
      rows.forEach((r, i) => { R.set([r.x, r.y, r.w, r.h], i * 4); I.set([items[i]!.glass ? 1 : 0, r.dim, 0, items[i]!.foot], i * 4); });
      gl.uniform4fv(U.uRect!, R);
      gl.uniform4fv(U.uInfo!, I);
      gl.uniform3fv(U.uL!, L);
      gl.uniform3fv(U.uSun!, li.sun);
      gl.uniform3fv(U.uAmb!, li.amb.map((v) => v * 0.92));
      gl.uniform1f(U.uSunK!, li.k);
      gl.uniform1f(U.uLamp!, li.lamp);
      gl.uniform2f(U.uLampP!, W * 0.97, H * 0.6);
      gl.uniform1f(U.uShelf!, rows[0]?.shelf ?? H * 0.8);
      gl.uniform1f(U.uDepth!, H * 0.085);
      gl.uniform4f(U.uWin!, W * 0.46, H * 0.4, Math.max(W * 0.78, H * 1.2), H * 0.86);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // The buttons over the products, for the pointer and the keyboard.
    rows.forEach((r, i) => {
      const b = hits[i];
      if (!b) return;
      const bx = items[i]!.box;
      b.style.transform = `translate(${(r.x + bx[0] * r.w).toFixed(1)}px, ${(r.y + bx[1] * r.h).toFixed(1)}px)`;
      b.style.width = `${((bx[2] - bx[0]) * r.w).toFixed(1)}px`;
      b.style.height = `${((bx[3] - bx[1]) * r.h).toFixed(1)}px`;
    });
    // The copy: its ink follows the room, dark by day and light after dark.
    pin.style.setProperty("--sd-ink-k", li.ink.toFixed(3));
    pin.classList.toggle("is-night", li.ink > 0.5);
    void inkDark;
    const introK = (1 - smooth(0.35, 0.85, uScroll)) * (1 - k);
    if (intro) { intro.style.opacity = introK.toFixed(3); intro.style.transform = `translateY(${((1 - introK) * -30).toFixed(1)}px)`; intro.style.visibility = introK > 0.001 ? "visible" : "hidden"; }
    steps.forEach((el, j) => {
      const c = U_OPEN + j * U_STEP;
      const sk = smooth(c - U_STEP * 0.5, c - U_STEP * 0.12, u) * (1 - smooth(c + U_STEP * 0.12, c + U_STEP * 0.5, u)) * (1 - k);
      el.style.opacity = sk.toFixed(3);
      el.style.visibility = sk > 0.001 ? "visible" : "hidden";
      el.style.transform = `translateY(${((1 - sk) * 20).toFixed(1)}px)`;
      const cta = el.querySelector<HTMLElement>(".sd-cta");
      if (cta) cta.style.pointerEvents = sk > 0.7 ? "auto" : "none";
    });
    const lastC = U_OPEN + (steps.length - 1) * U_STEP;
    const finK = smooth(lastC + U_END * 0.45, lastC + U_END * 0.85, u) * (1 - k);
    if (finale) { finale.style.opacity = finK.toFixed(3); finale.style.transform = `translateY(${((1 - finK) * 26).toFixed(1)}px)`; finale.style.pointerEvents = finK > 0.8 ? "auto" : "none"; }
    // The day: the clock, the hand on the timeline, and the step in hand.
    if (clockEl) clockEl.textContent = clockText(h);
    if (nowEl) nowEl.style.setProperty("--h", ((h - 6) / 17).toFixed(4));
    marks.forEach((m, j) => m.classList.toggle("is-now", Math.abs(u - (U_OPEN + j * U_STEP)) < U_STEP * 0.4));
    // The focused product's moment: its time large at the top centre, and its writing under it.
    if (card) {
      if (fi >= 0 && k > 0.001) {
        const it = items[fi]!;
        if (card.dataset.k !== String(fi)) {
          card.dataset.k = String(fi);
          card.querySelector(".sd-card-when")!.textContent = it.when || "";
          card.querySelector(".sd-card-name")!.textContent = it.name;
          card.querySelector(".sd-card-line")!.textContent = it.line;
          card.querySelector(".sd-card-use")!.textContent = it.use;
          card.querySelector(".sd-card-ing")!.textContent = it.ing;
        }
        const clk = card.querySelector(".sd-card-clock");
        if (clk) clk.textContent = clockText(h);
        card.hidden = false;
        card.style.opacity = k.toFixed(3);
        card.style.transform = `translate(-50%, ${((1 - k) * -14).toFixed(1)}px)`;
      } else card.hidden = true;
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
    if (hover >= 0) fi = hover;
    fk += ((hover >= 0 ? 1 : 0) - fk) * (still ? 1 : 1 - Math.exp(-dt / 0.28));
    if (hover < 0 && fk < 0.002) { fk = 0; fi = -1; }
    apply(uNow, ptr.x, ptr.k, clock);
    raf = requestAnimationFrame(frame);
  };
  function run() { if (!raf && !demoing) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => (e?.isIntersecting ? run() : stop())).observe(root);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : run()));
  addEventListener("pointermove", (e) => { ptr.tx = e.clientX / Math.max(1, innerWidth); ptr.on = e.pointerType === "mouse" ? 1 : 0; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.on = 0; });
  hits.forEach((b, i) => {
    b.addEventListener("pointerenter", () => { hover = i; });
    b.addEventListener("pointerleave", () => { if (hover === i) hover = -1; });
    b.addEventListener("focus", () => { hover = i; });
    b.addEventListener("blur", () => { if (hover === i) hover = -1; });
    b.addEventListener("click", () => { hover = hover === i ? -1 : i; });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hover = -1; });
  // The timeline: each mark scrolls to its step.
  const scrollToU = (u: number) => {
    const top = root.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (u / total) * (root.offsetHeight - innerHeight), behavior: reduced.matches ? "auto" : "smooth" });
  };
  marks.forEach((m, j) => m.addEventListener("click", () => scrollToU(U_OPEN + j * U_STEP)));
  addEventListener("resize", () => { resize(); apply(uNow, ptr.x, ptr.k, clock); });
  uNow = progress();
  apply(uNow, 0.5, 0, 0);

  // ------------------------------------------------------------------------------------------------ card recording
  // The pointer moves the morning sun so the glass shadows swing, rests on a product so its card opens, then the day
  // runs through the routine to the lamp at night.
  if (lead && !(window as unknown as { __hoverDemo?: unknown }).__hoverDemo) {
    const at = (j: number) => U_OPEN + j * U_STEP;
    const keys: [number, number][] = [[0, 0], [5.2, 0]];
    let tt = 5.2;
    steps.forEach((_, j) => { tt += j === 0 ? 1.0 : 0.95; keys.push([tt, at(j)]); tt += 0.25; keys.push([tt, at(j)]); });
    keys.push([tt + 1.6, total], [tt + 3.2, total]);
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
      const u = uAt(t);
      const pick = Math.min(2, n - 1);
      fk = smooth(2.95, 3.6, t) * (1 - smooth(4.9, 5.5, t));
      const fe = smoother(fk);
      const rows = layout(lerp(u, stepU(pick, u), fe), W, H, pick, fe, u);
      const target = rows[pick] ? { x: rows[pick]!.x + rows[pick]!.w * 0.5, y: rows[pick]!.y + rows[pick]!.h * 0.55 } : { x: W * 0.5, y: H * 0.6 };
      const sweep = 0.15 + 0.7 * smoother((t - 0.3) / 1.8);
      let x: number, y: number;
      if (t < 2.3) { x = W * sweep; y = H * 0.4; }
      else if (t < 5.2) { const k = smoother((t - 2.3) / 0.8); x = lerp(W * 0.85, target.x, k); y = lerp(H * 0.4, target.y, k); }
      else { const k = smoother((t - 5.2) / 0.8); x = lerp(target.x, W * 0.93, k); y = lerp(target.y, H * 0.9, k); }
      cursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // The pointer rests on a product: the day runs to its time, then back as it leaves.
      hover = -1;
      fi = pick;
      const pk = t < 3.0 ? 1 : 0;
      apply(u, x / W, pk, t);
    };
    (demo as unknown as { seconds: number }).seconds = keys.at(-1)![0];
    (window as unknown as { __hoverDemo?: unknown }).__hoverDemo = demo;
  }
}
