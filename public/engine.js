// Dot-matrix renderer. Scenes paint into a tiny canvas (one pixel per dot); the engine
// snaps each pixel to a palette tone, eases dot sizes, and moves dots on springs.
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
const T_BASE = 0, T_DIM = 1, T_C = 2, T_A = 3, T_B = 4;

export function nearestTone(r, g, b, A, B, C) {
  const da = (r - A[0]) ** 2 + (g - A[1]) ** 2 + (b - A[2]) ** 2;
  const db = (r - B[0]) ** 2 + (g - B[1]) ** 2 + (b - B[2]) ** 2;
  const dc = (r - C[0]) ** 2 + (g - C[1]) ** 2 + (b - C[2]) ** 2;
  return da <= db && da <= dc ? T_A : db <= dc ? T_B : T_C;
}

// Stateless dot drawing for small previews.
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
  const fills = [rgb.base, rgb.base, rgb.c, rgb.a, rgb.b];
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

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.low = document.createElement("canvas");
    this.lctx = this.low.getContext("2d", { willReadFrequently: true });
    this.cell = 14;
    this.speed = 1;
    this.shape = "circle";
    this.style = "halftone";
    this.interact = true;
    this.maxFps = 60;
    this.clockStyle = "dot";
    this.burnin = true;
    this.ripples = [];
    this.pointer = { x: -999, y: -999, active: false };
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
    this.A = { cols: 0, rows: 0, t: 0, pal: {}, rgb: {}, pointer: this.pointer, ripples: this.ripples };
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

  setCell(px) {
    if (px === this.cell) return;
    this.cell = px;
    this.resize();
  }

  setScene(factory, instant = false) {
    this.prevData = instant ? null : this.lastData;
    this.trans = instant || !this.lastData ? 1 : 0;
    this.scene = factory();
    this.lctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lctx.globalCompositeOperation = "source-over";
    this.lctx.globalAlpha = 1;
    this.lctx.clearRect(0, 0, this.cols, this.rows);
    this.scene.init(this.A);
  }

  setOverlay(on) {
    this.overlayTarget = on ? 1 : 0;
    this.maskKey = "";
  }

  addRipple(px, py, amp = 1) {
    if (this.ripples.length > 8) this.ripples.shift();
    this.ripples.push({ x: px / this.cell, y: py / this.cell, r: 0, w: 1.4, amp, life: 1, age: 0, dur: 1.2 + amp * 0.6 });
  }

  setPointer(px, py, active) {
    this.pointer.x = px / this.cell;
    this.pointer.y = py / this.cell;
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
    const cols = Math.ceil(w / this.cell) + 1;
    const rows = Math.ceil(h / this.cell) + 1;
    if (cols === this.cols && rows === this.rows) return;
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
    this.mask = buildClockMask(this.clockStyle, this.cols, this.rows, d, drift);
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

    const L = this.lctx;
    if (!this.scene.persist) L.clearRect(0, 0, this.cols, this.rows);
    this.scene.update(sdt, A);
    this.scene.draw(L, A);
    const data = L.getImageData(0, 0, this.cols, this.rows).data;

    if (this.trans < 1) this.trans = Math.min(1, this.trans + dt / 0.9);
    this.overlayK += (this.overlayTarget - this.overlayK) * Math.min(1, dt * 3.5);
    if (this.overlayK > 0.005) this.updateMask();

    this.render(data, dt);
    this.lastData = data;
    if (this.frames++ === 1) this._ff();
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
            if (ok > 0.5) { tone = m === 1 ? T_B : T_A; a = 1; }
            else a *= 1 - ok * 2;
          } else if (m === 2) a *= 1 - 0.95 * ok;
          else if (m === 4 && ok > 0.5) { tone = T_DIM; a = 0.42; }
        }

        // Breathing: a slow diagonal swell keeps the empty field alive.
        const swell = 0.5 + 0.5 * Math.sin(x * 0.18 + y * 0.12 - t * 0.8);
        let target;
        if (tone === T_DIM) target = cell * 0.36;
        else if (tone >= 0) target = cell * 0.82;
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

    const dim = [cur.base[0] + (CC[0] - cur.base[0]) * 0.45, cur.base[1] + (CC[1] - cur.base[1]) * 0.45, cur.base[2] + (CC[2] - cur.base[2]) * 0.45];
    const fills = [cur.base, dim, CC, CA, CB];
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
