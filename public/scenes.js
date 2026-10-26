// Scenes draw in grid units: one canvas pixel is one dot. Colors come from A.pal / A.rgb
// (a = accent, b = ink, c = soft tone); the engine snaps every dot to one of them.
import { compile } from "./formula.js";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
};
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function fade(L, A, amount) {
  L.globalCompositeOperation = "destination-out";
  L.fillStyle = `rgba(0,0,0,${amount})`;
  L.fillRect(0, 0, A.cols, A.rows);
  L.globalCompositeOperation = "source-over";
}

class Koi {
  init(A) {
    const n = clamp(Math.round((A.cols * A.rows) / 1500), 3, 10);
    this.fish = Array.from({ length: n }, (_, i) => this.make(A, i));
    this.pads = Array.from({ length: 3 }, () => ({
      x: rand(0, A.cols), y: rand(0, A.rows), r: rand(3, 5.5),
      rot: rand(0, TAU), vx: rand(-0.25, 0.25), vy: rand(-0.15, 0.15), vr: rand(-0.04, 0.04),
    }));
  }
  make(A, i) {
    const len = clamp(Math.min(A.cols, A.rows) * 0.2, 9, 17) * rand(0.8, 1.2), N = 16, seg = len / N;
    const x = rand(6, A.cols - 6), y = rand(6, A.rows - 6), ang = rand(0, TAU);
    const pts = [];
    for (let k = 0; k < N; k++) pts.push({ x: x - Math.cos(ang) * k * seg, y: y - Math.sin(ang) * k * seg });
    const spots = [];
    const ns = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < ns; s++) spots.push({ k: 1 + Math.floor(Math.random() * N * 0.6), side: rand(-0.5, 0.5), r: rand(0.45, 0.8) });
    return { pts, ang, seg, N, w: len * 0.16, sp: rand(2.6, 4.4), turn: 0, phase: rand(0, TAU), boost: 0, style: i % 3, spots };
  }
  update(dt, A) {
    const { cols, rows } = A, P = A.pointer;
    for (const p of this.pads) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.x < -p.r) p.x = cols + p.r; if (p.x > cols + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = rows + p.r; if (p.y > rows + p.r) p.y = -p.r;
    }
    for (const f of this.fish) {
      const h = f.pts[0];
      f.turn = clamp((f.turn + (Math.random() - 0.5) * dt * 3) * 0.985, -1, 1);
      f.ang += f.turn * dt;
      const m = 5;
      if (h.x < m || h.x > cols - m || h.y < m || h.y > rows - m) {
        f.ang += angDiff(Math.atan2(rows / 2 - h.y, cols / 2 - h.x), f.ang) * Math.min(1, dt * 2);
      }
      if (P.active) {
        const dx = P.x - h.x, dy = P.y - h.y, d = Math.hypot(dx, dy);
        if (d < 22 && d > 4) f.ang += angDiff(Math.atan2(dy, dx), f.ang) * dt * 0.8;
      }
      for (const R of A.ripples) {
        if (R.age > 0.35) continue;
        const dx = h.x - R.x, dy = h.y - R.y;
        if (Math.hypot(dx, dy) < 14 * R.amp) {
          f.ang += angDiff(Math.atan2(dy, dx), f.ang) * Math.min(1, dt * 6);
          f.boost = 1;
        }
      }
      for (const o of this.fish) {
        if (o === f) continue;
        const q = o.pts[0], dx = h.x - q.x, dy = h.y - q.y;
        if (dx * dx + dy * dy < 16) f.ang += angDiff(Math.atan2(dy, dx), f.ang) * dt * 0.8;
      }
      const v = f.sp * (1 + f.boost * 2.4);
      f.boost = Math.max(0, f.boost - dt * 0.9);
      h.x += Math.cos(f.ang) * v * dt;
      h.y += Math.sin(f.ang) * v * dt;
      f.phase += dt * (2.4 + v * 0.7);
      for (let k = 1; k < f.N; k++) {
        const p = f.pts[k], q = f.pts[k - 1];
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
        p.x = q.x + (dx / d) * f.seg;
        p.y = q.y + (dy / d) * f.seg;
      }
    }
  }
  draw(L, A) {
    const pal = A.pal;
    L.fillStyle = pal.c;
    L.globalAlpha = 0.4;
    for (const p of this.pads) {
      L.beginPath();
      L.moveTo(p.x, p.y);
      L.arc(p.x, p.y, p.r, p.rot + 0.35, p.rot + TAU - 0.35);
      L.closePath();
      L.fill();
    }
    L.globalAlpha = 1;
    const prof = (k, N) => {
      const t = k / (N - 1);
      return t < 0.2 ? 0.7 + 1.5 * t : 1 - ((t - 0.2) / 0.8) * 0.82;
    };
    for (const f of this.fish) {
      const N = f.N;
      const body = [pal.a, pal.b, pal.c][f.style];
      const spot = [pal.b, pal.a, pal.a][f.style];
      const D = [];
      for (let k = 0; k < N; k++) {
        const p = f.pts[k], q = f.pts[Math.max(0, k - 1)], r = f.pts[Math.min(N - 1, k + 1)];
        let tx = q.x - r.x, ty = q.y - r.y;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const wig = Math.sin(f.phase - k * 0.45) * f.w * 0.6 * (k / N);
        D.push({ x: p.x - ty * wig, y: p.y + tx * wig, tx, ty, w: prof(k, N) * f.w });
      }
      const fin = D[3], fa = Math.atan2(fin.ty, fin.tx), sw = Math.sin(f.phase * 0.8) * 0.25;
      L.fillStyle = pal.c;
      L.globalAlpha = 0.8;
      for (const side of [-1, 1]) {
        L.beginPath();
        L.ellipse(fin.x - fin.ty * fin.w * 1.1 * side, fin.y + fin.tx * fin.w * 1.1 * side, fin.w * 1.05, fin.w * 0.42, fa + side * (2.2 + sw), 0, TAU);
        L.fill();
      }
      const tail = D[N - 1], ta = Math.atan2(tail.ty, tail.tx) + Math.PI;
      for (const side of [-1, 1]) {
        L.beginPath();
        L.ellipse(tail.x + Math.cos(ta + side * 0.45) * f.w * 0.8, tail.y + Math.sin(ta + side * 0.45) * f.w * 0.8, f.w * 0.95, f.w * 0.35, ta + side * 0.45, 0, TAU);
        L.fill();
      }
      L.globalAlpha = 1;
      L.fillStyle = body;
      L.beginPath();
      for (let k = N - 1; k >= 0; k--) {
        const p = D[k];
        L.moveTo(p.x + p.w, p.y);
        L.arc(p.x, p.y, p.w, 0, TAU);
      }
      L.fill();
      L.fillStyle = spot;
      L.beginPath();
      for (const s of f.spots) {
        const p = D[s.k];
        const sx = p.x - p.ty * p.w * s.side, sy = p.y + p.tx * p.w * s.side;
        L.moveTo(sx + p.w * s.r, sy);
        L.arc(sx, sy, p.w * s.r, 0, TAU);
      }
      L.fill();
    }
  }
}

