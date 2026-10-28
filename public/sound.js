// "Sound": scenes drawn from the audio itself — spectrum, waveform, beats. Without a source
// connected they play a calm stand-in signal so they never sit still.
import { Points, T_BASE, T_DIM, T_C, T_A, T_B } from "./engine.js";
import { sig, BANDS } from "./audio.js";
import { objectScene } from "./objects.js";

const TAU = Math.PI * 2;
const { sin, cos, abs, exp, sqrt, hypot, floor, min, max, random: rnd } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// The spectrum read at x in 0..1 (low to high), interpolated between bands.
const band = (spec, x) => {
  const f = clamp(x, 0, 1) * (BANDS - 1), i = floor(f), r = f - i;
  return spec[i] * (1 - r) + spec[min(BANDS - 1, i + 1)] * r;
};
const pitch = (A, k = 1) => (A.thumb ? (A.w / 46) * k : max(8, A.cell * k));
const tone = (v) => (v > 0.7 ? T_B : v > 0.38 ? T_C : T_DIM);

const scene = (def) => () => ({
  free: true,
  sound: true,
  grid: false,
  P: new Points(8192),
  init(A) { this.S = def.init(A); this.S.lb = -1; },
  update(dt, A) {
    dt = min(dt, 0.05);
    const s = sig(A), S = this.S;
    S.beat = s.beats !== S.lb && S.lb !== -1;
    S.lb = s.beats;
    def.step(S, dt, A, s);
  },
  points(A) { this.P.reset(); def.draw(this.P, A, this.S, sig(A)); return this.P; },
});

/* Spectrum: dot columns with falling peak markers. */
const spectrum = scene({
  init(A) {
    const p = pitch(A), cols = floor(A.w / p), rows = floor(A.h / p);
    return { p, cols, rows, h: new Float32Array(cols), pk: new Float32Array(cols), pv: new Float32Array(cols) };
  },
  step(S, dt, A, s) {
    for (let c = 0; c < S.cols; c++) {
      const tg = band(s.spec, (c + 0.5) / S.cols) * S.rows * 0.84;
      S.h[c] = tg > S.h[c] ? tg : max(tg, S.h[c] - dt * S.rows * 1.3);
      if (S.h[c] >= S.pk[c]) { S.pk[c] = S.h[c]; S.pv[c] = 0; }
      else { S.pv[c] += dt * S.rows * 1.6; S.pk[c] = max(S.h[c], S.pk[c] - S.pv[c] * dt); }
    }
  },
  draw(P, A, S) {
    const { p, cols, rows } = S, d = p * 0.74;
    const ox = (A.w - (cols - 1) * p) / 2, by = A.h - (A.h - (rows - 1) * p) / 2;
    for (let c = 0; c < cols; c++) {
      const x = ox + c * p, h = S.h[c], pk = floor(S.pk[c]);
      for (let r = 0; r < rows; r++) {
        const y = by - r * p;
        if (r + 1 <= h) P.push(x, y, d, r / rows > 0.5 ? T_B : T_C);
        else if (r < h) P.push(x, y, d * (h - r), T_C);
        else if (r === pk && pk > 1) P.push(x, y, d * 0.8, T_A);
        else P.push(x, y, p * 0.13, T_BASE);
      }
    }
  },
});

/* Mirror: the spectrum grows up and down from a centre line, bass in the middle. */
const mirror = scene({
  init(A) {
    const p = pitch(A), cols = floor(A.w / p) | 1, rows = floor(A.h / p) | 1;
    return { p, cols, rows, h: new Float32Array(cols) };
  },
  step(S, dt, A, s) {
    const mid = (S.cols - 1) / 2;
    for (let c = 0; c < S.cols; c++) {
      const tg = band(s.spec, abs(c - mid) / mid) * (S.rows / 2) * 0.86;
      S.h[c] = tg > S.h[c] ? tg : max(tg, S.h[c] - dt * S.rows * 0.7);
    }
  },
  draw(P, A, S, s) {
    const { p, cols, rows } = S, d = p * 0.74, half = (rows - 1) / 2;
    const ox = (A.w - (cols - 1) * p) / 2, cy = A.h / 2;
    for (let c = 0; c < cols; c++) {
      const x = ox + c * p, h = S.h[c];
      for (let r = 0; r <= half; r++) {
        const k = r / max(1, h);
        let s1, t;
        if (r === 0) { s1 = d * 0.55; t = T_DIM; }
        else if (r <= h) { s1 = d * (1 - 0.45 * k); t = k > 0.85 && s.beat > 0.5 && h > half * 0.5 ? T_A : k < 0.5 ? T_B : T_C; }
        else if (r < h + 1) { s1 = d * 0.55 * (h + 1 - r); t = T_C; }
        else { s1 = p * 0.12; t = T_BASE; }
        P.push(x, cy - r * p, s1, t);
        if (r) P.push(x, cy + r * p, s1, t);
      }
    }
  },
});

