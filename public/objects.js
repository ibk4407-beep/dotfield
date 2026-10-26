// "Objects": lit 3D surfaces made of dots, all sharing the torus treatment — slow tumble,
// light as dot size, a see-through back side, and the accent used for a single detail.
import { Points, T_DIM, T_C, T_A, T_B } from "./engine.js";
import { H } from "./formula.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// A tube of radius `rad` around a closed curve c(s), s in 0..1.
function tube(curve, rad, radMod) {
  return (u, v, t) => {
    const e = 1e-3, p = curve(u, t), q = curve(u + e, t);
    const T = norm(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    let N = cross(T, [0, 0, 1]);
    if (Math.hypot(...N) < 1e-3) N = cross(T, [0, 1, 0]);
    N = norm(...N);
    const B = cross(T, N);
    const r = rad * (radMod ? radMod(u, v, t) : 1), a = v * TAU;
    return [p[0] + r * (Math.cos(a) * N[0] + Math.sin(a) * B[0]), p[1] + r * (Math.cos(a) * N[1] + Math.sin(a) * B[1]), p[2] + r * (Math.cos(a) * N[2] + Math.sin(a) * B[2])];
  };
}

// Shapes: f(u, v, t) -> [x, y, z] with u, v in 0..1, roughly unit-sized.
const SHAPES = {
  torus: { U: 150, V: 46, scale: 0.24, f: (u, v) => {
    const a = u * TAU, b = v * TAU + u * 0.45;
    return [(1 + 0.42 * Math.cos(b)) * Math.cos(a), 0.42 * Math.sin(b), (1 + 0.42 * Math.cos(b)) * Math.sin(a)];
  }, accent: (u, v, t) => Math.abs((((u * TAU - t * 0.6) % TAU) + TAU) % TAU) < 0.12 },
  knot: { U: 360, V: 16, scale: 0.21, f: tube((s) => {
    const a = s * TAU;
    return [(2 + Math.cos(3 * a)) * Math.cos(2 * a) * 0.42, (2 + Math.cos(3 * a)) * Math.sin(2 * a) * 0.42, Math.sin(3 * a) * 0.42];
  }, 0.2), accent: (u, v, t) => Math.abs(((u - t * 0.05) % 1 + 1) % 1 - 0.5) < 0.006 },
  mobius: { U: 220, V: 22, scale: 0.3, f: (u, v) => {
    const a = u * TAU, w = (v - 0.5) * 0.9;
    return [(1 + (w / 2) * Math.cos(a / 2)) * Math.cos(a), (w / 2) * Math.sin(a / 2), (1 + (w / 2) * Math.cos(a / 2)) * Math.sin(a)];
  }, twoSided: true, accent: (u, v) => Math.abs(v - 0.5) < 0.03 && Math.abs(u - 0.5) < 0.1 },
  twist: { U: 170, V: 40, scale: 0.24, f: (u, v) => {
    const a = u * TAU, b = v * TAU;
    const r = 0.38 * (1 + 0.16 * Math.cos(2 * b + 3 * a));
    return [(1 + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (1 + r * Math.cos(b)) * Math.sin(a)];
  }},
  gyro: { U: 540, V: 10, scale: 0.3, animated: true, f: (u, v, t) => {
    // Three thin rings, each turning on its own axis.
    const k = Math.min(2, Math.floor(u * 3)), uu = u * 3 - k;
    const R = [1, 0.78, 0.56][k], a = uu * TAU, b = v * TAU, r = 0.045;
    let x = (R + r * Math.cos(b)) * Math.cos(a), y = r * Math.sin(b), z = (R + r * Math.cos(b)) * Math.sin(a);
    const ang = t * [0.35, -0.5, 0.7][k] + k;
    if (k === 0) [y, z] = [y * Math.cos(ang) - z * Math.sin(ang), y * Math.sin(ang) + z * Math.cos(ang)];
    else if (k === 1) [x, y] = [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
    else [x, z] = [x * Math.cos(ang) - z * Math.sin(ang), x * Math.sin(ang) + z * Math.cos(ang)];
    return [x, y, z];
  }, accent: (u, v) => Math.abs(u - 2.5 / 3) < 0.004 },
  coil: { U: 420, V: 12, scale: 0.26, f: tube((s) => {
    const a = s * TAU * 6;
    return [Math.cos(a) * 0.8, (s * 2 - 1) * 1.15, Math.sin(a) * 0.8];
  }, 0.13), open: true },
  blob: { sphere: 5200, scale: 0.3, animated: true, f: (d, t) => {
    const n = H.noise(d[0] * 1.4 + t * 0.25, d[1] * 1.4, d[2] * 1.4 + t * 0.18);
    return 1 + (n - 0.5) * 0.55;
  }},
  shell: { U: 280, V: 30, scale: 0.5, normalize: true, twoSided: true, f: (u, v) => {
    // The classic parametric seashell, recentred by sample().
    const a = u * 6 * Math.PI, b = v * TAU, e1 = Math.exp(a / (6 * Math.PI)), c2 = Math.cos(b / 2) ** 2;
    return [2 * (1 - e1) * Math.cos(a) * c2, 1 - Math.exp(a / (3 * Math.PI)) - Math.sin(b) + e1 * Math.sin(b), 2 * (e1 - 1) * Math.sin(a) * c2];
  }, open: true },
  orb: { sphere: 6000, scale: 0.34, f: (d) => 1 + 0.025 * Math.sin(Math.asin(clamp(d[1], -1, 1)) * 26) },
  // Two interlocked rings.
  chain: { U: 300, V: 24, scale: 0.27, twoSided: true, f: parts([
    tube((s) => { const a = s * TAU; return [Math.cos(a) * 0.82 - 0.42, Math.sin(a) * 0.82, 0]; }, 0.2),
    tube((s) => { const a = s * TAU; return [Math.cos(a) * 0.82 + 0.42, 0, Math.sin(a) * 0.82]; }, 0.2),
  ]), accent: (u) => Math.abs(u - 0.75) < 0.006 },
  // Borromean rings: no two are linked, yet the three hold together.
  borromean: { U: 450, V: 14, scale: 0.3, twoSided: true, f: parts([
    tube((s) => { const a = s * TAU; return [Math.cos(a), Math.sin(a) * 0.52, 0]; }, 0.1),
    tube((s) => { const a = s * TAU; return [0, Math.cos(a), Math.sin(a) * 0.52]; }, 0.1),
    tube((s) => { const a = s * TAU; return [Math.sin(a) * 0.52, 0, Math.cos(a)]; }, 0.1),
  ]), accent: (u) => u > 2 / 3 && Math.abs(u - 5 / 6) < 0.004 },
  // A horn/spindle torus: the tube is fatter than the hole, so it folds through itself.
  horn: { U: 150, V: 50, scale: 0.3, f: (u, v) => {
    const a = u * TAU, b = v * TAU, R = 0.55, r = 0.62;
    return [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)];
  }, twoSided: true },
  // Cinquefoil: the (2, 5) torus knot.
  star: { U: 520, V: 14, scale: 0.23, f: tube((s) => {
    const a = s * TAU;
    return [(2.3 + Math.cos(5 * a)) * Math.cos(2 * a) * 0.36, Math.sin(5 * a) * 0.36, (2.3 + Math.cos(5 * a)) * Math.sin(2 * a) * 0.36];
  }, 0.12), accent: (u, v, t) => Math.abs(((u - t * 0.04) % 1 + 1) % 1 - 0.5) < 0.004 },
  // A fine (3, 8) torus knot winding around an invisible torus.
  wind: { U: 900, V: 8, scale: 0.25, f: tube((s) => {
    const a = s * TAU;
    return [(1 + 0.42 * Math.cos(8 * a)) * Math.cos(3 * a), 0.42 * Math.sin(8 * a), (1 + 0.42 * Math.cos(8 * a)) * Math.sin(3 * a)];
  }, 0.055) },
  // A slinky bent into a ring.
  slinky: { U: 1300, V: 9, scale: 0.25, f: tube((s) => {
    const a = s * TAU;
    return [(1 + 0.34 * Math.cos(26 * a)) * Math.cos(a), 0.34 * Math.sin(26 * a), (1 + 0.34 * Math.cos(26 * a)) * Math.sin(a)];
  }, 0.045), accent: (u, v, t) => Math.abs(((u - t * 0.03) % 1 + 1) % 1 - 0.5) < 0.0025 },
  // The figure-8 immersion of a Klein bottle.
  klein: { U: 160, V: 42, scale: 0.36, normalize: true, twoSided: true, f: (u, v) => {
    const a = u * TAU, b = v * TAU, R = 2.2;
    const w = R + Math.cos(a / 2) * Math.sin(b) - Math.sin(a / 2) * Math.sin(2 * b);
    return [w * Math.cos(a), Math.sin(a / 2) * Math.sin(b) + Math.cos(a / 2) * Math.sin(2 * b), w * Math.sin(a)];
  }},
  // A bracelet of pearls, one of them in the accent.
  pearls: { U: 18 * 14, V: 18, scale: 0.28, twoSided: true, f: (u, v) => {
    const n = 18, k = Math.min(n - 1, Math.floor(u * n)), uu = u * n - k;
    const c = (k / n) * TAU, lon = uu * TAU, lat = (v - 0.5) * Math.PI, r = 0.17;
    return [Math.cos(c) + r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), Math.sin(c) + r * Math.cos(lat) * Math.sin(lon)];
  }, accent: (u) => Math.floor(u * 18) === 5 },
  // A flat band with three half twists.
  ribbon: { U: 300, V: 14, scale: 0.3, twoSided: true, f: (u, v) => {
    const a = u * TAU, w = (v - 0.5) * 0.62, th = 1.5 * a;
    const rx = Math.cos(a), rz = Math.sin(a);
    return [rx + w * Math.cos(th) * rx, w * Math.sin(th), rz + w * Math.cos(th) * rz];
  }, accent: (u, v) => Math.abs(v - 0.5) < 0.04 && Math.abs(u - 0.25) < 0.02 },
  // A torus whose surface carries a travelling wave.
  ripple: { U: 150, V: 44, scale: 0.24, animated: true, f: (u, v, t) => {
    const a = u * TAU, b = v * TAU;
    const r = 0.4 * (1 + 0.14 * Math.sin(6 * a - t * 2.2) * (0.6 + 0.4 * Math.cos(b)));
    return [(1 + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (1 + r * Math.cos(b)) * Math.sin(a)];
  }},
};

// Several closed pieces sharing one u range (u is split evenly between them).
function parts(fns) {
  return (u, v, t) => {
    const k = Math.min(fns.length - 1, Math.floor(u * fns.length));
    return fns[k](u * fns.length - k, v, t);
  };
}

function fibSphere(n) {
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
    out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return out;
}

// Samples a shape into positions and outward-ish normals.
function sample(def, t) {
  const pos = [], nrm = [], uv = [];
  if (def.sphere) {
    for (const d of fibSphere(def.sphere)) {
      const r = def.f(d, t);
      pos.push([d[0] * r, d[1] * r, d[2] * r]);
      nrm.push(d);
      uv.push([0, 0]);
    }
    return { pos, nrm, uv };
  }
  const e = 1e-3;
  for (let i = 0; i < def.U; i++) {
    const u = def.open ? i / (def.U - 1) : i / def.U;
    for (let j = 0; j < def.V; j++) {
      const v = j / def.V + (def.open ? 0 : (i % 2) * (0.5 / def.V));
      const p = def.f(u, v, t);
      const pu = def.f(u + e, v, t), pv = def.f(u, v + e, t);
      let n = norm(...cross([pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]]));
      // Point normals away from the shape's centre so lighting is consistent.
      if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0 && !def.twoSided) n = [-n[0], -n[1], -n[2]];
      pos.push(p); nrm.push(n); uv.push([u, v]);
    }
  }
  if (def.normalize) {
    // Centre the shape and scale it to unit radius.
    const c = [0, 1, 2].map((k) => pos.reduce((sum, p) => sum + p[k], 0) / pos.length);
    let rmax = 0;
    for (const p of pos) { for (let k = 0; k < 3; k++) p[k] -= c[k]; rmax = Math.max(rmax, Math.hypot(...p)); }
    for (const p of pos) for (let k = 0; k < 3; k++) p[k] /= rmax;
  }
  return { pos, nrm, uv };
}

