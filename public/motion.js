// "Motion": scenes whose movement comes from a process rather than a turning camera —
// simulations, growth, physics, algorithms at work. All are drawn on a fixed view.
import { Points, T_DIM, T_C, T_A, T_B } from "./engine.js";
import { H } from "./formula.js";

const TAU = Math.PI * 2, PI = Math.PI;
const { sin, cos, abs, exp, sqrt, hypot, floor, min, max, round, atan2 } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rnd = Math.random;
const tone = (m) => (m > 0.66 ? T_B : m > 0.3 ? T_C : T_DIM);

// A fixed dot lattice that fits the view; thumbnails get a coarse one.
function lattice(A, k = 1) {
  const p = A.thumb ? (A.w / 42) * k : max(8, A.cell * k);
  const cols = max(4, floor(A.w / p)), rows = max(4, floor(A.h / p));
  return { p, cols, rows, n: cols * rows, ox: (A.w - (cols - 1) * p) / 2, oy: (A.h - (rows - 1) * p) / 2, dot: p * 0.46 };
}
// A click this frame, in CSS pixels.
const click = (A) => A.ripples.find((R) => R.age < 0.05 && R.amp > 0.5);

// Wraps a { init, step, draw } definition; make.def lets a scene restart itself.
const scene = (def) => {
  const make = () => ({
    free: true,
    P: new Points(8192),
    init(A) { this.S = def.init(A); this.S.t = 0; },
    update(dt, A) { dt = min(dt, 0.05); this.S.t += dt; def.step(this.S, dt, A); },
    points(A) { this.P.reset(); def.draw(this.P, A, this.S); return this.P; },
  });
  make.def = def;
  return make;
};

/* ---------- Reaction–diffusion (Gray–Scott) ---------- */
function grayScott(F, K) {
  const seed = (S, cx, cy, r) => {
    for (let y = max(0, floor(cy - r)); y < min(S.rows, cy + r); y++) for (let x = max(0, floor(cx - r)); x < min(S.cols, cx + r); x++) {
      if (hypot(x - cx, y - cy) < r) { const i = y * S.cols + x; S.u[i] = 0.5; S.v[i] = 0.25 + rnd() * 0.1; }
    }
  };
  const iterate = (S) => {
    const W = S.cols, Hh = S.rows, u = S.u, v = S.v, u2 = S.u2, v2 = S.v2;
    for (let y = 0; y < Hh; y++) {
      const ym = ((y - 1 + Hh) % Hh) * W, y0 = y * W, yp = ((y + 1) % Hh) * W;
      for (let x = 0; x < W; x++) {
        const xm = x === 0 ? W - 1 : x - 1, xp = x === W - 1 ? 0 : x + 1, i = y0 + x;
        const lu = 0.2 * (u[y0 + xm] + u[y0 + xp] + u[ym + x] + u[yp + x]) + 0.05 * (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) - u[i];
        const lv = 0.2 * (v[y0 + xm] + v[y0 + xp] + v[ym + x] + v[yp + x]) + 0.05 * (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) - v[i];
        const uvv = u[i] * v[i] * v[i];
        u2[i] = u[i] + lu - uvv + F * (1 - u[i]);
        v2[i] = v[i] + 0.5 * lv + uvv - (K + F) * v[i];
      }
    }
    S.u = u2; S.v = v2; S.u2 = u; S.v2 = v;
  };
  return scene({
    init(A) {
      const g = lattice(A, 0.8), S = { ...g, u: new Float32Array(g.n).fill(1), v: new Float32Array(g.n), u2: new Float32Array(g.n), v2: new Float32Array(g.n), next: 16 };
      for (let k = 0; k < 9; k++) seed(S, rnd() * g.cols, rnd() * g.rows, 2 + rnd() * 2);
      for (let k = 0; k < (A.thumb ? 260 : 320); k++) iterate(S);
      return S;
    },
    step(S, dt, A) {
      for (let k = 0; k < (A.thumb ? 3 : 8); k++) iterate(S);
      const c = click(A);
      if (c) seed(S, (c.px - S.ox) / S.p, (c.py - S.oy) / S.p, 3);
      // Keep it alive: now and then clear a patch and plant something new in it.
      if ((S.next -= dt) < 0) {
        S.next = 14 + rnd() * 8;
        const cx = rnd() * S.cols, cy = rnd() * S.rows, r = S.rows * 0.22;
        for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) if (hypot(x - cx, y - cy) < r) { S.u[y * S.cols + x] = 1; S.v[y * S.cols + x] = 0; }
        seed(S, cx, cy, 2.5);
      }
    },
    draw(P, A, S) {
      for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) {
        const m = clamp((S.v[y * S.cols + x] - 0.08) * 4, 0, 1);
        P.push(S.ox + x * S.p, S.oy + y * S.p, S.dot * (0.12 + 0.88 * m), m > 0.7 ? T_B : m > 0.25 ? T_C : T_DIM);
      }
    },
  });
}

/* ---------- Ripple tank (wave equation) ---------- */
const pond = scene({
  init(A) { const g = lattice(A, 0.8); return { ...g, a: new Float32Array(g.n), b: new Float32Array(g.n), next: 0.3 }; },
  step(S, dt, A) {
    const drop = (cx, cy, amp) => {
      for (let y = 1; y < S.rows - 1; y++) for (let x = 1; x < S.cols - 1; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 < 16) S.a[y * S.cols + x] -= amp * exp(-d2 / 3);
      }
    };
    if ((S.next -= dt) < 0) { S.next = 0.6 + rnd() * 1.8; drop(2 + rnd() * (S.cols - 4), 2 + rnd() * (S.rows - 4), 0.9 + rnd() * 0.6); }
    const c = click(A);
    if (c) drop((c.px - S.ox) / S.p, (c.py - S.oy) / S.p, 1.6);
    for (let s = 0; s < 2; s++) {
      const W = S.cols, a = S.a, b = S.b;
      for (let y = 1; y < S.rows - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        b[i] = ((a[i - 1] + a[i + 1] + a[i - W] + a[i + W]) * 0.5 - b[i]) * 0.993;
      }
      S.a = b; S.b = a;
    }
  },
  draw(P, A, S) {
    for (let i = 0; i < S.n; i++) {
      const val = S.a[i], m = min(1, abs(val) * 5);
      P.push(S.ox + (i % S.cols) * S.p, S.oy + floor(i / S.cols) * S.p, S.dot * (0.16 + 0.84 * m), val > 0.06 ? T_B : val < -0.06 ? T_C : T_DIM);
    }
  },
});

/* ---------- Cyclic cellular automaton (Moore, threshold 3, 3 states): spirals out of noise ---------- */
const cyclic = scene({
  init(A) {
    const g = lattice(A, 0.8), N = 3, s = new Uint8Array(g.n).map(() => floor(rnd() * N));
    const S = { ...g, N, s, s2: new Uint8Array(g.n), acc: 0, life: 0 };
    for (let k = 0; k < 60; k++) cyclicStep(S);
    return S;
  },
  step(S, dt) {
    S.acc += dt * 10; S.life += dt;
    while (S.acc >= 1) {
      S.acc--;
      if (!cyclicStep(S) || S.life > 110) {
        S.s = S.s.map(() => floor(rnd() * S.N)); S.life = 0;
        for (let k = 0; k < 60; k++) cyclicStep(S);
      }
    }
  },
  draw(P, A, S) {
    for (let i = 0; i < S.n; i++) {
      const st = S.s[i];
      P.push(S.ox + (i % S.cols) * S.p, S.oy + floor(i / S.cols) * S.p, S.dot * [0.85, 0.45, 0.14][st], [T_B, T_C, T_DIM][st]);
    }
  },
});
function cyclicStep(S) {
  const { cols: W, rows: Hh, N, s, s2 } = S;
  let changed = 0;
  for (let y = 0; y < Hh; y++) {
    const rm = ((y - 1 + Hh) % Hh) * W, r0 = y * W, rp = ((y + 1) % Hh) * W;
    for (let x = 0; x < W; x++) {
    const xm = x === 0 ? W - 1 : x - 1, xp = x === W - 1 ? 0 : x + 1, i = r0 + x, nx = s[i] === N - 1 ? 0 : s[i] + 1;
    const c = (s[rm + xm] === nx) + (s[rm + x] === nx) + (s[rm + xp] === nx) + (s[r0 + xm] === nx) + (s[r0 + xp] === nx) + (s[rp + xm] === nx) + (s[rp + x] === nx) + (s[rp + xp] === nx);
    const hit = c >= 3;
    s2[i] = hit ? nx : s[i];
    if (hit) changed++;
    }
  }
  S.s = s2; S.s2 = s;
  return changed;
}

