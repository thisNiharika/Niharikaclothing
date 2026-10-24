// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The sky: a slow liquid of three colours behind a scene, deep at the edges and glowing at the horizon, drawn on one
// quad at half resolution in its own WebGL canvas. The aisle made it first; Peel and The Box use it too.

export type Rgb = [number, number, number];

/** "#rrggbb" as 0 to 1 channels, for the sky's colours. */
export function rgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x888888;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A colour's deep, mid and glow for the sky: darkened for the edges, itself, and lifted towards white for the light. */
export function skyOf(hex: string, deep = 0.32, glow = 0.55): Rgb[] {
  const c = rgb(hex);
  return [c.map((v) => v * deep) as Rgb, c, c.map((v) => v + (1 - v) * glow) as Rgb];
}

/** Blends two skies channel by channel. */
export function mixSky(a: Rgb[], b: Rgb[], k: number): Rgb[] {
  return a.map((c, i) => c.map((v, j) => v + (b[i]![j]! - v) * k) as Rgb);
}

/**
 * The light: a slow liquid of the aisle's three colours, deep at the edges and glowing at the horizon, drawn on
 * one quad at half resolution. Without WebGL the CSS gradient under it stays.
 */
export function createSky(canvas: HTMLCanvasElement | null) {
  if (!canvas) return null;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) return null;
  const vs = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  const fs = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int k=0;k<5;k++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec2 p=vec2(uv.x*r.x/r.y,uv.y)*1.35;
  vec2 q=vec2(fbm(p+vec2(0.,t*.035)),fbm(p+vec2(5.2,1.3)-vec2(t*.028,0.)));
  vec2 w=vec2(fbm(p+2.4*q+vec2(1.7,9.2)+t*.02),fbm(p+2.4*q+vec2(8.3,2.8)-t*.017));
  float f=fbm(p+2.6*w);
  vec3 col=mix(c0,c1,smoothstep(.25,.85,f));
  col=mix(col,c2,smoothstep(.62,1.,f*(.6+w.x))*.85);
  float hz=exp(-pow((uv.y-.36)*4.2,2.));
  col+=c2*hz*.22;
  float floorDark=smoothstep(.3,.0,uv.y);
  col=mix(col,c0*.55,floorDark*.75);
  float v=smoothstep(1.35,.25,length((uv-vec2(.5,.45))*vec2(1.05,1.5)));
  col*=mix(.42,1.05,v);
  gl_FragColor=vec4(col,1.);
}`;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (k: string) => gl.getUniformLocation(prog, k);
  const ur = u("r"), ut = u("t"), u0 = u("c0"), u1 = u("c1"), u2 = u("c2");
  const resize = () => {
    const scale = Math.min(1, 900 / Math.max(1, canvas.clientWidth)) * 0.5 * Math.min(2, devicePixelRatio || 1);
    const w = Math.max(2, Math.round(canvas.clientWidth * scale));
    const h = Math.max(2, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  canvas.classList.add("on");
  return {
    draw(t: number, c: [number, number, number][]) {
      resize();
      gl.uniform2f(ur, canvas.width, canvas.height);
      gl.uniform1f(ut, t);
      gl.uniform3fv(u0, c[0]!);
      gl.uniform3fv(u1, c[1]!);
      gl.uniform3fv(u2, c[2]!);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
