// A hundred more scenes in four families:
//   Forms   lit surfaces in the torus treatment (objects.js renders them)
//   Orbits  3D point clouds and strange attractors, shaded by depth
//   Lines   2D figures drawn in dots
//   Op-art  fine-pitch halftone fields written in the formula language
import { Points, T_DIM, T_C, T_A, T_B } from "./engine.js";
import { H } from "./formula.js";
import { Formula } from "./scenes.js";
import { objectScene, tube, parts } from "./objects.js";

const TAU = Math.PI * 2, PI = Math.PI, SQ2 = Math.SQRT2;
const { sin, cos, abs, exp, sqrt, hypot, tanh, sinh, cosh, floor, min, max } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fract = (x) => x - floor(x);
const GOLD = PI * (3 - sqrt(5));

function steer(self, A, dt) {
  const P = A.pointer;
  const tx = P.active ? (P.px / A.w - 0.5) * 2 : 0, ty = P.active ? (P.py / A.h - 0.5) * 2 : 0;
  self.sx = (self.sx || 0) + (tx - (self.sx || 0)) * Math.min(1, dt * 1.5);
  self.sy = (self.sy || 0) + (ty - (self.sy || 0)) * Math.min(1, dt * 1.5);
}

/* ================================ Forms ================================ */

const ring = (R, r, cx = 0) => (u, v) => {
  const a = u * TAU, b = v * TAU;
  return [cx + (R + r * cos(b)) * cos(a), r * sin(b), (R + r * cos(b)) * sin(a)];
};
const inRing = (p, R, r, cx) => (hypot(p[0] - cx, p[2]) - R) ** 2 + p[1] ** 2 < r * r * 0.97;
const torusKnot = (p, q, r = 0.42) => (s) => {
  const a = s * TAU, w = 1 + r * cos(q * a);
  return [w * cos(p * a), r * sin(q * a), w * sin(p * a)];
};
// Superformula, rescaled so its largest radius is 1.
function sf(m, n1, n2, n3) {
  const f = (th) => (abs(cos((m * th) / 4)) ** n2 + abs(sin((m * th) / 4)) ** n3) ** (-1 / n1);
  let top = 0;
  for (let i = 0; i < 720; i++) top = max(top, f((i / 720) * TAU));
  return (th) => f(th) / top;
}
function superShape(A, B) {
  const r1 = sf(...A), r2 = sf(...B);
  return (u, v) => {
    const th = (u - 0.5) * TAU, ph = (v - 0.5) * PI, a = r1(th), b = r2(ph);
    return [a * cos(th) * b * cos(ph), b * sin(ph), a * sin(th) * b * cos(ph)];
  };
}
// A torus whose cross-section is a superformula profile, turning k times around the ring.
const profiled = (prof, k, rad = 0.4) => (u, v) => {
  const a = u * TAU, b = v * TAU, r = rad * prof(b - k * a);
  return [(1 + r * cos(b)) * cos(a), r * sin(b), (1 + r * cos(b)) * sin(a)];
};
// Great circles through a ball, like wound yarn.
const yarnCircles = Array.from({ length: 9 }, (_, k) => {
  const y = 1 - ((k + 0.5) / 9) * 2, rr = sqrt(1 - y * y), th = GOLD * k * 3.1;
  const n = [cos(th) * rr, y, sin(th) * rr];
  const e1 = hypot(n[0], n[2]) > 0.1 ? [-n[2], 0, n[0]].map((c) => c / hypot(n[0], n[2])) : [1, 0, 0];
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return tube((s) => { const a = s * TAU; return [0, 1, 2].map((c) => cos(a) * e1[c] + sin(a) * e2[c]); }, 0.035);
});