/* ---------- Elementary cellular automata, scrolling ---------- */
const RULES = [30, 110, 90, 150, 45, 73, 105, 54];
const rule = scene({
  init(A) {
    const g = lattice(A, 0.9), S = { ...g, ri: 0, acc: 0, next: 26, buf: [] };
    const first = new Uint8Array(g.cols); first[floor(g.cols / 2)] = 1;
    S.buf.push(first);
    for (let r = 1; r <= g.rows; r++) S.buf.push(ruleRow(S.buf[S.buf.length - 1], RULES[0]));
    return S;
  },
  step(S, dt) {
    S.acc += dt * 7;
    if ((S.next -= dt) < 0) { S.next = 26; S.ri = (S.ri + 1) % RULES.length; }
    while (S.acc >= 1) {
      S.acc--;
      let row = ruleRow(S.buf[S.buf.length - 1], RULES[S.ri]);
      const on = row.reduce((a, b) => a + b, 0);
      if (on === 0 || on === row.length) row = row.map(() => (rnd() < 0.5 ? 1 : 0));
      S.buf.push(row);
      if (S.buf.length > S.rows + 1) S.buf.shift();
    }
  },
  draw(P, A, S) {
    const last = S.buf.length - 1;
    for (let r = 0; r <= last; r++) {
      const y = S.oy + (r - S.acc) * S.p, row = S.buf[r];
      if (y < -S.p) continue;
      for (let x = 0; x < S.cols; x++) {
        if (row[x]) P.push(S.ox + x * S.p, y, S.dot * 0.85, r === last ? T_A : r > last - 4 ? T_B : T_C);
        else P.push(S.ox + x * S.p, y, S.dot * 0.12, T_DIM);
      }
    }
  },
});
function ruleRow(prev, r) {
  const n = prev.length, out = new Uint8Array(n);
  for (let x = 0; x < n; x++) out[x] = (r >> ((prev[(x - 1 + n) % n] << 2) | (prev[x] << 1) | prev[(x + 1) % n])) & 1;
  return out;
}

/* ---------- Langton's ants ---------- */
const ant = scene({
  init(A) {
    const g = lattice(A, 0.85);
    const ants = Array.from({ length: 3 }, () => ({ x: floor(g.cols * (0.3 + rnd() * 0.4)), y: floor(g.rows * (0.3 + rnd() * 0.4)), d: floor(rnd() * 4) }));
    return { ...g, cells: new Uint8Array(g.n), flip: new Float32Array(g.n).fill(-99), ants, acc: 0, on: 0 };
  },
  step(S, dt, A) {
    S.acc += dt * (A.thumb ? 160 : 320);
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    while (S.acc >= 1) {
      S.acc--;
      for (const a of S.ants) {
        const i = a.y * S.cols + a.x;
        a.d = S.cells[i] ? (a.d + 3) % 4 : (a.d + 1) % 4;
        S.on += S.cells[i] ? -1 : 1;
        S.cells[i] ^= 1; S.flip[i] = S.t;
        a.x = (a.x + DX[a.d] + S.cols) % S.cols; a.y = (a.y + DY[a.d] + S.rows) % S.rows;
      }
    }
    if (S.on > S.n * 0.3 || S.t > 160) Object.assign(S, ant.def.init(A), { t: 0 });
  },
  draw(P, A, S) {
    for (let i = 0; i < S.n; i++) {
      const age = S.t - S.flip[i], x = S.ox + (i % S.cols) * S.p, y = S.oy + floor(i / S.cols) * S.p;
      if (S.cells[i]) P.push(x, y, S.dot * 0.72, age < 1.2 ? T_B : T_C);
      else if (age < 0.8) P.push(x, y, S.dot * 0.3 * (1 - age / 0.8), T_DIM);
    }
    for (const a of S.ants) P.push(S.ox + a.x * S.p, S.oy + a.y * S.p, S.dot * 1.15, T_A);
  },
});

/* ---------- Falling sand with layered strata ---------- */
const sand = scene({
  init(A) { const g = lattice(A, 0.75); return { ...g, g: new Uint8Array(g.n), acc: 0, filled: 0, drain: false, tick: 0 }; },
  step(S, dt) {
    S.acc += dt * 45;
    const W = S.cols, G = S.g;
    while (S.acc >= 1) {
      S.acc--; S.tick++;
      if (!S.drain) {
        const ex = W / 2 + sin(S.t * 0.23) * W * 0.3 + sin(S.t * 0.71) * W * 0.07;
        for (let k = 0; k < 2; k++) {
          const x = clamp(floor(ex + (rnd() - 0.5) * 3), 0, W - 1);
          if (!G[x]) { G[x] = rnd() < 0.004 ? 3 : floor(S.t / 7) % 2 ? 2 : 1; S.filled++; }
        }
      } else if (S.tick % 3 === 0) {
        // Let the bottom row out; everything above settles down.
        for (let x = 0; x < W; x++) { const i = (S.rows - 1) * W + x; if (G[i]) { G[i] = 0; S.filled--; } }
      }
      const flip = S.tick % 2;
      for (let y = S.rows - 2; y >= 0; y--) {
        for (let k = 0; k < W; k++) {
          const x = flip ? k : W - 1 - k, i = y * W + x;
          if (!G[i]) continue;
          const b = i + W;
          if (!G[b]) { G[b] = G[i]; G[i] = 0; continue; }
          const d = rnd() < 0.5 ? -1 : 1;
          for (const dx of [d, -d]) {
            const nx = x + dx;
            if (nx >= 0 && nx < W && !G[b + dx] && !G[i + dx]) { G[b + dx] = G[i]; G[i] = 0; break; }
          }
        }
      }
      if (!S.drain && S.filled > S.n * 0.42) S.drain = true;
      if (S.drain && S.filled < S.n * 0.16) S.drain = false;
    }
  },
  draw(P, A, S) {
    for (let i = 0; i < S.n; i++) {
      const c = S.g[i];
      if (c) P.push(S.ox + (i % S.cols) * S.p, S.oy + floor(i / S.cols) * S.p, S.dot * 0.82, c === 3 ? T_A : c === 2 ? T_B : T_C);
    }
  },
});

/* ---------- Galton board ---------- */
const galton = scene({
  init(A) {
    const R = A.thumb ? 8 : 12, m = min(A.w, A.h), sx = m * (A.thumb ? 0.07 : 0.048), sy = sx * 0.9;
    const y0 = A.h * 0.08, bottom = A.h * 0.94, dot = sx * 0.14;
    const cap = max(3, floor((bottom - (y0 + R * sy) - sx * 0.6) / (dot * 2.2))) * 3;
    return { R, sx, sy, y0, bottom, dot, cap, cx: A.w / 2, balls: [], bins: new Array(R + 1).fill(0), spawn: 0, clearing: false, last: -1, lastT: -9 };
  },
  step(S, dt) {
    if (!S.clearing && (S.spawn -= dt) < 0) { S.spawn = 0.07; S.balls.push({ row: 0, k: 0, f: 0, dir: rnd() < 0.5 ? 0 : 1, fy: 0, fall: false }); }
    const stackTop = (k) => S.bottom - floor(S.bins[k] / 3) * S.dot * 2.2;
    S.balls = S.balls.filter((b) => {
      if (!b.fall) {
        b.f += dt * 7;
        while (b.f >= 1 && !b.fall) {
          b.f -= 1; b.k += b.dir; b.row++; b.dir = rnd() < 0.5 ? 0 : 1;
          if (b.row >= S.R) { b.fall = true; b.fy = S.y0 + S.R * S.sy; b.v = 0; }
        }
        return true;
      }
      b.v += dt * S.sx * 30; b.fy += b.v * dt;
      if (b.fy >= stackTop(b.k)) { S.bins[b.k]++; S.last = b.k; S.lastT = S.t; if (S.bins[b.k] >= S.cap) S.clearing = true; return false; }
      return true;
    });
    if (S.clearing) {
      for (let k = 0; k <= S.R; k++) S.bins[k] = max(0, S.bins[k] - 2);
      if (S.bins.every((c) => c === 0) && !S.balls.length) S.clearing = false;
    }
  },
  draw(P, A, S) {
    const xp = (r, k) => S.cx + (k - r / 2) * S.sx, yp = (r) => S.y0 + r * S.sy, d = S.dot;
    for (let r = 0; r < S.R; r++) for (let k = 0; k <= r; k++) P.push(xp(r, k), yp(r), d * 0.8, T_DIM);
    // Bin walls.
    for (let k = 0; k <= S.R + 1; k++) {
      const x = xp(S.R, k) - S.sx / 2;
      for (let y = S.bottom; y > yp(S.R) + S.sx * 0.6; y -= d * 2.6) P.push(x, y, d * 0.35, T_DIM);
    }
    for (const b of S.balls) {
      if (b.fall) { P.push(xp(S.R, b.k), b.fy, d * 1.1, T_B); continue; }
      const x = xp(b.row, b.k) + (xp(b.row + 1, b.k + b.dir) - xp(b.row, b.k)) * b.f;
      P.push(x, yp(b.row) + (yp(b.row + 1) - yp(b.row)) * b.f - sin(b.f * PI) * S.sy * 0.35 - d * 1.6, d * 1.1, T_B);
    }
    for (let k = 0; k <= S.R; k++) for (let c = 0; c < S.bins[k]; c++) {
      const top = k === S.last && c === S.bins[k] - 1 && S.t - S.lastT < 0.4;
      P.push(xp(S.R, k) + ((c % 3) - 1) * d * 2.2, S.bottom - floor(c / 3) * d * 2.2, d * 0.95, top ? T_A : T_C);
    }
  },
});