/* Scope: the waveform as a phosphor trace with a short afterglow. */
const scope = scene({
  init(A) {
    const p = pitch(A), n = floor(A.w / (p * 0.42));
    return { p, n, hist: [], acc: 0 };
  },
  step(S, dt, A, s) {
    S.acc += dt;
    if (S.acc < 1 / 20) return;
    S.acc = 0;
    const ys = new Float32Array(S.n), w = s.wave, L = w.length;
    for (let i = 0; i < S.n; i++) {
      // A soft window keeps both ends on the centre line.
      const x = i / (S.n - 1), win = sin(x * Math.PI) ** 0.6;
      ys[i] = clamp(w[floor(x * (L - 1))], -1.2, 1.2) * win;
    }
    S.hist.unshift(ys);
    if (S.hist.length > 7) S.hist.pop();
  },
  draw(P, A, S, s) {
    const { p, n } = S, cy = A.h / 2, amp = A.h * 0.34, dx = A.w / (n - 1);
    for (let i = 0; i < n; i += 3) P.push(i * dx, cy, p * 0.12, T_BASE);
    for (let k = S.hist.length - 1; k >= 0; k--) {
      const ys = S.hist[k], f = 1 - k / 7;
      const t = k === 0 ? T_B : k < 3 ? T_C : T_DIM, sz = p * (k === 0 ? 0.5 : 0.42 * f);
      for (let i = 0; i < n; i++) {
        const y = cy - ys[i] * amp;
        P.push(i * dx, y, sz, k === 0 && abs(ys[i]) > 0.75 && s.beat > 0.35 ? T_A : t);
        if (!i) continue;
        // Fill steep stretches so the trace stays one unbroken line.
        const y0 = cy - ys[i - 1] * amp, gaps = min(16, floor(abs(y - y0) / (p * 0.4)));
        for (let g = 1; g <= gaps; g++) { const f = g / (gaps + 1); P.push((i - 1 + f) * dx, y0 + (y - y0) * f, sz, t); }
      }
    }
  },
});

/* Ring: a circular spectrum that swells with the bass; beats send out rings. */
const ring = scene({
  init(A) { return { p: pitch(A), rings: [] }; },
  step(S, dt, A, s) {
    const m = min(A.w, A.h);
    if (S.beat) S.rings.push({ r: m * 0.2, life: 1 });
    for (const R of S.rings) { R.r += dt * m * (0.32 + R.life * 0.2); R.life -= dt * 0.75; }
    S.rings = S.rings.filter((R) => R.life > 0);
  },
  draw(P, A, S, s) {
    const { p } = S, m = min(A.w, A.h), cx = A.w / 2, cy = A.h / 2;
    const r0 = m * 0.17 * (1 + 0.14 * s.bass + 0.1 * s.beat), rays = A.thumb ? 64 : 120;
    for (const R of S.rings) {
      const n = floor((TAU * R.r) / (p * 1.1));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        P.push(cx + cos(a) * R.r, cy + sin(a) * R.r, p * 0.6 * R.life, R.life > 0.75 ? T_A : T_DIM);
      }
    }
    const nIn = floor((TAU * r0 * 0.8) / (p * 0.9));
    for (let i = 0; i < nIn; i++) {
      const a = (i / nIn) * TAU;
      P.push(cx + cos(a) * r0 * 0.8, cy + sin(a) * r0 * 0.8, p * 0.38, T_DIM);
    }
    for (let k = 0; k < rays; k++) {
      // Mirrored left and right, bass at the top.
      const u = k / rays, a = u * TAU - Math.PI / 2, v = band(s.spec, (u < 0.5 ? u : 1 - u) * 2);
      const len = v * m * 0.3, ca = cos(a), sa = sin(a);
      const steps = max(1, floor(len / (p * 0.75)));
      for (let j = 0; j <= steps; j++) {
        const f = j / steps, r = r0 + f * len;
        P.push(cx + ca * r, cy + sa * r, p * (0.72 - 0.4 * f), f > 0.6 ? T_C : T_B);
      }
    }
  },
});

/* Donut: the torus, its tube swelling with the bass and rippling with the spectrum
   around the ring. The shape is sampled once; each frame only rescales the tube. */