// Layered ocean swell rendered as halftone; crests catch the accent.
class Swell {
  init(A) {
    this.img = new ImageData(A.cols, A.rows);
  }
  update() {}
  draw(L, A) {
    const { cols, rows, t } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c;
    const P = A.pointer;
    for (let y = 0; y < rows; y++) {
      const depth = y / rows;
      for (let x = 0; x < cols; x++) {
        let h = Math.sin(x * 0.09 + t * 0.7 + Math.sin(y * 0.05 + t * 0.3) * 2) * 0.5
          + Math.sin(x * 0.04 - y * 0.11 + t * 0.45) * 0.35
          + Math.sin((x + y) * 0.17 - t * 1.1) * 0.15;
        if (P.active) {
          const dd = Math.hypot(x - P.x, y - P.y);
          h += Math.sin(dd * 0.6 - t * 5) * Math.exp(-dd * 0.08) * 0.5;
        }
        const v = h * 0.5 + 0.5;
        const i = (y * cols + x) * 4;
        const al = smooth(0.55, 0.97, v) * (0.5 + 0.5 * depth);
        const col = v > 0.9 ? ca : v > 0.74 ? cb : cc;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = al * 255;
      }
    }
    L.putImageData(this.img, 0, 0);
  }
}

class Rain {
  init() {
    this.drops = [];
    this.splashes = [];
    this.acc = 0;
  }
  update(dt, A) {
    const { cols, rows } = A, P = A.pointer;
    this.acc += dt * cols * 0.35;
    while (this.acc > 1) {
      this.acc--;
      this.drops.push({ x: Math.floor(rand(0, cols)) + 0.5, y: rand(-10, -1), vy: rand(24, 38), len: rand(1.5, 3), land: rand(rows * 0.3, rows + 2) });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const p = this.drops[i];
      p.y += p.vy * dt;
      let hit = p.y >= p.land;
      if (P.active && !hit) {
        const dx = p.x - P.x, dy = p.y - P.y;
        if (dy < 0.5 && dy > -1.5 && Math.abs(dx) < 6) hit = true;
      }
      if (hit) {
        this.splashes.push({ x: p.x, y: p.y, r: 0.5, life: 1, max: rand(3, 6) });
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.r += dt * s.max * 1.3;
      s.life -= dt * 1.1;
      if (s.life <= 0) this.splashes.splice(i, 1);
    }
  }
  draw(L, A) {
    L.strokeStyle = A.pal.b;
    L.lineWidth = 0.9;
    L.lineCap = "round";
    L.beginPath();
    for (const p of this.drops) {
      L.moveTo(p.x, p.y - p.len);
      L.lineTo(p.x, p.y);
    }
    L.stroke();
    L.lineWidth = 1;
    for (const s of this.splashes) {
      L.strokeStyle = s.life > 0.6 ? A.pal.a : A.pal.c;
      L.globalAlpha = s.life;
      L.beginPath();
      L.ellipse(s.x, s.y, s.r, s.r * 0.42, 0, 0, TAU);
      L.stroke();
    }
    L.globalAlpha = 1;
  }
}

class Flow {
  constructor() { this.persist = true; }
  init(A) {
    const n = Math.round((A.cols * A.rows) / 40);
    this.ps = Array.from({ length: n }, () => ({ x: rand(0, A.cols), y: rand(0, A.rows), c: Math.random() < 0.12 ? 0 : Math.random() < 0.5 ? 1 : 2, life: rand(2, 8) }));
  }
  update(dt, A) {
    const { cols, rows, t } = A, P = A.pointer;
    for (const p of this.ps) {
      p.px = p.x; p.py = p.y;
      const ang = (Math.sin(p.x * 0.05 + t * 0.25) + Math.cos(p.y * 0.06 - t * 0.17) + Math.sin((p.x + p.y) * 0.03 + t * 0.1)) * 1.6;
      let vx = Math.cos(ang) * 7, vy = Math.sin(ang) * 7;
      if (P.active) {
        const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy);
        if (d < 16 && d > 0.5) {
          const f = (1 - d / 16) * 18;
          vx += (-dy / d) * f;
          vy += (dx / d) * f;
        }
      }
      p.x += vx * dt; p.y += vy * dt;
      p.life -= dt;
      if (p.life < 0 || p.x < 0 || p.y < 0 || p.x > cols || p.y > rows) {
        p.x = p.px = rand(0, cols); p.y = p.py = rand(0, rows); p.life = rand(3, 9);
      }
    }
  }
  draw(L, A) {
    fade(L, A, 0.1);
    const cols = [A.pal.a, A.pal.b, A.pal.c];
    L.lineWidth = 1;
    L.lineCap = "round";
    for (let c = 0; c < 3; c++) {
      L.strokeStyle = cols[c];
      L.beginPath();
      for (const p of this.ps) {
        if (p.c !== c) continue;
        L.moveTo(p.px, p.py);
        L.lineTo(p.x + 0.01, p.y);
      }
      L.stroke();
    }
  }
}

