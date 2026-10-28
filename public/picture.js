// "Pictures": the user's own images, redrawn as dots. Images stay in this browser
// (localStorage, downscaled) — they're never uploaded or put into share links.
import { sound } from "./audio.js";

const KEY = "dotfield:pictures";
const MAX = 12, SIDE = 720;
const { sin, cos, exp, sqrt, hypot, min, max, round, floor, random: rnd } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rgbStr = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const lumOf = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/* ---------- Storage ---------- */
const read = () => {
  try {
    const l = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(l) ? l.filter((p) => p && /^pic:[a-z0-9]{4,12}$/.test(p.id) && /^data:image\//.test(p.src)) : [];
  } catch { return []; }
};
export let pictures = read();
export const reloadPictures = () => { pictures = read(); };
const write = (list) => { localStorage.setItem(KEY, JSON.stringify(list)); pictures = list; };

const images = new Map();
// The decoded image, or null while it is still loading.
function imageFor(pic) {
  let im = images.get(pic.id);
  if (!im) { im = new Image(); im.src = pic.src; images.set(pic.id, im); }
  return im.complete && im.naturalWidth ? im : null;
}

export async function addPicture(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("type");
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const k = min(1, SIDE / max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = max(1, round(im.naturalWidth * k));
    cv.height = max(1, round(im.naturalHeight * k));
    const cx = cv.getContext("2d");
    cx.imageSmoothingQuality = "high";
    cx.drawImage(im, 0, 0, cv.width, cv.height);
    // WebP keeps transparency at a fraction of PNG's size; fall back where it isn't supported.
    let src = cv.toDataURL("image/webp", 0.86);
    if (!src.startsWith("data:image/webp")) src = cv.toDataURL("image/png");
    const pic = { id: "pic:" + Math.random().toString(36).slice(2, 10), name: (file.name || "Picture").replace(/\.[^.]+$/, "").slice(0, 24) || "Picture", src };
    const list = [pic, ...read()].slice(0, MAX);
    try { write(list); } catch { throw new Error("quota"); }
    return pic;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function removePicture(id) {
  images.delete(id);
  try { write(read().filter((p) => p.id !== id)); } catch {}
}

/* ---------- Scene ---------- */
export const picOpts = { color: "original" };

// Where the image sits on a near-flat border (a cut-out on white, a studio backdrop), clear the
// background by flooding in from the edges; photos and full illustrations are left alone.
function clearBackdrop(d, w, h) {
  let n = 0, sr = 0, sg = 0, sb = 0, opaque = true;
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  for (const j of border) { const i = j * 4; if (d[i + 3] < 250) opaque = false; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
  if (!opaque) return;
  sr /= n; sg /= n; sb /= n;
  let dev = 0;
  for (const j of border) { const i = j * 4; dev += hypot(d[i] - sr, d[i + 1] - sg, d[i + 2] - sb); }
  if (dev / n > 14) return;
  const seen = new Uint8Array(w * h), stack = [...border];
  while (stack.length) {
    const j = stack.pop();
    if (seen[j]) continue;
    seen[j] = 1;
    const i = j * 4;
    if (hypot(d[i] - sr, d[i + 1] - sg, d[i + 2] - sb) > 38) continue;
    d[i + 3] = 0;
    const x = j % w, y = (j / w) | 0;
    if (x > 0) stack.push(j - 1);
    if (x < w - 1) stack.push(j + 1);
    if (y > 0) stack.push(j - w);
    if (y < h - 1) stack.push(j + w);
  }
}

const ease = (t) => 1 - (1 - t) ** 3;

// Reduce the dots' colours to K representatives (k-means), so original-colour mode costs a
// handful of fills per frame rather than one per distinct colour.
const K = 32;
function quantise(col, n) {
  const C = new Float32Array(K * 3), key = new Uint8Array(n);
  for (let k = 0; k < K; k++) { const q = Math.floor(((k + 0.5) / K) * n) * 3; C[k * 3] = col[q]; C[k * 3 + 1] = col[q + 1]; C[k * 3 + 2] = col[q + 2]; }
  const S = new Float64Array(K * 4);
  for (let it = 0; it < 8; it++) {
    S.fill(0);
    for (let q = 0; q < n; q++) {
      const r = col[q * 3], g = col[q * 3 + 1], b = col[q * 3 + 2];
      let best = 0, bd = 1e9;
      for (let k = 0; k < K; k++) {
        const dr = r - C[k * 3], dg = g - C[k * 3 + 1], db = b - C[k * 3 + 2], d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; best = k; }
      }
      key[q] = best;
      S[best * 4] += r; S[best * 4 + 1] += g; S[best * 4 + 2] += b; S[best * 4 + 3]++;
    }
    for (let k = 0; k < K; k++) if (S[k * 4 + 3]) for (let c = 0; c < 3; c++) C[k * 3 + c] = S[k * 4 + c] / S[k * 4 + 3];
  }
  return { key, C };
}

// Hue rotation in YIQ space, θ in radians.
function hueRotate(r, g, b, th) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b, i0 = 0.596 * r - 0.274 * g - 0.322 * b, q0 = 0.211 * r - 0.523 * g + 0.312 * b;
  const c = cos(th), s = sin(th), i = i0 * c - q0 * s, q = i0 * s + q0 * c;
  return [y + 0.956 * i + 0.621 * q, y - 0.272 * i - 0.647 * q, y - 1.106 * i + 1.703 * q];
}

class PictureScene {
  constructor(pic) {
    this.pic = pic;
    this.free = true;
    this.sound = true;
    this.grid = false;
    this.n = 0;
    this.ready = false;
  }
  init(A) {
    this.ready = false;
    this.build(A);
  }
  build(A) {
    const im = imageFor(this.pic);
    if (!im || !A.w) return;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    // Fill the whole view, cropping the overflow evenly (like CSS object-fit: cover).
    const k = max(A.w / iw, A.h / ih), sw = A.w / k, sh = A.h / k;
    // A little finer than the field's grid, but capped so big screens stay smooth.
    const p = A.thumb ? A.w / 56 : max(5, A.cell * 0.8, sqrt((A.w * A.h) / 14000));
    const cols = max(2, round(A.w / p) + 1), rows = max(2, round(A.h / p) + 1);
    // Let the browser average each cell's pixels.
    const cv = document.createElement("canvas");
    cv.width = cols; cv.height = rows;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.imageSmoothingQuality = "high";
    cx.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, cols, rows);
    const d = cx.getImageData(0, 0, cols, rows).data;
    clearBackdrop(d, cols, rows);

    const N = cols * rows, ox = (A.w - (cols - 1) * p) / 2, oy = (A.h - (rows - 1) * p) / 2;
    const f32 = () => new Float32Array(N);
    Object.assign(this, { p, n: 0, hx: f32(), hy: f32(), lum: f32(), al: f32(), sx: f32(), sy: f32(), dl: f32(), dx: f32(), dy: f32(), vx: f32(), vy: f32(), ph: f32(), col: new Uint8Array(N * 3) });
    const cxm = A.w / 2, cym = A.h / 2, far = hypot(A.w, A.h) / 2;
    for (let j = 0; j < N; j++) {
      const i = j * 4, a = d[i + 3] / 255;
      if (a < 0.12) continue;
      const q = this.n++, x = ox + (j % cols) * p, y = oy + ((j / cols) | 0) * p;
      this.hx[q] = x; this.hy[q] = y; this.al[q] = a;
      this.col[q * 3] = d[i]; this.col[q * 3 + 1] = d[i + 1]; this.col[q * 3 + 2] = d[i + 2];
      this.lum[q] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      // Assembly: every dot flies in from a ring outside the view, the centre settling first.
      const ang = rnd() * Math.PI * 2, rad = far * (1.05 + rnd() * 0.5);
      this.sx[q] = cxm + cos(ang) * rad; this.sy[q] = cym + sin(ang) * rad;
      this.dl[q] = (hypot(x - cxm, y - cym) / far) * 0.9 + rnd() * 0.35;
      this.ph[q] = rnd() * 6.283;
    }
    // Draw order grouped by colour, so each colour is one path.
    const { key, C } = quantise(this.col, this.n);
    this.key = key;
    this.C = C;
    this.waves = [];
    this.nextWave = 1.5;
    this.sheen = null;
    this.order = Uint32Array.from({ length: this.n }, (_, q) => q).sort((a, b) => key[a] - key[b]);
    // Previews start already assembled.
    this.t = A.thumb ? 3 : 0;
    this.beats = sound.beats;
    this.kick = 0;
    this.ready = true;
    this.toneKey = "";
  }
  // Palette mode: saturated colours take the accent, strong contrast the ink, the rest the mid tone.
  tones(A) {
    const k = A.pal.a + A.pal.b + A.pal.c + A.pal.bg;
    if (k === this.toneKey) return;
    this.toneKey = k;
    const lbg = lumOf(A.rgb.bg);
    this.tone = new Uint8Array(this.n);
    for (let q = 0; q < this.n; q++) {
      const r = this.col[q * 3], g = this.col[q * 3 + 1], b = this.col[q * 3 + 2];
      const sat = (max(r, g, b) - min(r, g, b)) / 255;
      this.tone[q] = sat > 0.42 ? 0 : Math.abs(this.lum[q] - lbg) > 0.45 ? 1 : 2;
    }
  }
  update(dt, A) {
    if (!this.ready) { this.build(A); if (!this.ready) return; }
    dt = min(dt, 0.05);
    this.t += dt;
    const s = sound.on ? sound : null;
    let hit = false;
    if (s && s.beats !== this.beats) { this.beats = s.beats; this.kick = 1; hit = true; }
    this.kick *= exp(-dt * 6);
    // Springs back to the picture; the cursor and clicks push dots aside.
    const P = A.pointer, hov = P && P.active, R = A.thumb ? 0 : max(70, this.p * 9);
    const cxm = A.w / 2, cym = A.h / 2;
    const rip = A.ripples || [];
    const { dx, dy, vx, vy, hx, hy } = this;
    const beatPush = s ? this.kick * 26 * (0.4 + s.bass) : 0;
    // Left alone, the picture still stirs: every few seconds a soft wave rolls out from a
    // random spot (more often with sound, one per beat).
    const W = this.waves;
    this.nextWave -= dt;
    if (this.t > 2 && (this.nextWave <= 0 || hit)) {
      if (W.length > 4) W.shift();
      W.push({ x: A.w * (0.1 + rnd() * 0.8), y: A.h * (0.1 + rnd() * 0.8), r: 0, life: 1 });
      this.nextWave = 3.5 + rnd() * 3.5;
    }
    for (let i = W.length - 1; i >= 0; i--) {
      W[i].r += dt * max(A.w, A.h) * 0.32;
      W[i].life -= dt / 3.2;
      if (W[i].life <= 0) W.splice(i, 1);
    }
    const ww = max(A.w, A.h) * 0.045;
    for (let q = 0; q < this.n; q++) {
      let fx = -60 * dx[q], fy = -60 * dy[q];
      const x = hx[q] + dx[q], y = hy[q] + dy[q];
      for (let i = 0; i < W.length; i++) {
        const w = W[i], ex = hx[q] - w.x, ey = hy[q] - w.y, dd = sqrt(ex * ex + ey * ey);
        const z = (dd - w.r) / ww;
        if (z > -2 && z < 2 && dd > 0.01) { const e = exp(-z * z) * w.life * 1600; fx += (ex / dd) * e; fy += (ey / dd) * e; }
      }
      if (hov) {
        const ex = x - P.px, ey = y - P.py, dd = sqrt(ex * ex + ey * ey);
        if (dd < R && dd > 0.01) { const f = (1 - dd / R) ** 2 * 5200; fx += (ex / dd) * f; fy += (ey / dd) * f; }
      }
      for (let r = 0; r < rip.length; r++) {
        const W = rip[r], ex = x - W.px, ey = y - W.py, dd = sqrt(ex * ex + ey * ey);
        const z = (dd - W.r * A.cell) / (A.cell * 2.2);
        if (z > -2 && z < 2 && dd > 0.01) { const e = exp(-z * z) * W.life * W.amp * 9000; fx += (ex / dd) * e; fy += (ey / dd) * e; }
      }
      if (beatPush) { const ex = hx[q] - cxm, ey = hy[q] - cym, dd = sqrt(ex * ex + ey * ey) + 1; fx += (ex / dd) * beatPush * 60; fy += (ey / dd) * beatPush * 60; }
      vx[q] += (fx - 9 * vx[q]) * dt; vy[q] += (fy - 9 * vy[q]) * dt;
      dx[q] += vx[q] * dt; dy[q] += vy[q] * dt;
    }
  }
  paint(ctx, A, eng) {
    const k = ctx.canvas.width / A.w;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const rgb = A.rgb;
    ctx.fillStyle = rgbStr(...rgb.bg);
    ctx.fillRect(0, 0, A.w, A.h);
    if (!this.ready) return;
    const s = sound.on ? sound : null;
    const t = this.t, p = this.p, lbg = lumOf(rgb.bg);
    const palette = picOpts.color === "palette";
    if (palette) this.tones(A);
    const swell = 1 + (s ? 0.45 * s.bass + 0.25 * this.kick : 0);
    const cxm = A.w / 2, cym = A.h / 2, hi = s ? s.high : 0;
    const { hx, hy, dx, dy, sx, sy, dl, lum, al, ph, order } = this;
    const fills = palette ? [rgb.a, rgb.b, rgb.c] : null;
    const square = eng && eng.shape === "square";
    // On the GPU when the engine has it; otherwise Canvas 2D paths.
    const G = eng && eng.dotsGL ? eng.dotsGL() : null;
    if (G) G.begin(ctx.canvas, k);
    let color = null;
    // A band of light sweeps diagonally across every ~11 s; dots inside it swell and brighten.
    const span = A.w + A.h * 0.6, bw = span * 0.11;
    const bc = (((t * 0.09) % 1.4) - 0.2) * span;
    const sheen = this.sheen || (this.sheen = new Float32Array(this.n));
    for (let q = 0; q < this.n; q++) { const z = (hx[q] + hy[q] * 0.6 - bc) / bw; sheen[q] = z > -2.5 && z < 2.5 ? exp(-z * z) : 0; }
    // Idle sway: the whole picture ripples gently like a flag.
    const sw = p * 0.32;
    const draw = (q) => {
      const a = clamp((t - dl[q]) / 1.1, 0, 1), e = ease(a);
      const wx = sw * sin(hy[q] * 0.013 + hx[q] * 0.004 + t * 1.1), wy = sw * cos(hx[q] * 0.011 - t * 0.9);
      const x = sx[q] + (hx[q] + dx[q] + wx - sx[q]) * e, y = sy[q] + (hy[q] + dy[q] + wy - sy[q]) * e;
      // Size from contrast against the background, so the picture reads as halftone.
      let v = clamp(Math.abs(lum[q] - lbg) * 1.15 + 0.14, 0, 1) * al[q];
      // Breathing: a slow wave rolls out from the centre.
      const dc = hypot(hx[q] - cxm, hy[q] - cym);
      v *= (0.88 + 0.12 * sin(t * 1.3 - dc * 0.012)) * swell * (1 + 0.3 * sheen[q]);
      if (hi > 0.25 && sin(ph[q] + t * 9) > 0.985) v *= 1 + hi;
      const r = clamp(v, 0, 1.3) * p * 0.48 * (0.35 + 0.65 * e);
      if (r < 0.2) return;
      if (G) { G.push(x, y, r, color); return; }
      if (square) { ctx.rect(x - r, y - r, r * 2, r * 2); return; }
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 6.2832);
    };
    if (palette) {
      // The sweeping band turns dots to the accent colour.
      for (let g = 0; g < 3; g++) {
        color = fills[g];
        if (!G) { ctx.fillStyle = rgbStr(...color); ctx.beginPath(); }
        for (let q = 0; q < this.n; q++) if ((sheen[q] > 0.45 ? 0 : this.tone[q]) === g) draw(q);
        if (!G) ctx.fill();
      }
      if (G) G.flush(ctx, rgb.bg, !square);
      return;
    }
    // Colours drift slowly around the hue wheel (about ±30°, nudged on beats); inside the
    // band they lift toward white.
    const C = this.C, th = 0.52 * sin(t * 0.21) + (s ? 0.35 * this.kick : 0);
    const fill = (k, lift) => {
      const c = hueRotate(C[k * 3], C[k * 3 + 1], C[k * 3 + 2], th);
      return c.map((v) => clamp(v + (255 - v) * lift, 0, 255));
    };
    for (const lit of [false, true]) {
      let cur = -1;
      for (let o = 0; o < order.length; o++) {
        const q = order[o];
        if (sheen[q] > 0.3 !== lit) continue;
        const key = this.key[q];
        if (key !== cur) {
          if (cur !== -1 && !G) ctx.fill();
          cur = key;
          color = fill(key, lit ? 0.38 : 0);
          if (!G) { ctx.fillStyle = rgbStr(...color); ctx.beginPath(); }
        }
        draw(q);
      }
      if (cur !== -1 && !G) ctx.fill();
    }
    if (G) G.flush(ctx, rgb.bg, !square);
  }
}

export const PIC_ICON = '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>';
export const pictureEntry = (pic) => ({ id: pic.id, name: pic.name, icon: PIC_ICON, make: () => new PictureScene(pic) });