/* ---------- Diffusion-limited aggregation ---------- */
const crystal = scene({
  init(A) {
    const g = lattice(A, 0.6), birth = new Float32Array(g.n).fill(-1);
    const cx = floor(g.cols / 2), cy = floor(g.rows / 2);
    birth[cy * g.cols + cx] = 0;
    const S = { ...g, birth, cx, cy, R: 2, walkers: [], fade: 0 };
    for (let k = 0; k < 260; k++) S.walkers.push(spawnWalker(S));
    return S;
  },
  step(S, dt, A) {
    if (S.fade > 0) {
      S.fade += dt;
      if (S.fade > 2.5) Object.assign(S, crystal.def.init(A), { t: S.t });
      return;
    }
    let budget = A.thumb ? 1500 : 3000;
    const W = S.cols, B = S.birth;
    while (budget > 0) {
      for (let w = 0; w < S.walkers.length && budget > 0; w++, budget--) {
        const k = S.walkers[w];
        const r = floor(rnd() * 4);
        k.x += r === 0 ? 1 : r === 1 ? -1 : 0; k.y += r === 2 ? 1 : r === 3 ? -1 : 0;
        const d = hypot(k.x - S.cx, k.y - S.cy);
        if (d > S.R + 7 || k.x < 1 || k.y < 1 || k.x >= W - 1 || k.y >= S.rows - 1) { S.walkers[w] = spawnWalker(S); continue; }
        const i = k.y * W + k.x;
        if (B[i - 1] >= 0 || B[i + 1] >= 0 || B[i - W] >= 0 || B[i + W] >= 0) {
          B[i] = S.t; S.R = max(S.R, d + 1); S.walkers[w] = spawnWalker(S);
        }
      }
    }
    if (S.R > min(S.cols, S.rows) * 0.47) S.fade = 0.001;
  },
  draw(P, A, S) {
    const f = 1 - clamp(S.fade / 2.5, 0, 1);
    for (let i = 0; i < S.n; i++) {
      const b = S.birth[i];
      if (b < 0) continue;
      const age = S.t - b;
      P.push(S.ox + (i % S.cols) * S.p, S.oy + floor(i / S.cols) * S.p, S.dot * 0.8 * f, age < 0.3 ? T_A : age < 5 ? T_B : T_C);
    }
  },
});
function spawnWalker(S) {
  const a = rnd() * TAU, r = S.R + 4;
  return { x: clamp(round(S.cx + cos(a) * r), 1, S.cols - 2), y: clamp(round(S.cy + sin(a) * r), 1, S.rows - 2) };
}

/* ---------- A tree that grows, holds, and lets go ---------- */
function growTree(A) {
  const segs = [], maxD = A.thumb ? 7 : 9, speed = A.h * 0.17;
  const rec = (x, y, ang, len, d, t0) => {
    const x1 = x + cos(ang) * len, y1 = y + sin(ang) * len, t1 = t0 + len / speed;
    segs.push({ x, y, x1, y1, t0, t1, d, bloom: d === maxD && rnd() < 0.04 });
    if (d >= maxD) return;
    const n = rnd() < 0.18 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const spread = (k - (n - 1) / 2) * (0.38 + rnd() * 0.3) + (rnd() - 0.5) * 0.25;
      rec(x1, y1, ang + spread, len * (0.68 + rnd() * 0.1), d + 1, t1);
    }
  };
  rec(A.w / 2, A.h * 0.95, -PI / 2 + (rnd() - 0.5) * 0.1, A.h * 0.19, 0, 0);
  return { segs, maxD, end: max(...segs.map((s) => s.t1)) };
}
const sapling = scene({
  init(A) { return growTree(A); },
  step(S, dt, A) { if (S.t > S.end + 11) { Object.assign(S, growTree(A)); S.t = 0; } },
  draw(P, A, S) {
    const t = S.t, gap = max(2, A.cell * 0.45), fade = 1 - clamp((t - S.end - 8) / 2.5, 0, 1), base = A.h * 0.95;
    for (const s of S.segs) {
      if (t < s.t0) continue;
      const f = min(1, (t - s.t0) / (s.t1 - s.t0)), len = hypot(s.x1 - s.x, s.y1 - s.y), n = max(1, floor((len * f) / gap));
      const size = A.cell * 0.42 * (0.28 + 0.9 * (1 - s.d / S.maxD) ** 1.4) * fade;
      for (let k = 0; k <= n; k++) {
        const q = (k / n) * f, x = s.x + (s.x1 - s.x) * q, y = s.y + (s.y1 - s.y) * q;
        // A gentle sway, stronger towards the top.
        const sway = sin(t * 0.7 + y * 0.006) * (base - y) * 0.012;
        P.push(x + sway, y, size, s.d < 3 ? T_B : T_C);
      }
      if (s.bloom && f >= 1) {
        const sway = sin(t * 0.7 + s.y1 * 0.006) * (base - s.y1) * 0.012;
        P.push(s.x1 + sway, s.y1, A.cell * 0.5 * fade, T_A);
      }
    }
  },
});

/* ---------- Fireflies that slowly fall into step (Kuramoto) ---------- */
const fireflies = scene({
  init(A) {
    const n = A.thumb ? 60 : 170;
    return { n, x: Float32Array.from({ length: n }, rnd), y: Float32Array.from({ length: n }, rnd), th: Float32Array.from({ length: n }, rnd), w: Float32Array.from({ length: n }, () => 0.55 + rnd() * 0.12), next: 70 };
  },
  step(S, dt) {
    const { n, x, y, th, w } = S;
    if ((S.next -= dt) < 0) { S.next = 70; for (let i = 0; i < n; i++) th[i] = rnd(); }
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = 0; j < n; j++) {
        const dx = x[j] - x[i], dy = y[j] - y[i];
        if (dx * dx + dy * dy < 0.06) { sum += sin(TAU * (th[j] - th[i])); cnt++; }
      }
      th[i] += dt * (w[i] + 0.3 * (sum / max(1, cnt)));
      if (th[i] >= 1) th[i] -= 1;
      x[i] = (x[i] + (H.noise(x[i] * 3, y[i] * 3, S.t * 0.05) - 0.5) * 0.03 * dt + 1) % 1;
      y[i] = (y[i] + (H.noise(y[i] * 3 + 9, x[i] * 3, S.t * 0.05) - 0.5) * 0.03 * dt + 1) % 1;
    }
  },
  draw(P, A, S) {
    const d = A.cell * 0.42;
    for (let i = 0; i < S.n; i++) {
      const b = exp(-S.th[i] * 9);
      P.push(A.w * (0.04 + S.x[i] * 0.92), A.h * (0.06 + S.y[i] * 0.88), d * (0.3 + 1.2 * b), b > 0.6 ? T_A : b > 0.15 ? T_B : T_DIM);
    }
  },
});