class Life {
  init(A) {
    const n = A.cols * A.rows;
    this.g = new Uint8Array(n);
    this.n = new Uint8Array(n);
    this.age = new Float32Array(n);
    this.fade = new Float32Array(n);
    this.img = new ImageData(A.cols, A.rows);
    this.acc = 0;
    this.still = 0;
    for (let i = 0; i < n; i++) this.g[i] = Math.random() < 0.2 ? 1 : 0;
  }
  seed(A, cx, cy, r) {
    const { cols, rows } = A;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (Math.random() < 0.55) this.g[y * cols + x] = 1;
      }
  }
  step(A) {
    const { cols, rows } = A, g = this.g, n = this.n;
    let changes = 0, pop = 0;
    for (let y = 0; y < rows; y++) {
      const ym = ((y - 1 + rows) % rows) * cols, y0 = y * cols, yp = ((y + 1) % rows) * cols;
      for (let x = 0; x < cols; x++) {
        const xm = (x - 1 + cols) % cols, xp = (x + 1) % cols;
        const c = g[ym + xm] + g[ym + x] + g[ym + xp] + g[y0 + xm] + g[y0 + xp] + g[yp + xm] + g[yp + x] + g[yp + xp];
        const alive = g[y0 + x];
        const next = c === 3 || (alive && c === 2) ? 1 : 0;
        n[y0 + x] = next;
        if (next !== alive) changes++;
        pop += next;
      }
    }
    this.g = n; this.n = g;
    for (let i = 0; i < this.g.length; i++) {
      if (this.g[i]) { this.age[i] = this.n[i] ? this.age[i] + 1 : 0; this.fade[i] = 1; }
    }
    const total = cols * rows;
    this.still = changes < total * 0.004 ? this.still + 1 : 0;
    if (this.still > 12 || pop < total * 0.03) {
      for (let s = 0; s < 6; s++) this.seed(A, rand(0, cols), rand(0, rows), rand(3, 7));
      this.still = 0;
    }
  }
  update(dt, A) {
    if (this.g.length !== A.cols * A.rows) this.init(A);
    const P = A.pointer;
    if (P.active) this.seed(A, P.x, P.y, 1.5);
    for (const R of A.ripples) if (R.age < 0.05) this.seed(A, R.x, R.y, 5);
    this.acc += dt;
    while (this.acc > 0.14) { this.acc -= 0.14; this.step(A); }
    for (let i = 0; i < this.fade.length; i++) if (!this.g[i] && this.fade[i] > 0) this.fade[i] = Math.max(0, this.fade[i] - dt * 1.4);
  }
  draw(L, A) {
    const { cols, rows } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c;
    for (let j = 0; j < cols * rows; j++) {
      const i = j * 4;
      if (this.g[j]) {
        const col = this.age[j] < 1 ? ca : cb;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = 255;
      } else {
        d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2];
        d[i + 3] = this.fade[j] * 170;
      }
    }
    L.putImageData(this.img, 0, 0);
  }
}

