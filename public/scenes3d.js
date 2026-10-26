// "Studio" scenes: dots placed in 3D (or along curves) with depth, light and restraint,
// plus fine-pitch halftone fields. Free scenes return Points in CSS pixels.
import { Points, T_BASE, T_DIM, T_C, T_A, T_B } from "./engine.js";
import { compile, H } from "./formula.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const { noise } = H;
// Fast 2D value noise (integer hash, no trig) for the per-dot heavy scenes.
const ih = (i, j) => {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = ih(xi, yi), b = ih(xi + 1, yi), c = ih(xi, yi + 1), d = ih(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fibSphere(n) {
  const pts = new Float32Array(n * 3), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
    pts[i * 3] = Math.cos(th) * r; pts[i * 3 + 1] = y; pts[i * 3 + 2] = Math.sin(th) * r;
  }
  return pts;
}
// Pointer as -1..1 offsets from screen center, eased.
function steer(self, A, dt, k = 1.5) {
  const P = A.pointer;
  const tx = P.active ? (P.px / A.w - 0.5) * 2 : 0, ty = P.active ? (P.py / A.h - 0.5) * 2 : 0;
  self.sx = (self.sx || 0) + (tx - (self.sx || 0)) * Math.min(1, dt * k);
  self.sy = (self.sy || 0) + (ty - (self.sy || 0)) * Math.min(1, dt * k);
}
const freshClick = (A) => A.ripples.some((R) => R.age < 0.05 && R.amp > 0.5);

// A dot globe: noise continents, a see-through back side and travelling arcs.
class Globe {
  constructor() { this.free = true; this.P = new Points(4096); }
  init(A) {
    const n = clamp(Math.round((A.w * A.h) / 110), 2500, 11000);
    this.v = fibSphere(n);
    this.land = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = this.v[i * 3], y = this.v[i * 3 + 1], z = this.v[i * 3 + 2];
      this.land[i] = noise(x * 1.7 + 5, y * 1.7 + 5, z * 1.7 + 5) + noise(x * 4, y * 4, z * 4) * 0.25 > 0.68 ? 1 : 0;
    }
    const landIdx = [...this.land.keys()].filter((i) => this.land[i]);
    this.cities = Array.from({ length: 14 }, () => landIdx[Math.floor(Math.random() * landIdx.length)] ?? 0);
    this.arcs = [];
    this.rot = rand(0, TAU);
    this.spin = 0;
    this.timer = 0;
  }
  update(dt, A) {
    steer(this, A, dt);
    if (freshClick(A)) this.spin += 1.6;
    this.spin *= 1 - Math.min(1, dt * 1.2);
    this.rot += dt * (0.12 + this.spin);
    this.timer -= dt;
    if (this.timer <= 0 && this.arcs.length < 6) {
      this.timer = rand(0.6, 1.6);
      const a = this.cities[Math.floor(Math.random() * this.cities.length)], b = this.cities[Math.floor(Math.random() * this.cities.length)];
      if (a !== b) this.arcs.push({ a, b, p: 0, dur: rand(2.2, 3.6) });
    }
    for (const arc of this.arcs) arc.p += dt / arc.dur;
    this.arcs = this.arcs.filter((arc) => arc.p < 1.6);
  }
  project(x, y, z, A) {
    const yaw = this.rot + this.sx * 0.5, pitch = 0.32 + this.sy * 0.3;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const R = Math.min(A.w, A.h) * 0.34;
    return [A.w / 2 + x1 * R, A.h / 2 + y1 * R, z2];
  }
  points(A) {
    const P = this.P, v = this.v, n = this.land.length, dot = A.cell * 0.42;
    P.reset();
    const lx = -0.5, ly = -0.6, lz = 0.62;
    for (let i = 0; i < n; i++) {
      const [sx, sy, z] = this.project(v[i * 3], v[i * 3 + 1], v[i * 3 + 2], A);
      const land = this.land[i];
      if (z < 0) {
        if (land) P.push(sx, sy, dot * 0.28, T_DIM);
        continue;
      }
      // Light in view space from the upper left.
      const [nx, ny] = [(sx - A.w / 2) / (Math.min(A.w, A.h) * 0.34), (sy - A.h / 2) / (Math.min(A.w, A.h) * 0.34)];
      const lam = clamp(nx * lx + ny * ly + z * lz, 0, 1);
      const depth = 0.45 + 0.55 * z;
      if (land) P.push(sx, sy, dot * depth * (0.55 + 0.45 * lam), lam > 0.35 ? T_B : T_C);
      else P.push(sx, sy, dot * 0.22 * depth, T_DIM);
    }
    const t = A.t;
    for (const c of this.cities) {
      const [sx, sy, z] = this.project(v[c * 3], v[c * 3 + 1], v[c * 3 + 2], A);
      if (z > 0.05) P.push(sx, sy, dot * (0.9 + 0.35 * Math.sin(t * 3 + c)), T_A);
    }
    for (const arc of this.arcs) {
      const a = [v[arc.a * 3], v[arc.a * 3 + 1], v[arc.a * 3 + 2]], b = [v[arc.b * 3], v[arc.b * 3 + 1], v[arc.b * 3 + 2]];
      const head = Math.min(1, arc.p), tail = Math.max(0, arc.p - 0.6);
      const steps = 34;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        if (f > head || f < tail) continue;
        const lift = 1 + Math.sin(Math.PI * f) * 0.28;
        let x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
        const l = Math.hypot(x, y, z) || 1;
        x = (x / l) * lift; y = (y / l) * lift; z = (z / l) * lift;
        const [sx, sy, zz] = this.project(x, y, z, A);
        if (zz < -0.2) continue;
        P.push(sx, sy, dot * (Math.abs(f - head) < 0.04 ? 0.8 : 0.34), T_A);
      }
    }
    return P;
  }
}

