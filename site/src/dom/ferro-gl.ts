// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The ferrofluid itself: one full-screen shader that ray marches a signed distance field. The liquid is a shallow pool
// with a rounded edge and up to three drops rising out of it, joined by a smooth union so they meet as liquid does.
// Spikes are cones on a spherical Fibonacci lattice over each drop (the nearest lattice point is found directly, after
// Keinert et al., "Spherical Fibonacci Mapping", 2015) and on a hexagonal lattice over the pool; their heights come
// from the field the page sets: the beat, and a lean towards the pointer. The surface is black and glossy, so what you
// see is what it reflects: the room (the page's own ground, two strip lights and a softbox) and the headline, which
// sits on a plane facing the camera behind the liquid, exactly where the page draws it.
//
// The canvas is transparent wherever there is no liquid, so the page and its headline show through; the floor only
// darkens under the pool. The shader is drawn at a fraction of the screen's resolution that adapts to the frame rate.

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform vec3 uRo, uF, uR, uU;
uniform vec2 uTan;
uniform vec4 uB[3];
uniform vec2 uBH[3];
uniform int uN;
uniform vec4 uPool;
uniform vec2 uPoolC;
uniform float uK;
uniform vec4 uPtr;
uniform vec4 uBound;
uniform vec3 uBg, uInk;
uniform sampler2D uW0, uW1;
uniform vec4 uR0, uR1;
uniform vec2 uWK;
uniform float uD, uFib, uSpikeW;

const float PI = 3.14159265;
const float PHI = 1.61803399;

float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

vec3 fibPoint(float i, float n) {
  float ph = 2.0 * PI * fract(i * (PHI - 1.0));
  float z = 1.0 - (2.0 * i + 1.0) / n;
  float s = sqrt(max(0.0, 1.0 - z * z));
  return vec3(cos(ph) * s, sin(ph) * s, z);
}

// The lattice point nearest to unit vector p (pole on z), and the chord distance to it.
float fibNearest(vec3 p, float n, out vec3 best) {
  float ph = atan(p.y, p.x);
  float z = clamp(p.z, -1.0, 1.0);
  float k = max(2.0, floor(log(n * PI * sqrt(5.0) * max(1e-4, 1.0 - z * z)) / log(PHI * PHI)));
  float fk = pow(PHI, k) / sqrt(5.0);
  vec2 F = vec2(floor(fk + 0.5), floor(fk * PHI + 0.5));
  vec2 dp = 2.0 * PI * (fract((F + 1.0) * (PHI - 1.0)) - (PHI - 1.0));
  vec2 dz = -2.0 * F / n;
  mat2 B = mat2(dp.x, dz.x, dp.y, dz.y);
  vec2 c = floor(inverse(B) * vec2(ph, z - (1.0 - 1.0 / n)));
  float d = 9.0;
  best = vec3(0.0, 0.0, 1.0);
  for (int s = 0; s < 4; s++) {
    vec2 off = vec2(float(s & 1), float(s >> 1));
    float i = clamp(dot(F, c + off), 0.0, n - 1.0);
    vec3 q = fibPoint(i, n);
    float e = dot(q - p, q - p);
    if (e < d) { d = e; best = q; }
  }
  return sqrt(d);
}

// The nearest centre on a hexagonal lattice of spacing s.
vec2 hexNearest(vec2 p, float s) {
  vec2 r = vec2(1.0, 1.7320508) * s;
  vec2 a = (floor(p / r) + 0.5) * r;
  vec2 b = (floor((p - r * 0.5) / r) + 1.0) * r;
  return dot(p - a, p - a) < dot(p - b, p - b) ? a : b;
}

// How far drop i's spikes stand out of the liquid at p: cones on its lattice, raised by the beat and towards the pointer.
float spikes(vec3 p, int i) {
  vec4 b = uB[i];
  vec2 h = uBH[i];
  vec3 q = p - b.xyz;
  vec3 n = q / max(length(q), 1e-4);
  vec3 s;
  float cd = fibNearest(vec3(n.z, n.x, n.y), uFib, s);
  vec3 sw = vec3(s.y, s.z, s.x);
  vec3 toP = uPtr.xyz - b.xyz;
  // The beat raises every spike; the pointer raises the ones facing it, most of all those pointing straight at it.
  float face = max(0.0, dot(sw, toP / max(length(toP), 1e-3)));
  float lean = h.x + h.y * face * face;
  float under = smoothstep(-0.95, 0.35, sw.y);
  // A cone with hollow flanks and a fine tip, as the liquid stands along the field.
  float pr = max(0.0, 1.0 - cd / uSpikeW);
  return lean * under * pr * pr * pr;
}