// Warp-speed starfield; the vanishing point follows the cursor.
class Stars {
  init(A) {
    const n = Math.round((A.cols * A.rows) / 16);
    this.s = Array.from({ length: n }, () => this.spawn(rand(0.05, 1)));
    this.cx = A.cols / 2; this.cy = A.rows / 2;
  }
  spawn(z = 1) {
    return { x: rand(-1, 1), y: rand(-1, 1), z, accent: Math.random() < 0.08 };
  }
  update(dt, A) {
    const P = A.pointer;
    const tx = P.active ? P.x : A.cols / 2, ty = P.active ? P.y : A.rows / 2;
    this.cx += (tx - this.cx) * Math.min(1, dt * 1.5);
    this.cy += (ty - this.cy) * Math.min(1, dt * 1.5);
    for (const s of this.s) {
      s.pz = s.z;
      s.z -= dt * 0.28;
      if (s.z <= 0.03) Object.assign(s, this.spawn(1), { pz: 1 });
    }
  }
  draw(L, A) {
    const sc = Math.max(A.cols, A.rows) * 0.35;
    L.lineCap = "round";
    for (const s of this.s) {
      const x1 = this.cx + (s.x / s.pz) * sc, y1 = this.cy + (s.y / s.pz) * sc;
      const x2 = this.cx + (s.x / s.z) * sc, y2 = this.cy + (s.y / s.z) * sc;
      if (x2 < -2 || y2 < -2 || x2 > A.cols + 2 || y2 > A.rows + 2) continue;
      const near = 1 - s.z;
      L.strokeStyle = s.accent ? A.pal.a : near > 0.6 ? A.pal.b : A.pal.c;
      L.globalAlpha = Math.min(1, near * 1.6);
      L.lineWidth = 0.6 + near * 1.2;
      L.beginPath();
      L.moveTo(x1, y1);
      L.lineTo(x2 + 0.01, y2);
      L.stroke();
    }
    L.globalAlpha = 1;
  }
}

