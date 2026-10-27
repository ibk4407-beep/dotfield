// A tiny, sandboxed expression language for dot patterns (used by the AI and by built-in scenes).
// Only numbers, whitelisted variables/functions and operators exist, so a formula can't reach the page.

export const CLOCK_STYLES = ["light", "serif", "grotesk", "condensed", "mono", "orbit", "analog", "railway", "ring", "seg", "dot", "word", "progress", "binary", "full"];
export const CLOCK_POS = ["bl", "br", "center"];
export const CLOCK_SIZES = ["s", "m", "l"];
export const SURFACES = ["flat", "sphere", "terrain"];

const VARS = ["x", "y", "u", "v", "r", "a", "t", "i", "w", "h", "mx", "my"];
const CONSTS = { pi: Math.PI, tau: Math.PI * 2, e: Math.E };
// name: [minArgs, maxArgs]
const FUNCS = {
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1], atan2: [2, 2],
  sqrt: [1, 1], abs: [1, 1], floor: [1, 1], ceil: [1, 1], round: [1, 1], fract: [1, 1], sign: [1, 1],
  min: [2, 4], max: [2, 4], pow: [2, 2], exp: [1, 1], log: [1, 1], mod: [2, 2], clamp: [3, 3],
  mix: [3, 3], step: [2, 2], smoothstep: [3, 3], hypot: [2, 3], noise: [2, 3], hash: [1, 2],
};
const MAX_LEN = 320;

const fract = (x) => x - Math.floor(x);
const hash = (x, y = 0) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const hash3 = (x, y, z) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
function noise(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf), sz = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz
  );
}
export const H = {
  fract, hash, noise,
  mod: (a, b) => ((a % b) + b) % b,
  clamp: (x, a, b) => Math.min(Math.max(x, a), b),
  mix: (a, b, t) => a + (b - a) * t,
  step: (e, x) => (x < e ? 0 : 1),
  smoothstep: (a, b, x) => {
    const t = Math.min(Math.max((x - a) / (b - a || 1e-9), 0), 1);
    return t * t * (3 - 2 * t);
  },
};
const MATH_FUNCS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sqrt", "abs", "floor", "ceil", "round", "sign", "min", "max", "pow", "exp", "log", "hypot"]);

function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z_][a-z0-9_]*)|(\*\*|<=|>=|==|!=|&&|\|\||[-+*/%^<>?:(),]))/giy;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const start = re.lastIndex;
    if (/^\s*$/.test(src.slice(start))) break;
    m = re.exec(src);
    if (!m) throw new Error(`unexpected character at ${start}: "${src.slice(start, start + 6).trim()}"`);
    if (m[1] !== undefined) out.push({ k: "num", v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ k: "id", v: m[2].toLowerCase() });
    else out.push({ k: "op", v: m[3] === "^" ? "**" : m[3] });
    if (out.length > 240) throw new Error("formula too long");
  }
  return out;
}

export function parse(src) {
  if (typeof src !== "string") throw new Error("formula must be a string");
  src = src.trim().replace(/;$/, "");
  if (!src) throw new Error("empty formula");
  if (src.length > MAX_LEN) throw new Error(`formula longer than ${MAX_LEN} characters`);
  const tk = tokenize(src);
  let p = 0, depth = 0;
  const peek = () => tk[p];
  const isOp = (v) => tk[p] && tk[p].k === "op" && tk[p].v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`expected "${v}"`);
    p++;
  };
  const guard = (fn) => {
    if (++depth > 48) throw new Error("formula nested too deeply");
    const r = fn();
    depth--;
    return r;
  };
  const bin = (next, ops) => () => {
    let left = next();
    while (tk[p] && tk[p].k === "op" && ops.includes(tk[p].v)) {
      const op = tk[p++].v;
      left = { k: "b", op, a: left, b: next() };
    }
    return left;
  };
  const ternary = () => guard(() => {
    const c = or();
    if (isOp("?")) {
      p++;
      const a = ternary();
      expect(":");
      const b = ternary();
      return { k: "t", c, a, b };
    }
    return c;
  });
  const unary = () => guard(() => {
    if (isOp("-") || isOp("+")) {
      const op = tk[p++].v;
      const a = unary();
      return op === "-" ? { k: "u", a } : a;
    }
    return power();
  });
  const power = () => {
    const base = primary();
    if (isOp("**")) {
      p++;
      return { k: "b", op: "**", a: base, b: unary() };
    }
    return base;
  };
  const primary = () => guard(() => {
    const t = peek();
    if (!t) throw new Error("unexpected end of formula");
    if (t.k === "num") {
      p++;
      if (!Number.isFinite(t.v)) throw new Error("bad number");
      return { k: "n", v: t.v };
    }
    if (t.k === "id") {
      p++;
      if (isOp("(")) {
        if (!Object.hasOwn(FUNCS, t.v)) throw new Error(`unknown function "${t.v}"`);
        p++;
        const args = [];
        if (!isOp(")")) {
          args.push(ternary());
          while (isOp(",")) { p++; args.push(ternary()); }
        }
        expect(")");
        const [lo, hi] = FUNCS[t.v];
        if (args.length < lo || args.length > hi) throw new Error(`${t.v}() takes ${lo === hi ? lo : `${lo}-${hi}`} arguments`);
        return { k: "f", n: t.v, args };
      }
      if (VARS.includes(t.v)) return { k: "v", n: t.v };
      if (Object.hasOwn(CONSTS, t.v)) return { k: "n", v: CONSTS[t.v] };
      throw new Error(`unknown variable "${t.v}"`);
    }
    if (isOp("(")) {
      p++;
      const e = ternary();
      expect(")");
      return e;
    }
    throw new Error(`unexpected "${t.v}"`);
  });
  const mul = bin(unary, ["*", "/", "%"]);
  const add = bin(mul, ["+", "-"]);
  const cmp = bin(add, ["<", ">", "<=", ">="]);
  const eq = bin(cmp, ["==", "!="]);
  const and = bin(eq, ["&&"]);
  const or = bin(and, ["||"]);
  const ast = ternary();
  if (p < tk.length) throw new Error(`unexpected "${tk[p].v}"`);
  return ast;
}