// The pool's spikes, a hexagonal field round its middle, as a height over its surface.
float poolSpikes(vec3 p) {
  vec2 xz = p.xz - uPoolC;
  vec2 c = hexNearest(xz, uPool.w);
  float fall = smoothstep(1.05, 0.45, length(c));
  vec2 dp = c + uPoolC - uPtr.xz;
  float near = 1.0 + 0.8 * uPtr.w * exp(-dot(dp, dp) / 0.4);
  float pr = max(0.0, 1.0 - length(xz - c) / (uPool.w * 0.5));
  return uPool.z * fall * near * pr * pr * pr * smoothstep(0.12, 0.0, abs(p.y - uPool.y));
}

// The liquid: the smooth shapes (pool and drops) run together first, with exact distances so they meet cleanly, and
// the spikes are then raised out of the merged surface from the nearest drop and the pool. Returns the surface's
// value at p (for normals) and, through 'safe', a distance it is safe to march (for the ray).
float field(vec3 p, out float safe) {
  vec2 xz = p.xz - uPoolC;
  float dp = smax(length(xz) - uPool.x, p.y - uPool.y, 0.035);
  float d = dp;
  int best = -1;
  float bd = 1e9, hd = 0.0, rmin = 1.0;
  for (int i = 0; i < 3; i++) {
    if (i >= uN) break;
    float di = length(p - uB[i].xyz) - uB[i].w;
    if (di < bd) { bd = di; best = i; }
    d = smin(d, di, uK);
    hd = max(hd, uBH[i].x + uBH[i].y);
    rmin = min(rmin, max(uB[i].w, 0.2));
  }
  float hp = uPool.z * 1.8;
  float lim = max(hd, hp);
  if (lim < 0.002 || d > lim + 0.05) { safe = d - lim; return d - lim; }
  // Each set of spikes only where its own shape is the surface: a drop's on the drop, the pool's on the pool, fading
  // through the neck between them, so neither is stretched across the other.
  float wd = smoothstep(0.28, 0.04, bd - d);
  float sp = best >= 0 && hd > 0.002 && wd > 0.0 ? spikes(p, best) * wd : 0.0;
  float wp = smoothstep(0.2, 0.03, dp - d);
  if (hp > 0.002 && wp > 0.0) sp = max(sp, poolSpikes(p) * wp);
  // Steps are short only where steep spikes can be: near a drop, or over the pool's spikes. Elsewhere (the open pool)
  // a ray travels at full speed, so it does not run out of steps before it reaches the far side.
  float lip = 1.0;
  if (wd > 0.0) lip = max(lip, 1.0 + 2.6 * hd / (uSpikeW * rmin));
  if (wp > 0.0 && hp > 0.002) lip = max(lip, 1.0 + 3.0 * hp / (uPool.w * 0.5));
  float f = d - sp;
  safe = max(d - lim, f / lip);
  return f;
}

float map(vec3 p) { float s; field(p, s); return s; }

// The liquid without its spikes, for the shadow it casts: a smooth distance gives a smooth shadow.
float body(vec3 p) {
  float d = smax(length(p.xz - uPoolC) - uPool.x, p.y - uPool.y, 0.035);
  for (int i = 0; i < 3; i++) { if (i >= uN) break; d = smin(d, length(p - uB[i].xyz) - uB[i].w, uK); }
  return d;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  float s;
  return normalize(e.xyy * field(p + e.xyy, s) + e.yyx * field(p + e.yyx, s) + e.yxy * field(p + e.yxy, s) + e.xxx * field(p + e.xxx, s));
}

vec3 word(vec3 c, vec2 suv, vec4 rc, sampler2D tx, float k) {
  if (k <= 0.001) return c;
  vec2 w = (suv - rc.xy) / max(rc.zw - rc.xy, vec2(1e-4));
  if (w.x < 0.0 || w.y < 0.0 || w.x > 1.0 || w.y > 1.0) return c;
  vec4 t = texture(tx, vec2(w.x, 1.0 - w.y));
  return mix(c, t.rgb / max(t.a, 1e-3), t.a * k);
}