// Ridge lines in perspective (Unknown Pleasures, in dots), with hidden-line removal.
class Terrain {
  constructor() { this.free = true; this.P = new Points(8192); }
  init(A) {
    this.step = Math.max(4, A.cell * 0.5);
    this.cols = Math.ceil(A.w / this.step) + 1;
    this.rows = clamp(Math.round(A.h / (A.cell * 1.1)), 30, 62);
    this.minY = new Float32Array(this.cols);
  }
  update(dt, A) { steer(this, A, dt, 1); }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.34, step = this.step;
    P.reset();
    const horizon = A.h * (0.28 + this.sy * 0.04), bottom = A.h * 1.02, k = A.h * 0.5, camH = 1;
    this.minY.fill(1e9);
    // Rows evenly spaced on screen, nearest first so farther lines hide behind nearer ridges.
    for (let r = 0; r < this.rows; r++) {
      const q = 1 - r / this.rows;
      const groundY = horizon + (bottom - horizon) * q * q;
      const z = (camH * k) / Math.max(1, groundY - horizon);
      const near = clamp(1 - z / 6, 0, 1);
      const zw = z + t * 0.35;
      for (let c = 0; c < this.cols; c++) {
        const sx = c * step;
        const x = ((sx - A.w / 2) / k) * z + this.sx * 0.5;
        const valley = smooth(0.15, 1.4, Math.abs(x));
        const hgt = (noise2(x * 0.9 + 20, zw * 0.9) * 0.8 + noise2(x * 2.6 + 7, zw * 2.6) * 0.25) * (0.25 + 0.75 * valley);
        const sy = horizon + ((camH - hgt * 0.9) / z) * k;
        if (sy >= this.minY[c] - 0.5) continue;
        this.minY[c] = sy;
        if (sy < horizon - A.h * 0.25) continue;
        const size = dot * (0.35 + 0.65 * near);
        const tone = hgt > 0.85 && near > 0.45 ? T_A : near > 0.72 ? T_B : near > 0.38 ? T_C : T_DIM;
        P.push(sx, sy, size, tone);
      }
    }
    return P;
  }
}

