import { check, parse, SCENE_IDS, CLOCK_STYLES } from "../public/formula.js";

const SHAPES = ["square", "circle"];
const STYLES = ["halftone", "dither"];
const CLOCKS = [...CLOCK_STYLES, "off"];
const IDLES = [0, 1, 3, 5, 10];
const HEX = /^#[0-9a-f]{6}$/i;
const MODEL = "@cf/openai/gpt-oss-120b";
const FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const THEME_SCHEMA = {
  type: "object",
  properties: {
    idea: { type: "string" },
    name: { type: "string" },
    expr: { type: "string" },
    speed: { type: "number" },
    bg: { type: "string" },
    a: { type: "string" },
    b: { type: "string" },
    c: { type: "string" },
  },
  required: ["name", "expr", "speed", "bg", "a", "b", "c"],
};

const SYSTEM = `You are a generative artist who designs animated dot-matrix patterns (in the spirit of tixy.land) for a minimal screensaver.
For the user's keyword, invent ONE original pattern formula and a color palette. Return only a JSON object: {"idea","name","expr","speed","bg","a","b","c"}.

The formula "expr" is evaluated for every dot, every frame. Its result is clamped to -1..1:
- 0 = empty dot, 1 = big accent/soft dot, -1 = big dark ink dot. Magnitude is dot size.
Variables: x, y (integer grid position), w, h (grid size), u (-aspect..aspect, left→right), v (-1..1, top→bottom),
r = distance from center, a = angle around center (-pi..pi), t = seconds, i = dot index, mx, my = pointer position in u/v space.
Constants: pi, tau, e. Operators: + - * / % ^ (power), comparisons < > <= >= == != (give 1 or 0), && ||, cond ? x : y.
Functions: sin cos tan asin acos atan atan2 sqrt abs floor ceil round fract sign min max pow exp log mod clamp mix step smoothstep hypot noise(x,y,z) (smooth 0..1) hash(x,y) (random 0..1).
Rules: no other names exist. Must animate with t. Keep under 220 characters. Use a*integer for angular symmetry.
Composition: restraint looks refined. Most dots must stay empty (value near 0); the motif should cover roughly 15-60% of the field, never fill it.

Think like a motion designer first: in "idea", describe in one sentence what the viewer sees (shape, rhythm, motion) that evokes the keyword.
Then build it from fitting techniques, combining two or three:
- moving points / orbits: 1 - hypot(u - X(t), v - Y(t))*k
- falling or rising streaks per column: fract(y*k + t*s + hash(x, 0))
- grids, tiles, checkers: floor(), mod(), fract() of x, y
- polar petals / stars: cos(a*k) compared with r
- stripes and bands: sin(u*k + t), step(), smoothstep()
- organic fields: noise(u*k, v*k, t*s)
- pulses: sin(t*k) scaling a shape; masks: smoothstep(edge, edge+0.05, value)
- negative values (ink) for shadows, outlines or a second layer
Avoid the generic "sin(a*k + r*k - t)" swirl unless the keyword is literally a spiral.

Examples of the style (do NOT copy, create something new):
- ripples: sin(r*14 - t*3) * (1.2 - r)
- spiral arms: sin(a*3 + r*10 - t*2) * smoothstep(1.3, 0.1, r)
- rain streaks: fract(y*0.08 + t*0.9 + hash(x, 1)) > 0.9 ? 1 : 0
- beating heart: (pow(u*u + pow(-v*1.2 + 0.3*sqrt(abs(u)), 2) - 0.35*(1 + 0.12*sin(t*6)), 1) < 0) ? 1 : -0.15*sin(r*20 - t*4)
- drifting clouds: noise(u*2 + t*0.2, v*2, t*0.3)*2.4 - 1.2
- orbiting bodies: max(0, 1 - min(hypot(u - cos(t)*0.6, v - sin(t)*0.6), hypot(u + cos(t*1.3)*0.4, v + sin(t*1.3)*0.4))*2.5)

Palette: bg = very light tint of the theme hue (lightness > 92%, not pure white); a = vivid accent; b = deep dark color; c = soft mid tone. All #rrggbb.
name = 1-3 words in the same language as the keyword. speed = 0.4 (calm) to 1.8 (energetic).`;

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
    ? { name: String(raw.formula.name || "AI").slice(0, 40), expr: raw.formula.expr.trim() }
    : null;
  return {
    scene: SCENE_IDS.includes(raw.scene) ? raw.scene : formula ? "ai" : "koi",
    formula,
    palette: typeof raw.palette === "string" ? raw.palette.slice(0, 24) : "custom",
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : "",
    colors: sanitizeColors(raw.colors || {}),
    style: STYLES.includes(raw.style) ? raw.style : "halftone",
    shape: SHAPES.includes(raw.shape) ? raw.shape : "circle",
    clockStyle: CLOCKS.includes(raw.clockStyle) ? raw.clockStyle : "dot",
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
  if (attempt < 3) {
    try {
      const out = await env.AI.run(MODEL, { messages, reasoning: { effort: "low" }, max_tokens: 4000 });
      return parseModelOutput(out);
    } catch (e) {
      if (attempt < 2) throw e;
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

async function theme(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 120) : "";
  if (!prompt) return json({ error: "empty_prompt" }, 400);

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Keyword: "${prompt}"` },
  ];
  let lastError = "no output";
  // The model iterates: each rejected formula goes back with the validator's reason.
  for (let attempt = 0; attempt < 4; attempt++) {
    let parsed;
    try {
      parsed = await callModel(env, messages, attempt);
    } catch (e) {
      lastError = String((e && e.message) || e);
      continue;
    }
    const expr = typeof parsed.expr === "string" ? parsed.expr.trim().replace(/;$/, "") : "";
    const verdict = check(expr, { allowCodegen: false });
    if (verdict.ok) {
      return json({
        name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : prompt.slice(0, 40),
        expr,
        speed: Math.min(1.8, Math.max(0.4, Number.isFinite(+parsed.speed) ? +parsed.speed : 1)),
        colors: sanitizeColors(parsed),
      });
    }
    lastError = verdict.error;
    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    messages.push({ role: "user", content: `That formula was rejected: ${verdict.error}. Fix it and return the full JSON again, still evoking "${prompt}".` });
  }
  return json({ error: "ai_failed", detail: lastError }, 502);
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