// Digital rain: columns of glyph-like dots with bright heads.
class Cascade {
  init(A) {
    this.colsState = Array.from({ length: A.cols }, () => this.reset(A, true));
    this.img = new ImageData(A.cols, A.rows);
  }
  reset(A, initial) {
    return { y: initial ? rand(-A.rows, A.rows) : rand(-A.rows * 0.5, 0), sp: rand(6, 18), len: rand(6, 22), seed: Math.random() * 1000 };
  }
  update(dt, A) {
    if (this.colsState.length !== A.cols) this.init(A);
    for (const c of this.colsState) {
      c.y += c.sp * dt;
      if (c.y - c.len > A.rows) Object.assign(c, this.reset(A, false));
    }
  }
  draw(L, A) {
    const { cols, rows, t } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data;
    d.fill(0);
    const ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c;
    const tick = Math.floor(t * 9);
    for (let x = 0; x < cols; x++) {
      const c = this.colsState[x];
      const head = Math.floor(c.y);
      for (let k = 0; k < c.len; k++) {
        const y = head - k;
        if (y < 0 || y >= rows) continue;
        const flick = Math.sin((x * 12.9898 + y * 78.233 + c.seed + Math.floor(tick / (1 + (k % 3)))) * 43758.5453);
        const on = flick - Math.floor(flick) > 0.25;
        if (!on && k > 0) continue;
        const i = (y * cols + x) * 4;
        const col = k === 0 ? ca : k < 4 ? cb : cc;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = 255 * (k === 0 ? 1 : Math.max(0.15, 1 - k / c.len));
      }
    }
    L.putImageData(this.img, 0, 0);
  }
}