// JS source from a parsed tree. Every emitted token comes from the whitelist above.
function toJS(n) {
  switch (n.k) {
    case "n": return `(${n.v})`;
    case "v": return n.n;
    case "u": return `(-${toJS(n.a)})`;
    case "t": return `(${toJS(n.c)}!==0?${toJS(n.a)}:${toJS(n.b)})`;
    case "f": {
      const args = n.args.map(toJS).join(",");
      return MATH_FUNCS.has(n.n) ? `M.${n.n}(${args})` : `H.${n.n}(${args})`;
    }
    case "b": {
      const a = toJS(n.a), b = toJS(n.b);
      if (n.op === "**") return `M.pow(${a},${b})`;
      if (n.op === "&&") return `((${a}!==0&&${b}!==0)?1:0)`;
      if (n.op === "||") return `((${a}!==0||${b}!==0)?1:0)`;
      if (["<", ">", "<=", ">=", "==", "!="].includes(n.op)) return `((${a}${n.op === "==" ? "===" : n.op === "!=" ? "!==" : n.op}${b})?1:0)`;
      return `(${a}${n.op}${b})`;
    }
  }
  throw new Error("bad node");
}

// Closure tree for runtimes that forbid code generation (Cloudflare Workers).
function toClosure(n) {
  switch (n.k) {
    case "n": { const v = n.v; return () => v; }
    case "v": { const i = VARS.indexOf(n.n); return (s) => s[i]; }
    case "u": { const a = toClosure(n.a); return (s) => -a(s); }
    case "t": { const c = toClosure(n.c), a = toClosure(n.a), b = toClosure(n.b); return (s) => (c(s) !== 0 ? a(s) : b(s)); }
    case "f": {
      const fn = MATH_FUNCS.has(n.n) ? Math[n.n] : H[n.n];
      const args = n.args.map(toClosure);
      if (args.length === 1) { const [a] = args; return (s) => fn(a(s)); }
      if (args.length === 2) { const [a, b] = args; return (s) => fn(a(s), b(s)); }
      return (s) => fn(...args.map((f) => f(s)));
    }
    case "b": {
      const a = toClosure(n.a), b = toClosure(n.b);
      switch (n.op) {
        case "+": return (s) => a(s) + b(s);
        case "-": return (s) => a(s) - b(s);
        case "*": return (s) => a(s) * b(s);
        case "/": return (s) => a(s) / b(s);
        case "%": return (s) => a(s) % b(s);
        case "**": return (s) => Math.pow(a(s), b(s));
        case "<": return (s) => (a(s) < b(s) ? 1 : 0);
        case ">": return (s) => (a(s) > b(s) ? 1 : 0);
        case "<=": return (s) => (a(s) <= b(s) ? 1 : 0);
        case ">=": return (s) => (a(s) >= b(s) ? 1 : 0);
        case "==": return (s) => (a(s) === b(s) ? 1 : 0);
        case "!=": return (s) => (a(s) !== b(s) ? 1 : 0);
        case "&&": return (s) => (a(s) !== 0 && b(s) !== 0 ? 1 : 0);
        case "||": return (s) => (a(s) !== 0 || b(s) !== 0 ? 1 : 0);
      }
    }
  }
  throw new Error("bad node");
}