// What a ray leaving the liquid at o in direction r sees: the page's ground, the lights, and the words.
vec3 env(vec3 o, vec3 r) {
  vec3 c = mix(uBg * 0.8, uBg * 1.02, smoothstep(-0.3, 0.35, r.y));
  if (r.y > 0.02) {
    vec3 h = o + r * ((4.0 - o.y) / r.y);
    vec2 a = abs(h.xz - vec2(0.0, -0.4)) - vec2(2.8, 2.2);
    c = mix(c, vec3(1.7), 1.0 - smoothstep(0.0, 0.4, max(a.x, a.y)));
  }
  if (abs(r.x) > 0.02) {
    float sx = sign(r.x);
    float t = (4.6 * sx - o.x) / r.x;
    if (t > 0.0) {
      vec3 h = o + r * t;
      vec2 a = abs(vec2(h.z + 0.6, h.y - 1.3)) - vec2(0.28, 1.7);
      c = mix(c, vec3(1.45), (1.0 - smoothstep(0.0, 0.1, max(a.x, a.y))) * (sx > 0.0 ? 0.95 : 0.6));
    }
  }
  float rz = dot(r, uF);
  if (rz > 0.02) {
    vec3 oc = o - uRo;
    float t = (uD - dot(oc, uF)) / rz;
    if (t > 0.0) {
      vec3 h = oc + r * t;
      vec2 suv = vec2(dot(h, uR) / (uD * uTan.x), dot(h, uU) / (uD * uTan.y)) * 0.5 + 0.5;
      c = word(c, suv, uR0, uW0, uWK.x);
      c = word(c, suv, uR1, uW1, uWK.y);
    }
  }
  return c;
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uF + ndc.x * uTan.x * uR + ndc.y * uTan.y * uU);
  vec3 ro = uRo;
  float tF = rd.y < -1e-4 ? -ro.y / rd.y : 1e4;
  vec3 oc = ro - uBound.xyz;
  float b = dot(oc, rd);
  float disc = b * b - (dot(oc, oc) - uBound.w * uBound.w);
  bool hit = false;
  float t = 0.0;
  if (disc > 0.0) {
    float sq = sqrt(disc);
    float t1 = min(-b + sq, tF);
    t = max(0.0, -b - sq);
    for (int k = 0; k < 190; k++) {
      if (t > t1) break;
      float d = map(ro + rd * t);
      if (d < 0.0006 * t) { hit = true; break; }
      t += d;
    }
  }
  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 r = reflect(rd, n);
    float cv = clamp(dot(-rd, n), 0.0, 1.0);
    float fr = 0.05 + 0.95 * pow(1.0 - cv, 5.0);
    vec3 col = env(p, r) * (0.07 + 0.93 * fr);
    vec3 key = normalize(vec3(-0.35, 1.0, 0.55));
    col += pow(max(dot(r, key), 0.0), 260.0) * 1.3;
    col += uInk * 0.05;
    // Where the liquid meets the floor it darkens a little: the floor cannot be seen through it.
    col *= mix(0.75, 1.0, smoothstep(0.0, 0.08, p.y));
    o = vec4(clamp(col, 0.0, 1.0), 1.0);
  } else if (tF < 1e3) {
    vec3 p = ro + rd * tF;
    float a = 0.0;
    if (length(p.xz - uBound.xz) < uBound.w + 0.6) {
      float occ = body(p + vec3(0.0, 0.25, 0.0));
      a = (1.0 - smoothstep(0.0, 0.6, occ)) * 0.34;
    }
    o = vec4(uInk * 0.25 * a, a);
  } else {
    o = vec4(0.0);
  }
}`;

/** A drop: its centre and radius, the height the beat gives every spike, and the height the pointer adds facing it. */
export type Drop = { x: number; y: number; z: number; r: number; h: number; lean: number };
export type FerroFrame = {
  ro: [number, number, number];
  target: [number, number, number];
  fovY: number;
  drops: Drop[];
  pool: { x: number; r: number; top: number; h: number; spacing: number };
  /** How softly the drops and the pool run together. */
  blend: number;
  ptr: { x: number; y: number; z: number; k: number };
  words: { k0: number; k1: number };
};
export type Basis = { ro: number[]; F: number[]; R: number[]; U: number[]; tx: number; ty: number };

const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** The camera's frame for an aspect: where it is, which way it looks, and the half extents of its view. */
export function basis(f: Pick<FerroFrame, "ro" | "target" | "fovY">, aspect: number): Basis {
  const F = norm(sub(f.target, f.ro));
  const R = norm(cross(F, [0, 1, 0]));
  const U = cross(R, F);
  const ty = Math.tan((f.fovY * Math.PI) / 360);
  return { ro: f.ro, F, R, U, tx: ty * aspect, ty };
}

/** Where a world point lands on the screen, as fractions from the top left; null behind the camera. */
export function project(b: Basis, p: number[]): { x: number; y: number } | null {
  const d = sub(p, b.ro);
  const z = dot(d, b.F);
  if (z <= 1e-3) return null;
  return { x: 0.5 + (dot(d, b.R) / (z * b.tx)) * 0.5, y: 0.5 - (dot(d, b.U) / (z * b.ty)) * 0.5 };
}

/** The point where the ray through a screen position (fractions from the top left) meets the plane z = zPlane. */
export function unproject(b: Basis, sx: number, sy: number, zPlane: number): number[] {
  const nx = sx * 2 - 1, ny = 1 - sy * 2;
  const rd = norm([0, 1, 2].map((i) => b.F[i]! + nx * b.tx * b.R[i]! + ny * b.ty * b.U[i]!));
  const t = Math.abs(rd[2]!) > 1e-4 ? (zPlane - b.ro[2]!) / rd[2]! : 0;
  return [b.ro[0]! + rd[0]! * Math.max(0, t), b.ro[1]! + rd[1]! * Math.max(0, t), b.ro[2]! + rd[2]! * Math.max(0, t)];
}

const hex3 = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const v = m ? parseInt(m[1]!, 16) : 0xeeeeee;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

export function createFerro(canvas: HTMLCanvasElement, colors: { bg: string; ink: string }) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("WebGL2 unavailable");
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = {
    res: u("uRes"), ro: u("uRo"), F: u("uF"), R: u("uR"), Up: u("uU"), tan: u("uTan"), B: u("uB"), BH: u("uBH"), N: u("uN"), pool: u("uPool"),
    ptr: u("uPtr"), poolC: u("uPoolC"), K: u("uK"), bound: u("uBound"), bg: u("uBg"), ink: u("uInk"), W0: u("uW0"), W1: u("uW1"), R0: u("uR0"), R1: u("uR1"), WK: u("uWK"),
    D: u("uD"), fib: u("uFib"), sw: u("uSpikeW"),
  };
  gl.uniform3fv(U.bg, hex3(colors.bg));
  gl.uniform3fv(U.ink, hex3(colors.ink));
  gl.uniform1f(U.fib, 96);
  gl.uniform1f(U.sw, 0.24);
  gl.uniform1i(U.W0, 0);
  gl.uniform1i(U.W1, 1);

  // The two words (the opening headline and the closing one), as textures with their rectangles on the screen.
  const tex = [0, 1].map((i) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });
  const rects: [number[], number[]] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  let scale = 2, cssW = 1, cssH = 1;
  // Every pixel marches its own ray, so a phone gets fewer of them than a desktop.
  const budget = matchMedia("(pointer: coarse)").matches ? 650_000 : 1_500_000;
  const maxScale = () => Math.min(1, Math.sqrt(budget / Math.max(1, cssW * cssH * Math.min(devicePixelRatio || 1, 2) ** 2))) * Math.min(devicePixelRatio || 1, 2);
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    scale = Math.min(scale, maxScale());
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  /** Fit the resolution to the frame time: down quickly when frames are slow, back up slowly when there is room. */
  let slow = 0, fast = 0;
  const adapt = (dt: number) => {
    if (dt > 0.03) { slow++; fast = 0; } else if (dt < 0.014) { fast++; slow = 0; } else { slow = 0; fast = 0; }
    const top = maxScale();
    if (slow > 8 && scale > 0.42) { scale = Math.max(0.42, scale * 0.85); slow = 0; resize(); }
    else if (fast > 90 && scale < top) { scale = Math.min(top, scale * 1.1); fast = 0; resize(); }
  };

  return {
    resize,
    adapt,
    lock(s: number) { scale = s; resize(); },
    word(i: 0 | 1, source: HTMLCanvasElement | null, rect: number[]) {
      rects[i] = rect;
      if (!source) return;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex[i]!);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    },
    draw(f: FerroFrame) {
      const b = basis(f, cssW / cssH);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform3fv(U.ro, b.ro);
      gl.uniform3fv(U.F, b.F);
      gl.uniform3fv(U.R, b.R);
      gl.uniform3fv(U.Up, b.U);
      gl.uniform2f(U.tan, b.tx, b.ty);
      const B = new Float32Array(12), H = new Float32Array(6);
      f.drops.slice(0, 3).forEach((d, i) => { B.set([d.x, d.y, d.z, d.r], i * 4); H.set([d.h, d.lean], i * 2); });
      gl.uniform4fv(U.B, B);
      gl.uniform2fv(U.BH, H);
      gl.uniform1i(U.N, Math.min(3, f.drops.length));
      gl.uniform4f(U.pool, f.pool.r, f.pool.top, f.pool.h, f.pool.spacing);
      gl.uniform2f(U.poolC, f.pool.x, 0);
      gl.uniform1f(U.K, f.blend);
      gl.uniform4f(U.ptr, f.ptr.x, f.ptr.y, f.ptr.z, f.ptr.k);
      // One sphere holds everything that can be hit, so rays that miss it cost nothing.
      let reach = f.pool.r + 0.2;
      for (const d of f.drops) reach = Math.max(reach, Math.hypot(d.x - f.pool.x, d.y - 0.3, d.z) + d.r + d.h + d.lean + 0.1);
      gl.uniform4f(U.bound, f.pool.x, 0.3, 0, reach + 0.3);
      gl.uniform4fv(U.R0, rects[0]);
      gl.uniform4fv(U.R1, rects[1]);
      gl.uniform2f(U.WK, f.words.k0, f.words.k1);
      gl.uniform1f(U.D, Math.hypot(...(f.ro as [number, number, number])) + 2.6);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return b;
    },
  };
}