const R0 = 0.36;
const DONUT = {
  U: 150, V: 46, scale: 0.24,
  f: (u, v) => {
    const a = u * TAU, b = v * TAU + u * 0.45;
    return [(1 + R0 * cos(b)) * cos(a), R0 * sin(b), (1 + R0 * cos(b)) * sin(a)];
  },
  accent: (u, v, t) => abs((((u * TAU - t * 0.6) % TAU) + TAU) % TAU) < 0.12,
};
const donut = () => {
  const o = objectScene(DONUT);
  const init = o.init.bind(o), pts = o.points.bind(o);
  return Object.assign(o, {
    sound: true,
    init(A) { init(A); this.S0 = this.S; this.S = { ...this.S0, pos: this.S0.pos.map((p) => p.slice()) }; },
    points(A) {
      const s = sig(A), { pos, uv } = this.S0, out = this.S.pos;
      for (let i = 0; i < pos.length; i++) {
        const u = uv[i][0], ca = cos(u * TAU), sa = sin(u * TAU), p = pos[i];
        const k = (R0 + 0.09 * s.bass + 0.15 * band(s.spec, abs(2 * u - 1))) / R0;
        out[i][0] = ca + (p[0] - ca) * k; out[i][1] = p[1] * k; out[i][2] = sa + (p[2] - sa) * k;
      }
      const P = pts(A), z = 1 + 0.07 * s.beat, cx = A.w / 2, cy = A.h / 2;
      for (let i = 0; i < P.n; i++) { P.x[i] = cx + (P.x[i] - cx) * z; P.y[i] = cy + (P.y[i] - cy) * z; }
      return P;
    },
  });
};

/* Waterfall: a scrolling spectrogram, time to the left, pitch upwards. */
const waterfall = scene({
  init(A) {
    const p = pitch(A), cols = floor(A.w / p) + 1, rows = floor(A.h / p);
    return { p, cols, rows, v: new Float32Array(cols * rows), head: 0, acc: 0 };
  },
  step(S, dt, A, s) {
    S.acc += dt * 20;
    while (S.acc >= 1) {
      S.acc -= 1;
      S.head = (S.head + 1) % S.cols;
      for (let r = 0; r < S.rows; r++) S.v[S.head * S.rows + r] = band(s.spec, r / (S.rows - 1));
    }
  },
  draw(P, A, S) {
    const { p, cols, rows, v, head } = S, d = p * 0.8;
    const oy = A.h - (A.h - (rows - 1) * p) / 2, shift = S.acc * p;
    for (let k = 0; k < cols; k++) {
      // k = 0 is the newest column, at the right edge.
      const c = (head - k + cols) % cols, x = A.w - p / 2 - k * p - shift + p;
      for (let r = 0; r < rows; r++) {
        const val = v[c * rows + r], y = oy - r * p;
        if (val < 0.08) { P.push(x, y, p * 0.12, T_BASE); continue; }
        P.push(x, y, d * (0.18 + 0.82 * val), k < 2 && val > 0.85 ? T_A : tone(val));
      }
    }
  },
});

/* Horizon: spectrum lines receding into the distance, nearer ones hiding farther ones. */
const horizon = scene({
  init(A) {
    const p = pitch(A), n = floor(A.w / (p * 0.5)), lines = A.thumb ? 18 : 30;
    return { p, n, lines, hist: [], acc: 1 };
  },
  step(S, dt, A, s) {
    S.acc += dt * 12;
    if (S.acc < 1) return;
    S.acc = 0;
    const row = new Float32Array(S.n);
    for (let i = 0; i < S.n; i++) {
      const x = i / (S.n - 1), e = abs(x - 0.5) * 2;
      row[i] = band(s.spec, e) * exp(-e * e * 2.2);
    }
    S.hist.unshift(row);
    if (S.hist.length > S.lines) S.hist.pop();
  },
  draw(P, A, S, s) {
    const { p, n } = S, bins = floor(A.w / (p * 0.5)) + 2, hz = new Float32Array(bins).fill(1e9);
    const top = A.h * 0.24, bot = A.h * 0.9, W = A.w * 0.96;
    for (let k = 0; k < S.hist.length; k++) {
      const row = S.hist[k], z = (k + S.acc) / S.lines, sc = 1 / (1 + z * 2.2);
      const base = top + (bot - top) * (sc - 1 / 3.2) / (1 - 1 / 3.2), amp = A.h * 0.42 * sc;
      const t = k < 4 ? T_B : k < 13 ? T_C : T_DIM, sz = p * 0.56 * (0.45 + 0.55 * sc);
      for (let i = 0; i < n; i++) {
        const x = A.w / 2 + (i / (n - 1) - 0.5) * W * sc, y = base - row[i] * amp;
        const b = floor(x / (p * 0.5));
        if (b < 0 || b >= bins || y > hz[b] - 1) continue;
        hz[b] = y;
        P.push(x, y, sz, k === 0 && row[i] > 0.6 && s.beat > 0.4 ? T_A : t);
      }
    }
  },
});

