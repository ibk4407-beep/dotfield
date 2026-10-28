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

function drawPointGroups(ctx, P, fills, circle, k = 1) {
  for (let g = 0; g < 5; g++) {
    ctx.fillStyle = rgbStr(fills[g]);
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < P.n; i++) {
      if (P.t[i] !== g) continue;
      const h = (P.s[i] / 2) * k;
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
    this.clockStyle = "light";
    this.clockPos = "bl";
    this.clockSize = "m";
    this.burnin = true;
    this.clk = null;
    this.ripples = [];
    this.sound = null;
    this.react = 1;
    this.pulse = null;
    this.beatsSeen = 0;
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
    if (!instant && old && !morph && this.frames > 1 && this.canvas.width > 0 && this.canvas.height > 0) {
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

  // The clock lives on its own finer dot grid inside a box placed on screen, so it reads as
  // type rather than as coarse field dots.
  updateMask() {
    const d = new Date();
    const { w, h } = this;
    const pc = Math.max(3.5, this.cellBase * (this.clockSize === "l" ? 0.5 : 0.36));
    const box = { s: [0.26, 0.16], m: [0.4, 0.24], l: [0.7, 0.44] }[this.clockSize] || [0.4, 0.24];
    const bw = Math.min(w * box[0], h * box[0] * 1.9), bh = Math.min(h * box[1], bw * 0.62);
    const mx = w * 0.05, my = h * 0.07;
    let x0 = this.clockPos === "center" ? (w - bw) / 2 : this.clockPos === "br" ? w - mx - bw : mx;
    let y0 = this.clockPos === "center" ? (h - bh) / 2 : h - my - bh;
    if (this.burnin) {
      // Wander a little every minute so static pixels don't burn in.
      const m = Math.floor(d.getTime() / 60000);
      x0 += Math.sin(m * 0.9) * w * 0.03;
      y0 += Math.cos(m * 1.3) * h * 0.03;
      x0 = Math.max(4, Math.min(w - bw - 4, x0));
      y0 = Math.max(4, Math.min(h - bh - 4, y0));
    }
    const cols = Math.max(16, Math.round(bw / pc)), rows = Math.max(9, Math.round(bh / pc));
    const key = `${this.clockStyle}|${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}|${cols}x${rows}|${Math.round(x0)},${Math.round(y0)}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    const m = buildClockMask(this.clockStyle, cols, rows, d, { x: 0, y: 0 });
    this.clk = { tone: m.tone, alpha: m.alpha, cols, rows, x0, y0, pc };
  }

  drawClock() {
    const ok = this.overlayK, C = this.clk;
    if (ok < 0.005 || !C) return;
    const { ctx, cur } = this, circle = this.shape === "circle";
    const { tone, alpha, cols, pc, x0, y0 } = C, half = pc / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // A soft knockout that follows the glyphs keeps them legible over any scene.
    ctx.globalAlpha = Math.min(1, ok) * 0.9;
    ctx.fillStyle = rgbStr(cur.bg);
    ctx.beginPath();
    for (let j = 0; j < tone.length; j++) if (tone[j]) ctx.rect(x0 + (j % cols) * pc - 0.5, y0 + ((j / cols) | 0) * pc - 0.5, pc + 1, pc + 1);
    ctx.fill();
    ctx.globalAlpha = 1;
    const fills = fillsOf(cur), grow = Math.min(1, ok * 1.3);
    for (const [m, t] of [[4, T_DIM], [1, T_B], [3, T_A]]) {
      ctx.fillStyle = rgbStr(fills[t]);
      ctx.beginPath();
      for (let j = 0; j < tone.length; j++) {
        if (tone[j] !== m) continue;
        const r = (m === 4 ? pc * 0.34 : pc * (0.22 + 0.72 * Math.pow(alpha[j], 0.8))) * grow / 2;
        const cx = x0 + (j % cols) * pc + half, cy = y0 + ((j / cols) | 0) * pc + half;
        if (circle) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, 6.2832); } else ctx.rect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.fill();
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.maxFps < 60 && now - this.lastDraw < 1000 / this.maxFps - 2) return;
    this.step(now);
  }

  step(now) {
    this.lastDraw = now;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (!this.scene) return;
    const snd = this.sound;
    if (snd) snd.update(dt);
    // With sound connected, scenes that don't listen on their own speed up with loudness,
    // swell with the bass and pulse on every beat.
    const R = snd && snd.on && !this.scene.sound ? this.react : 0;
    this.pulse = R ? { size: 1 + R * (0.3 * snd.bass + 0.3 * snd.beat), zoom: 1 + R * (0.02 * snd.bass + 0.035 * snd.beat), base: R * snd.high } : null;
    const sdt = dt * this.speed * (R ? 1 + R * (1.1 * snd.level + 0.9 * snd.beat) : 1);
    if (R && snd.beats !== this.beatsSeen && !this.scene.free) {
      this.addRipple(this.w * (0.15 + Math.random() * 0.7), this.h * (0.15 + Math.random() * 0.7), Math.min(0.5, 0.3 * R));
    }
    if (snd) this.beatsSeen = snd.beats;
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

    if (this.scene.paint) {
      // Scenes with their own renderer (WebGL) paint the whole view themselves.
      this.scene.update(sdt, A);
      this.scene.paint(this.ctx, A, this);
    } else if (this.scene.free) {
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

    if (this.snapK > 0 && this.snap.width > 0 && this.snap.height > 0) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = easeInOut(this.snapK);
      this.ctx.drawImage(this.snap, 0, 0);
      this.ctx.globalAlpha = 1;
      this.snapK = Math.max(0, this.snapK - dt / 0.9);
    }
    this.drawClock();
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
    const pz = this.pulse;
    if (pz) {
      // Zoom about the centre so the whole picture breathes.
      const z = pz.zoom, d = this.dpr;
      ctx.setTransform(d * z, 0, 0, d * z, (this.w / 2) * (1 - z) * d, (this.h / 2) * (1 - z) * d);
    }
    drawPointGroups(ctx, P, fillsOf(cur), circle, pz ? pz.size : 1);

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
    const rip = this.ripples;
    const P = this.pointer;
    const hov = this.interact && P.active;
    const t = this.t;
    const CA = cur.a, CB = cur.b, CC = cur.c;
    const ease = 1 - Math.exp(-dt * 11);
    const K = 70, DAMP = 11, RP = 7;
    const counts = [0, 0, 0, 0, 0];
    const pz = this.pulse;
    const baseSize = cell * 0.13 * (pz ? 1 + pz.base * 0.9 : 1), sizeK = pz ? pz.size : 1;

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

        // Breathing: a slow diagonal swell keeps the empty field alive.
        const swell = 0.5 + 0.5 * Math.sin(x * 0.18 + y * 0.12 - t * 0.8);
        let target;
        if (a < 0.05 || (dither && a < TH[j])) { tone = T_BASE; target = baseSize * (0.85 + 0.35 * swell); }
        else {
          tone = nearestTone(r, g, b, CA, CB, CC);
          target = (dither ? cell * 0.66 : cell * (0.2 + 0.7 * Math.pow(a, 0.8))) * sizeK;
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