/* ---------- Traffic: jams that appear from nowhere (Nagel–Schreckenberg) ---------- */
const traffic = scene({
  init(A) {
    const g = lattice(A, 0.9), lanes = A.thumb ? 6 : 11, L = g.cols;
    const roads = Array.from({ length: lanes }, (_, l) => {
      const dens = 0.12 + 0.05 * (l % 4), cars = [];
      for (let x = 0; x < L; x++) if (rnd() < dens) cars.push({ pos: x, prev: x, v: 0 });
      return { y: A.h * (0.14 + (0.72 * l) / (lanes - 1)), dir: l % 2 ? -1 : 1, cars };
    });
    return { ...g, L, roads, acc: 0 };
  },
  step(S, dt) {
    S.acc += dt * 5;
    while (S.acc >= 1) {
      S.acc--;
      for (const r of S.roads) {
        const c = r.cars, n = c.length;
        for (let i = 0; i < n; i++) {
          const gap = (c[(i + 1) % n].pos - c[i].pos - 1 + S.L) % S.L;
          let v = min(c[i].v + 1, 5, n > 1 ? gap : 5);
          if (v > 0 && rnd() < 0.22) v--;
          c[i].v = v;
        }
        for (const car of c) { car.prev = car.pos; car.pos = (car.pos + car.v) % S.L; }
        c.sort((a, b) => a.pos - b.pos);
      }
    }
  },
  draw(P, A, S) {
    const toX = (q, dir) => S.ox + (dir > 0 ? q : S.L - 1 - q) * S.p;
    S.roads.forEach((r, l) => {
      for (let x = 0; x < S.L; x += 3) P.push(toX(x, 1), r.y + S.p * 0.6, S.dot * 0.14, T_DIM);
      r.cars.forEach((car, i) => {
        let dp = car.pos - car.prev;
        if (dp < 0) dp += S.L;
        const q = (car.prev + dp * S.acc) % S.L, tn = l === 3 && i === 0 ? T_A : car.v === 0 ? T_B : T_C;
        P.push(toX(q, r.dir), r.y, S.dot * 0.8, tn);
        P.push(toX(q, r.dir) - r.dir * S.p * 0.55, r.y, S.dot * 0.8, tn);
      });
    });
  },
});

/* ---------- A hanging sheet in the wind (Verlet cloth) ---------- */
const curtain = scene({
  init(A) {
    const nx = A.thumb ? 22 : 46, ny = A.thumb ? 16 : 32, n = nx * ny, pos = new Float32Array(n * 3);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = -1 + (2 * i) / (nx - 1); pos[k + 1] = -0.78 + (1.45 * j) / (ny - 1); pos[k + 2] = 0;
    }
    return { nx, ny, n, pos, prev: pos.slice(), rx: 2 / (nx - 1), ry: 1.45 / (ny - 1) };
  },
  step(S, dt) {
    const { nx, ny, pos, prev } = S, h = dt / 2, t = S.t;
    // Wind is sampled once per frame on the rest grid; it varies slowly enough.
    const wind = S.wind || (S.wind = new Float32Array(S.n * 2));
    for (let i = nx; i < S.n; i++) {
      const u = (i % nx) / nx, v = floor(i / nx) / ny;
      wind[i * 2] = 0.35 * (H.noise(v * 1.6 + 5, t * 0.3, u) - 0.5);
      wind[i * 2 + 1] = 1.5 * (H.noise(u * 2.2 + t * 0.45, v * 1.6, t * 0.2) - 0.45) + 0.5 * sin(t * 0.37);
    }
    for (let sub = 0; sub < 2; sub++) {
      for (let i = nx; i < S.n; i++) {
        const k = i * 3, x = pos[k], y = pos[k + 1], z = pos[k + 2];
        const ax = wind[i * 2], ay = 2.2, az = wind[i * 2 + 1];
        const vx = (x - prev[k]) * 0.985, vy = (y - prev[k + 1]) * 0.985, vz = (z - prev[k + 2]) * 0.985;
        prev[k] = x; prev[k + 1] = y; prev[k + 2] = z;
        pos[k] = x + vx + ax * h * h; pos[k + 1] = y + vy + ay * h * h; pos[k + 2] = z + vz + az * h * h;
      }
      for (let it = 0; it < 4; it++) {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = j * nx + i;
          if (i < nx - 1 && j > 0) link(pos, a, a + 1, S.rx, false, false);
          if (j < ny - 1) link(pos, a, a + nx, S.ry, j === 0, false);
        }
      }
    }
  },
  draw(P, A, S) {
    const { nx, ny, pos } = S, sc = min(A.w, A.h) * 0.42, dot = ((sc * 2) / (nx - 1)) * 0.46;
    const at = (i, j) => (clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)) * 3;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = at(i, j), r = at(i + 1, j), l = at(i - 1, j), u = at(i, j - 1), d = at(i, j + 1);
      const ax = pos[r] - pos[l], ay = pos[r + 1] - pos[l + 1], az = pos[r + 2] - pos[l + 2];
      const bx = pos[d] - pos[u], by = pos[d + 1] - pos[u + 1], bz = pos[d + 2] - pos[u + 2];
      let n0 = ay * bz - az * by, n1 = az * bx - ax * bz, n2 = ax * by - ay * bx;
      const nl = hypot(n0, n1, n2) || 1;
      n0 /= nl; n1 /= nl; n2 /= nl;
      if (n2 < 0) { n0 = -n0; n1 = -n1; n2 = -n2; }
      const lam = clamp(-n0 * 0.45 - n1 * 0.45 + n2 * 0.75, 0, 1), persp = 1 / (1 - pos[k + 2] * 0.22);
      P.push(A.w / 2 + pos[k] * sc * persp, A.h / 2 + pos[k + 1] * sc * persp, dot * persp * (0.25 + 0.75 * lam), j === 0 ? (i === 0 ? T_A : T_B) : lam > 0.62 ? T_B : lam > 0.3 ? T_C : T_DIM);
    }
  },
});
// Pulls two cloth points back towards their rest distance; pinned points never move.
function link(pos, a, b, rest, pinA, pinB) {
  const ka = a * 3, kb = b * 3;
  const dx = pos[kb] - pos[ka], dy = pos[kb + 1] - pos[ka + 1], dz = pos[kb + 2] - pos[ka + 2];
  const d = hypot(dx, dy, dz) || 1e-6, diff = (d - rest) / d;
  const wa = pinB ? 1 : 0.5, wb = pinA ? 1 : 0.5;
  if (!pinA) { pos[ka] += dx * diff * wa; pos[ka + 1] += dy * diff * wa; pos[ka + 2] += dz * diff * wa; }
  if (!pinB) { pos[kb] -= dx * diff * wb; pos[kb + 1] -= dy * diff * wb; pos[kb + 2] -= dz * diff * wb; }
}

/* ---------- Incense smoke ---------- */
const incense = scene({
  init(A) { return { parts: [], acc: 0 }; },
  step(S, dt, A) {
    const sx = A.w / 2, sy = A.h * 0.64;
    S.acc += dt * (A.thumb ? 25 : 50);
    while (S.acc >= 1) { S.acc--; S.parts.push({ x: sx + (rnd() - 0.5) * 2, y: sy, age: 0 }); }
    for (const p of S.parts) {
      p.age += dt;
      const swirl = (H.noise(p.x * 0.006, p.y * 0.006 - S.t * 0.1, S.t * 0.15) - 0.5) * A.h * 0.3 * min(1, p.age * 0.35);
      p.x += swirl * dt;
      p.y -= A.h * 0.07 * (1 + p.age * 0.08) * dt;
    }
    S.parts = S.parts.filter((p) => p.age < 9 && p.y > -10);
  },
  draw(P, A, S) {
    const d = A.cell * 0.42, sx = A.w / 2, sy = A.h * 0.64;
    for (const p of S.parts) P.push(p.x, p.y, d * clamp(0.75 - p.age * 0.05, 0.2, 1), p.age < 2 ? T_B : p.age < 5 ? T_C : T_DIM);
    for (let y = sy + d * 2.2; y < A.h * 0.94; y += d * 1.6) P.push(sx, y, d * 0.5, T_C);
    P.push(sx, sy + d * 0.6, d * (1 + 0.15 * sin(S.t * 3)), T_A);
  },
});