// Fireworks that burst into dot sparks; clicking launches one where you click.
class Bloom {
  constructor() { this.persist = true; }
  init() {
    this.rockets = [];
    this.sparks = [];
    this.timer = 0.3;
  }
  burst(x, y, A) {
    const n = Math.round(rand(40, 70)), sp = Math.min(A.cols, A.rows) * rand(0.22, 0.32);
    const tone = Math.random() < 0.5 ? "a" : Math.random() < 0.5 ? "b" : "c";
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * TAU + rand(-0.05, 0.05), v = sp * rand(0.6, 1);
      this.sparks.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: rand(1.1, 1.8), tone: Math.random() < 0.15 ? "a" : tone });
    }
  }
  update(dt, A) {
    const { cols, rows } = A;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rand(0.7, 1.6);
      this.rockets.push({ x: rand(0.15, 0.85) * cols, y: rows + 1, vy: -rows * rand(0.85, 1.1), top: rand(0.15, 0.45) * rows });
    }
    for (const R of A.ripples) if (R.age < 0.03 && !R.used) { R.used = true; this.burst(R.x, R.y, A); }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.py = r.y;
      r.y += r.vy * dt;
      r.vy += rows * 0.55 * dt;
      if (r.y <= r.top || r.vy > -rows * 0.1) { this.burst(r.x, r.y, A); this.rockets.splice(i, 1); }
    }
    const g = rows * 0.18;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.px = s.x; s.py = s.y;
      s.vx *= 1 - dt * 1.6; s.vy = s.vy * (1 - dt * 1.6) + g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }
  draw(L, A) {
    fade(L, A, 0.16);
    L.lineCap = "round";
    L.lineWidth = 1;
    L.strokeStyle = A.pal.c;
    L.beginPath();
    for (const r of this.rockets) { L.moveTo(r.x, r.py ?? r.y); L.lineTo(r.x, r.y); }
    L.stroke();
    for (const s of this.sparks) {
      L.strokeStyle = A.pal[s.tone];
      L.globalAlpha = Math.min(1, s.life);
      L.beginPath();
      L.moveTo(s.px ?? s.x, s.py ?? s.y);
      L.lineTo(s.x + 0.01, s.y);
      L.stroke();
    }
    L.globalAlpha = 1;
  }
}

// A starling murmuration (boids); the cursor is a hawk.
class Murmur {
  constructor() { this.persist = true; }
  init(A) {
    const n = clamp(Math.round((A.cols * A.rows) / 55), 40, 240);
    this.b = Array.from({ length: n }, () => {
      const a = rand(0, TAU);
      return { x: rand(0, A.cols), y: rand(0, A.rows), vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, accent: Math.random() < 0.06 };
    });
  }
  update(dt, A) {
    const { cols, rows } = A, P = A.pointer, B = this.b;
    for (const p of B) {
      let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
      for (const q of B) {
        if (q === p) continue;
        let dx = q.x - p.x, dy = q.y - p.y;
        if (dx > cols / 2) dx -= cols; else if (dx < -cols / 2) dx += cols;
        if (dy > rows / 2) dy -= rows; else if (dy < -rows / 2) dy += rows;
        const d2 = dx * dx + dy * dy;
        if (d2 < 36) {
          n++; ax += q.vx; ay += q.vy; cx += dx; cy += dy;
          if (d2 < 3) { sx -= dx / (d2 + 0.1); sy -= dy / (d2 + 0.1); }
        }
      }
      if (n) {
        p.vx += ((ax / n - p.vx) * 1.2 + (cx / n) * 0.9 + sx * 2.2) * dt;
        p.vy += ((ay / n - p.vy) * 1.2 + (cy / n) * 0.9 + sy * 2.2) * dt;
      }
      if (P.active) {
        const dx = p.x - P.x, dy = p.y - P.y, d = Math.hypot(dx, dy);
        if (d < 10 && d > 0.01) { p.vx += (dx / d) * (10 - d) * 6 * dt; p.vy += (dy / d) * (10 - d) * 6 * dt; }
      }
      const sp = Math.hypot(p.vx, p.vy) || 1, ns = clamp(sp, 5, 11);
      p.vx = (p.vx / sp) * ns; p.vy = (p.vy / sp) * ns;
    }
    for (const p of B) {
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 0) { p.x += cols; p.px = p.x; } else if (p.x > cols) { p.x -= cols; p.px = p.x; }
      if (p.y < 0) { p.y += rows; p.py = p.y; } else if (p.y > rows) { p.y -= rows; p.py = p.y; }
    }
  }
  draw(L, A) {
    fade(L, A, 0.32);
    L.lineCap = "round";
    L.lineWidth = 1;
    for (const accent of [false, true]) {
      L.strokeStyle = accent ? A.pal.a : A.pal.b;
      L.beginPath();
      for (const p of this.b) {
        if (p.accent !== accent) continue;
        L.moveTo(p.px ?? p.x, p.py ?? p.y);
        L.lineTo(p.x + 0.01, p.y);
      }
      L.stroke();
    }
  }
}