const FORMS = {
  umbilic: { name: "Umbilic", U: 240, V: 34, scale: 0.36, normalize: true, f: (u, v) => {
    const a = (u - 0.5) * TAU, b = (v - 0.5) * TAU, w = 7 + cos(a / 3 - 2 * b) + 2 * cos(a / 3 + b);
    return [sin(a) * w, sin(a / 3 - 2 * b) + 2 * sin(a / 3 + b), cos(a) * w];
  }},
  cyclide: { name: "Cyclide", U: 160, V: 44, scale: 0.34, normalize: true, f: (u, v) => {
    const a = 1, c = 0.42, d = 0.6, b = sqrt(a * a - c * c), U = u * TAU, W = v * TAU;
    const k = a - c * cos(U) * cos(W);
    return [(d * (c - a * cos(U) * cos(W)) + b * b * cos(U)) / k, (b * sin(W) * (c * cos(U) - d)) / k, (b * sin(U) * (a - d * cos(W))) / k];
  }},
  bolt: { name: "Bolt", U: 170, V: 44, scale: 0.25, f: profiled(sf(4, 8, 8, 8), 1, 0.4) },
  prism: { name: "Prism", U: 170, V: 44, scale: 0.25, f: profiled(sf(3, 4.5, 10, 10), 1, 0.46) },
  gear: { name: "Gear", U: 360, V: 26, scale: 0.27, f: (u, v) => {
    const a = u * TAU, b = v * TAU, r = 0.28, tooth = 0.1 * tanh(5 * sin(20 * a)) * max(0, cos(b)) + 0.1 * max(0, cos(b));
    return [(1 + r * cos(b) + tooth) * cos(a), r * 0.75 * sin(b), (1 + r * cos(b) + tooth) * sin(a)];
  }},
  bubbles: { name: "Bubbles", U: 260, V: 30, scale: 0.25, f: (u, v) => {
    const a = u * TAU, b = v * TAU, r = 0.16 + 0.2 * abs(cos(6 * a)) ** 0.8;
    return [(1 + r * cos(b)) * cos(a), r * sin(b), (1 + r * cos(b)) * sin(a)];
  }},
  sprinkles: { name: "Sprinkles", U: 150, V: 46, scale: 0.24, f: ring(1, 0.42),
    accent: (u, v) => sin(v * TAU) < -0.2 && H.hash(floor(u * 150) * 1.3, floor(v * 46) * 0.7) < 0.08 },
  drift: { name: "Drift", U: 84, V: 26, scale: 0.24, animated: true, f: (u, v, t) => ring(1, 0.42)(u + t * 0.012, v + t * 0.045 + u * 3),
    accent: (u, v) => abs(v - 0.5) < 0.02 },
  eight: { name: "Eight", U: 300, V: 40, scale: 0.21, orient: -1, f: parts([ring(0.9, 0.36, -0.82), ring(0.9, 0.36, 0.82)]),
    keep: (p, u) => !inRing(p, 0.9, 0.36, u < 0.5 ? 0.82 : -0.82) },
  apple: { name: "Apple", U: 130, V: 56, scale: 0.3, twoSided: true, f: ring(0.3, 0.8) },
  infinity: { name: "Infinity", U: 380, V: 16, scale: 0.36, orient: -1, f: tube((s) => {
    const a = s * TAU, d = 1 + sin(a) ** 2;
    return [(1.3 * cos(a)) / d, 0.24 * sin(a), (1.3 * sin(a) * cos(a)) / d];
  }, 0.13) },
  clover: { name: "Clover", U: 560, V: 12, scale: 0.25, orient: -1, f: tube(torusKnot(3, 4), 0.11),
    accent: (u, v, t) => abs(fract(u - t * 0.04) - 0.5) < 0.004 },
  petal: { name: "Petal", U: 640, V: 11, scale: 0.25, orient: -1, f: tube(torusKnot(3, 5), 0.095) },
  seven: { name: "Seven", U: 700, V: 11, scale: 0.24, orient: -1, f: tube(torusKnot(2, 7, 0.5), 0.09) },
  lace: { name: "Lace", U: 1200, V: 7, scale: 0.25, orient: -1, f: tube(torusKnot(4, 9, 0.45), 0.05),
    accent: (u, v, t) => abs(fract(u - t * 0.025) - 0.5) < 0.002 },
  figure8: { name: "Figure 8", U: 420, V: 14, scale: 0.21, orient: -1, f: tube((s) => {
    const a = s * TAU;
    return [(2 + cos(2 * a)) * cos(3 * a) * 0.4, sin(4 * a) * 0.4, (2 + cos(2 * a)) * sin(3 * a) * 0.4];
  }, 0.15) },
  lissa: { name: "Lissa", U: 760, V: 9, scale: 0.24, orient: -1, f: tube((s) => {
    const a = s * TAU;
    return [cos(3 * a + 0.7), cos(2 * a + 0.2) * 0.85, cos(7 * a)];
  }, 0.065) },
  yarn: { name: "Yarn", U: 9 * 160, V: 6, scale: 0.3, orient: -1, f: parts(yarnCircles), accent: (u) => floor(u * 9) === 4 },
  planet: { name: "Planet", U: 220, V: 30, scale: 0.27, twoSided: (u) => u >= 0.5, f: parts([
    (u, v) => { const lon = u * TAU, lat = (v - 0.5) * PI * 0.98; return [cos(lat) * cos(lon) * 0.62, sin(lat) * 0.62, cos(lat) * sin(lon) * 0.62]; },
    (u, v) => { const a = u * TAU, r = 0.86 + 0.42 * v; return [r * cos(a), 0, r * sin(a)]; },
  ]), accent: (u, v) => u >= 0.5 && abs(v - 0.62) < 0.02 },
  loom: { name: "Loom", U: 100, V: 44, scale: 0.3, twoSided: true, animated: true, open: true, f: (u, v, t) => {
    const a = u * TAU, tw = 2.2 + 0.6 * sin(t * 0.22);
    return [cos(a) * (1 - v) + cos(a + tw) * v, (v - 0.5) * 2.2, sin(a) * (1 - v) + sin(a + tw) * v];
  }, accent: (u) => u < 0.008 },
  conch: { name: "Conch", U: 320, V: 28, scale: 0.42, normalize: true, twoSided: true, open: true, f: (u, v) => {
    const a = u * TAU * 3.4, g = exp(0.17 * a) * 0.1, rho = g * 0.62, b = v * TAU;
    return [(g + rho * cos(b)) * cos(a), -g * 1.25 + rho * sin(b), (g + rho * cos(b)) * sin(a)];
  }},
  trumpet: { name: "Trumpet", U: 110, V: 64, scale: 0.4, normalize: true, twoSided: true, open: true, f: (u, v) => {
    const a = u * TAU, w = (v - 0.5) * 5.4, sech = 1 / cosh(w);
    return [sech * cos(a), (w - tanh(w)) * 0.55, sech * sin(a)];
  }},
  helicat: { name: "Helicat", U: 120, V: 44, scale: 0.36, normalize: true, twoSided: true, animated: true, open: true, f: (u, v, t) => {
    const al = (0.5 - 0.5 * cos(t * 0.3)) * PI / 2, U = (u - 0.5) * TAU, W = (v - 0.5) * 2.4;
    return [cos(al) * sinh(W) * sin(U) + sin(al) * cosh(W) * cos(U), U * cos(al) + W * sin(al), -cos(al) * sinh(W) * cos(U) + sin(al) * cosh(W) * sin(U)];
  }},
  enneper: { name: "Enneper", U: 56, V: 110, scale: 0.38, normalize: true, twoSided: true, open: true, f: (u, v) => {
    const r = u ** 0.7 * 1.3, th = v * TAU, x = r * cos(th), y = r * sin(th);
    return [x - x ** 3 / 3 + x * y * y, x * x - y * y, y - y ** 3 / 3 + y * x * x];
  }},
  boy: { name: "Boy", U: 130, V: 60, scale: 0.4, normalize: true, twoSided: true, open: true, f: (u, v) => {
    const U = u * PI, W = v * PI, c2 = cos(W) ** 2, D = 2 - SQ2 * sin(3 * U) * sin(2 * W);
    return [(SQ2 * c2 * cos(2 * U) + cos(U) * sin(2 * W)) / D, (3 * c2) / D, (SQ2 * c2 * sin(2 * U) - sin(U) * sin(2 * W)) / D];
  }},
  roman: { name: "Roman", U: 120, V: 60, scale: 0.4, normalize: true, twoSided: true, open: true, f: (u, v) => {
    const U = u * PI, W = (v - 0.5) * PI;
    return [sin(2 * U) * cos(W) ** 2, cos(U) * sin(2 * W), sin(U) * sin(2 * W)];
  }},
  dome: { name: "Dome", U: 150, V: 46, scale: 0.36, normalize: true, twoSided: true, f: (u, v) => {
    const U = u * TAU, W = v * TAU;
    return [0.55 * cos(U), sin(W), cos(W) + 0.55 * sin(U)];
  }},
  sine: { name: "Sine", U: 120, V: 60, scale: 0.36, normalize: true, twoSided: true, f: (u, v) => {
    const U = u * TAU, W = v * TAU;
    return [sin(U), sin(U + W), sin(W)];
  }},
  saddle: { name: "Saddle", tilt: -0.75, U: 46, V: 120, scale: 0.36, normalize: true, twoSided: true, animated: true, open: true, f: (u, v, t) => {
    const r = sqrt(u), th = v * TAU;
    return [r * cos(th), r ** 3 * cos(3 * th + t * 0.25) * 0.55, r * sin(th)];
  }},
  drop: { name: "Drop", tilt: -0.75, U: 52, V: 120, scale: 0.36, twoSided: true, animated: true, open: true, f: (u, v, t) => {
    const r = sqrt(u) * 1.15, th = v * TAU;
    return [r * cos(th), 0.13 * sin(r * 11 - t * 1.8) * exp(-r * 0.9), r * sin(th)];
  }},
  sheet: { name: "Sheet", tilt: -0.75, U: 92, V: 62, scale: 0.34, twoSided: true, animated: true, open: true, f: (u, v, t) => {
    const x = (u - 0.5) * 2.2, z = (v - 0.5) * 1.5;
    return [x, 0.14 * sin(2.4 * x + t * 1.4) + 0.07 * sin(3.1 * z - t * 0.9 + x), z];
  }, accent: (u, v) => abs(u - v) < 0.008 },
  pumpkin: { name: "Pumpkin", sphere: 5400, scale: 0.33, f: (d) => 1 - 0.09 * (1 - abs(cos(4 * Math.atan2(d[2], d[0])))) ** 1.5 },
  bloom: { name: "Bloom", sphere: 5200, scale: 0.3, animated: true, f: (d, t) => {
    const lon = Math.atan2(d[2], d[0]), lat = Math.asin(clamp(d[1], -1, 1));
    return 1 + 0.14 * sin(5 * lon + t * 0.25) * cos(lat) ** 3 * sin(t * 0.6) + 0.06 * sin(4 * lat - t * 0.4);
  }},
  gem: { name: "Gem", U: 150, V: 46, scale: 0.36, normalize: true, open: true, f: superShape([6, 1, 1, 1], [4, 1, 1, 1]) },
  cube: { name: "Cube", U: 150, V: 46, scale: 0.36, normalize: true, open: true, f: superShape([4, 8, 8, 8], [4, 8, 8, 8]) },
  urchin: { name: "Urchin", U: 200, V: 60, scale: 0.38, normalize: true, open: true, f: superShape([8, 0.6, 1.7, 1.7], [8, 0.6, 1.7, 1.7]) },
  pebble: { name: "Pebble", U: 150, V: 46, scale: 0.36, normalize: true, open: true, f: superShape([3, 4.5, 10, 10], [2, 2, 2, 2]) },
  lantern: { name: "Lantern", U: 170, V: 50, scale: 0.36, normalize: true, open: true, f: superShape([10, 3, 0.8, 0.8], [2, 1.2, 0.6, 0.6]) },
  pringle: { name: "Pringle", U: 170, V: 40, scale: 0.25, f: (u, v) => {
    // A ring whose centre line rides up and down twice around.
    const a = u * TAU, b = v * TAU, r = 0.3, lift = 0.38 * cos(2 * a);
    return [(1 + r * cos(b)) * cos(a), r * sin(b) + lift, (1 + r * cos(b)) * sin(a)];
  }, accent: (u, v) => abs(v - 0.25) < 0.008 },
  gimbal: { name: "Gimbal", U: 240, V: 22, scale: 0.27, animated: true, f: parts([
    ring(1, 0.16),
    (u, v, t) => { const [x, y, z] = ring(0.66, 0.14)(u, v), c = cos(t * 0.4), s = sin(t * 0.4); return [x, y * c - z * s, y * s + z * c]; },
  ]), accent: (u) => u >= 0.5 && abs(u - 0.75) < 0.004 },
};

