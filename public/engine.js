// Dot-matrix renderer. Each scene paints into a tiny canvas (one pixel per dot),
// and the engine turns those pixels into dots sized by alpha and tinted by color.

export const hexToRgb = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbStr = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 5x7 glyphs for the screensaver clock.
const FONT = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["0", "1", "0", "0", "0", "1", "0"],
  " ": ["0", "0", "0", "0", "0", "0", "0"],
};

const KEYS = ["bg", "base", "a", "b", "c"];

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.low = document.createElement("canvas");
    this.lctx = this.low.getContext("2d", { willReadFrequently: true });
    this.cell = 14;
    this.speed = 1;
    this.shape = "square";
    this.interact = true;
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
    this.colorStrs = new Map();
    this.buckets = new Map();
    this.A = { cols: 0, rows: 0, t: 0, pal: {}, rgb: {}, pointer: this.pointer, ripples: this.ripples };
    this.firstFrame = new Promise((r) => (this._ff = r));
    addEventListener("resize", () => this.resize());
    this.resize();
    this.last = performance.now();
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
  }

  addRipple(px, py, amp = 1) {
    if (this.ripples.length > 10) this.ripples.shift();
    this.ripples.push({ x: px / this.cell, y: py / this.cell, r: 0, w: 1.6, amp, life: 1, age: 0, dur: 1.6 + amp * 0.8 });
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
    this.ax = new Float32Array(cols);
    this.ay = new Float32Array(rows);
    const n = cols * rows;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.ps = new Float32Array(n);
    this.prevData = null;
    this.lastData = null;
    this.trans = 1;
    this.maskKey = "";
    if (this.scene) this.scene.init(this.A);
  }

  buildMask() {
    const d = new Date();
    const blink = d.getSeconds() % 2 === 0;
    const str = `${String(d.getHours()).padStart(2, "0")}${blink ? ":" : " "}${String(d.getMinutes()).padStart(2, "0")}`;
    const key = `${str}|${this.cols}x${this.rows}`;
    if (key === this.maskKey) return;
    this.maskKey = key;
    const { cols, rows } = this;
    const glyphs = [...str].map((ch) => FONT[ch]);
    const widthUnits = glyphs.reduce((s, g) => s + g[0].length, 0) + glyphs.length - 1;
    const s = Math.max(1, Math.floor(Math.min((cols * 0.72) / widthUnits, (rows * 0.45) / 7)));
    const ox = Math.floor((cols - widthUnits * s) / 2);
    const oy = Math.floor((rows - 7 * s) / 2);
    const mask = new Uint8Array(cols * rows);
    let cx = ox;
    for (const g of glyphs) {
      const gw = g[0].length;
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < gw; gx++) {
          if (g[gy][gx] !== "1") continue;
          for (let yy = 0; yy < s; yy++)
            for (let xx = 0; xx < s; xx++) {
              const x = cx + gx * s + xx, y = oy + gy * s + yy;
              if (x >= 0 && y >= 0 && x < cols && y < rows) mask[y * cols + x] = 1;
            }
        }
      cx += (gw + 1) * s;
    }
    // A soft halo keeps the digits readable over any scene.
    const halo = Math.max(2, s);
    const out = mask.slice();
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (mask[y * cols + x] !== 1) continue;
        for (let dy = -halo; dy <= halo; dy++)
          for (let dx = -halo; dx <= halo; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
            const j = yy * cols + xx;
            if (out[j] === 0) out[j] = 2;
          }
      }
    this.mask = out;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    this.step(now);
  }

  step(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.scene) return;
    const sdt = dt * this.speed;
    this.t += sdt;

    // Palette morph
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
      R.r += 22 * dt;
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
    if (this.overlayK > 0.005) this.buildMask();

    this.render(data);
    this.lastData = data;
    if (this.frames++ === 1) this._ff();
  }

  colorStr(key) {
    let s = this.colorStrs.get(key);
    if (!s) {
      s = `rgb(${((key >> 10) & 31) * 8 + 4},${((key >> 5) & 31) * 8 + 4},${(key & 31) * 8 + 4})`;
      this.colorStrs.set(key, s);
    }
    return s;
  }

  render(d) {
    const { ctx, cols, rows, cell, cur } = this;
    const circle = this.shape === "circle";
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
    const base = cur.base, ink = cur.b, acc = cur.a;

    for (let x = 0; x < cols; x++) this.ax[x] = Math.sin(x * 0.23 + t * 0.7);
    for (let y = 0; y < rows; y++) this.ay[y] = Math.cos(y * 0.19 - t * 0.5);

    for (const arr of this.buckets.values()) arr.length = 0;
    const px = this.px, py = this.py, ps = this.ps;

    ctx.fillStyle = rgbStr(base);
    ctx.beginPath();
    const half = cell / 2;

    for (let y = 0; y < rows; y++) {
      const cyBase = y * cell + half;
      for (let x = 0; x < cols; x++) {
        const j = y * cols + x;
        const i = j * 4;
        let a = d[i + 3] / 255, r = d[i], g = d[i + 1], b = d[i + 2];

        if (prev) {
          const na = a * tk, pa = (prev[i + 3] / 255) * (1 - tk);
          const ta = na + pa;
          if (ta > 0) {
            r = (r * na + prev[i] * pa) / ta;
            g = (g * na + prev[i + 1] * pa) / ta;
            b = (b * na + prev[i + 2] * pa) / ta;
          }
          a = ta;
        }
        if (mask) {
          const m = mask[j];
          if (m === 1) {
            r += (ink[0] - r) * ok; g += (ink[1] - g) * ok; b += (ink[2] - b) * ok;
            a += (1 - a) * ok;
          } else if (m === 2) a *= 1 - 0.92 * ok;
        }

        let s = 0, dx = 0, dy = 0;
        for (let q = 0; q < rip.length; q++) {
          const R = rip[q];
          const ex = x - R.x, ey = y - R.y;
          const dist = Math.sqrt(ex * ex + ey * ey);
          const z = (dist - R.r) / R.w;
          if (z > -3 && z < 3) {
            const e = Math.exp(-z * z) * R.life * R.amp;
            s += e;
            if (dist > 0.01) { dx += (ex / dist) * e; dy += (ey / dist) * e; }
          }
        }
        if (hov) {
          const ex = x - P.x, ey = y - P.y, d2 = ex * ex + ey * ey;
          if (d2 < 36) { const e = 1 - Math.sqrt(d2) / 6; s += e * e * 0.7; }
        }
        const cx = x * cell + half + dx * cell * 0.35;
        const cy = cyBase + dy * cell * 0.35;
        const sc = s > 1.5 ? 1.5 : s;

        let sz, cr, cg, cb;
        if (a < 0.04) {
          const amb = 0.5 + 0.5 * this.ax[x] * this.ay[y];
          sz = cell * (0.12 + 0.09 * amb + 0.32 * sc);
          if (s < 0.05) {
            const hs = sz / 2;
            if (circle) { ctx.moveTo(cx + hs, cy); ctx.arc(cx, cy, hs, 0, 6.2832); }
            else ctx.rect(cx - hs, cy - hs, sz, sz);
            continue;
          }
          const m = Math.min(1, s) * 0.55;
          cr = base[0] + (acc[0] - base[0]) * m;
          cg = base[1] + (acc[1] - base[1]) * m;
          cb = base[2] + (acc[2] - base[2]) * m;
        } else {
          const m = a * 1.3 > 1 ? 1 : a * 1.3;
          cr = base[0] + (r - base[0]) * m;
          cg = base[1] + (g - base[1]) * m;
          cb = base[2] + (b - base[2]) * m;
          sz = cell * (0.28 + 0.6 * a) * (1 + 0.3 * sc);
          if (sz > cell * 0.94) sz = cell * 0.94;
        }
        const key = ((cr >> 3) << 10) | ((cg >> 3) << 5) | (cb >> 3);
        let arr = this.buckets.get(key);
        if (!arr) { arr = []; this.buckets.set(key, arr); }
        px[j] = cx; py[j] = cy; ps[j] = sz;
        arr.push(j);
      }
    }
    ctx.fill();

    for (const [key, arr] of this.buckets) {
      if (!arr.length) continue;
      ctx.fillStyle = this.colorStr(key);
      ctx.beginPath();
      for (let n = 0; n < arr.length; n++) {
        const j = arr[n], hs = ps[j] / 2;
        if (circle) { ctx.moveTo(px[j] + hs, py[j]); ctx.arc(px[j], py[j], hs, 0, 6.2832); }
        else ctx.rect(px[j] - hs, py[j] - hs, ps[j], ps[j]);
      }
      ctx.fill();
    }
    if (this.buckets.size > 4000) this.buckets.clear();
  }
}