/* Burst: beats throw rings of sparks from the centre; treble scatters glints. */
const burst = scene({
  init(A) { return { p: pitch(A), q: [], acc: 0 }; },
  step(S, dt, A, s) {
    const m = min(A.w, A.h), cx = A.w / 2, cy = A.h / 2, cap = A.thumb ? 500 : 2600;
    if (S.beat) {
      const n = floor((A.thumb ? 30 : 110) * (0.6 + s.bass)), sp = m * (0.5 + 0.7 * s.bass), a0 = rnd() * TAU;
      for (let i = 0; i < n && S.q.length < cap; i++) {
        const a = a0 + (i / n) * TAU, v = sp * (0.75 + rnd() * 0.5);
        S.q.push({ x: cx, y: cy, vx: cos(a) * v, vy: sin(a) * v, life: 1, k: rnd() < 0.12 });
      }
    }
    S.acc += dt * s.high * (A.thumb ? 20 : 120);
    while (S.acc >= 1 && S.q.length < cap) {
      S.acc -= 1;
      S.q.push({ x: rnd() * A.w, y: rnd() * A.h, vx: 0, vy: 0, life: 0.55, k: false });
    }
    const drag = exp(-dt * 2.2);
    for (const o of S.q) { o.vx *= drag; o.vy *= drag; o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt * 0.55; }
    S.q = S.q.filter((o) => o.life > 0);
  },
  draw(P, A, S, s) {
    const { p } = S, cx = A.w / 2, cy = A.h / 2, m = min(A.w, A.h);
    const core = m * 0.035 * (1 + 1.6 * s.bass), nc = A.thumb ? 40 : 120, g = Math.PI * (3 - sqrt(5));
    for (let i = 0; i < nc; i++) {
      const r = core * sqrt(i / nc), a = i * g;
      P.push(cx + cos(a) * r, cy + sin(a) * r, p * 0.5, i < nc * 0.3 ? T_B : T_C);
    }
    for (const o of S.q) P.push(o.x, o.y, p * (0.2 + 0.55 * o.life), o.k && o.life > 0.5 ? T_A : tone(o.life));
  },
});

/* Radial: a halftone field where distance from the centre is pitch — bass in the middle,
   treble at the edges — with beats rolling outwards. */
const radial = scene({
  init(A) {
    const p = pitch(A), cols = floor(A.w / p), rows = floor(A.h / p);
    return { p, cols, rows, waves: [] };
  },
  step(S, dt, A, s) {
    if (S.beat) S.waves.push({ r: 0, a: 0.5 + 0.5 * s.bass });
    for (const W of S.waves) { W.r += dt * 0.75; W.a *= exp(-dt * 1.2); }
    S.waves = S.waves.filter((W) => W.r < 1.4 && W.a > 0.03);
  },
  draw(P, A, S, s) {
    const { p, cols, rows } = S, d = p * 0.8;
    const ox = (A.w - (cols - 1) * p) / 2, oy = (A.h - (rows - 1) * p) / 2, cx = A.w / 2, cy = A.h / 2, R = hypot(cx, cy);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const px = ox + x * p, py = oy + y * p, r = hypot(px - cx, py - cy) / R;
      let v = band(s.spec, r ** 0.85) * 0.9, w = 0;
      for (const W of S.waves) { const z = (r - W.r) / 0.05; w += exp(-z * z) * W.a; }
      v = min(1, v + w * 0.6);
      if (v < 0.07) { P.push(px, py, p * 0.12, T_BASE); continue; }
      P.push(px, py, d * (0.15 + 0.85 * v), w > 0.45 ? T_A : tone(v));
    }
  },
});

const ICON = '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>';
const LIST = {
  spectrum: ["Spectrum", spectrum], mirror: ["Mirror", mirror], scope: ["Scope", scope], ring: ["Ring", ring],
  donut: ["Donut", donut], waterfall: ["Waterfall", waterfall], horizon: ["Horizon", horizon], burst: ["Burst", burst], radial: ["Radial", radial],
};
export const SOUND = Object.entries(LIST).map(([id, [name, make]]) => ({ id, name, group: "sound", icon: ICON, make }));
