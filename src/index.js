import { check, parse, SCENE_IDS, CLOCK_STYLES, CLOCK_POS, CLOCK_SIZES, SURFACES } from "../public/formula.js";

const SHAPES = ["square", "circle"];
const STYLES = ["halftone", "dither"];
const CLOCKS = [...CLOCK_STYLES, "off"];
const IDLES = [0, 1, 3, 5, 10];
const HEX = /^#[0-9a-f]{6}$/i;
const MODEL = "@cf/openai/gpt-oss-120b";
const FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CANDIDATES = 3;
const GRACE_MS = 12000;

const THEME_SCHEMA = {
  type: "object",
  properties: {
    idea: { type: "string" },
    surface: { type: "string", enum: SURFACES },
    name: { type: "string" },
    expr: { type: "string" },
    speed: { type: "number" },
    bg: { type: "string" },
    a: { type: "string" },
    b: { type: "string" },
    c: { type: "string" },
  },
  required: ["surface", "name", "expr", "speed", "bg", "a", "b", "c"],
};

const SYSTEM = `You are a senior motion designer creating ONE animated dot pattern for a refined, minimal screensaver
(think Nothing's dot-matrix language, Swiss posters, halftone print, Stripe's dot globe). Restraint over spectacle.
Return only a JSON object: {"idea","surface","name","expr","speed","bg","a","b","c"}.

The formula "expr" is evaluated for every dot, every frame; the result is clamped to -1..1:
0 = empty dot, positive = soft/accent dot (1 = the accent color, used sparingly), negative = dark ink dot. Magnitude = dot size.
Variables: u (-aspect..aspect, left→right), v (-1..1, top→bottom), r = distance from center, a = angle (-pi..pi),
t = seconds, x, y = integer grid position, w, h = grid size, i = dot index, mx, my = pointer in u/v space.
Constants: pi, tau, e. Operators: + - * / % ^, comparisons (1 or 0), && ||, cond ? x : y.
Functions: sin cos tan asin acos atan atan2 sqrt abs floor ceil round fract sign min max pow exp log mod clamp mix step smoothstep hypot
noise(x,y,z) (smooth 0..1), hash(x,y) (static random 0..1). No other names exist. Under 220 characters.

"surface" is the object the pattern is printed on:
- "flat": the screen itself (posters, typography-like layouts, grids, fields).
- "sphere": wrapped on a slowly rotating dot globe; u = longitude (-1.6..1.6), v = latitude (-1 top..1 bottom). Great for planets, eyes, seeds, cells, weather.
- "terrain": a landscape seen in perspective; positive values rise as hills. Great for sea, dunes, sound, mountains, cities.
Pick the surface that makes the keyword feel most like an object or a place.

Design principles (follow all):
1. One clear motif that evokes the keyword. In "idea", say in one sentence what the viewer sees and how it moves.
2. Negative space: most dots stay near 0; the motif covers about 15-45% of the field.
3. Smooth and legible: build shapes with smoothstep edges, gradients and lines a few dots wide. No per-dot static.
4. Calm motion: t multipliers mostly 0.1-1.5. Never feed t into hash(). Nothing should flicker.
5. Hierarchy: soft positive values for the body, values near 1 only for a few highlights, negative values for a second layer or shadow.
6. Avoid the generic "sin(a*k + r*k - t)" swirl and plain full-screen noise.

Techniques to combine: moving points 1 - hypot(u - X(t), v - Y(t))*k · column streaks smoothstep(0.8, 1, fract(y*k + t*s + hash(x, 0)))
· tiles floor()/fract() · petals cos(a*k) vs r · bands smoothstep() on sin(u*k + t) · organic noise(u*k, v*k, t*s) thresholded with smoothstep
· pulses sin(t*k) scaling a shape · thin outlines 1 - smoothstep(0, w, abs(f)).

Examples (style only, do not copy):
- ripples (flat): sin(r*14 - t*3) * (1.2 - r) * 0.8
- rain (flat): smoothstep(0.75, 1, fract(y*0.03 + t*0.5 + hash(x, 1)))
- heart (flat): (pow(u*u + pow(-v*1.2 + 0.3*sqrt(abs(u)), 2) - 0.35*(1 + 0.12*sin(t*6)), 1) < 0) ? 0.8 : -0.12*sin(r*20 - t*4)
- storm bands (sphere): smoothstep(0.55, 0.75, noise(u*2 + t*0.15, v*5, t*0.1)) * (1 - abs(v)) - 0.4*smoothstep(0.9, 1, abs(v))
- dunes (terrain): smoothstep(0.3, 0.9, sin(u*3 + noise(u, v*2, 0)*3 + t*0.2)*0.5 + 0.5) * 0.7
- orbit (flat): max(0, 1 - min(hypot(u - cos(t)*0.6, v - sin(t)*0.6), hypot(u + cos(t*1.3)*0.4, v + sin(t*1.3)*0.4))*2.5)

Palette, sophisticated and muted: bg = very light tint of the theme hue (lightness > 92%, not pure white);
a = one confident accent; b = deep near-black tinted with the hue; c = soft mid tone between bg and a. All #rrggbb.
name = 1-3 words in the same language as the keyword. speed = 0.4 (calm) to 1.4 (lively).`;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (h1, h2, t) => {
  const a = toRgb(h1), b = toRgb(h2);
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
};
const lum = (h) => {
  const [r, g, b] = toRgb(h);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

function sanitizeColors(c) {
  const pick = (v, fb) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : fb);
  let bg = pick(c.bg, "#f3f3f1");
  // The UI is light glass, so the field stays light; dark mode derives its own night palette.
  for (let i = 0; i < 6 && lum(bg) < 0.9; i++) bg = mix(bg, "#ffffff", 0.45);
  let b = pick(c.b, "#1c1c1e");
  for (let i = 0; i < 6 && lum(b) > 0.35; i++) b = mix(b, "#000000", 0.35);
  const a = pick(c.a, "#ff4f1a");
  const cc = pick(c.c, mix(a, bg, 0.5));
  return { bg, base: mix(bg, b, 0.11), a, b, c: cc };
}