/* ---------- Soda: bubbles rising and popping ---------- */
const soda = scene({
  init(A) { return { sites: Array.from({ length: 7 }, () => ({ x: A.w * (0.12 + rnd() * 0.76), next: rnd() })), bubbles: [], rip: [] }; },
  step(S, dt, A) {
    const sc = min(A.w, A.h) / 700, top = A.h * 0.16;
    for (const s of S.sites) if ((s.next -= dt) < 0) { s.next = 0.25 + rnd() * 1.2; S.bubbles.push({ x: s.x, y: A.h * 0.95, r: 3 * sc, age: 0, ph: rnd() * TAU }); }
    for (const b of S.bubbles) {
      b.age += dt; b.r += dt * 6 * sc;
      b.y -= min(140, 16 + b.age * 26) * sc * dt;
      b.x += sin(b.age * 6 + b.ph) * 0.4 * sc;
    }
    S.bubbles = S.bubbles.filter((b) => { if (b.y - b.r < top) { S.rip.push({ x: b.x, age: 0 }); return false; } return true; });
    for (const r of S.rip) r.age += dt;
    S.rip = S.rip.filter((r) => r.age < 2.5);
  },
  draw(P, A, S) {
    const d = A.cell * 0.42, top = A.h * 0.16;
    for (const b of S.bubbles) {
      if (b.r < d * 1.6) { P.push(b.x, b.y, d * 0.55, T_C); continue; }
      const n = max(6, round((TAU * b.r) / (d * 1.9)));
      for (let k = 0; k < n; k++) P.push(b.x + cos((k / n) * TAU) * b.r, b.y + sin((k / n) * TAU) * b.r, d * 0.55, k === floor(n * 0.62) ? T_B : T_C);
    }
    for (let x = d; x < A.w; x += d * 2.2) {
      let y = top;
      for (const r of S.rip) { const dx = abs(x - r.x); y += A.h * 0.012 * exp(-r.age * 1.6) * sin(dx * 0.06 - r.age * 7) * exp(-dx * 0.012); }
      P.push(x, y, d * 0.55, T_B);
    }
  },
});

/* ---------- Sorting algorithms at work ---------- */
function* insertion(a) {
  for (let i = 1; i < a.length; i++) for (let j = i; j > 0; j--) {
    yield [j - 1, j];
    if (a[j - 1] <= a[j]) break;
    [a[j - 1], a[j]] = [a[j], a[j - 1]];
  }
}
function* quick(a, lo = 0, hi = a.length - 1) {
  if (lo >= hi) return;
  let i = lo;
  for (let j = lo; j < hi; j++) { yield [j, hi]; if (a[j] < a[hi]) { [a[i], a[j]] = [a[j], a[i]]; i++; } }
  [a[i], a[hi]] = [a[hi], a[i]];
  yield* quick(a, lo, i - 1); yield* quick(a, i + 1, hi);
}
function* shell(a) {
  for (let g = floor(a.length / 2); g > 0; g = floor(g / 2)) for (let i = g; i < a.length; i++) for (let j = i; j >= g; j -= g) {
    yield [j - g, j];
    if (a[j - g] <= a[j]) break;
    [a[j - g], a[j]] = [a[j], a[j - g]];
  }
}
const SORTS = [quick, insertion, shell];
const sort = scene({
  init(A) { const S = { n: A.thumb ? 22 : 48, algo: 0, acc: 0 }; return sortReset(S); },
  step(S, dt) {
    if (S.done) { S.hold += dt; if (S.hold > 3.2) { S.algo = (S.algo + 1) % SORTS.length; sortReset(S); } return; }
    S.acc += dt * (S.algo === 1 ? 70 : 40);
    while (S.acc >= 1) {
      S.acc--;
      const r = S.gen.next();
      if (r.done) { S.done = true; S.hold = 0; S.cmp = []; break; }
      S.cmp = r.value;
    }
  },
  draw(P, A, S) {
    const bw = (A.w * 0.66) / S.n, x0 = (A.w - bw * (S.n - 1)) / 2, base = A.h * 0.84, maxH = A.h * 0.66, d = bw * 0.38;
    const sweep = S.done ? S.hold * S.n * 0.9 : -1;
    for (let i = 0; i < S.n; i++) {
      const lv = max(1, round(((S.a[i] / S.n) * maxH) / bw)), hot = S.cmp.includes(i);
      for (let k = 0; k < lv; k++) P.push(x0 + i * bw, base - k * bw, d, hot ? (k === lv - 1 ? T_A : T_B) : i < sweep ? T_B : T_C);
    }
  },
});
function sortReset(S) {
  S.a = Array.from({ length: S.n }, (_, i) => i + 1);
  for (let i = S.n - 1; i > 0; i--) { const j = floor(rnd() * (i + 1)); [S.a[i], S.a[j]] = [S.a[j], S.a[i]]; }
  S.gen = SORTS[S.algo](S.a); S.cmp = []; S.done = false; S.hold = 0;
  return S;
}

/* ---------- A maze carved, then solved ---------- */
const maze = scene({
  init(A) {
    const g = lattice(A, 0.9), MW = max(3, floor((g.cols - 1) / 2)), MH = max(3, floor((g.rows - 1) / 2)), DW = MW * 2 + 1, DH = MH * 2 + 1;
    const wall = new Uint8Array(DW * DH).fill(1), seen = new Uint8Array(MW * MH);
    seen[0] = 1; wall[DW + 1] = 0;
    return { p: g.p, dot: g.dot, MW, MH, DW, DH, wall, seen, stack: [[0, 0]], path: [], shown: 0, phase: "carve", acc: 0, hold: 0, ox: (A.w - (DW - 1) * g.p) / 2, oy: (A.h - (DH - 1) * g.p) / 2 };
  },
  step(S, dt, A) {
    S.acc += dt * (S.phase === "carve" ? (A.thumb ? 60 : 110) : 60);
    while (S.acc >= 1) {
      S.acc--;
      if (S.phase === "carve") {
        const [cx, cy] = S.stack[S.stack.length - 1];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < S.MW && y < S.MH && !S.seen[y * S.MW + x]);
        if (nb.length) {
          const [nx, ny] = nb[floor(rnd() * nb.length)];
          S.seen[ny * S.MW + nx] = 1;
          S.wall[(cy + ny + 1) * S.DW + (cx + nx + 1)] = 0;
          S.wall[(ny * 2 + 1) * S.DW + nx * 2 + 1] = 0;
          S.stack.push([nx, ny]);
        } else {
          S.stack.pop();
          if (!S.stack.length) { S.phase = "solve"; S.path = solveMaze(S); }
        }
      } else if (S.phase === "solve") {
        if (++S.shown >= S.path.length) { S.phase = "hold"; break; }
      } else break;
    }
    if (S.phase === "hold" && (S.hold += dt) > 5.5) Object.assign(S, maze.def.init(A), { t: S.t });
  },
  draw(P, A, S) {
    const fade = 1 - clamp((S.hold - 4) / 1.5, 0, 1), head = S.stack[S.stack.length - 1];
    for (let y = 0; y < S.DH; y++) for (let x = 0; x < S.DW; x++) if (S.wall[y * S.DW + x]) P.push(S.ox + x * S.p, S.oy + y * S.p, S.dot * 0.55 * fade, T_C);
    for (let k = 0; k < S.shown && k < S.path.length; k++) {
      const [x, y] = S.path[k];
      P.push(S.ox + x * S.p, S.oy + y * S.p, S.dot * 0.7 * fade, k === S.shown - 1 && S.phase === "solve" ? T_A : T_B);
    }
    if (S.phase === "carve" && head) P.push(S.ox + (head[0] * 2 + 1) * S.p, S.oy + (head[1] * 2 + 1) * S.p, S.dot * 0.9, T_A);
  },
});
function solveMaze(S) {
  const { DW, DH, wall } = S, start = DW + 1, goal = (DH - 2) * DW + DW - 2, from = new Int32Array(DW * DH).fill(-1), q = [start];
  from[start] = start;
  while (q.length) {
    const i = q.shift();
    if (i === goal) break;
    for (const j of [i + 1, i - 1, i + DW, i - DW]) if (!wall[j] && from[j] < 0) { from[j] = i; q.push(j); }
  }
  const path = [];
  for (let i = goal; from[i] >= 0 && i !== start; i = from[i]) path.push([i % DW, floor(i / DW)]);
  path.push([1, 1]);
  return path.reverse();
}

