// "Satin": a sheet of satin folding in slow waves, lit from the upper left with an accent rim
// from below. One height field drives two scenes — a full-colour WebGL render and a dot
// version on the field's grid. Both swell with the bass and ripple on every beat.
import { sound } from "./audio.js";

const { sin, cos, exp, sqrt, max, min, floor } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Shared by the shader below and the JS shading — keep the two in step.
const FOLD = 3, TILT = 0.4; // fold frequency; slope gain
function height(x, y, U) {
  const T = U.t;
  const X = x * FOLD, Y = y * FOLD;
  const qx = X + 0.35 * sin(Y * 1.3 + T * 0.21), qy = Y + 0.35 * sin(X * 1.1 - T * 0.17);
  let h = 0.55 * sin(qx * 1.28 + qy * 0.96 + T * 0.25)
    + 0.25 * sin(qx * 1.89 + qy * 1.92 - T * 0.33)
    + 0.12 * sin(qx * 3.87 + qy * 1.85 + T * 0.41)
    + 0.3 * sin(-qx * 0.33 + qy * 1.05 + T * 0.13);
  h *= U.amp;
  if (U.beat > 0.01) h += 0.2 * U.beat * sin((x * 0.6 + y * 0.8) * 5 - U.age * 7);
  return h;
}

// Lighting terms at a point (x right, y up, height units of the view's half-height).
const L1 = (() => { const v = [-0.45, 0.6, 0.66], l = Math.hypot(...v); return v.map((c) => c / l); })();
const L2 = (() => { const v = [0.3, 0.2, 0.93], l = Math.hypot(...v); return v.map((c) => c / l); })();
function shade(x, y, asp, U, out) {
  const e = 0.012, h = height(x, y, U);
  const gx = (height(x + e, y, U) - h) / e, gy = (height(x, y + e, U) - h) / e;
  let nx = -gx * TILT, ny = -gy * TILT, nz = 1;
  const nl = sqrt(nx * nx + ny * ny + 1);
  nx /= nl; ny /= nl; nz /= nl;
  const dif = max(nx * L1[0] + ny * L1[1] + nz * L1[2], 0);
  const ao = smooth(-1.1, 0.7, h);
  // Mirror reflection towards a viewer straight above: r.z = 2(n·l)n.z - l.z.
  const d1 = nx * L1[0] + ny * L1[1] + nz * L1[2], d2 = nx * L2[0] + ny * L2[1] + nz * L2[2];
  const sp = Math.pow(max(2 * d1 * nz - L1[2], 0), 48) * (1 + 1.5 * U.high);
  const sp2 = Math.pow(max(2 * d2 * nz - L2[2], 0), 8) * 0.45 * ao;
  const sl = sqrt(nx * nx + ny * ny);
  const rim = sl > 1e-4 ? smooth(0.3, 0.65, sl) * Math.pow(max((nx * 0.75 - ny * 0.66) / sl, 0), 3) * ao * (0.8 + 1.4 * U.beat + 0.4 * U.bass) : 0;
  const edge = 0.12 + (0.32 * x) / asp + 0.1 * sin(x * 1.7 + U.t * 0.12);
  out.body = (0.12 + 0.75 * dif * sqrt(dif)) * ao;
  out.rim = min(1, rim * 1.2);
  out.spec = min(1, sp + sp2);
  out.cover = smooth(0.18, -0.2, y - edge - 0.08 * h);
  return out;
}