// A slowly tumbling torus, lit from above.
class Torus {
  constructor() { this.free = true; this.P = new Points(4096); }
  init() { this.U = 150; this.V = 46; }
  update(dt, A) { steer(this, A, dt); }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.42;
    P.reset();
    const ax = 1.0 + Math.sin(t * 0.13) * 0.4 + this.sy * 0.4, ay = t * 0.18 + this.sx * 0.6;
    const cx = Math.cos(ax), sxr = Math.sin(ax), cy = Math.cos(ay), syr = Math.sin(ay);
    const S = Math.min(A.w, A.h) * 0.24, R = 1, r = 0.42;
    for (let i = 0; i < this.U; i++) {
      const u = (i / this.U) * TAU;
      for (let j = 0; j < this.V; j++) {
        const v = (j / this.V) * TAU + i * 0.07;
        let x = (R + r * Math.cos(v)) * Math.cos(u), y = r * Math.sin(v), z = (R + r * Math.cos(v)) * Math.sin(u);
        let nx = Math.cos(v) * Math.cos(u), ny = Math.sin(v), nz = Math.cos(v) * Math.sin(u);
        [y, z] = [y * cx - z * sxr, y * sxr + z * cx];
        [ny, nz] = [ny * cx - nz * sxr, ny * sxr + nz * cx];
        [x, z] = [x * cy + z * syr, -x * syr + z * cy];
        [nx, nz] = [nx * cy + nz * syr, -nx * syr + nz * cy];
        const persp = 1 / (1 - z * 0.18);
        const lam = clamp(-nx * 0.35 - ny * 0.75 + nz * 0.55, 0, 1);
        const facing = nz > -0.15;
        const bead = Math.abs(((u - t * 0.6) % TAU + TAU) % TAU) < 0.12;
        const size = dot * persp * (facing ? 0.3 + 0.7 * lam : 0.22);
        P.push(A.w / 2 + x * S * persp, A.h / 2 + y * S * persp, size, bead && facing ? T_A : !facing ? T_DIM : lam > 0.45 ? T_B : T_C);
      }
    }
    return P;
  }
}

// A two-armed spiral galaxy with differential rotation.
class Galaxy {
  constructor() { this.free = true; this.P = new Points(8192); }
  init(A) {
    const n = clamp(Math.round((A.w * A.h) / 120), 4000, 12000);
    this.s = Array.from({ length: n }, () => {
      const arm = Math.random() < 0.5 ? 0 : Math.PI;
      const r = Math.pow(Math.random(), 0.7);
      const spread = (Math.random() - 0.5) * (0.5 + r * 0.6);
      return { r, a: arm + r * 4.2 + spread, h: (Math.random() - 0.5) * 0.08 * (1 - r), tw: Math.random() < 0.004 };
    });
  }
  update(dt, A) {
    steer(this, A, dt);
    for (const s of this.s) s.a += dt * 0.22 / (0.25 + s.r);
  }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.5;
    P.reset();
    const tilt = 1.05 + this.sy * 0.25, ct = Math.cos(tilt), st = Math.sin(tilt), yaw = this.sx * 0.4;
    const S = Math.min(A.w, A.h) * 0.46;
    for (const s of this.s) {
      let x = Math.cos(s.a + yaw) * s.r, z = Math.sin(s.a + yaw) * s.r, y = s.h;
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      const core = 1 - s.r;
      const size = dot * (0.25 + core * 0.55) * (1 + z2 * 0.25) * (s.tw ? 1.3 + 0.4 * Math.sin(t * 4 + s.r * 40) : 1);
      P.push(A.w / 2 + x * S * 1.25, A.h / 2 + y2 * S, size, s.tw ? T_A : core > 0.7 ? T_B : core > 0.35 ? T_C : T_DIM);
    }
    return P;
  }
}

// A silk sheet: smooth interfering waves shaded by their slope.
class Silk {
  constructor() { this.free = true; this.P = new Points(8192); }
  init(A) { this.cols = clamp(Math.round(A.w / 9), 80, 220); this.rows = 60; }
  update(dt, A) { steer(this, A, dt, 1); }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.46;
    P.reset();
    const hgt = (x, z) => 0.24 * Math.sin(x * 1.6 + t * 0.5) + 0.18 * Math.sin(z * 2.3 - t * 0.7 + x * 0.6) + 0.1 * Math.sin((x - z) * 3.1 + t * 0.9);
    const f = A.w * 0.55, horizon = A.h * (0.3 + this.sy * 0.05);
    for (let r = this.rows - 1; r >= 0; r--) {
      const z = 0.5 + (r / this.rows) * 3.2, near = 1 - r / this.rows;
      for (let c = 0; c < this.cols; c++) {
        const x = ((c / (this.cols - 1)) * 2 - 1) * 2.2 + this.sx * 0.3;
        const h = hgt(x, z), slope = hgt(x + 0.05, z) - h, slopeZ = hgt(x, z + 0.05) - h;
        const light = clamp(0.5 + slope * 9 - slopeZ * 6, 0, 1);
        const sx = A.w / 2 + (x / z) * f;
        if (sx < -10 || sx > A.w + 10) continue;
        const sy = horizon + ((0.9 - h) / z) * f * 0.5;
        const size = dot * (0.2 + 0.8 * near) * (0.35 + 0.65 * light);
        P.push(sx, sy, size, light > 0.86 && near > 0.5 ? T_A : light > 0.55 ? T_B : light > 0.3 ? T_C : T_DIM);
      }
    }
    return P;
  }
}