/* ---------- Sliding puzzle: scrambles a halftone sphere, then puts it back ---------- */
const slide = scene({
  init(A) {
    const m = 4, k = A.thumb ? 5 : 9, T = min(A.w, A.h) * 0.66 / m;
    const S = { m, k, T, dp: (T * 0.94) / k, bx: (A.w - T * m) / 2, by: (A.h - T * m) / 2, board: [...Array(m * m).keys()], empty: m * m - 1, hist: [], phase: "solved", hold: 2, mv: null };
    return S;
  },
  step(S, dt) {
    if (S.mv) {
      S.mv.f += dt * (S.phase === "scramble" ? 9 : 3.6);
      if (S.mv.f < 1) return;
      S.board[S.mv.to] = S.board[S.mv.from]; S.board[S.mv.from] = S.m * S.m - 1; S.empty = S.mv.from; S.mv = null;
    }
    if (S.phase === "solved") { if ((S.hold -= dt) < 0) { S.phase = "scramble"; S.left = 70; } return; }
    if (S.phase === "scramble") {
      if (S.left-- <= 0) { S.phase = "pause"; S.hold = 1.4; return; }
      const ex = S.empty % S.m, ey = floor(S.empty / S.m), last = S.hist[S.hist.length - 1];
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [ex + dx, ey + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < S.m && y < S.m).map(([x, y]) => y * S.m + x).filter((i) => i !== last);
      const from = opts[floor(rnd() * opts.length)];
      S.hist.push(S.empty);
      S.mv = { from, to: S.empty, f: 0 };
      return;
    }
    if (S.phase === "pause") { if ((S.hold -= dt) < 0) S.phase = "solve"; return; }
    if (S.phase === "solve") {
      if (!S.hist.length) { S.phase = "solved"; S.hold = 3.5; return; }
      S.mv = { from: S.hist.pop(), to: S.empty, f: 0 };
    }
  },
  draw(P, A, S) {
    const { m, k, T, dp } = S, d = dp * 0.46, e = S.mv ? S.mv.f * S.mv.f * (3 - 2 * S.mv.f) : 0;
    for (let pos = 0; pos < m * m; pos++) {
      const id = S.board[pos];
      if (id === m * m - 1) continue;
      let px = pos % m, py = floor(pos / m);
      if (S.mv && S.mv.from === pos) { px += ((S.mv.to % m) - px) * e; py += (floor(S.mv.to / m) - py) * e; }
      const hx = id % m, hy = floor(id / m);
      for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
        const u = ((hx * k + a + 0.5) / (m * k)) * 2 - 1, v = ((hy * k + b + 0.5) / (m * k)) * 2 - 1, r2 = u * u + v * v;
        const X = S.bx + px * T + T * 0.03 + (a + 0.5) * dp, Y = S.by + py * T + T * 0.03 + (b + 0.5) * dp;
        if (r2 < 0.8) {
          const z = sqrt(0.8 - r2), lam = clamp((-u * 0.45 - v * 0.6 + z * 0.75) / 0.9, 0, 1);
          P.push(X, Y, d * (0.22 + 0.78 * lam), lam > 0.995 ? T_A : lam > 0.55 ? T_B : T_C);
        } else P.push(X, Y, d * 0.2, T_DIM);
      }
    }
  },
});

/* ---------- Dots that regroup into one formation after another ---------- */
const hash1 = (i) => { const s = sin(i * 127.1) * 43758.5453; return s - floor(s); };
const FORMATIONS = [
  (i, N) => { const s = Math.ceil(sqrt(N)); return [((i % s) / (s - 1)) * 1.8 - 0.9, (floor(i / s) / (s - 1)) * 1.8 - 0.9]; },
  (i, N) => { const ring = i % 3, a = (floor(i / 3) / (N / 3)) * TAU, r = [1, 0.66, 0.32][ring]; return [cos(a) * r, sin(a) * r]; },
  (i, N) => { const x = (floor(i / 5) / (N / 5)) * 3.2 - 1.6; return [x, sin(x * 3) * 0.38 + ((i % 5) - 2) * 0.09]; },
  (i, N) => { const r = sqrt((i + 0.5) / N), a = i * PI * (3 - sqrt(5)); return [cos(a) * r, sin(a) * r]; },
  (i, N) => { const R = sqrt(2 * N), r = floor((sqrt(8 * i + 1) - 1) / 2), c = i - (r * (r + 1)) / 2; return [((c - r / 2) / R) * 2, (r / R) * 2 - 0.95]; },
  (i, N) => { const y = ((i % 9) / 8) * 1.8 - 0.9, x = (floor(i / 9) / (N / 9)) * 3 - 1.5; return [x, y]; },
  (i) => [(hash1(i) - 0.5) * 3.2, (hash1(i + 999) - 0.5) * 2],
];
const assemble = scene({
  init(A) { return { N: A.thumb ? 300 : 900, k: 0 }; },
  step(S) { const cyc = 6.5; S.k = floor(S.t / cyc); S.phase = S.t - S.k * cyc; },
  draw(P, A, S) {
    const sc = min(A.w, A.h) * 0.42, F = FORMATIONS.length, a = FORMATIONS[S.k % F], b = FORMATIONS[(S.k + 1) % F], d = A.cell * 0.42;
    for (let i = 0; i < S.N; i++) {
      const delay = 4 + hash1(i * 3.7) * 0.9, q = clamp((S.phase - delay) / 1.6, 0, 1), e = q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2;
      const [x0, y0] = a(i, S.N), [x1, y1] = b(i, S.N);
      P.push(A.w / 2 + (x0 + (x1 - x0) * e) * sc, A.h / 2 + (y0 + (y1 - y0) * e) * sc, d * 0.6, i === 0 ? T_A : q > 0 && q < 1 ? T_B : T_C);
    }
  },
});

/* ---------- Fields ---------- */
const masses = (A, t) => [0, 1].map((k) => [A.w / 2 + sin(t * 0.21 + k * 2.1) * A.w * 0.3, A.h / 2 + sin(t * 0.29 + k * 1.3) * A.h * 0.26]);
const gravity = scene({
  init(A) { return lattice(A, 1.15); },
  step() {},
  draw(P, A, S) {
    const m = min(A.w, A.h), K = (0.12 * m) ** 2, s2 = (0.06 * m) ** 2, M = masses(A, S.t);
    for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) {
      const px = S.ox + x * S.p, py = S.oy + y * S.p;
      let dx = 0, dy = 0, f = 0;
      for (const [mx, my] of M) {
        const ex = mx - px, ey = my - py, k = min(0.85, K / (ex * ex + ey * ey + s2));
        dx += ex * k; dy += ey * k; f = max(f, k);
      }
      P.push(px + dx, py + dy, S.dot * (0.3 + 0.7 * min(1, f * 2)), f > 0.4 ? T_B : f > 0.12 ? T_C : T_DIM);
    }
    for (const [mx, my] of M) P.push(mx, my, S.dot * 0.9, T_A);
  },
});
const metaballs = scene({
  init(A) { return { ...lattice(A, 0.8), balls: Array.from({ length: 6 }, (_, k) => ({ a: 0.13 + k * 0.037, b: 0.17 + k * 0.029, ph: k * 1.7, r: 0.1 + (k % 3) * 0.03 })) }; },
  step() {},
  draw(P, A, S) {
    const m = min(A.w, A.h), B = new Float64Array(S.balls.length * 3);
    S.balls.forEach((b, k) => { B[k * 3] = A.w / 2 + sin(S.t * b.a + b.ph) * A.w * 0.32; B[k * 3 + 1] = A.h / 2 + sin(S.t * b.b + b.ph * 1.3) * A.h * 0.3; B[k * 3 + 2] = (b.r * m) ** 2; });
    for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) {
      const px = S.ox + x * S.p, py = S.oy + y * S.p;
      let f = 0;
      for (let k = 0; k < B.length; k += 3) { const ex = px - B[k], ey = py - B[k + 1]; f += B[k + 2] / (ex * ex + ey * ey + 1); }
      const q = smooth(0.55, 1.4, f);
      P.push(px, py, S.dot * (0.12 + 0.88 * q), q > 0.92 ? T_B : q > 0.15 ? T_C : T_DIM);
    }
  },
});
const cells = scene({
  init(A) {
    const n = A.thumb ? 9 : 17;
    return { ...lattice(A, 0.85), seeds: Array.from({ length: n }, (_, k) => ({ x: rnd() * A.w, y: rnd() * A.h, k })) };
  },
  step(S, dt, A) {
    for (const s of S.seeds) {
      s.x += (H.noise(s.k * 3.1, S.t * 0.08, 0) - 0.5) * A.w * 0.08 * dt;
      s.y += (H.noise(s.k * 3.1 + 50, S.t * 0.08, 0) - 0.5) * A.h * 0.08 * dt;
      s.x = clamp(s.x, 0, A.w); s.y = clamp(s.y, 0, A.h);
    }
  },
  draw(P, A, S) {
    for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) {
      const px = S.ox + x * S.p, py = S.oy + y * S.p;
      let f1 = 1e12, f2 = 1e12, near = -1;
      for (const s of S.seeds) {
        const d = (px - s.x) ** 2 + (py - s.y) ** 2;
        if (d < f1) { f2 = f1; f1 = d; near = s.k; } else if (d < f2) f2 = d;
      }
      const e = sqrt(f2) - sqrt(f1), wall = 1 - smooth(0, S.p * 1.5, e), core = sqrt(f1) < S.p * 1.1;
      P.push(px, py, S.dot * (core ? 0.9 : 0.14 + 0.76 * wall), core ? (near === 0 ? T_A : T_B) : wall > 0.55 ? T_B : wall > 0.2 ? T_C : T_DIM);
    }
  },
});
const filings = scene({
  init(A) { return lattice(A, 1.3); },
  step() {},
  draw(P, A, S) {
    const t = S.t, m = min(A.w, A.h), L = m * 0.12;
    const poles = [0, 1].flatMap((k) => {
      const cx = A.w / 2 + sin(t * 0.13 + k * 3) * A.w * 0.22, cy = A.h / 2 + sin(t * 0.17 + k * 1.7) * A.h * 0.2, a = k * 1.3 + 0.4;
      return [[cx + cos(a) * L, cy + sin(a) * L, 1], [cx - cos(a) * L, cy - sin(a) * L, -1]];
    });
    for (let y = 0; y < S.rows; y++) for (let x = 0; x < S.cols; x++) {
      const px = S.ox + x * S.p, py = S.oy + y * S.p;
      let fx = 0, fy = 0;
      for (const [qx, qy, q] of poles) { const dx = px - qx, dy = py - qy, d2 = dx * dx + dy * dy + 40; fx += (q * dx) / d2; fy += (q * dy) / d2; }
      const mag = clamp(hypot(fx, fy) * m * 0.06, 0, 1), a = atan2(fy, fx), c = cos(a) * S.p * 0.3, s = sin(a) * S.p * 0.3;
      const tn = mag > 0.6 ? T_B : mag > 0.25 ? T_C : T_DIM, sz = S.dot * (0.18 + 0.3 * mag);
      P.push(px - c, py - s, sz, tn); P.push(px, py, sz, tn); P.push(px + c, py + s, sz, tn);
    }
    for (const [qx, qy, q] of poles) P.push(qx, qy, S.dot * 1.1, q > 0 ? T_A : T_B);
  },
});