// Returns f(x, y, u, v, r, a, t, i, w, h, mx, my).
export function compile(src, { allowCodegen = true } = {}) {
  const ast = parse(src);
  if (allowCodegen) {
    try {
      // eslint-disable-next-line no-new-func
      return new Function("M", "H", `"use strict";return function(${VARS.join(",")}){return ${toJS(ast)};}`)(Math, H);
    } catch {}
  }
  const root = toClosure(ast);
  const s = new Float64Array(VARS.length);
  return (...args) => {
    for (let k = 0; k < args.length; k++) s[k] = args[k];
    return root(s);
  };
}

// Samples the formula on a small grid to reject broken, blank or frozen patterns.
export function check(src, opts) {
  let fn;
  try {
    fn = compile(src, opts);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const cols = 48, rows = 27, aspect = cols / rows;
  let finite = 0, total = 0, lit = 0, big = 0, magnitude = 0, spatial = 0, temporal = 0;
  let flicker = 0;
  // Pearson correlation between neighbours along each axis; random static is ~0 in every direction.
  let corr, structSum = 0, structN = 0;
  const pearson = ([sa, sb, saa, sbb, sab, n]) => {
    const cov = sab / n - (sa / n) * (sb / n), va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
    return va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : 0;
  };
  const addPair = (c, a, b) => { c[0] += a; c[1] += b; c[2] += a * a; c[3] += b * b; c[4] += a * b; c[5]++; };
  let prev = null, prevT = 0;
  // Pairs 0.06s apart measure flicker; the wider gaps measure overall motion.
  for (const t of [0, 0.06, 1.7, 1.76, 3.9]) {
    const vals = new Float64Array(cols * rows);
    let sum = 0, sq = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const u = (x / (cols - 1) * 2 - 1) * aspect, v = y / (rows - 1) * 2 - 1;
        let val = fn(x, y, u, v, Math.hypot(u, v), Math.atan2(v, u), t, y * cols + x, cols, rows, 0, 0);
        total++;
        if (Number.isFinite(val)) finite++;
        else val = 0;
        val = Math.max(-1, Math.min(1, val));
        vals[y * cols + x] = val;
        sum += val; sq += val * val;
        if (Math.abs(val) > 0.1) lit++;
        if (Math.abs(val) > 0.5) big++;
        magnitude += Math.abs(val);
      }
    const n = cols * rows, mean = sum / n;
    spatial = Math.max(spatial, Math.sqrt(Math.max(0, sq / n - mean * mean)));
    corr = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
    for (let y = 0; y < rows - 1; y++)
      for (let x = 0; x < cols - 1; x++) {
        const k = y * cols + x;
        addPair(corr[0], vals[k], vals[k + 1]);
        addPair(corr[1], vals[k], vals[k + cols]);
        addPair(corr[2], vals[k], vals[k + cols + 1]);
      }
    if (sq / n - mean * mean > 1e-6) { structSum += Math.max(...corr.map(pearson)); structN++; }
    if (prev) {
      let d = 0;
      for (let k = 0; k < n; k++) d += Math.abs(vals[k] - prev[k]);
      if (t - prevT < 0.1) flicker = Math.max(flicker, d / n);
      else temporal = Math.max(temporal, d / n);
    }
    prev = vals;
    prevT = t;
  }
  if (finite / total < 0.9) return { ok: false, error: "formula produces NaN or Infinity for most dots" };
  const coverage = lit / total;
  if (coverage < 0.03) return { ok: false, error: "pattern is almost empty; values stay near 0" };
  if (coverage > 0.985 && spatial < 0.08) return { ok: false, error: "pattern is a flat fill; add spatial variation" };
  const fill = big / total;
  if (fill > 0.6 || magnitude / total > 0.5) return { ok: false, error: `pattern fills ${Math.round(fill * 100)}% of the dots with large dots; leave most dots empty (values near 0) so the shape reads, aim for 15-60%` };
  if (spatial < 0.04) return { ok: false, error: "pattern has no spatial structure" };
  if (temporal < 0.004) return { ok: false, error: "pattern does not animate; use t" };
  const structure = structN ? structSum / structN : 0;
  const roughness = 1 - structure;
  if (flicker > 0.2) return { ok: false, error: "pattern flickers frame to frame; avoid hash() of t and very fast t multipliers, move things smoothly" };
  if (structure < 0.3) return { ok: false, error: "pattern looks like random static; build smooth, legible shapes instead of per-dot noise" };
  // Aesthetic score: a calm, legible motif covering a moderate share of the field wins.
  const score = 1
    - 2 * Math.max(0, Math.abs(fill - 0.28) - 0.14)
    - 1.2 * Math.max(0, 0.65 - structure)
    - 3 * Math.max(0, flicker - 0.05)
    + 0.6 * Math.min(spatial, 0.45);
  return { ok: true, coverage, fill, spatial, temporal, flicker, roughness, structure, score };
}