// Concentric dotted rings drifting at different speeds, with parallax.
class Rings {
  constructor() { this.free = true; this.P = new Points(4096); this.grid = false; }
  init(A) {
    const R = Math.min(A.w, A.h) * 0.44;
    this.rings = Array.from({ length: 15 }, (_, k) => {
      const r = R * (0.12 + (k / 14) * 0.88);
      return { r, n: Math.max(12, Math.round((TAU * r) / (A.cell * 1.05))), sp: (k % 2 ? 1 : -1) * rand(0.03, 0.12), seg: Math.floor(rand(1, 6)), ph: rand(0, TAU), depth: k / 14, marker: Math.random() < 0.4 };
    });
  }
  update(dt, A) {
    steer(this, A, dt);
    for (const g of this.rings) g.ph += g.sp * dt;
  }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.55;
    P.reset();
    for (const g of this.rings) {
      const cx = A.w / 2 + this.sx * 26 * (1 - g.depth), cy = A.h / 2 + this.sy * 26 * (1 - g.depth);
      for (let i = 0; i < g.n; i++) {
        const ang = (i / g.n) * TAU + g.ph;
        const on = Math.sin(ang * g.seg + t * 0.25 + g.r) > -0.2;
        const x = cx + Math.cos(ang) * g.r, y = cy + Math.sin(ang) * g.r;
        P.push(x, y, on ? dot * (0.55 + 0.25 * (1 - g.depth)) : dot * 0.18, on ? (g.depth > 0.75 ? T_C : T_B) : T_DIM);
      }
      if (g.marker) {
        const ang = g.ph * 3 + g.r;
        P.push(cx + Math.cos(ang) * g.r, cy + Math.sin(ang) * g.r, dot * 1.1, T_A);
      }
    }
    return P;
  }
}

// A rotating double helix with rungs.
class Helix {
  constructor() { this.free = true; this.P = new Points(4096); }
  init() {}
  update(dt, A) { steer(this, A, dt); }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.62;
    P.reset();
    const len = A.w * 0.86, amp = Math.min(A.h * 0.2, 150), M = Math.round(len / (A.cell * 0.32));
    const tilt = this.sy * 0.4;
    for (let i = 0; i < M; i++) {
      const f = i / (M - 1), x = A.w / 2 + (f - 0.5) * len;
      const ang = f * 13 + t * 0.9 + this.sx;
      for (const ph of [0, Math.PI]) {
        const y = Math.cos(ang + ph) * amp, z = Math.sin(ang + ph);
        P.push(x, A.h / 2 + y + z * tilt * amp, dot * (0.32 + 0.4 * (z * 0.5 + 0.5)), z > 0 ? T_B : T_C);
      }
      if (i % 7 === 0) {
        const z = Math.sin(ang);
        const n = Math.max(4, Math.round((Math.abs(Math.cos(ang)) * amp * 2) / (A.cell * 0.5)));
        for (let k = 1; k < n; k++) {
          const g = k / n, y = Math.cos(ang) * amp * (1 - 2 * g);
          P.push(x, A.h / 2 + y, dot * 0.3, Math.abs(z) < 0.3 && k === Math.floor(n / 2) ? T_A : T_C);
        }
      }
    }
    return P;
  }
}

// A decaying harmonograph drawn in dots, its phases drifting.
class Harmonograph {
  constructor() { this.free = true; this.P = new Points(4096); }
  init() { this.f = [2.01, 3, 3, 2.02]; this.p = [0, 1.2, 0.4, 2.2]; }
  update(dt, A) {
    steer(this, A, dt);
    for (let k = 0; k < 4; k++) this.p[k] += dt * 0.05 * (k + 1);
  }
  points(A) {
    const P = this.P, dot = A.cell * 0.5, S = Math.min(A.w, A.h) * 0.36;
    P.reset();
    const N = 2400, f = this.f, p = this.p;
    for (let i = 0; i < N; i += 1) {
      const s = (i / N) * 70, d = Math.exp(-s * 0.025);
      const x = (Math.sin(f[0] * s + p[0]) + Math.sin(f[1] * s + p[1]) * 0.6) * d;
      const y = (Math.sin(f[2] * s + p[2]) + Math.sin(f[3] * s + p[3]) * 0.6) * d;
      const head = 1 - i / N;
      P.push(A.w / 2 + x * S * 0.68 + this.sx * 20, A.h / 2 + y * S * 0.68 + this.sy * 20, dot * (0.25 + 0.55 * head), i < 6 ? T_A : head > 0.55 ? T_B : head > 0.2 ? T_C : T_DIM);
    }
    return P;
  }
}