function validFormula(expr) {
  if (typeof expr !== "string" || expr.length > 320) return false;
  try {
    parse(expr);
    return true;
  } catch {
    return false;
  }
}

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const num = (v, lo, hi, fb) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fb);
  const formula = raw.formula && validFormula(raw.formula.expr)
    ? { name: String(raw.formula.name || "AI").slice(0, 40), expr: raw.formula.expr.trim(), surface: SURFACES.includes(raw.formula.surface) ? raw.formula.surface : "flat" }
    : null;
  return {
    scene: SCENE_IDS.includes(raw.scene) ? raw.scene : formula ? "ai" : "torus",
    formula,
    palette: typeof raw.palette === "string" ? raw.palette.slice(0, 24) : "custom",
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : "",
    colors: sanitizeColors(raw.colors || {}),
    style: STYLES.includes(raw.style) ? raw.style : "halftone",
    shape: SHAPES.includes(raw.shape) ? raw.shape : "circle",
    clockStyle: CLOCKS.includes(raw.clockStyle) ? raw.clockStyle : "light",
    clockPos: CLOCK_POS.includes(raw.clockPos) ? raw.clockPos : "bl",
    clockSize: CLOCK_SIZES.includes(raw.clockSize) ? raw.clockSize : "m",
    cell: Math.round(num(raw.cell, 10, 24, 14)),
    speed: num(raw.speed, 0.2, 2.5, 1),
    idle: IDLES.includes(+raw.idle) ? +raw.idle : 3,
    full: raw.full !== false,
    interact: raw.interact !== false,
    wake: raw.wake !== false,
    burnin: raw.burnin !== false,
    eco: raw.eco === true,
  };
}

// Models answer in different envelopes (Workers AI text, Chat Completions, Responses API).
function modelText(out) {
  if (!out) return "";
  if (out.response !== undefined) return out.response;
  if (out.choices && out.choices[0]) return out.choices[0].message?.content ?? "";
  if (typeof out.output_text === "string") return out.output_text;
  if (Array.isArray(out.output)) {
    return out.output
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content || [])
      .map((c) => c.text || "")
      .join("");
  }
  return out;
}
function parseModelOutput(out) {
  const r = modelText(out);
  if (r && typeof r === "object") return r;
  if (typeof r === "string") {
    const m = r.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  }
  throw new Error("unparseable");
}