const FRAG = `precision highp float;
uniform vec2 R;
uniform float T, AMP, BEAT, AGE, HI, BASS;
uniform vec3 BG, INK, ACC, MID;
float H(vec2 p) {
  vec2 P = p * ${FOLD.toFixed(2)};
  vec2 q = P + 0.35 * vec2(sin(P.y * 1.3 + T * 0.21), sin(P.x * 1.1 - T * 0.17));
  float h = 0.55 * sin(dot(q, vec2(1.28, 0.96)) + T * 0.25)
    + 0.25 * sin(dot(q, vec2(1.89, 1.92)) - T * 0.33)
    + 0.12 * sin(dot(q, vec2(3.87, 1.85)) + T * 0.41)
    + 0.3 * sin(dot(q, vec2(-0.33, 1.05)) + T * 0.13);
  h *= AMP;
  h += 0.2 * BEAT * sin(dot(p, vec2(0.6, 0.8)) * 5.0 - AGE * 7.0);
  return h;
}
void main() {
  float asp = R.x / R.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * R) / R.y * 2.0;
  float e = 0.012, h = H(p);
  vec2 g = vec2(H(p + vec2(e, 0.0)) - h, H(p + vec2(0.0, e)) - h) / e;
  vec3 n = normalize(vec3(-g * ${TILT.toFixed(2)}, 1.0));
  vec3 l1 = normalize(vec3(-0.45, 0.6, 0.66)), l2 = normalize(vec3(0.3, 0.2, 0.93));
  float dif = max(dot(n, l1), 0.0);
  float ao = smoothstep(-1.1, 0.7, h);
  float sp = pow(max(reflect(-l1, n).z, 0.0), 48.0) * (1.0 + 1.5 * HI);
  float sp2 = pow(max(reflect(-l2, n).z, 0.0), 8.0) * 0.45 * ao;
  float sl = length(n.xy);
  float rim = sl > 1e-4 ? smoothstep(0.3, 0.65, sl) * pow(max(dot(n.xy / sl, vec2(0.75, -0.66)), 0.0), 3.0) * ao * (0.8 + 1.4 * BEAT + 0.4 * BASS) : 0.0;
  float edge = 0.12 + 0.32 * p.x / asp + 0.1 * sin(p.x * 1.7 + T * 0.12);
  float cover = smoothstep(0.18, -0.2, p.y - edge - 0.08 * h);
  vec3 col = mix(BG, MID, (0.12 + 0.75 * dif * sqrt(dif)) * ao);
  col = mix(col, ACC, clamp(rim * 1.2, 0.0, 1.0));
  col = mix(col, INK, clamp(sp + sp2, 0.0, 1.0));
  col = mix(BG, col, cover);
  // A whisper of noise so the long gradients don't band.
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// One WebGL context for the main view and one for previews — browsers cap the number of
// live contexts, so cards never get their own.
class GLSilk {
  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 v;void main(){gl_Position=vec4(v,0.,1.);}"));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const k of ["R", "T", "AMP", "BEAT", "AGE", "HI", "BASS", "BG", "INK", "ACC", "MID"]) this.u[k] = gl.getUniformLocation(pr, k);
    this.gl = gl;
  }
  render(w, h, U, rgb) {
    const { gl, u, canvas } = this;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.R, w, h);
    gl.uniform1f(u.T, U.t); gl.uniform1f(u.AMP, U.amp); gl.uniform1f(u.BEAT, U.beat);
    gl.uniform1f(u.AGE, U.age); gl.uniform1f(u.HI, U.high); gl.uniform1f(u.BASS, U.bass);
    const c3 = (loc, c) => gl.uniform3f(loc, c[0] / 255, c[1] / 255, c[2] / 255);
    c3(u.BG, rgb.bg); c3(u.INK, rgb.b); c3(u.ACC, rgb.a); c3(u.MID, rgb.c);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas;
  }
}
const renderers = {};
const glFor = (thumb) => {
  const k = thumb ? "thumb" : "main";
  if (!(k in renderers)) { const r = new GLSilk(); renderers[k] = r.gl ? r : null; }
  return renderers[k];
};

// Time, fold height and beat state, advanced from the live sound only — silk without a
// source just drifts, it doesn't dance to the demo signal.
function motion(U, dt) {
  const s = sound.on ? sound : null;
  U.bass += ((s ? s.bass : 0) - U.bass) * min(1, dt * 8);
  U.high += ((s ? s.high : 0) - U.high) * min(1, dt * 10);
  U.beat = s ? s.beat : 0;
  if (s && s.beats !== U.lb) { U.age = 0; U.lb = s.beats; } else U.age += dt;
  U.t += dt * (1 + (s ? 1.6 * s.level + 0.6 * s.beat : 0));
  U.amp = 1 + 0.55 * U.bass;
}
const fresh = (A) => ({ t: (A.t || 0) * 0.5 + 40, amp: 1, bass: 0, high: 0, beat: 0, age: 9, lb: -1 });

/* Satin: the colour render. Draws itself straight onto the view. */
const silk = () => ({
  free: true, sound: true, grid: false,
  init(A) { if (!this.U) this.U = fresh(A); this.o = {}; },
  update(dt, A) { motion(this.U, min(dt, 0.05)); },
  paint(ctx, A, eng) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const k = A.thumb ? 1 : min(1, 1600 / max(cw, ch)) ;
    const w = max(2, floor(cw * k)), h = max(2, floor(ch * k));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = glFor(A.thumb);
    if (r) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(r.render(w, h, this.U, A.rgb), 0, 0, cw, ch);
      return;
    }
    // No WebGL: shade a coarse image in JS and let the browser smooth it up.
    this.fb = this.fb || document.createElement("canvas");
    const fw = A.thumb ? 140 : 240, fh = max(2, floor((fw * ch) / cw));
    if (this.fb.width !== fw || this.fb.height !== fh) { this.fb.width = fw; this.fb.height = fh; this.img = null; }
    const fc = this.fb.getContext("2d");
    this.img = this.img || fc.createImageData(fw, fh);
    const d = this.img.data, { bg, a, b, c } = A.rgb, asp = fw / fh, o = this.o;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      shade(((i + 0.5 - fw / 2) / fh) * 2, ((fh / 2 - j - 0.5) / fh) * 2, asp, this.U, o);
      const q = (j * fw + i) * 4;
      for (let ch3 = 0; ch3 < 3; ch3++) {
        let v = bg[ch3] + (c[ch3] - bg[ch3]) * o.body;
        v += (a[ch3] - v) * o.rim;
        v += (b[ch3] - v) * o.spec;
        d[q + ch3] = bg[ch3] + (v - bg[ch3]) * o.cover;
      }
      d[q + 3] = 255;
    }
    fc.putImageData(this.img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fb, 0, 0, cw, ch);
  },
});

/* Satin Dots: the same cloth on the dot grid — dot size follows the light, the rim takes the
   accent and the brightest sheen the ink. */
const silkDots = () => ({
  sound: true,
  pitch: 0.75,
  init(A) { if (!this.U) this.U = fresh(A); this.o = {}; this.img = null; },
  update(dt, A) { motion(this.U, min(dt, 0.05)); },
  draw(L, A) {
    const { cols, rows } = A;
    if (!this.img || this.img.width !== cols || this.img.height !== rows) this.img = L.createImageData(cols, rows);
    const d = this.img.data, { a, b, c } = A.rgb, o = this.o;
    // Grid scenes are laid out in cells; the cloth is shaded against the visible view.
    const vw = A.thumb ? cols : A.w / A.cell, vh = A.thumb ? rows : A.h / A.cell, asp = vw / vh;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      shade(((x + 0.5 - vw / 2) / vh) * 2, ((vh / 2 - y - 0.5) / vh) * 2, asp, this.U, o);
      const v = clamp((o.body * 1.1 + o.rim + o.spec) * o.cover, 0, 1);
      const q = (y * cols + x) * 4;
      const col = o.rim > 0.2 && o.rim >= o.spec ? a : o.spec > 0.3 ? b : c;
      d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2];
      d[q + 3] = v < 0.06 ? 0 : v * 255;
    }
    L.putImageData(this.img, 0, 0);
  },
});

const ICON = '<path d="M3 15c3-6 6 2 9-4s6-2 9-6"/><path d="M3 20c3-6 6 2 9-4s6-2 9-6"/>';
export const SATIN = [
  { id: "satin", name: "Satin", group: "satin", icon: ICON, make: silk },
  { id: "satindots", name: "Satin Dots", group: "satin", icon: ICON, make: silkDots },
];
