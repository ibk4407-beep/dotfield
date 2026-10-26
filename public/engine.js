// Dot renderer. Grid scenes paint into a tiny canvas (one pixel per dot); the engine snaps
// each pixel to a palette tone, eases dot sizes and moves dots on springs. Free scenes
// (3D objects, curves) hand the engine positioned dots directly.
import { buildClockMask } from "./clock.js";

export const hexToRgb = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbStr = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Interleaved gradient noise: an even, blue-noise-like threshold for 1-bit dithering.
const ign = (x, y) => { const v = 0.06711056 * x + 0.00583715 * y; return (52.9829189 * (v - Math.floor(v))) % 1; };

const KEYS = ["bg", "base", "a", "b", "c"];
// Tone groups, drawn back to front.
export const T_BASE = 0, T_DIM = 1, T_C = 2, T_A = 3, T_B = 4;

export function nearestTone(r, g, b, A, B, C) {
  const da = (r - A[0]) ** 2 + (g - A[1]) ** 2 + (b - A[2]) ** 2;
  const db = (r - B[0]) ** 2 + (g - B[1]) ** 2 + (b - B[2]) ** 2;
  const dc = (r - C[0]) ** 2 + (g - C[1]) ** 2 + (b - C[2]) ** 2;
  return da <= db && da <= dc ? T_A : db <= dc ? T_B : T_C;
}
const dimOf = (rgb) => [0, 1, 2].map((i) => rgb.base[i] + (rgb.c[i] - rgb.base[i]) * 0.45);
const fillsOf = (rgb) => [rgb.base, dimOf(rgb), rgb.c, rgb.a, rgb.b];

// A reusable buffer of positioned dots for free scenes.
export class Points {
  constructor(cap = 1024) { this.alloc(cap); }
  alloc(cap) {
    this.cap = cap;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.s = new Float32Array(cap); this.t = new Uint8Array(cap);
    this.n = 0;
  }
  reset() { this.n = 0; }
  push(x, y, s, t) {
    if (this.n >= this.cap) {
      const o = this;
      const next = new Points(this.cap * 2);
      next.x.set(o.x); next.y.set(o.y); next.s.set(o.s); next.t.set(o.t);
      Object.assign(this, { cap: next.cap, x: next.x, y: next.y, s: next.s, t: next.t });
    }
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.s[i] = s; this.t[i] = t;
  }
}

function drawPointGroups(ctx, P, fills, circle) {
  for (let g = 0; g < 5; g++) {
    ctx.fillStyle = rgbStr(fills[g]);
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < P.n; i++) {
      if (P.t[i] !== g) continue;
      const h = P.s[i] / 2;
      if (h < 0.15) continue;
      any = true;
      if (circle) { ctx.moveTo(P.x[i] + h, P.y[i]); ctx.arc(P.x[i], P.y[i], h, 0, 6.2832); }
      else ctx.rect(P.x[i] - h, P.y[i] - h, h * 2, h * 2);
    }
    if (any) ctx.fill();
  }
}

