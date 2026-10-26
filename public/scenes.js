// Scenes draw in grid units: one canvas pixel is one dot.
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

class Koi {
  init(A) {
    const n = clamp(Math.round((A.cols * A.rows) / 1700), 3, 9);
    this.fish = Array.from({ length: n }, (_, i) => this.make(A, i));
    this.pads = Array.from({ length: 3 }, () => ({
      x: rand(0, A.cols), y: rand(0, A.rows), r: rand(3.5, 6.5),
      rot: rand(0, TAU), vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.2), vr: rand(-0.05, 0.05),
    }));
  }
  make(A, i) {
    const len = rand(13, 22), N = 16, seg = len / N;
    const x = rand(6, A.cols - 6), y = rand(6, A.rows - 6), ang = rand(0, TAU);
    const pts = [];
    for (let k = 0; k < N; k++) pts.push({ x: x - Math.cos(ang) * k * seg, y: y - Math.sin(ang) * k * seg });
    const spots = [];
    const ns = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < ns; s++) spots.push({ k: 1 + Math.floor(Math.random() * N * 0.6), side: rand(-0.5, 0.5), r: rand(0.45, 0.8) });
    return { pts, ang, seg, N, w: len * 0.16, sp: rand(4, 7), turn: 0, phase: rand(0, TAU), boost: 0, style: i % 3, spots };
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
      f.turn = clamp((f.turn + (Math.random() - 0.5) * dt * 4) * 0.985, -1.2, 1.2);
      f.ang += f.turn * dt;
      const m = 5;
      if (h.x < m || h.x > cols - m || h.y < m || h.y > rows - m) {
        f.ang += angDiff(Math.atan2(rows / 2 - h.y, cols / 2 - h.x), f.ang) * Math.min(1, dt * 2.2);
      }
      if (P.active) {
        const dx = P.x - h.x, dy = P.y - h.y, d = Math.hypot(dx, dy);
        if (d < 24 && d > 4) f.ang += angDiff(Math.atan2(dy, dx), f.ang) * dt * 0.9;
      }
      for (const R of A.ripples) {
        if (R.age > 0.35) continue;
        const dx = h.x - R.x, dy = h.y - R.y;
        if (Math.hypot(dx, dy) < 16 * R.amp) {
          f.ang += angDiff(Math.atan2(dy, dx), f.ang) * Math.min(1, dt * 6);
          f.boost = 1;
        }
      }
      for (const o of this.fish) {
        if (o === f) continue;
        const q = o.pts[0], dx = h.x - q.x, dy = h.y - q.y;
        if (dx * dx + dy * dy < 16) f.ang += angDiff(Math.atan2(dy, dx), f.ang) * dt * 0.8;
      }
      const v = f.sp * (1 + f.boost * 2.2);
      f.boost = Math.max(0, f.boost - dt * 0.9);
      h.x += Math.cos(f.ang) * v * dt;
      h.y += Math.sin(f.ang) * v * dt;
      f.phase += dt * (3 + v * 0.6);
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
    L.globalAlpha = 0.5;
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
      // Pectoral fins
      const fin = D[3], fa = Math.atan2(fin.ty, fin.tx), sw = Math.sin(f.phase * 0.8) * 0.25;
      L.fillStyle = pal.c;
      L.globalAlpha = 0.85;
      for (const side of [-1, 1]) {
        L.beginPath();
        L.ellipse(fin.x - fin.ty * fin.w * 1.1 * side, fin.y + fin.tx * fin.w * 1.1 * side, fin.w * 1.05, fin.w * 0.42, fa + side * (2.2 + sw), 0, TAU);
        L.fill();
      }
      // Tail
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