/* ================================ Orbits ================================ */

// Unit-radius, centred copy of a point list.
function unit(xyz) {
  const n = xyz.length / 3, c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += xyz[i * 3 + k] / n;
  let r = 0;
  for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) xyz[i * 3 + k] -= c[k]; r = max(r, hypot(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2])); }
  for (let i = 0; i < xyz.length; i++) xyz[i] /= r || 1;
  return xyz;
}
// Integrates an ODE (RK4) into a trail of points; map() orients it so it reads well.
function attractor(f, { p0 = [0.1, 0, 0], dt = 0.01, every = 2, n = 6000, map = (p) => p }) {
  return (q) => {
    const N = Math.round(n * q), out = new Float32Array(N * 3);
    let p = p0.slice();
    const add = (a, b, s) => a.map((v, k) => v + b[k] * s);
    const step = () => {
      const k1 = f(p), k2 = f(add(p, k1, dt / 2)), k3 = f(add(p, k2, dt / 2)), k4 = f(add(p, k3, dt));
      p = p.map((v, k) => v + (dt / 6) * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k]));
      if (!p.every(Number.isFinite) || abs(p[0]) + abs(p[1]) + abs(p[2]) > 1e4) p = p0.map((v) => v + Math.random() * 0.01);
    };
    for (let i = 0; i < 1500; i++) step();
    for (let i = 0; i < N; i++) {
      for (let e = 0; e < every; e++) step();
      const m = map(p);
      out[i * 3] = m[0]; out[i * 3 + 1] = m[1]; out[i * 3 + 2] = m[2];
    }
    return { xyz: unit(out) };
  };
}
const ATTRACTORS = {
  lorenz: ["Lorenz", ([x, y, z]) => [10 * (y - x), x * (28 - z) - y, x * y - (8 / 3) * z], { dt: 0.005, every: 2, map: ([x, y, z]) => [x, -z, y] }],
  aizawa: ["Aizawa", ([x, y, z]) => [(z - 0.7) * x - 3.5 * y, 3.5 * x + (z - 0.7) * y, 0.6 + 0.95 * z - z ** 3 / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x ** 3], { dt: 0.01, every: 2, map: ([x, y, z]) => [x, -z, y] }],
  thomas: ["Thomas", ([x, y, z]) => [sin(y) - 0.208186 * x, sin(z) - 0.208186 * y, sin(x) - 0.208186 * z], { p0: [1.1, 1.1, -0.01], dt: 0.05, every: 7 }],
  halvorsen: ["Halvorsen", ([x, y, z]) => [-1.89 * x - 4 * y - 4 * z - y * y, -1.89 * y - 4 * z - 4 * x - z * z, -1.89 * z - 4 * x - 4 * y - x * x], { p0: [-1.48, -1.51, 2.04], dt: 0.005, every: 6 }],
  rossler: ["Rössler", ([x, y, z]) => [-y - z, x + 0.2 * y, 0.2 + z * (x - 5.7)], { dt: 0.02, every: 2, map: ([x, y, z]) => [x, -z * 0.6, y] }],
  dadras: ["Dadras", ([x, y, z]) => [y - 3 * x + 2.7 * y * z, 1.7 * y - x * z + z, 2 * x * y - 9 * z], { p0: [1.1, 2.1, -2], dt: 0.01, every: 2 }],
  fourwing: ["Four Wing", ([x, y, z]) => [0.2 * x + y * z, 0.01 * x - 0.4 * y - x * z, -z - x * y], { p0: [1.3, -0.18, 0.01], dt: 0.03, every: 2 }],
  chen: ["Chen", ([x, y, z]) => [35 * (y - x), -7 * x - x * z + 28 * y, x * y - 3 * z], { p0: [-0.1, 0.5, -0.6], dt: 0.002, every: 4, map: ([x, y, z]) => [x, -z, y] }],
  sprott: ["Sprott", ([x, y, z]) => [y + 2.07 * x * y + x * z, 1 - 1.79 * x * x + y * z, x - x * x - y * y], { p0: [0.63, 0.47, -0.54], dt: 0.01, every: 2 }],
};