// Stateless drawing for small previews.
export function drawDots(ctx, d, cols, rows, cell, rgb, shape, style) {
  ctx.fillStyle = rgbStr(rgb.bg);
  ctx.fillRect(0, 0, cols * cell, rows * cell);
  const groups = [[], [], [], [], []];
  const sizes = new Float32Array(cols * rows);
  for (let j = 0; j < cols * rows; j++) {
    const i = j * 4, a = d[i + 3] / 255;
    const x = j % cols, y = (j / cols) | 0;
    if (a < 0.05 || (style === "dither" && a < ign(x, y))) { sizes[j] = cell * 0.14; groups[T_BASE].push(j); continue; }
    sizes[j] = style === "dither" ? cell * 0.66 : cell * (0.2 + 0.7 * Math.pow(a, 0.8));
    groups[nearestTone(d[i], d[i + 1], d[i + 2], rgb.a, rgb.b, rgb.c)].push(j);
  }
  const fills = fillsOf(rgb);
  for (let gI = 0; gI < 5; gI++) {
    ctx.fillStyle = rgbStr(fills[gI]);
    ctx.beginPath();
    for (const j of groups[gI]) {
      const x = (j % cols) * cell + cell / 2, y = ((j / cols) | 0) * cell + cell / 2, h = sizes[j] / 2;
      if (shape === "circle") { ctx.moveTo(x + h, y); ctx.arc(x, y, h, 0, 6.2832); } else ctx.rect(x - h, y - h, h * 2, h * 2);
    }
    ctx.fill();
  }
}
export function drawFree(ctx, P, w, h, rgb, shape) {
  ctx.fillStyle = rgbStr(rgb.bg);
  ctx.fillRect(0, 0, w, h);
  drawPointGroups(ctx, P, fillsOf(rgb), shape === "circle");
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.low = document.createElement("canvas");
    this.lctx = this.low.getContext("2d", { willReadFrequently: true });
    this.snap = document.createElement("canvas");
    this.snapK = 0;
    this.cellBase = 14;
    this.cell = 14;
    this.speed = 1;
    this.shape = "circle";
    this.style = "halftone";
    this.interact = true;
    this.maxFps = 60;
    this.clockStyle = "dot";
    this.burnin = true;
    this.ripples = [];
    this.pointer = { x: -999, y: -999, px: -999, py: -999, active: false };
    this.overlayK = 0;
    this.overlayTarget = 0;
    this.mask = null;
    this.maskKey = "";
    this.scene = null;
    this.prevData = null;
    this.lastData = null;
    this.trans = 1;
    this.t = 0;
    this.frames = 0;
    this.cur = null;
    this.target = null;
    this.A = { cols: 0, rows: 0, w: 0, h: 0, cell: 14, t: 0, pal: {}, rgb: {}, pointer: this.pointer, ripples: this.ripples };
    this.firstFrame = new Promise((r) => (this._ff = r));
    addEventListener("resize", () => this.resize());
    this.resize();
    this.last = performance.now();
    this.lastDraw = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    // Some embedded or occluded views pause rAF while still visible; keep drawing at a low rate.
    setInterval(() => {
      if (!document.hidden && performance.now() - this.last > 250) this.step(performance.now());
    }, 100);
  }

  setColors(c, instant = false) {
    const next = {};
    for (const k of KEYS) next[k] = hexToRgb(c[k]);
    this.target = next;
    if (!this.cur || instant) this.cur = Object.fromEntries(KEYS.map((k) => [k, next[k].slice()]));
  }

  effCell(scene = this.scene) {
    return Math.max(6, Math.round(this.cellBase * ((scene && scene.pitch) || 1)));
  }

  setCell(px) {
    this.cellBase = px;
    const eff = this.effCell();
    if (eff === this.cell) return;
    this.cell = eff;
    this.resize();
  }

  setScene(factory, instant = false) {
    const next = factory();
    const eff = this.effCell(next);
    const old = this.scene;
    const morph = !instant && old && !old.free && !next.free && eff === this.cell && this.lastData;
    if (!instant && old && !morph && this.frames > 1) {
      // Different kinds of scenes can't morph dot-by-dot, so cross-fade the last frame instead.
      this.snap.width = this.canvas.width;
      this.snap.height = this.canvas.height;
      this.snap.getContext("2d").drawImage(this.canvas, 0, 0);
      this.snapK = 1;
    }
    this.prevData = morph ? this.lastData : null;
    this.trans = morph ? 0 : 1;
    this.scene = null;
    if (eff !== this.cell) { this.cell = eff; this.resize(); }
    this.scene = next;
    this.lctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lctx.globalCompositeOperation = "source-over";
    this.lctx.globalAlpha = 1;
    this.lctx.clearRect(0, 0, this.cols, this.rows);
    this.lastData = null;
    next.init(this.A);
  }

  setOverlay(on) {
    this.overlayTarget = on ? 1 : 0;
    this.maskKey = "";
  }

  addRipple(px, py, amp = 1) {
    if (this.ripples.length > 8) this.ripples.shift();
    this.ripples.push({ x: px / this.cell, y: py / this.cell, px, py, r: 0, w: 1.4, amp, life: 1, age: 0, dur: 1.2 + amp * 0.6 });
  }

  setPointer(px, py, active) {
    this.pointer.x = px / this.cell;
    this.pointer.y = py / this.cell;
    this.pointer.px = px;
    this.pointer.py = py;
    this.pointer.active = active;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.A.w = w; this.A.h = h; this.A.cell = this.cell;
    const cols = Math.ceil(w / this.cell) + 1;
    const rows = Math.ceil(h / this.cell) + 1;
    if (cols === this.cols && rows === this.rows) { if (this.scene && this.scene.free) this.scene.init(this.A); return; }
    this.cols = cols; this.rows = rows;
    this.low.width = cols; this.low.height = rows;
    this.A.cols = cols; this.A.rows = rows;
    const n = cols * rows;
    this.S = new Float32Array(n).fill(this.cell * 0.14);
    this.OX = new Float32Array(n);
    this.OY = new Float32Array(n);
    this.VX = new Float32Array(n);
    this.VY = new Float32Array(n);
    this.TH = new Float32Array(n);
    for (let j = 0; j < n; j++) this.TH[j] = ign(j % cols, (j / cols) | 0);
    this.groups = Array.from({ length: 5 }, () => new Int32Array(n));
    this.prevData = null;
    this.lastData = null;
    this.trans = 1;
    this.maskKey = "";
    if (this.scene) this.scene.init(this.A);
  }

  updateMask() {
    const d = new Date();
    let drift = { x: 0, y: 0 };
    if (this.burnin) {
      // Shift the face a little every minute so static pixels don't burn in.
      const m = Math.floor(d.getTime() / 60000);
      drift = { x: Math.round(Math.sin(m * 0.9) * this.cols * 0.12), y: Math.round(Math.cos(m * 1.3) * this.rows * 0.1) };
    }
    const key = `${this.clockStyle}|${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}|${this.cols}x${this.rows}|${drift.x},${drift.y}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    const m = buildClockMask(this.clockStyle, this.cols, this.rows, d, drift);
    this.mask = m.tone;
    this.maskA = m.alpha;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.maxFps < 60 && now - this.lastDraw < 1000 / this.maxFps - 2) return;
    this.step(now);
  }

  step(now) {
    this.lastDraw = now;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.scene) return;
    const sdt = dt * this.speed;
    this.t += sdt;

    const k = Math.min(1, dt * 5);
    for (const key of KEYS) {
      const c = this.cur[key], tg = this.target[key];
      for (let i = 0; i < 3; i++) c[i] += (tg[i] - c[i]) * k;
    }
    const A = this.A;
    for (const key of KEYS) {
      A.rgb[key] = this.cur[key];
      A.pal[key] = rgbStr(this.cur[key]);
    }
    A.t = this.t;

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const R = this.ripples[i];
      R.r += 24 * dt;
      R.age += dt;
      R.life -= dt / R.dur;
      if (R.life <= 0) this.ripples.splice(i, 1);
    }

    this.overlayK += (this.overlayTarget - this.overlayK) * Math.min(1, dt * 3.5);
    if (this.overlayK > 0.005) this.updateMask();

    if (this.scene.free) {
      this.scene.update(sdt, A);
      this.renderFree(this.scene.points(A), dt);
    } else {
      const L = this.lctx;
      if (!this.scene.persist) L.clearRect(0, 0, this.cols, this.rows);
      this.scene.update(sdt, A);
      this.scene.draw(L, A);
      const data = L.getImageData(0, 0, this.cols, this.rows).data;
      if (this.trans < 1) this.trans = Math.min(1, this.trans + dt / 0.9);
      this.render(data, dt);
      this.lastData = data;
    }

    if (this.snapK > 0) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = easeInOut(this.snapK);
      this.ctx.drawImage(this.snap, 0, 0);
      this.ctx.globalAlpha = 1;
      this.snapK = Math.max(0, this.snapK - dt / 0.9);
    }
    if (this.frames++ === 1) this._ff();
  }

  renderFree(P, dt) {
    const { ctx, cols, rows, cell, cur } = this;
    const circle = this.shape === "circle";
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = rgbStr(cur.bg);
    ctx.fillRect(0, 0, this.w, this.h);
    const half = cell / 2;
    if (this.scene.grid !== false) {
      // A whisper of the dot grid keeps free scenes part of the same field.
      ctx.fillStyle = rgbStr(cur.base);
      ctx.beginPath();
      const s = cell * 0.09;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const cx = x * cell + half, cy = y * cell + half;
        if (circle) { ctx.moveTo(cx + s, cy); ctx.arc(cx, cy, s, 0, 6.2832); } else ctx.rect(cx - s, cy - s, s * 2, s * 2);
      }
      ctx.fill();
    }
    drawPointGroups(ctx, P, fillsOf(cur), circle);

    const ok = this.overlayK;
    if (ok > 0.005 && this.mask) {
      const mask = this.mask, ma = this.maskA;
      ctx.globalAlpha = Math.min(1, ok * 1.2);
      ctx.fillStyle = rgbStr(cur.bg);
      ctx.beginPath();
      for (let j = 0; j < mask.length; j++) if (mask[j]) ctx.rect((j % cols) * cell, ((j / cols) | 0) * cell, cell + 0.5, cell + 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
      const fills = fillsOf(cur);
      for (const [m, tone] of [[4, T_DIM], [1, T_B], [3, T_A]]) {
        ctx.fillStyle = rgbStr(fills[tone]);
        ctx.beginPath();
        for (let j = 0; j < mask.length; j++) {
          if (mask[j] !== m) continue;
          const sz = (m === 4 ? cell * 0.36 : cell * (0.2 + 0.7 * Math.pow(ma[j], 0.8))) * Math.min(1, ok * 1.5) / 2;
          const cx = (j % cols) * cell + half, cy = ((j / cols) | 0) * cell + half;
          if (circle) { ctx.moveTo(cx + sz, cy); ctx.arc(cx, cy, sz, 0, 6.2832); } else ctx.rect(cx - sz, cy - sz, sz * 2, sz * 2);
        }
        ctx.fill();
      }
    }
  }

  render(d, dt) {
    const { ctx, cols, rows, cell, cur, S, OX, OY, VX, VY, TH, groups } = this;
    const circle = this.shape === "circle";
    const dither = this.style === "dither";
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = rgbStr(cur.bg);
    ctx.fillRect(0, 0, this.w, this.h);

    const prev = this.trans < 1 ? this.prevData : null;
    const tk = easeInOut(this.trans);
    const ok = this.overlayK;
    const mask = ok > 0.005 ? this.mask : null;
    const ma = this.maskA;
    const rip = this.ripples;
    const P = this.pointer;
    const hov = this.interact && P.active;
    const t = this.t;
    const CA = cur.a, CB = cur.b, CC = cur.c;
    const ease = 1 - Math.exp(-dt * 11);
    const K = 70, DAMP = 11, RP = 7;
    const counts = [0, 0, 0, 0, 0];
    const baseSize = cell * 0.13;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const j = y * cols + x, i = j * 4;
        let a = d[i + 3] / 255, r = d[i], g = d[i + 1], b = d[i + 2];
        if (prev) {
          const na = a * tk, pa = (prev[i + 3] / 255) * (1 - tk), ta = na + pa;
          if (ta > 0) {
            r = (r * na + prev[i] * pa) / ta;
            g = (g * na + prev[i + 1] * pa) / ta;
            b = (b * na + prev[i + 2] * pa) / ta;
          }
          a = ta;
        }

        let tone = -1;
        if (mask) {
          const m = mask[j];
          if (m === 1 || m === 3) {
            if (ok > 0.5) { tone = m === 1 ? T_B : T_A; a = ma[j]; }
            else a *= 1 - ok * 2;
          } else if (m === 2) a *= 1 - 0.95 * ok;
          else if (m === 4 && ok > 0.5) { tone = T_DIM; a = 0.42; }
        }

        // Breathing: a slow diagonal swell keeps the empty field alive.
        const swell = 0.5 + 0.5 * Math.sin(x * 0.18 + y * 0.12 - t * 0.8);
        let target;
        if (tone === T_DIM) target = cell * 0.36;
        else if (tone >= 0) target = cell * (0.2 + 0.7 * Math.pow(a, 0.8));
        else if (a < 0.05 || (dither && a < TH[j])) { tone = T_BASE; target = baseSize * (0.85 + 0.35 * swell); }
        else {
          tone = nearestTone(r, g, b, CA, CB, CC);
          target = dither ? cell * 0.66 : cell * (0.2 + 0.7 * Math.pow(a, 0.8));
        }

        // Springs: the cursor pushes dots aside, click shockwaves throw them outward.
        let fx = -K * OX[j], fy = -K * OY[j];
        if (hov) {
          const ex = x - P.x, ey = y - P.y, dd = Math.sqrt(ex * ex + ey * ey);
          if (dd < RP && dd > 0.001) {
            const f = (1 - dd / RP) ** 2;
            fx += (ex / dd) * f * 46;
            fy += (ey / dd) * f * 46;
            target *= 1 + 0.55 * f;
            if (tone === T_BASE && f > 0.25) tone = T_DIM;
          }
        }
        for (let q = 0; q < rip.length; q++) {
          const R = rip[q];
          const ex = x - R.x, ey = y - R.y, dd = Math.sqrt(ex * ex + ey * ey);
          const z = (dd - R.r) / R.w;
          if (z > -2.5 && z < 2.5 && dd > 0.001) {
            const e = Math.exp(-z * z) * R.life * R.amp;
            fx += (ex / dd) * e * 160;
            fy += (ey / dd) * e * 160;
            target *= 1 + 0.5 * e;
          }
        }
        let vx = VX[j] + (fx - DAMP * VX[j]) * dt, vy = VY[j] + (fy - DAMP * VY[j]) * dt;
        let ox = OX[j] + vx * dt, oy = OY[j] + vy * dt;
        if (ox > 1.2) ox = 1.2; else if (ox < -1.2) ox = -1.2;
        if (oy > 1.2) oy = 1.2; else if (oy < -1.2) oy = -1.2;
        VX[j] = vx; VY[j] = vy; OX[j] = ox; OY[j] = oy;

        if (target > cell * 0.95) target = cell * 0.95;
        S[j] += (target - S[j]) * ease;
        groups[tone][counts[tone]++] = j;
      }
    }

    const fills = fillsOf(cur);
    const half = cell / 2;
    for (let gI = 0; gI < 5; gI++) {
      const n = counts[gI];
      if (!n) continue;
      const arr = groups[gI];
      ctx.fillStyle = rgbStr(fills[gI]);
      ctx.beginPath();
      for (let q = 0; q < n; q++) {
        const j = arr[q], x = j % cols, y = (j / cols) | 0;
        const cx = x * cell + half + OX[j] * cell, cy = y * cell + half + OY[j] * cell, hs = S[j] / 2;
        if (circle) { ctx.moveTo(cx + hs, cy); ctx.arc(cx, cy, hs, 0, 6.2832); }
        else ctx.rect(cx - hs, cy - hs, hs * 2, hs * 2);
      }
      ctx.fill();
    }
  }
}