class Wave {
  init(A) {
    this.img = new ImageData(A.cols, A.rows);
    this.cx = A.cols / 2; this.cy = A.rows / 2;
  }
  update(dt, A) {
    const P = A.pointer;
    const tx = P.active ? P.x : A.cols * (0.5 + 0.3 * Math.sin(A.t * 0.21));
    const ty = P.active ? P.y : A.rows * (0.5 + 0.3 * Math.cos(A.t * 0.17));
    const k = Math.min(1, dt * (P.active ? 3 : 1));
    this.cx += (tx - this.cx) * k;
    this.cy += (ty - this.cy) * k;
  }
  draw(L, A) {
    const { cols, rows, t } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c;
    for (let y = 0; y < rows; y++) {
      const sy = Math.sin(y * 0.15 - t * 0.9);
      for (let x = 0; x < cols; x++) {
        const dx = x - this.cx, dy = y - this.cy;
        let v = Math.sin(x * 0.12 + t * 1.1) + sy + Math.sin((x * 0.7 + y) * 0.08 + t * 0.6) + Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.32 - t * 2.4) * 1.3;
        v = (v + 4.3) / 8.6;
        const al = smooth(0.48, 0.92, v);
        const i = (y * cols + x) * 4;
        const m = clamp((v - 0.5) * 2.4, 0, 1);
        const hi = smooth(0.82, 0.98, v);
        d[i] = cc[0] + (ca[0] - cc[0]) * m + (cb[0] - ca[0]) * hi;
        d[i + 1] = cc[1] + (ca[1] - cc[1]) * m + (cb[1] - ca[1]) * hi;
        d[i + 2] = cc[2] + (ca[2] - cc[2]) * m + (cb[2] - ca[2]) * hi;
        d[i + 3] = al * 255;
      }
    }
    L.putImageData(this.img, 0, 0);
  }
}

class Rain {
  init(A) {
    this.drops = [];
    this.splashes = [];
    this.acc = 0;
  }
  update(dt, A) {
    const { cols, rows } = A, P = A.pointer;
    this.acc += dt * cols * 0.55;
    while (this.acc > 1) {
      this.acc--;
      this.drops.push({ x: rand(0, cols), y: rand(-10, -1), vy: rand(26, 44), len: rand(1.5, 3.5), land: rand(rows * 0.25, rows + 2) });
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
      s.r += dt * s.max * 1.4;
      s.life -= dt * 1.25;
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
    L.strokeStyle = A.pal.a;
    L.lineWidth = 1;
    for (const s of this.splashes) {
      L.globalAlpha = s.life;
      L.beginPath();
      L.ellipse(s.x, s.y, s.r, s.r * 0.42, 0, 0, TAU);
      L.stroke();
    }
    L.globalAlpha = 1;
  }
}

class Flow {
  constructor() {
    this.persist = true;
  }
  init(A) {
    const n = Math.round((A.cols * A.rows) / 32);
    this.ps = Array.from({ length: n }, () => ({ x: rand(0, A.cols), y: rand(0, A.rows), c: Math.floor(rand(0, 3)), life: rand(2, 8) }));
  }
  update(dt, A) {
    const { cols, rows, t } = A, P = A.pointer;
    for (const p of this.ps) {
      p.px = p.x; p.py = p.y;
      const ang = (Math.sin(p.x * 0.05 + t * 0.3) + Math.cos(p.y * 0.06 - t * 0.2) + Math.sin((p.x + p.y) * 0.03 + t * 0.1)) * 1.6;
      let vx = Math.cos(ang) * 9, vy = Math.sin(ang) * 9;
      if (P.active) {
        const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy);
        if (d < 18 && d > 0.5) {
          const f = (1 - d / 18) * 22;
          vx += (-dy / d) * f + (dx / d) * f * 0.3;
          vy += (dx / d) * f + (dy / d) * f * 0.3;
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
    L.globalCompositeOperation = "destination-out";
    L.fillStyle = "rgba(0,0,0,0.12)";
    L.fillRect(0, 0, A.cols, A.rows);
    L.globalCompositeOperation = "source-over";
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
    for (let i = 0; i < n; i++) this.g[i] = Math.random() < 0.22 ? 1 : 0;
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
    while (this.acc > 0.12) { this.acc -= 0.12; this.step(A); }
    for (let i = 0; i < this.fade.length; i++) if (!this.g[i] && this.fade[i] > 0) this.fade[i] = Math.max(0, this.fade[i] - dt * 1.6);
  }
  draw(L, A) {
    const { cols, rows } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c;
    for (let j = 0; j < cols * rows; j++) {
      const i = j * 4;
      if (this.g[j]) {
        const m = Math.min(1, this.age[j] / 8);
        d[i] = ca[0] + (cb[0] - ca[0]) * m;
        d[i + 1] = ca[1] + (cb[1] - ca[1]) * m;
        d[i + 2] = ca[2] + (cb[2] - ca[2]) * m;
        d[i + 3] = 255;
      } else {
        d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2];
        d[i + 3] = this.fade[j] * 150;
      }
    }
    L.putImageData(this.img, 0, 0);
  }
}

export const SCENES = {
  koi: () => new Koi(),
  wave: () => new Wave(),
  rain: () => new Rain(),
  flow: () => new Flow(),
  life: () => new Life(),
};
export const SCENE_ORDER = ["koi", "wave", "rain", "flow", "life"];