// Comet: a bright head running along the trail (fraction of the trail per second).
const comet = (speed, len = 70) => (i, t, n) => {
  const k = (((t * speed * n - i) % n) + n) % n;
  return k < len ? 1 - k / len : 0;
};

function hopf(q) {
  const fibers = [], per = Math.round(120 * (0.5 + q / 2));
  for (const [lat, count] of [[0.5, 18], [0, 22], [-0.55, 16]]) {
    for (let j = 0; j < count; j++) fibers.push([lat, (j / count) * TAU]);
  }
  return { fibers, per, xyz: new Float32Array(fibers.length * per * 3) };
}
function hopfStep(S, t) {
  let o = 0;
  for (let f = 0; f < S.fibers.length; f++) {
    const [lat0, lon0] = S.fibers[f], lat = lat0 + sin(t * 0.2 + lon0) * 0.08, lon = lon0 + t * 0.05;
    const a = cos(lat) * cos(lon), b = cos(lat) * sin(lon), c = sin(lat), s = 1 / sqrt(2 * (1 + c));
    for (let k = 0; k < S.per; k++) {
      const phi = (k / S.per) * TAU;
      const x0 = (1 + c) * cos(phi) * s, x1 = (a * sin(phi) - b * cos(phi)) * s, x2 = (a * cos(phi) + b * sin(phi)) * s, x3 = (1 + c) * sin(phi) * s;
      const d = 1 / (1 - x0 + 1e-3) * 0.32;
      S.xyz[o++] = clamp(x1 * d, -3, 3); S.xyz[o++] = clamp(x3 * d, -3, 3); S.xyz[o++] = clamp(x2 * d, -3, 3);
    }
  }
}