// Snowfall that settles into drifts and slowly melts.
class Snow {
  init(A) {
    this.f = [];
    this.h = new Float32Array(A.cols);
    this.acc = 0;
  }
  update(dt, A) {
    const { cols, rows, t } = A, P = A.pointer;
    if (this.h.length !== cols) this.h = new Float32Array(cols);
    this.acc += dt * cols * 0.3;
    while (this.acc > 1) {
      this.acc--;
      this.f.push({ x: rand(-5, cols + 5), y: -1, vy: rand(2.5, 6), ph: rand(0, TAU), s: rand(0.5, 1.2), accent: Math.random() < 0.05 });
    }
    const wind = Math.sin(t * 0.15) * 2;
    for (let i = this.f.length - 1; i >= 0; i--) {
      const p = this.f[i];
      p.ph += dt * 1.5;
      p.x += (wind + Math.sin(p.ph) * 1.2) * dt;
      p.y += p.vy * dt;
      if (P.active) {
        const dx = p.x - P.x, dy = p.y - P.y, d = Math.hypot(dx, dy);
        if (d < 6 && d > 0.01) { p.x += (dx / d) * (6 - d) * 3 * dt; p.y += (dy / d) * (6 - d) * 3 * dt; }
      }
      const xi = clamp(Math.floor(p.x), 0, cols - 1);
      if (p.y >= rows - this.h[xi]) {
        this.h[xi] = Math.min(rows * 0.28, this.h[xi] + 0.18 * p.s);
        this.f.splice(i, 1);
      }
    }
    for (let x = 0; x < cols; x++) {
      const l = this.h[Math.max(0, x - 1)], r = this.h[Math.min(cols - 1, x + 1)];
      this.h[x] += ((l + r) / 2 - this.h[x]) * dt * 0.8;
      this.h[x] = Math.max(0, this.h[x] - dt * 0.035);
    }
  }
  draw(L, A) {
    const { rows } = A;
    L.fillStyle = A.pal.c;
    L.beginPath();
    L.moveTo(0, rows + 1);
    for (let x = 0; x < this.h.length; x++) L.lineTo(x + 0.5, rows - this.h[x]);
    L.lineTo(this.h.length, rows + 1);
    L.closePath();
    L.fill();
    for (const accent of [false, true]) {
      L.fillStyle = accent ? A.pal.a : A.pal.b;
      L.beginPath();
      for (const p of this.f) {
        if (p.accent !== accent) continue;
        L.moveTo(p.x + p.s * 0.5, p.y);
        L.arc(p.x, p.y, p.s * 0.5, 0, TAU);
      }
      L.fill();
    }
  }
}

// A formula scene: f(x, y, u, v, r, a, t, i, w, h, mx, my) in [-1, 1].
// Positive values light the accent/soft tones, negative values the ink tone.
export class Formula {
  constructor(src) {
    this.fn = compile(src);
  }
  init(A) {
    this.img = new ImageData(A.cols, A.rows);
  }
  update() {}
  draw(L, A) {
    const { cols, rows, t } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c, fn = this.fn;
    const aspect = cols / rows, P = A.pointer;
    const mx = P.active ? (P.x / (cols - 1) * 2 - 1) * aspect : 0, my = P.active ? P.y / (rows - 1) * 2 - 1 : 0;
    for (let y = 0; y < rows; y++) {
      const v = (y / (rows - 1)) * 2 - 1;
      for (let x = 0; x < cols; x++) {
        const u = ((x / (cols - 1)) * 2 - 1) * aspect;
        const j = y * cols + x, i = j * 4;
        let val = fn(x, y, u, v, Math.sqrt(u * u + v * v), Math.atan2(v, u), t, j, cols, rows, mx, my);
        if (!(val === val)) val = 0;
        if (val > 1) val = 1; else if (val < -1) val = -1;
        const m = val < 0 ? -val : val;
        const col = val < 0 ? cb : m > 0.93 ? ca : cc;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = m * 255;
      }
    }
    L.putImageData(this.img, 0, 0);
  }
}