/* ---------- Flow, landscape, signals ---------- */
const streams = scene({
  init(A) {
    const n = A.thumb ? 500 : 1600, parts = Array.from({ length: n }, () => { const x = rnd() * A.w, y = rnd() * A.h; return { x, y, h: [x, y, x, y, x, y] }; });
    return { parts, tick: 0 };
  },
  step(S, dt, A) {
    const sc = min(A.w, A.h) / 700;
    S.tick++;
    for (const p of S.parts) {
      const ang = (H.noise(p.x * 0.0032 / sc, p.y * 0.0032 / sc, S.t * 0.04) - 0.5) * 2.4, sp = (40 + 30 * H.noise(p.y * 0.01, S.t * 0.1, 0)) * sc;
      if (S.tick % 4 === 0) { p.h.unshift(p.x, p.y); p.h.length = 6; }
      p.x += cos(ang) * sp * dt; p.y += sin(ang) * sp * dt;
      if (p.x > A.w + 10 || p.x < -20 || p.y < -10 || p.y > A.h + 10) { p.x = -5; p.y = rnd() * A.h; p.h = [p.x, p.y, p.x, p.y, p.x, p.y]; }
    }
  },
  draw(P, A, S) {
    const d = A.cell * 0.42;
    S.parts.forEach((p, i) => {
      P.push(p.h[2], p.h[3], d * 0.22, T_DIM);
      P.push(p.h[0], p.h[1], d * 0.32, T_C);
      P.push(p.x, p.y, d * 0.5, i === 0 ? T_A : T_B);
    });
  },
});
const parallax = scene({
  init(A) { return lattice(A, 0.85); },
  step() {},
  draw(P, A, S) {
    const L = 5, t = S.t, sc = A.w / 1200;
    const ridge = (l, x) => {
      const base = A.h * (0.4 + l * 0.115), amp = A.h * (0.07 + l * 0.022), sp = (5 + l * l * 9) * sc;
      return base - amp * (H.noise((x + t * sp) * 0.0028 * (1 + l * 0.35) / sc, l * 7.3, 0) * 1.7 - 0.35);
    };
    // Sun: an accent disc above the furthest hills.
    const sx = A.w * 0.7, sy = A.h * 0.24, sr = min(A.w, A.h) * 0.07;
    for (let y = sy - sr; y <= sy + sr; y += S.p * 0.8) for (let x = sx - sr; x <= sx + sr; x += S.p * 0.8) if (hypot(x - sx, y - sy) < sr && y < ridge(0, x)) P.push(x, y, S.dot * 0.7, T_A);
    for (let l = 0; l < L; l++) {
      const sp = (5 + l * l * 9) * sc, off = -((t * sp) % S.p), size = S.dot * (0.3 + l * 0.14), tn = l < 1 ? T_DIM : l < 3 ? T_C : T_B;
      for (let x = off; x < A.w + S.p; x += S.p) {
        const top = ridge(l, x), below = l < L - 1 ? ridge(l + 1, x) : A.h + S.p;
        let first = true;
        for (let y = S.oy + Math.ceil((top - S.oy) / S.p) * S.p; y < below && y < A.h + S.p; y += S.p) {
          P.push(x, y, size * (first ? 1.25 : 1), tn);
          first = false;
        }
      }
    }
  },
});
const ecg = (p) => 0.12 * exp(-(((p - 0.15) / 0.03) ** 2)) - 0.1 * exp(-(((p - 0.27) / 0.008) ** 2)) + exp(-(((p - 0.3) / 0.012) ** 2)) - 0.25 * exp(-(((p - 0.33) / 0.01) ** 2)) + 0.25 * exp(-(((p - 0.55) / 0.05) ** 2));
const monitor = scene({
  init(A) {
    const d = A.cell * 0.42, cols = floor((A.w * 0.8) / (d * 1.4));
    return { cols, e: new Float32Array(cols), r: new Float32Array(cols), head: 0, beat: 0, hr: 1.05 };
  },
  step(S, dt) {
    const prev = S.head;
    S.head = (S.head + (dt * S.cols) / 6) % S.cols;
    S.beat += dt * S.hr;
    if (S.beat >= 1) { S.beat -= 1; S.hr = 0.95 + rnd() * 0.2; }
    const span = (S.head - prev + S.cols) % S.cols;
    for (let k = 0; k <= span; k++) {
      const c = floor(prev + k) % S.cols;
      S.e[c] = ecg(S.beat); S.r[c] = sin(S.t * 1.6) * 0.5 + 0.12 * sin(S.t * 0.4);
    }
  },
  draw(P, A, S) {
    const d = A.cell * 0.42, x0 = A.w * 0.1, step = d * 1.4, gap = S.cols * 0.05;
    for (let y = A.h * 0.12; y < A.h * 0.9; y += step * 5) for (let x = x0; x < A.w * 0.9; x += step * 5) P.push(x, y, d * 0.16, T_DIM);
    const ey = (v) => A.h * 0.46 - v * A.h * 0.24, ry = (v) => A.h * 0.78 - v * A.h * 0.06;
    for (let c = 0; c < S.cols; c++) {
      const ahead = (c - S.head + S.cols) % S.cols, age = (S.head - c + S.cols) % S.cols;
      if (ahead < gap) continue;
      const x = x0 + c * step, tn = age < S.cols * 0.18 ? T_B : T_C;
      const y = ey(S.e[c]), py = c > 0 ? ey(S.e[c - 1]) : y;
      // Fill steep strokes so the QRS spike reads as a line.
      const n = min(30, floor(abs(y - py) / (d * 1.2)));
      for (let k = 1; k <= n; k++) P.push(x - step * (1 - k / (n + 1)) * 0.5, py + ((y - py) * k) / (n + 1), d * 0.45, tn);
      P.push(x, y, d * 0.5, tn);
      P.push(x, ry(S.r[c]), d * 0.4, age < S.cols * 0.18 ? T_C : T_DIM);
    }
    const hc = floor(S.head);
    P.push(x0 + hc * step, ey(S.e[hc]), d * 1.1, T_A);
  },
});
const tide = scene({
  init(A) { return lattice(A, 0.8); },
  step() {},
  draw(P, A, S) {
    const t = S.t, level = A.h * (0.56 + 0.08 * sin(t * 0.11)), sc = A.w / 1200;
    const surf = (x) => level + A.h * (0.016 * sin((x * 0.012) / sc - t * 1.1) + 0.01 * sin((x * 0.031) / sc + t * 1.7) + 0.012 * (H.noise((x * 0.008) / sc, t * 0.25, 0) - 0.5));
    for (let x = 0; x < S.cols; x++) {
      const px = S.ox + x * S.p, s = surf(px);
      for (let y = 0; y < S.rows; y++) {
        const py = S.oy + y * S.p;
        if (py < s) continue;
        const depth = (py - s) / (A.h - s + 1);
        P.push(px, py, S.dot * (0.3 + 0.62 * (1 - depth) ** 1.4), depth < 0.12 ? T_B : depth < 0.8 ? T_C : T_DIM);
      }
    }
    const mx = A.w * (0.62 + 0.2 * sin(t * 0.11 + 1.6)), my = A.h * 0.2, mr = min(A.w, A.h) * 0.045;
    for (let y = my - mr; y <= my + mr; y += S.p * 0.7) for (let x = mx - mr; x <= mx + mr; x += S.p * 0.7) if (hypot(x - mx, y - my) < mr) P.push(x, y, S.dot * 0.6, T_A);
  },
});