const ORBITS = {
  ...Object.fromEntries(Object.entries(ATTRACTORS).map(([id, [name, f, o]]) => [id, { name, build: attractor(f, o), accent: comet(0.018), scale: 0.4 }])),
  hopf: { name: "Hopf", build: hopf, step: hopfStep, scale: 0.36, accent: (i, t, n, S) => floor(i / S.per) === 20 ? 1 : 0 },
  atom: { name: "Atom", scale: 0.4, build: (q) => {
    const per = Math.round(420 * q), core = Math.round(260 * q);
    return { per, core, xyz: new Float32Array((per * 3 + core + 3) * 3) };
  }, step: (S, t) => {
    let o = 0;
    const put = (x, y, z) => { S.xyz[o++] = x; S.xyz[o++] = y; S.xyz[o++] = z; };
    const orbit = (k, a) => {
      // A unit circle tilted about x, then turned about y by k thirds.
      const x = cos(a), y = sin(a) * sin(1.15), z = sin(a) * cos(1.15), r = (k * TAU) / 3;
      return [x * cos(r) + z * sin(r), y, -x * sin(r) + z * cos(r)];
    };
    for (let k = 0; k < 3; k++) for (let i = 0; i < S.per; i++) put(...orbit(k, (i / S.per) * TAU));
    for (let i = 0; i < S.core; i++) {
      const y = 1 - (i / (S.core - 1)) * 2, r = sqrt(1 - y * y), th = GOLD * i;
      put(cos(th) * r * 0.14, y * 0.14, sin(th) * r * 0.14);
    }
    for (let k = 0; k < 3; k++) put(...orbit(k, t * (1.1 + k * 0.35) + k * 2));
  }, accent: (i, t, n) => (i >= n - 3 ? 1 : 0), big: (i, n) => (i >= n - 3 ? 2.2 : 1) },
  lattice: { name: "Lattice", scale: 0.25, build: (q) => {
    const m = q < 1 ? 10 : 15, xyz = new Float32Array(m ** 3 * 3);
    return { m, xyz };
  }, step: (S, t) => {
    const m = S.m;
    let o = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) for (let k = 0; k < m; k++) {
      const x = (i / (m - 1)) * 2 - 1, y = (j / (m - 1)) * 2 - 1, z = (k / (m - 1)) * 2 - 1;
      const w = 0.09 * sin(x * 3 + z * 2 + t * 1.2);
      S.xyz[o++] = x; S.xyz[o++] = y + w; S.xyz[o++] = z;
    }
  }},
  currents: { name: "Currents", scale: 0.38, build: (q) => {
    const n = Math.round(3600 * q), xyz = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = sqrt(1 - y * y), th = GOLD * i;
      xyz[i * 3] = cos(th) * r; xyz[i * 3 + 1] = y; xyz[i * 3 + 2] = sin(th) * r;
    }
    return { xyz };
  }, step: (S, t, dt) => {
    // Points slide over the sphere along a slowly changing noise flow.
    const p = S.xyz;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      const fx = H.noise(x * 1.5 + 3, y * 1.5, t * 0.05) - 0.5, fy = H.noise(y * 1.5 + 7, z * 1.5, t * 0.05) - 0.5, fz = H.noise(z * 1.5 + 11, x * 1.5, t * 0.05) - 0.5;
      // Tangential part of a swirl around the y axis plus noise.
      let vx = -z * 0.4 + fy * z - fz * y, vy = fz * x - fx * z, vz = x * 0.4 + fx * y - fy * x;
      let nx = x + vx * dt * 1.6, ny = y + vy * dt * 1.6, nz = z + vz * dt * 1.6;
      const l = hypot(nx, ny, nz) || 1;
      p[i] = nx / l; p[i + 1] = ny / l; p[i + 2] = nz / l;
    }
  }},
  vortex: { name: "Vortex", scale: 0.38, build: (q) => {
    const n = Math.round(4200 * q), pr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pr[i * 3] = Math.random() ** 0.7; pr[i * 3 + 1] = Math.random() * TAU; pr[i * 3 + 2] = Math.random(); }
    return { pr, xyz: new Float32Array(n * 3) };
  }, step: (S, t, dt) => {
    const { pr, xyz } = S;
    for (let i = 0; i < pr.length; i += 3) {
      const r = pr[i];
      pr[i + 1] += dt * (0.25 + 0.9 / (r + 0.25));
      const rr = 0.08 + r * (0.35 + 0.65 * pr[i + 2]);
      xyz[i] = cos(pr[i + 1]) * rr; xyz[i + 1] = (pr[i + 2] - 0.5) * 2 + sin(pr[i + 1] * 2 + t) * 0.02; xyz[i + 2] = sin(pr[i + 1]) * rr;
    }
  }},
  tower: { name: "Tower", scale: 0.34, build: (q) => {
    const rings = q < 1 ? 16 : 26, per = q < 1 ? 36 : 64;
    return { rings, per, xyz: new Float32Array(rings * per * 3) };
  }, step: (S, t) => {
    let o = 0;
    for (let k = 0; k < S.rings; k++) {
      const y = (k / (S.rings - 1)) * 2 - 1, rot = sin(t * 0.35 + k * 0.22) * 1.6, rr = 0.55 + 0.08 * sin(k * 0.5 + t * 0.4);
      for (let i = 0; i < S.per; i++) {
        const a = (i / S.per) * TAU + rot, sq = 1 / max(abs(cos(a)), abs(sin(a)));
        S.xyz[o++] = cos(a) * rr * sq; S.xyz[o++] = y; S.xyz[o++] = sin(a) * rr * sq;
      }
    }
  }, accent: (i, t, n, S) => (i % S.per === 0 ? 1 : 0) },
  onion: { name: "Onion", scale: 0.4, build: (q) => {
    const per = Math.round(1700 * q), base = new Float32Array(per * 3);
    for (let i = 0; i < per; i++) {
      const y = 1 - (i / (per - 1)) * 2, r = sqrt(1 - y * y), th = GOLD * i;
      base[i * 3] = cos(th) * r; base[i * 3 + 1] = y; base[i * 3 + 2] = sin(th) * r;
    }
    return { per, base, xyz: new Float32Array(per * 9) };
  }, step: (S, t) => {
    let o = 0;
    for (let s = 0; s < 3; s++) {
      const R = [1, 0.7, 0.42][s], a = t * [0.12, -0.2, 0.32][s], ca = cos(a), sa = sin(a);
      for (let i = 0; i < S.per; i++) {
        const x = S.base[i * 3], y = S.base[i * 3 + 1], z = S.base[i * 3 + 2];
        const yy = y * ca - z * sa, zz = y * sa + z * ca;
        S.xyz[o++] = x * R; S.xyz[o++] = yy * R; S.xyz[o++] = zz * R;
      }
    }
  }},
  swarm: { name: "Swarm", scale: 0.4, build: (q) => {
    const n = Math.round(2600 * q), xyz = new Float32Array(n * 3);
    for (let i = 0; i < xyz.length; i++) xyz[i] = (Math.random() - 0.5) * 1.6;
    return { xyz };
  }, step: (S, t, dt) => {
    const p = S.xyz;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      const vx = H.noise(y * 1.3, z * 1.3, t * 0.1) - 0.5, vy = H.noise(z * 1.3 + 5, x * 1.3, t * 0.1) - 0.5, vz = H.noise(x * 1.3 + 9, y * 1.3, t * 0.1) - 0.5;
      // Gentle pull back towards the centre keeps the swarm together.
      const l = hypot(x, y, z), pull = max(0, l - 0.7) * 1.5;
      p[i] += (vx * 1.4 - (x / (l || 1)) * pull) * dt; p[i + 1] += (vy * 1.4 - (y / (l || 1)) * pull) * dt; p[i + 2] += (vz * 1.4 - (z / (l || 1)) * pull) * dt;
    }
  }},
  lissajous3: { name: "Lissajous", scale: 0.34, build: (q) => ({ n: Math.round(3600 * q), xyz: new Float32Array(Math.round(3600 * q) * 3) }), step: (S, t) => {
    for (let i = 0; i < S.n; i++) {
      const a = (i / S.n) * TAU;
      S.xyz[i * 3] = sin(3 * a + t * 0.07); S.xyz[i * 3 + 1] = sin(4 * a) * 0.9; S.xyz[i * 3 + 2] = sin(5 * a + t * 0.05 + 1);
    }
  }, accent: comet(0.03, 40) },
  fountain: { name: "Fountain", scale: 0.4, tilt: 0.25, build: (q) => {
    // Per particle: position (3), velocity (3), life.
    const n = Math.round(2800 * q), st = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) { st[i * 7 + 1] = -2; st[i * 7 + 6] = Math.random() * 3; }
    return { st, xyz: new Float32Array(n * 3) };
  }, step: (S, t, dt) => {
    const { st, xyz } = S;
    for (let i = 0, j = 0; i < st.length; i += 7, j += 3) {
      st[i + 6] -= dt;
      if (st[i + 6] <= 0) {
        const a = Math.random() * TAU, s = 0.08 + Math.random() * 0.22;
        st[i] = 0; st[i + 1] = -1; st[i + 2] = 0;
        st[i + 3] = cos(a) * s; st[i + 4] = 1.55 + Math.random() * 0.25; st[i + 5] = sin(a) * s;
        st[i + 6] = 3 + Math.random();
      }
      st[i + 4] -= dt;
      st[i] += st[i + 3] * dt; st[i + 1] += st[i + 4] * dt; st[i + 2] += st[i + 5] * dt;
      xyz[j] = st[i]; xyz[j + 1] = -max(-1, st[i + 1]); xyz[j + 2] = st[i + 2];
    }
  }},
};

class Cloud {
  constructor(def) { this.free = true; this.def = def; this.P = new Points(8192); }
  init(A) {
    this.S = this.def.build(A.thumb ? 0.5 : 1);
    if (this.def.step) this.def.step(this.S, A.t, 0.016);
  }
  update(dt, A) { steer(this, A, dt); if (this.def.step) this.def.step(this.S, A.t, Math.min(dt, 0.05)); }
  points(A) {
    const { S, def, P } = this, t = A.t, xyz = S.xyz, n = xyz.length / 3;
    P.reset();
    const ax = (def.tilt ?? 0.4) + sin(t * 0.11) * 0.2 + this.sy * 0.4, ay = t * 0.12 + this.sx * 0.6;
    const cx = cos(ax), sx = sin(ax), cy = cos(ay), sy = sin(ay);
    const size = min(A.w, A.h) * def.scale, dot = A.cell * 0.42;
    for (let i = 0; i < n; i++) {
      let x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      [x, z] = [x * cy + z * sy, -x * sy + z * cy];
      const persp = 1 / (1 - z * 0.18), d = clamp((z + 1) / 2, 0, 1);
      const acc = def.accent ? def.accent(i, t, n, S) : 0;
      const s = dot * persp * (0.22 + 0.5 * d) * (1 + acc * 0.9) * (def.big ? def.big(i, n) : 1);
      P.push(A.w / 2 + x * size * persp, A.h / 2 + y * size * persp, s, acc > 0.3 ? T_A : d > 0.62 ? T_B : d > 0.34 ? T_C : T_DIM);
    }
    return P;
  }
}

/* ================================ Lines ================================ */