// Fine-pitch halftone moon with a slowly travelling terminator.
class Moon {
  constructor() { this.pitch = 0.62; }
  init(A) { this.img = new ImageData(A.cols, A.rows); }
  update() {}
  draw(L, A) {
    const { cols, rows, t } = A;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, cb = A.rgb.b, cc = A.rgb.c;
    d.fill(0);
    const R = Math.min(cols, rows) * 0.36, cx = cols / 2, cy = rows / 2;
    const la = t * 0.08, lx = Math.sin(la), lz = Math.cos(la), ly = -0.25;
    const rot = t * 0.02;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const nx = (x - cx) / R, ny = (y - cy) / R, rr = nx * nx + ny * ny;
        const i = (y * cols + x) * 4;
        if (rr > 1) {
          const halo = Math.exp(-(Math.sqrt(rr) - 1) * 9) * 0.22;
          if (halo > 0.05) { d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2]; d[i + 3] = halo * 255; }
          continue;
        }
        const nz = Math.sqrt(1 - rr);
        const lam = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
        const lon = Math.atan2(nx, nz) + rot, lat = Math.asin(ny);
        const crater = noise2(lon * 3 + 10, lat * 3) * 0.6 + noise2(lon * 9 + 3, lat * 9) * 0.4;
        // Light is dot size; maria (the darker crater fields) print in ink, the rest in the soft tone.
        const v = Math.pow(lam, 0.8) * (0.55 + 0.45 * (1 - crater));
        const col = crater > 0.58 && lam > 0.15 ? cb : cc;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = clamp(v, 0.08, 0.95) * 255;
      }
    L.putImageData(this.img, 0, 0);
  }
}

// Soft light: slow gaussian blobs in fine halftone, like light through frosted glass.
class Aura {
  constructor() { this.pitch = 0.8; }
  init(A) { this.img = new ImageData(A.cols, A.rows); }
  update() {}
  draw(L, A) {
    const { cols, rows, t } = A, P = A.pointer;
    if (this.img.width !== cols || this.img.height !== rows) this.img = new ImageData(cols, rows);
    const d = this.img.data, ca = A.rgb.a, cb = A.rgb.b, cc = A.rgb.c;
    const s = Math.min(cols, rows);
    const blobs = [
      [cols * (0.5 + 0.28 * Math.sin(t * 0.11)), rows * (0.5 + 0.25 * Math.cos(t * 0.09)), s * 0.42],
      [cols * (0.5 + 0.3 * Math.cos(t * 0.07 + 2)), rows * (0.5 + 0.28 * Math.sin(t * 0.12 + 1)), s * 0.34],
      [cols * (0.5 + 0.2 * Math.sin(t * 0.05 + 4)), rows * (0.5 + 0.3 * Math.sin(t * 0.08 + 3)), s * 0.28],
    ];
    if (P.active) blobs.push([P.x, P.y, s * 0.12]);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let v = 0;
        for (const [bx, by, br] of blobs) { const dx = x - bx, dy = y - by; v += Math.exp(-(dx * dx + dy * dy) / (br * br)); }
        v += (noise2(x * 0.05 + t * 0.03, y * 0.05) - 0.5) * 0.25;
        const i = (y * cols + x) * 4;
        // Wide, soft falloff: mostly the soft tone, ink only in the cores, accent rarely.
        const col = v > 1.65 ? ca : v > 1.05 ? cb : cc;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = Math.pow(smooth(0.04, 1.6, v), 1.25) * 255;
      }
    L.putImageData(this.img, 0, 0);
  }
}