function steer(self, A, dt) {
  const P = A.pointer;
  const tx = P.active ? (P.px / A.w - 0.5) * 2 : 0, ty = P.active ? (P.py / A.h - 0.5) * 2 : 0;
  self.sx = (self.sx || 0) + (tx - (self.sx || 0)) * Math.min(1, dt * 1.5);
  self.sy = (self.sy || 0) + (ty - (self.sy || 0)) * Math.min(1, dt * 1.5);
}

// Rotates, lights and projects a sampled shape into Points.
function render(P, S, A, rot, scale, twoSided, accentFn) {
  const { pos, nrm, uv } = S, t = A.t;
  const [ax, ay] = rot;
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  const size = Math.min(A.w, A.h) * scale, dot = A.cell * 0.42;
  for (let i = 0; i < pos.length; i++) {
    let [x, y, z] = pos[i], [nx, ny, nz] = nrm[i];
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [ny, nz] = [ny * cx - nz * sx, ny * sx + nz * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [nx, nz] = [nx * cy + nz * sy, -nx * sy + nz * cy];
    if (twoSided && nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const persp = 1 / (1 - z * 0.16);
    const lam = clamp(-nx * 0.35 - ny * 0.75 + nz * 0.55, 0, 1);
    const facing = twoSided ? z > -0.35 : nz > -0.15;
    const s = dot * persp * (facing ? 0.3 + 0.7 * lam : 0.22);
    const tone = accentFn && facing && accentFn(uv[i][0], uv[i][1], t) ? T_A : !facing ? T_DIM : lam > 0.45 ? T_B : T_C;
    P.push(A.w / 2 + x * size * persp, A.h / 2 + y * size * persp, s, tone);
  }
}

class ObjectScene {
  constructor(key) {
    this.free = true;
    this.key = key;
    this.def = SHAPES[key];
    this.P = new Points(8192);
  }
  init(A) {
    // Thumbnails don't need full resolution.
    if (A.thumb) this.def = { ...SHAPES[this.key], U: Math.round((SHAPES[this.key].U || 0) * 0.6), V: Math.max(8, Math.round((SHAPES[this.key].V || 0) * 0.65)), sphere: SHAPES[this.key].sphere && Math.round(SHAPES[this.key].sphere * 0.45) };
    this.S = sample(this.def, 0);
    this.acT = 0;
  }
  update(dt, A) {
    steer(this, A, dt);
    this.acT += dt;
    // Animated shapes resample up to 30 times a second.
    if (this.def.animated && this.acT > 1 / 30) { this.S = sample(this.def, A.t); this.acT = 0; }
  }
  points(A) {
    const t = A.t;
    this.P.reset();
    render(this.P, this.S, A, [1.0 + Math.sin(t * 0.13) * 0.4 + this.sy * 0.4, t * 0.18 + this.sx * 0.6], this.def.scale, this.def.twoSided, this.def.accent);
    return this.P;
  }
}

// Morph: flows from one object into the next, point by point.
const MORPH_ORDER = ["torus", "orb", "knot", "ribbon", "star", "mobius", "blob", "klein"];
class Morph {
  constructor() { this.free = true; this.P = new Points(8192); }
  init() {
    const N = 5400;
    this.sets = MORPH_ORDER.map((k) => {
      const s = sample(SHAPES[k], 0);
      const pick = (arr) => Array.from({ length: N }, (_, i) => arr[Math.floor((i / N) * arr.length)]);
      // Normalise every shape to the same apparent size.
      const sc = SHAPES[k].scale / 0.27;
      return { pos: pick(s.pos).map((p) => p.map((c) => c * sc)), nrm: pick(s.nrm), uv: new Array(N).fill([0, 0]) };
    });
    this.k = 0;
    this.phase = 0;
    this.cur = { pos: this.sets[0].pos.map((p) => p.slice()), nrm: this.sets[0].nrm.map((n) => n.slice()), uv: this.sets[0].uv };
  }
  update(dt, A) {
    steer(this, A, dt);
    this.phase += dt / 9;
    if (this.phase >= 1) { this.phase = 0; this.k = (this.k + 1) % this.sets.length; }
    // Hold each shape, then morph over the last third of the cycle.
    const m = clamp((this.phase - 0.62) / 0.38, 0, 1), e = m * m * (3 - 2 * m);
    const a = this.sets[this.k], b = this.sets[(this.k + 1) % this.sets.length];
    for (let i = 0; i < a.pos.length; i++) {
      for (let c = 0; c < 3; c++) {
        this.cur.pos[i][c] = a.pos[i][c] + (b.pos[i][c] - a.pos[i][c]) * e;
        this.cur.nrm[i][c] = a.nrm[i][c] + (b.nrm[i][c] - a.nrm[i][c]) * e;
      }
    }
  }
  points(A) {
    const t = A.t;
    this.P.reset();
    render(this.P, this.cur, A, [1.0 + Math.sin(t * 0.13) * 0.4 + this.sy * 0.4, t * 0.18 + this.sx * 0.6], 0.27, true);
    return this.P;
  }
}

const ICONS = {
  torus: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="3.5" ry="1.8"/>',
  knot: '<path d="M12 4c5 0 7 6 3 9s-9 2-9-2 5-7 8-3 2 9-2 10-8-3-5-7"/>',
  mobius: '<path d="M3 12c0-4 4-5 9 0s9 4 9 0-4-5-9 0-9 4-9 0z"/>',
  twist: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><path d="M5 9c3 2 4 5 3 7M12 6.5c2 3 2 7 0 11M19 9c-3 2-4 5-3 7"/>',
  gyro: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3"/><ellipse cx="12" cy="12" rx="3" ry="9"/>',
  coil: '<path d="M6 4h12M6 8h12M6 12h12M6 16h12M6 20h12" stroke-dasharray="2 2"/>',
  blob: '<path d="M12 3c5 0 9 3 8 8s-3 10-9 9-8-5-7-10 3-7 8-7z"/>',
  shell: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6"/>',
  orb: '<circle cx="12" cy="12" r="8.5"/><path d="M4 9h16M3.5 12h17M4 15h16"/>',
  morph: '<circle cx="8" cy="12" r="4.5"/><rect x="13" y="7.5" width="8" height="9" rx="2"/>',
  chain: '<ellipse cx="8.5" cy="12" rx="5.5" ry="4"/><ellipse cx="15.5" cy="12" rx="5.5" ry="4"/>',
  borromean: '<circle cx="12" cy="8.5" r="4.5"/><circle cx="8.5" cy="14.5" r="4.5"/><circle cx="15.5" cy="14.5" r="4.5"/>',
  horn: '<ellipse cx="12" cy="12" rx="9" ry="6"/><path d="M12 6v12"/>',
  star: '<path d="M12 3l2.6 6 6.4.6-4.9 4.2 1.5 6.2L12 16.8 6.4 20l1.5-6.2L3 9.6 9.4 9z"/>',
  wind: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><path d="M4 10c3 3 5-4 8 0s5-3 8 0" />',
  slinky: '<ellipse cx="12" cy="12" rx="9" ry="5.5" stroke-dasharray="1.2 1.6"/>',
  klein: '<path d="M7 18c-3-3-2-11 4-12s8 4 6 8-7 3-6-1 4-3 5 0"/>',
  pearls: '<circle cx="12" cy="4.5" r="1.6"/><circle cx="19" cy="9" r="1.6"/><circle cx="17" cy="17" r="1.6"/><circle cx="7" cy="17" r="1.6"/><circle cx="5" cy="9" r="1.6"/>',
  ribbon: '<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/><path d="M3 14c3-6 6 6 9 0s6 6 9 0" opacity=".5"/>',
  ripple: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/><path d="M5 12c1.5-1 2.5 1 4 0s2.5 1 4 0 2.5 1 4 0 1.5 1 2 0"/>',
};
const NAMES = {
  torus: "Torus", knot: "Knot", mobius: "Möbius", twist: "Twist", gyro: "Gyro", coil: "Coil", blob: "Blob", shell: "Shell", orb: "Orb",
  chain: "Chain", borromean: "Borromean", horn: "Horn", star: "Star", wind: "Wind", slinky: "Slinky", klein: "Klein", pearls: "Pearls", ribbon: "Ribbon", ripple: "Ripple",
};

export const OBJECTS = [
  ...Object.keys(NAMES).map((k) => ({ id: k, name: NAMES[k], icon: ICONS[k], make: () => new ObjectScene(k) })),
  { id: "morph", name: "Morph", icon: ICONS.morph, make: () => new Morph() },
];