// A 2D scene: draw(P, A, t, S, dot) pushes points in CSS pixels.
const flat = (draw, init) => () => ({
  free: true,
  P: new Points(4096),
  init(A) { this.S = init ? init(A) : {}; },
  update(dt, A) { steer(this, A, dt); },
  points(A) { this.P.reset(); draw(this.P, A, A.t, this.S, A.cell * 0.42, this); return this.P; },
});

// A closed curve drawn by a moving pen: faint full figure, bright fading trail, accent tip.
function pen(curve, { period = 1, speed = 0.03, trail = 0.3, n = 2600 } = {}) {
  return flat((P, A, t, S, dot, self) => {
    const N = A.thumb ? n / 2 : n, R = min(A.w, A.h) * 0.42, rot = t * 0.04 + self.sx * 0.3;
    const cr = cos(rot), sr = sin(rot), head = fract(t * speed) * N;
    for (let k = 0; k < N; k++) {
      const [x0, y0] = curve((k / N) * period * TAU, t);
      const x = x0 * cr - y0 * sr, y = x0 * sr + y0 * cr;
      const behind = (head - k + N) % N, f = behind < N * trail ? 1 - behind / (N * trail) : 0;
      P.push(A.w / 2 + x * R, A.h / 2 + y * R, dot * (0.3 + 0.7 * f + (behind < 4 ? 0.6 : 0)), behind < 4 ? T_A : f > 0.45 ? T_B : f > 0 ? T_C : T_DIM);
    }
  });
}
const hypo = (R, r, d, epi = false) => (th, t) => {
  const dd = d * (1 + 0.18 * sin(t * 0.11)), k = epi ? (R + r) / r : (R - r) / r, base = epi ? R + r : R - r;
  const x = base * cos(th) + (epi ? -1 : 1) * dd * cos(k * th), y = base * sin(th) - dd * sin(k * th);
  return [x / (base + dd), y / (base + dd)];
};
const rose = (k) => (th, t) => {
  const r = cos(k * th) * (0.85 + 0.15 * sin(t * 0.2 + th * 2));
  return [r * cos(th), r * sin(th)];
};