// AI formulas wrapped onto a 3D surface: a sphere or a terrain.
export class FormulaSurface {
  constructor(src, surface) {
    this.fn = compile(src);
    this.surface = surface;
    this.free = true;
    this.P = new Points(8192);
  }
  init(A) {
    if (this.surface === "sphere") this.v = fibSphere(clamp(Math.round((A.w * A.h) / 120), 2500, 10000));
    this.cols = clamp(Math.round(A.w / 11), 70, 170);
    this.rows = 56;
    this.rot = 0;
  }
  update(dt, A) { steer(this, A, dt); this.rot += dt * 0.15; }
  val(u, v, t, i) {
    const r = Math.sqrt(u * u + v * v);
    let val = this.fn((u + 1) * 32, (v + 1) * 16, u, v, r, Math.atan2(v, u), t, i, 64, 32, 0, 0);
    if (!(val === val)) val = 0;
    return clamp(val, -1, 1);
  }
  toneOf(val, near) {
    const m = Math.abs(val);
    if (m < 0.06) return T_DIM;
    return val < 0 ? T_B : m > 0.88 ? T_A : near > 0.3 ? T_C : T_DIM;
  }
  points(A) {
    const P = this.P, t = A.t, dot = A.cell * 0.62;
    P.reset();
    if (this.surface === "sphere") {
      const v = this.v, n = v.length / 3, R = Math.min(A.w, A.h) * 0.36;
      const yaw = this.rot + this.sx * 0.5, pitch = 0.3 + this.sy * 0.3;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (let i = 0; i < n; i++) {
        const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        const lon = Math.atan2(x, z), lat = Math.asin(clamp(y, -1, 1));
        const val = this.val(lon / Math.PI * 1.6, lat / (Math.PI / 2), t, i);
        const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const sx = A.w / 2 + x1 * R, sy = A.h / 2 + y1 * R;
        if (z2 < 0) { if (Math.abs(val) > 0.4) P.push(sx, sy, dot * 0.25, T_DIM); continue; }
        const m = Math.abs(val), depth = 0.45 + 0.55 * z2;
        P.push(sx, sy, dot * depth * (m < 0.06 ? 0.2 : 0.3 + 0.7 * m), this.toneOf(val, z2));
      }
    } else {
      const f = A.w * 0.5, horizon = A.h * (0.36 + this.sy * 0.05);
      for (let r = this.rows - 1; r >= 0; r--) {
        const z = 0.4 + (r / this.rows) * 3.6, near = 1 - r / this.rows;
        for (let c = 0; c < this.cols; c++) {
          const u = ((c / (this.cols - 1)) * 2 - 1) * 1.8, vv = (r / (this.rows - 1)) * 2 - 1;
          const val = this.val(u + this.sx * 0.2, vv, t, r * this.cols + c);
          const x = u * 1.4;
          const sx = A.w / 2 + (x / z) * f;
          if (sx < -10 || sx > A.w + 10) continue;
          const sy = horizon + ((0.7 - val * 0.35) / z) * f * 0.55;
          const m = Math.abs(val);
          P.push(sx, sy, dot * (0.2 + 0.8 * near) * (m < 0.06 ? 0.3 : 0.35 + 0.65 * m), this.toneOf(val, near));
        }
      }
    }
    return P;
  }
}

export const STUDIO = [
  { id: "globe", name: "Globe", make: () => new Globe(), icon: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17"/>' },
  { id: "terrain", name: "Terrain", make: () => new Terrain(), icon: '<path d="M2 17l5-6 4 4 3-3 8 5"/><path d="M2 20h20" />' },
  { id: "galaxy", name: "Galaxy", make: () => new Galaxy(), icon: '<path d="M12 12c3-2 6 0 5 3s-6 4-9 1-1-9 4-10"/><circle cx="12" cy="12" r="1" fill="currentColor"/>' },
  { id: "silk", name: "Silk", make: () => new Silk(), icon: '<path d="M2 9c4-4 8 4 12 0s6-2 8 0"/><path d="M2 15c4-4 8 4 12 0s6-2 8 0"/>' },
  { id: "rings", name: "Rings", make: () => new Rings(), icon: '<circle cx="12" cy="12" r="9" stroke-dasharray="2 2.5"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="4 2"/><circle cx="12" cy="12" r="2"/>' },
  { id: "moon", name: "Moon", make: () => new Moon(), icon: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16 5 8 0 0 0 0-16z" fill="currentColor"/>' },
  { id: "aura", name: "Aura", make: () => new Aura(), icon: '<circle cx="9" cy="10" r="5" stroke-dasharray="1.5 2"/><circle cx="15" cy="14" r="5" stroke-dasharray="1.5 2"/>' },
  { id: "helix", name: "Helix", make: () => new Helix(), icon: '<path d="M3 6c4 0 4 12 9 12s5-12 9-12M3 18c4 0 4-12 9-12s5 12 9 12"/>' },
  { id: "harmono", name: "Harmono", make: () => new Harmonograph(), icon: '<path d="M12 4c6 0 8 6 4 9s-9 1-8-3 6-5 8-1-1 8-4 8"/>' },
];