async function callModel(env, messages, attempt) {
  // A reasoning model writes far more varied formulas; Llama is the fallback.
  if (attempt < 2) {
    try {
      const out = await env.AI.run(MODEL, { messages, reasoning: { effort: "low" }, max_tokens: 4000 });
      return parseModelOutput(out);
    } catch (e) {
      if (attempt < 1) throw e;
    }
  }
  const out = await env.AI.run(FALLBACK_MODEL, {
    messages,
    response_format: { type: "json_schema", json_schema: THEME_SCHEMA },
    max_tokens: 400,
    temperature: 0.8,
  });
  return parseModelOutput(out);
}

// One candidate: the model iterates, each rejected formula going back with the validator's reason.
async function candidate(env, prompt, seed) {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Keyword: "${prompt}"\n${seed}` },
  ];
  let lastError = "no output";
  for (let attempt = 0; attempt < 3; attempt++) {
    let parsed;
    try {
      parsed = await callModel(env, messages, attempt);
    } catch (e) {
      lastError = String((e && e.message) || e);
      continue;
    }
    const expr = typeof parsed.expr === "string" ? parsed.expr.trim().replace(/;$/, "") : "";
    const verdict = check(expr, { allowCodegen: false });
    if (verdict.ok) return { parsed, expr, verdict };
    lastError = verdict.error;
    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    messages.push({ role: "user", content: `That formula was rejected: ${verdict.error}. Fix it and return the full JSON again, still evoking "${prompt}".` });
  }
  throw new Error(lastError);
}

// Each candidate gets a different creative brief so the three explore different ideas.
const SEEDS = [
  "Interpret the keyword literally: show the thing itself as a clear silhouette or object.",
  "Interpret the keyword through its motion or rhythm rather than its shape.",
  "Interpret the keyword abstractly, like a Swiss poster: geometry, repetition and negative space.",
];

async function theme(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 120) : "";
  if (!prompt) return json({ error: "empty_prompt" }, 400);

  // Several candidates in parallel; the validator's aesthetic score picks the winner. Once one passes,
  // the others get a short grace period instead of holding the answer hostage to the slowest.
  const { ok, errors } = await new Promise((resolve) => {
    const ok = [], errors = [];
    let pending = CANDIDATES, timer = null;
    const finish = () => { clearTimeout(timer); resolve({ ok: ok.slice(), errors }); };
    for (const seed of SEEDS.slice(0, CANDIDATES)) {
      candidate(env, prompt, seed)
        .then((r) => { ok.push(r); if (!timer) timer = setTimeout(finish, GRACE_MS); })
        .catch((e) => errors.push(String((e && e.message) || e)))
        .finally(() => { if (--pending === 0) finish(); });
    }
  });
  if (!ok.length) return json({ error: "ai_failed", detail: errors.join(" | ") }, 502);
  ok.sort((a, b) => b.verdict.score - a.verdict.score);
  const { parsed, expr, verdict } = ok[0];
  return json({
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : prompt.slice(0, 40),
    idea: typeof parsed.idea === "string" ? parsed.idea.slice(0, 200) : "",
    surface: SURFACES.includes(parsed.surface) ? parsed.surface : "flat",
    expr,
    speed: Math.min(1.6, Math.max(0.4, Number.isFinite(+parsed.speed) ? +parsed.speed : 1)),
    colors: sanitizeColors(parsed),
    score: Math.round(verdict.score * 100) / 100,
    candidates: ok.length,
  });
}

const ID_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newId(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("");
}

async function savePreset(req, env) {
  const text = await req.text();
  if (text.length > 6144) return json({ error: "too_large" }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const config = sanitizeConfig(body.config);
  if (!config) return json({ error: "bad_request" }, 400);
  const id = newId();
  await env.PRESETS.put(id, JSON.stringify({ config, created: Date.now() }), { expirationTtl: 60 * 60 * 24 * 365 });
  return json({ id }, 201);
}

async function loadPreset(id, env) {
  const v = await env.PRESETS.get(id);
  if (!v) return json({ error: "not_found" }, 404);
  return json(JSON.parse(v), 200, { "cache-control": "public, max-age=300" });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/theme") {
      return req.method === "POST" ? theme(req, env) : json({ error: "method_not_allowed" }, 405);
    }
    if (pathname === "/api/presets") {
      return req.method === "POST" ? savePreset(req, env) : json({ error: "method_not_allowed" }, 405);
    }
    const m = pathname.match(/^\/api\/presets\/([A-Za-z0-9]{6,16})$/);
    if (m) return req.method === "GET" ? loadPreset(m[1], env) : json({ error: "method_not_allowed" }, 405);
    if (pathname === "/api/health") return json({ ok: true });
    if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