const LINES = {
  spiro: { name: "Spiro", make: pen(hypo(8, 3, 2.4), { period: 3 }) },
  gyre: { name: "Gyre", make: pen(hypo(7, 4, 3), { period: 4, n: 3000 }) },
  lotus: { name: "Lotus", make: pen(hypo(5, 3, 1.6, true), { period: 3 }) },
  halo: { name: "Halo", make: pen(hypo(11, 7, 4.5), { period: 7, n: 3600, speed: 0.02 }) },
  rose: { name: "Rose", make: pen(rose(5 / 3), { period: 3, speed: 0.035 }) },
  rhodonea: { name: "Rhodonea", make: pen(rose(7 / 4), { period: 8, n: 3200, speed: 0.025 }) },
  sunflower: { name: "Sunflower", make: flat((P, A, t, S, dot, self) => {
    const N = A.thumb ? 420 : 900, R = min(A.w, A.h) * 0.45, rot = t * 0.05 + self.sx * 0.3;
    for (let i = 1; i < N; i++) {
      const f = sqrt(i / N), a = i * GOLD + rot, w = sin(sqrt(i) * 1.1 - t * 1.1);
      P.push(A.w / 2 + cos(a) * f * R, A.h / 2 + sin(a) * f * R, dot * (0.3 + 1.3 * f) * (0.75 + 0.25 * w), w > 0.985 ? T_A : w > 0.4 ? T_B : T_C);
    }
  }) },
  phyllo: { name: "Phyllo", make: flat((P, A, t, S, dot) => {
    const N = A.thumb ? 600 : 1400, R = min(A.w, A.h) * 0.46, g = GOLD + 0.012 * sin(t * 0.045);
    for (let i = 1; i < N; i++) {
      const f = sqrt(i / N), a = i * g;
      P.push(A.w / 2 + cos(a) * f * R, A.h / 2 + sin(a) * f * R, dot * 0.75, f > 0.66 ? T_DIM : f > 0.33 ? T_C : T_B);
    }
  }) },
  spores: { name: "Spores", make: flat((P, A, t, S, dot) => {
    const N = A.thumb ? 500 : 1100, R = min(A.w, A.h) * 0.5, flow = t * 9;
    for (let i = 0; i < N; i++) {
      const k = (i + flow) % N, f = sqrt(k / N), a = (i - N) * GOLD;
      P.push(A.w / 2 + cos(a) * f * R, A.h / 2 + sin(a) * f * R, dot * (0.25 + 0.9 * sin(f * PI)), f < 0.08 ? T_A : f > 0.75 ? T_DIM : T_C);
    }
  }) },
  table: { name: "Table", make: flat((P, A, t, S, dot) => {
    const cols = 5, rows = 3, cw = A.w / (cols + 1), ch = A.h / (rows + 1), rr = min(cw, ch) * 0.36, per = A.thumb ? 90 : 200;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = c + 1, b = r + 2, cx = cw * (c + 1), cy = ch * (r + 1), head = fract(t * 0.08 + (c + r) * 0.07) * per;
      for (let k = 0; k < per; k++) {
        const th = (k / per) * TAU, behind = (head - k + per) % per, f = behind < per * 0.3 ? 1 - behind / (per * 0.3) : 0;
        P.push(cx + sin(a * th + t * 0.25) * rr, cy + sin(b * th) * rr, dot * (0.18 + 0.5 * f), behind < 1 && r === 1 && c === 2 ? T_A : f > 0.5 ? T_B : f > 0 ? T_C : T_DIM);
      }
    }
  }) },
  moire: { name: "Moiré", make: flat((P, A, t, S, dot) => {
    const p = min(A.w, A.h) / (A.thumb ? 14 : 30), ang = 0.05 + 0.04 * sin(t * 0.09), ca = cos(ang), sa = sin(ang);
    const nx = Math.ceil(A.w / p / 2) + 2, ny = Math.ceil(A.h / p / 2) + 2;
    for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
      P.push(A.w / 2 + i * p, A.h / 2 + j * p, dot * 0.55, T_C);
      P.push(A.w / 2 + (i * ca - j * sa) * p * 1.02, A.h / 2 + (i * sa + j * ca) * p * 1.02, dot * 0.55, T_B);
    }
  }) },
  halos: { name: "Halos", make: flat((P, A, t, S, dot) => {
    const R = min(A.w, A.h), gap = R / (A.thumb ? 16 : 34);
    for (let s = 0; s < 2; s++) {
      const cx = A.w / 2 + (s ? 1 : -1) * R * (0.12 + 0.06 * sin(t * 0.2)), cy = A.h / 2 + (s ? -1 : 1) * R * 0.05 * cos(t * 0.17);
      for (let k = 1; k * gap < R * 0.62; k++) {
        const r = k * gap, m = floor((TAU * r) / (gap * 0.9));
        for (let i = 0; i < m; i++) P.push(cx + cos((i / m) * TAU) * r, cy + sin((i / m) * TAU) * r, dot * 0.5, s ? T_B : T_C);
      }
    }
  }) },
  pendulum: { name: "Pendulum", make: flat((P, A, t, S, dot) => {
    const n = A.thumb ? 14 : 22, top = A.h * 0.16, gap = (A.h * 0.68) / (n - 1), L = A.w * 0.32;
    for (let k = 0; k < n; k++) {
      const y = top + k * gap, ang = cos((TAU * t * (30 + k)) / 60) * 0.95, x = A.w / 2 + sin(ang) * L;
      for (let i = -12; i <= 12; i++) P.push(A.w / 2 + (i / 12) * L * 0.82, y, dot * 0.24, T_DIM);
      for (let e = 1; e < 5; e++) {
        const pa = cos((TAU * (t - e * 0.05) * (30 + k)) / 60) * 0.95;
        P.push(A.w / 2 + sin(pa) * L, y, dot * (0.7 - e * 0.13), T_C);
      }
      P.push(x, y, dot * 1.05, k === floor(n / 2) ? T_A : T_B);
    }
  }) },
  orrery: { name: "Orrery", make: flat((P, A, t, S, dot) => {
    const R = min(A.w, A.h) * 0.46;
    for (let k = 0; k < 7; k++) {
      const r = R * (0.16 + 0.12 * k), m = floor((TAU * r) / (dot * 4.5));
      for (let i = 0; i < m; i++) P.push(A.w / 2 + cos((i / m) * TAU) * r, A.h / 2 + sin((i / m) * TAU) * r * 0.42, dot * 0.3, T_DIM);
      const a = t * 0.9 * (0.16 / (0.16 + 0.12 * k)) ** 1.5 + k * 1.7;
      P.push(A.w / 2 + cos(a) * r, A.h / 2 + sin(a) * r * 0.42, dot * (1.2 + (k % 3) * 0.45), k === 3 ? T_A : T_B);
    }
    for (let i = 0; i < 40; i++) {
      const y = 1 - (i / 39) * 2, rr = sqrt(1 - y * y), th = GOLD * i;
      P.push(A.w / 2 + cos(th) * rr * R * 0.06, A.h / 2 + y * R * 0.06, dot * 0.5, T_B);
    }
  }) },
  radar: { name: "Radar", make: flat((P, A, t, S, dot) => {
    const R = min(A.w, A.h) * 0.45, gap = R / (A.thumb ? 9 : 18), sweep = t * 0.7;
    for (let k = 1; k * gap <= R; k++) {
      const r = k * gap, m = floor((TAU * r) / gap);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * TAU, lag = (((sweep - a) % TAU) + TAU) % TAU, b = exp(-lag * 1.3);
        const blip = H.hash(k, i) < 0.012 && lag < 2.2;
        P.push(A.w / 2 + cos(a) * r, A.h / 2 + sin(a) * r, dot * (blip ? 1.3 : 0.28 + 0.7 * b), blip ? T_A : b > 0.5 ? T_B : b > 0.15 ? T_C : T_DIM);
      }
    }
  }) },
  ridges: { name: "Ridges", make: flat((P, A, t, S, dot) => {
    // Joy Division–style lines: front lines hide whatever is behind them.
    const lines = A.thumb ? 22 : 46, cols = A.thumb ? 60 : 130, x0 = A.w * 0.28, x1 = A.w * 0.72, gap = (A.h * 0.64) / lines;
    const horizon = new Float32Array(cols).fill(1e9);
    for (let k = lines - 1; k >= 0; k--) {
      const base = A.h * 0.2 + k * gap;
      for (let c = 0; c < cols; c++) {
        const f = c / (cols - 1), env = exp(-(((f - 0.5) / 0.17) ** 2));
        const hgt = env * (H.noise(f * 7, k * 0.33, t * 0.12) ** 2 * 2.4 + 0.08) * gap * 7 + H.noise(f * 30, k, t * 0.3) * gap * 0.25;
        const y = base - hgt;
        if (y < horizon[c]) {
          horizon[c] = y - 1;
          P.push(x0 + f * (x1 - x0), y, dot * (env > 0.5 ? 0.5 : 0.35), hgt > gap * 5 ? T_B : T_C);
        }
      }
    }
  }) },
  iris: { name: "Iris", make: flat((P, A, t, S, dot) => {
    const R = min(A.w, A.h) * 0.46, gap = R / (A.thumb ? 12 : 26);
    for (let k = 1; k * gap <= R; k++) {
      const r = k * gap, m = floor((TAU * r) / gap);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * TAU, w = 0.5 + 0.5 * sin((r / R) * 16 - t * 1.2 + sin(a * 6 + t * 0.35) * 1.3);
        P.push(A.w / 2 + cos(a) * r, A.h / 2 + sin(a) * r, dot * (0.15 + 0.85 * w), w > 0.8 ? T_B : T_C);
      }
    }
  }) },
  lens: { name: "Lens", make: flat((P, A, t, S, dot) => {
    const p = min(A.w, A.h) / (A.thumb ? 14 : 30), L = min(A.w, A.h) * 0.26;
    const lx = A.w / 2 + sin(t * 0.21) * A.w * 0.28, ly = A.h / 2 + sin(t * 0.33) * A.h * 0.22;
    for (let y = p / 2; y < A.h; y += p) for (let x = p / 2; x < A.w; x += p) {
      const dx = x - lx, dy = y - ly, d = hypot(dx, dy);
      let X = x, Y = y, s = 0.35;
      if (d < L) { const k = (d / L) ** 0.45; X = lx + dx * k; Y = ly + dy * k; s = 0.35 + 0.65 * (1 - d / L); }
      P.push(X, Y, dot * s * 1.2, d < L * 0.5 ? T_B : T_C);
    }
  }) },
  signal: { name: "Signal", make: flat((P, A, t, S, dot) => {
    const cols = A.thumb ? 32 : 72, gap = (A.w * 0.7) / cols, x0 = A.w * 0.15, step = gap * 0.9;
    for (let c = 0; c < cols; c++) {
      const f = c / cols, amp = abs(sin(f * 9 + t * 1.3) * 0.5 + sin(f * 23 - t * 2.1) * 0.3 + sin(f * 3.7 + t * 0.4) * 0.4) * exp(-(((f - 0.5) / 0.35) ** 2));
      const n = floor((amp * A.h * 0.36) / step);
      for (let k = -n; k <= n; k++) P.push(x0 + c * gap, A.h / 2 + k * step, dot * 0.6, abs(k) === n && n > 6 ? T_B : T_C);
    }
  }) },
  hilbert: { name: "Hilbert", make: flat((P, A, t, S, dot) => {
    const ord = A.thumb ? 16 : 32, N = ord * ord, size = min(A.w, A.h) * 0.8, g = size / ord;
    const head = fract(t * 0.02) * N;
    for (let i = 0; i < N; i++) {
      const [x, y] = d2xy(ord, i), behind = (head - i + N) % N, f = behind < N * 0.3 ? 1 - behind / (N * 0.3) : 0;
      P.push(A.w / 2 - size / 2 + (x + 0.5) * g, A.h / 2 - size / 2 + (y + 0.5) * g, dot * (0.2 + 0.6 * f + (behind < 2 ? 0.5 : 0)), behind < 2 ? T_A : f > 0.5 ? T_B : f > 0 ? T_C : T_DIM);
    }
  }) },
  vinyl: { name: "Vinyl", make: flat((P, A, t, S, dot) => {
    const R = min(A.w, A.h) * 0.46, n = A.thumb ? 1200 : 3200, turns = A.thumb ? 14 : 26, rot = t * 0.55;
    for (let i = 0; i < n; i++) {
      const f = i / n, r = R * (0.22 + 0.78 * f), a = f * turns * TAU + rot, groove = H.noise(f * 60, 0.5, 0);
      P.push(A.w / 2 + cos(a) * r, A.h / 2 + sin(a) * r * 0.9, dot * (0.2 + 0.5 * groove), groove > 0.72 ? T_B : T_C);
    }
    P.push(A.w / 2 + cos(rot) * R * 0.12, A.h / 2 + sin(rot) * R * 0.11, dot * 1.2, T_A);
  }) },
};
// Index -> (x, y) along a Hilbert curve of side n.
function d2xy(n, d) {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; }
    x += s * rx; y += s * ry; t >>= 2;
  }
  return [x, y];
}