/* ---------- A pedestrian crossing through its signal cycle ---------- */
const crossing = scene({
  init(A) { return { peds: [], cars: [], spawn: 0, carSpawn: [0, 0.5], id: 0 }; },
  step(S, dt, A) {
    const cyc = S.t % 32, walk = cyc < 14, flash = cyc >= 14 && cyc < 17;
    S.walk = walk || flash;
    const top = A.h * 0.38, bot = A.h * 0.62, x0 = A.w * 0.34, x1 = A.w * 0.66, sc = min(A.w, A.h) / 700;
    if ((S.spawn -= dt) < 0) {
      S.spawn = 0.12 + rnd() * 0.25;
      const down = rnd() < 0.5;
      S.peds.push({ x: x0 + rnd() * (x1 - x0), y: down ? -5 : A.h + 5, dir: down ? 1 : -1, v: (34 + rnd() * 22) * sc, wait: (rnd() * 0.06 + 0.015) * A.h, id: S.id++, ph: rnd() * TAU });
    }
    for (const p of S.peds) {
      const curb = p.dir > 0 ? top - p.wait : bot + p.wait, before = p.dir > 0 ? p.y < curb : p.y > curb;
      const stop = !walk && before && abs(p.y - curb) < p.v * dt * 2 + 1;
      if (!stop) p.y += p.dir * p.v * dt;
      p.x += sin(S.t * 2 + p.ph) * 0.05;
    }
    S.peds = S.peds.filter((p) => p.y > -10 && p.y < A.h + 10);
    // Cars run while the crossing is red, and wait at the stop line otherwise.
    for (let l = 0; l < 2; l++) {
      if (!S.walk && (S.carSpawn[l] -= dt) < 0) { S.carSpawn[l] = 0.9 + rnd() * 1.2; S.cars.push({ lane: l, x: l ? A.w + 30 : -30, v: A.w * 0.28 }); }
    }
    for (const c of S.cars) {
      const dir = c.lane ? -1 : 1, stopX = c.lane ? x1 + 20 : x0 - 20, before = dir > 0 ? c.x < stopX : c.x > stopX;
      if (S.walk && before && abs(c.x - stopX) < 40) continue;
      c.x += dir * c.v * dt;
    }
    S.cars = S.cars.filter((c) => c.x > -40 && c.x < A.w + 40);
  },
  draw(P, A, S) {
    const d = A.cell * 0.42, top = A.h * 0.38, bot = A.h * 0.62, x0 = A.w * 0.34, x1 = A.w * 0.66, sh = (bot - top) / 9;
    for (let y = top + sh / 2; y < bot; y += sh) {
      if (floor((y - top) / sh) % 2) continue;
      for (let x = x0; x <= x1; x += d * 2) P.push(x, y, d * 0.28, T_DIM);
    }
    for (let x = 0; x < A.w; x += d * 3) { P.push(x, top, d * 0.18, T_DIM); P.push(x, bot, d * 0.18, T_DIM); }
    for (const c of S.cars) {
      const y = c.lane ? top + (bot - top) * 0.72 : top + (bot - top) * 0.28;
      for (let k = 0; k < 6; k++) P.push(c.x - (c.lane ? -1 : 1) * k * d * 1.9, y, d * 0.75, T_B);
    }
    for (const p of S.peds) P.push(p.x, p.y, d * 0.85, p.id % 41 === 0 ? T_A : T_C);
    // The signal: a small lamp in the accent while walking is allowed.
    P.push(x1 + d * 6, top - d * 6, d * 0.9, S.walk ? T_A : T_DIM);
  },
});

/* ---------- Rain with the occasional lightning bolt ---------- */
function bolt(A) {
  const pts = [], step = A.cell * 0.5;
  const walk = (x, y, ang, len, depth) => {
    for (let k = 0; k < len && y < A.h * 0.9; k++) {
      ang = PI / 2 + clamp(ang - PI / 2 + (rnd() - 0.5) * 0.9, -0.9, 0.9);
      x += cos(ang) * step; y += sin(ang) * step;
      pts.push([x, y, depth]);
      if (depth < 2 && rnd() < 0.05) walk(x, y, ang + (rnd() < 0.5 ? -0.7 : 0.7), floor(len * 0.3), depth + 1);
    }
  };
  walk(A.w * (0.2 + rnd() * 0.6), 0, PI / 2, 400, 0);
  return pts;
}
const storm = scene({
  init(A) {
    const n = A.thumb ? 80 : 260;
    return { drops: Array.from({ length: n }, () => ({ x: rnd() * A.w, y: rnd() * A.h, v: 0.8 + rnd() * 0.4 })), next: 2, bolt: null, age: 0 };
  },
  step(S, dt, A) {
    for (const d of S.drops) {
      d.y += d.v * A.h * 0.9 * dt; d.x += d.v * A.h * 0.12 * dt;
      if (d.y > A.h) { d.y = -10; d.x = rnd() * A.w * 1.1 - A.w * 0.1; }
    }
    if ((S.next -= dt) < 0) { S.next = 3 + rnd() * 5; S.bolt = bolt(A); S.age = 0; }
    S.age += dt;
    if (S.bolt && S.age > 1.2) S.bolt = null;
  },
  draw(P, A, S) {
    const d = A.cell * 0.42, lit = S.bolt && S.age < 0.25;
    for (const r of S.drops) for (let k = 0; k < 3; k++) P.push(r.x - k * d * 0.25, r.y - k * d * 1.6, d * (0.34 - k * 0.07), lit ? T_B : k ? T_DIM : T_C);
    if (!S.bolt) return;
    const shown = min(S.bolt.length, floor((S.age / 0.15) * S.bolt.length)), fade = 1 - clamp((S.age - 0.3) / 0.9, 0, 1);
    for (let k = 0; k < shown; k++) {
      const [x, y, depth] = S.bolt[k];
      P.push(x, y, d * (depth ? 0.45 : 0.75) * fade, depth ? T_B : T_A);
    }
  },
});

/* ---------- Catalog ---------- */
const ICON = '<circle cx="5" cy="12" r="1.5"/><circle cx="10" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><path d="M18 9l3 3-3 3"/>';
const LIST = {
  coral: ["Coral", grayScott(0.0545, 0.062)],
  mitosis: ["Mitosis", grayScott(0.0367, 0.0649)],
  fingerprint: ["Fingerprint", grayScott(0.037, 0.06)],
  pond: ["Pond", pond],
  cyclic: ["Cyclic", cyclic],
  rule: ["Rule", rule],
  ant: ["Ant", ant],
  sand: ["Sand", sand],
  galton: ["Galton", galton],
  crystal: ["Crystal", crystal],
  sapling: ["Sapling", sapling],
  fireflies: ["Fireflies", fireflies],
  traffic: ["Traffic", traffic],
  curtain: ["Curtain", curtain],
  incense: ["Incense", incense],
  soda: ["Soda", soda],
  sort: ["Sort", sort],
  maze: ["Maze", maze],
  slide: ["Slide", slide],
  assemble: ["Assemble", assemble],
  gravity: ["Gravity", gravity],
  metaballs: ["Metaballs", metaballs],
  cells: ["Cells", cells],
  filings: ["Filings", filings],
  streams: ["Streams", streams],
  parallax: ["Parallax", parallax],
  monitor: ["Monitor", monitor],
  tide: ["Tide", tide],
  crossing: ["Crossing", crossing],
  storm: ["Storm", storm],
};
export const MOTION = Object.entries(LIST).map(([id, [name, make]]) => ({ id, name, group: "motion", icon: ICON, make }));