export const FORMULAS = {
  plasma: "1 - smoothstep(0, 0.32, abs(sin((sin(u*3 + t*0.6) + sin(v*4 - t*0.8) + sin(r*6 - t))*2.2)))",
  tunnel: "(1 - smoothstep(0, 0.35, abs(sin(1.1/(r + 0.06) - t*2.2 + a*2)))) * smoothstep(0.03, 0.55, r)",
  spiral: "sin(a*3 + r*11 - t*2.4) * smoothstep(1.3, 0.15, r)",
  pulse: "sin(r*15 - t*3.5) * clamp(1.25 - r, 0, 1)",
  kaleido: "sin(abs(u)*7 + t) * cos(abs(v)*7 - t*1.2) * sin(r*4 - t*0.8)",
  cloud: "smoothstep(0.55, 0.8, noise(u*2.4 + t*0.12, v*2.4, t*0.22)) - smoothstep(0.3, 0.12, noise(u*2.4 + 9, v*2.4 + t*0.1, t*0.2))*0.7",
};

const ICON = {
  koi: '<path d="M3 12c3-5 9-6 13-3l5-3-1.5 6L21 18l-5-3c-4 3-10 2-13-3z"/>',
  wave: '<path d="M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.2 5-1"/><path d="M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.2 5-1"/>',
  rain: '<path d="M7 3v6M12 5v6M17 3v6"/><ellipse cx="12" cy="18" rx="7" ry="2.5"/>',
  flow: '<path d="M3 7c4 0 5 4 9 4s5-4 9-4"/><path d="M3 13c4 0 5 4 9 4s5-4 9-4"/>',
  life: '<rect x="4" y="4" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="4" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="4" y="15.5" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="15.5" width="4.5" height="4.5" rx="1"/>',
  stars: '<path d="M12 12l-7-7M12 12l7-7M12 12l-7 7M12 12l7 7M12 12V3M12 12v9"/>',
  matrix: '<path d="M6 3v10M12 7v14M18 3v8"/><circle cx="6" cy="16" r="1" fill="currentColor"/><circle cx="18" cy="14" r="1" fill="currentColor"/>',
  fireworks: '<path d="M12 12V3M12 12l6.4-6.4M12 12h9M12 12l6.4 6.4M12 12v9M12 12l-6.4 6.4M12 12H3M12 12L5.6 5.6"/>',
  boids: '<path d="M3 14l4-2 4 2M9 8l3-1.5L15 8M14 16l3.5-1.8L21 16"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  plasma: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="14" r="5"/>',
  tunnel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>',
  spiral: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6 8 8 0 1 1-8-8"/>',
  pulse: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  kaleido: '<path d="M12 3l3 6h-6zM12 21l-3-6h6zM3 12l6-3v6zM21 12l-6 3V9z"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 18z"/>',
  ai: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/>',
};

export const CATALOG = [
  { id: "koi", name: "Koi", make: () => new Koi() },
  { id: "wave", name: "Swell", make: () => new Swell() },
  { id: "rain", name: "Rain", make: () => new Rain() },
  { id: "flow", name: "Flow", make: () => new Flow() },
  { id: "life", name: "Life", make: () => new Life() },
  { id: "stars", name: "Warp", make: () => new Stars() },
  { id: "matrix", name: "Cascade", make: () => new Cascade() },
  { id: "fireworks", name: "Bloom", make: () => new Bloom() },
  { id: "boids", name: "Murmur", make: () => new Murmur() },
  { id: "snow", name: "Snow", make: () => new Snow() },
  ...Object.entries(FORMULAS).map(([id, src]) => ({ id, name: id[0].toUpperCase() + id.slice(1), make: () => new Formula(src) })),
].map((s) => ({ ...s, icon: ICON[s.id] }));
export const AI_ICON = ICON.ai;