/* ================================ Op-art ================================ */

class OpArt extends Formula {
  constructor(src) { super(src); this.pitch = 0.62; }
}
const OPART = {
  riley: ["Riley", "0.45 + 0.45*sin((u + 0.16*sin(v*3.2 + t*0.6))*24)"],
  cascade: ["Cascade", "0.45 + 0.45*sin(v*26 + sin(u*1.8 + t*0.5)*3.5)"],
  warp: ["Warp", "0.45 + 0.44*sin(u*9 + sin(v*2 + t*0.4)*1.6)*sin(v*9 + sin(u*2 - t*0.3)*1.6)"],
  squares: ["Squares", "0.45 + 0.45*sin(max(abs(u), abs(v))*26 - t*1.2)"],
  diamond: ["Diamond", "0.45 + 0.45*sin((abs(u) + abs(v))*22 - t)"],
  twin: ["Twin", "0.45 + 0.225*(sin(hypot(u - 0.55, v)*28 - t*2) + sin(hypot(u + 0.55, v)*28 - t*2))"],
  bulge: ["Bulge", "0.1 + 0.8*exp(-(pow(u - sin(t*0.3)*0.9, 2) + pow(v - cos(t*0.23)*0.4, 2))*2.5)"],
  gradient: ["Gradient", "0.45 + 0.45*sin(u*1.2 + v*0.7 + t*0.3)*cos(v*1.5 - t*0.2)"],
  whorl: ["Whorl", "0.45 + 0.45*sin(a*6 + log(r + 0.02)*9 - t*1.2)"],
  contour: ["Contour", "0.45 + 0.45*sin(noise(u*1.4, v*1.4, t*0.08)*42)"],
  topo: ["Topo", "0.06 + 0.84*smoothstep(0.8, 1, abs(sin(noise(u*1.1 + 9, v*1.1, t*0.07)*28)))"],
  weave: ["Weave", "mix(0.45 + 0.45*sin(u*22 + t), 0.45 + 0.45*sin(v*22 - t), step(0, sin(u*3.5)*sin(v*3.5)))"],
  tiles: ["Tiles", "0.9*(1 - smoothstep(0.05, 0.14, min(abs(hypot(abs(fract(u*4) - step(0.5, hash(floor(u*4), floor(v*4) + floor(t*0.12)))), fract(v*4)) - 0.5), abs(hypot(1 - abs(fract(u*4) - step(0.5, hash(floor(u*4), floor(v*4) + floor(t*0.12)))), 1 - fract(v*4)) - 0.5))))"],
  scan: ["Scan", "0.06 + 0.84*pow(0.5 + 0.5*sin(v*5 - t*1.3), 6)*(0.55 + 0.45*sin(u*30))"],
  hex: ["Hex", "0.45 + 0.15*(cos(u*11 + t) + cos((u*0.5 + v*0.866)*11 - t*0.7) + cos((u*0.5 - v*0.866)*11 + t*0.4))"],
  quasi: ["Quasi", "0.45 + 0.09*(cos(u*13 + t) + cos((u*0.309 + v*0.951)*13 + t) + cos((v*0.588 - u*0.809)*13 + t) + cos((u*0.809 + v*0.588)*13 - t) + cos((u*0.309 - v*0.951)*13 + t))"],
  beat: ["Beat", "0.45 + 0.45*sin(u*34)*sin((u*cos(t*0.06) + v*sin(t*0.06))*34)"],
  dual: ["Dual", "0.8*sin(u*3 + t*0.6)*cos(v*4 - t*0.5)"],
  meter: ["Meter", "0.85*step((1 - v)*0.5, 0.1 + 0.8*noise(floor(u*10)*1.7, t*0.7))*step(0.3, fract(u*10))"],
  dunes: ["Dunes", "0.45 + 0.45*sin(u*8 + noise(u*0.8, v*0.8, t*0.05)*12 + v*2)"],
  spokes: ["Spokes", "0.45 + 0.45*sin(a*18 + sin(r*4 - t)*2)"],
};

/* ================================ Catalog ================================ */

const ICON = {
  forms: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><path d="M3 12c3 4 15 4 18 0"/>',
  orbits: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-30 12 12)"/>',
  lines: '<path d="M4 12c2-8 6-8 8 0s6 8 8 0"/>',
  opart: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16" stroke-dasharray="1 2.5"/>',
};

export const GALLERY = [
  ...Object.entries(FORMS).map(([id, d]) => ({ id, name: d.name, group: "forms", icon: ICON.forms, make: () => objectScene(d) })),
  ...Object.entries(ORBITS).map(([id, d]) => ({ id, name: d.name, group: "orbits", icon: ICON.orbits, make: () => new Cloud(d) })),
  ...Object.entries(LINES).map(([id, d]) => ({ id, name: d.name, group: "lines", icon: ICON.lines, make: d.make })),
  ...Object.entries(OPART).map(([id, [name, src]]) => ({ id, name, group: "opart", icon: ICON.opart, make: () => new OpArt(src) })),
];
