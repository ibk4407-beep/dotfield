const SCENES = ["koi", "wave", "rain", "flow", "life"];
const SHAPES = ["square", "circle"];
const IDLES = [0, 1, 3, 5, 10];
const HEX = /^#[0-9a-f]{6}$/i;
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const THEME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    scene: { type: "string", enum: SCENES },
    speed: { type: "number" },
    bg: { type: "string" },
    a: { type: "string" },
    b: { type: "string" },
    c: { type: "string" },
  },
  required: ["name", "scene", "speed", "bg", "a", "b", "c"],
};

const SYSTEM = `You design color themes for a dot-matrix screensaver with a light, white-based UI.
Return JSON only: {"name","scene","speed","bg","a","b","c"}.
- name: 1-3 words in the user's language describing the theme.
- scene: one of koi (koi fish pond), wave (interference waves), rain (rain drops and ripples), flow (particle flow field), life (cellular automaton).
- speed: 0.4 (calm) to 2.0 (energetic).
- bg: a very light tint of the theme's hue (lightness above 92%, never pure #ffffff).
- a: the main vivid accent hex color.
- b: a deep, dark hex color that contrasts strongly with bg.
- c: a soft mid-tone hex color that harmonizes with a.
All colors are #rrggbb.`;

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
  let bg = pick(c.bg, "#f4f5f7");
  // The UI is white glass, so the field stays light whatever the model says.
  for (let i = 0; i < 6 && lum(bg) < 0.9; i++) bg = mix(bg, "#ffffff", 0.45);
  let b = pick(c.b, "#20242c");
  for (let i = 0; i < 6 && lum(b) > 0.35; i++) b = mix(b, "#000000", 0.35);
  const a = pick(c.a, "#ff5a1f");
  const cc = pick(c.c, mix(a, bg, 0.5));
  return { bg, base: mix(bg, b, 0.11), a, b, c: cc };
}

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const num = (v, lo, hi, fb) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : fb);
  return {
    scene: SCENES.includes(raw.scene) ? raw.scene : "koi",
    palette: typeof raw.palette === "string" ? raw.palette.slice(0, 24) : "custom",
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : "",
    colors: sanitizeColors(raw.colors || {}),
    cell: Math.round(num(raw.cell, 10, 24, 14)),
    speed: num(raw.speed, 0.2, 2.5, 1),
    shape: SHAPES.includes(raw.shape) ? raw.shape : "square",
    idle: IDLES.includes(+raw.idle) ? +raw.idle : 3,
    clock: raw.clock !== false,
    full: raw.full !== false,
    interact: raw.interact !== false,
  };
}

function parseModelOutput(out) {
  const r = out && out.response !== undefined ? out.response : out;
  if (r && typeof r === "object") return r;
  if (typeof r === "string") {
    const m = r.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  }
  throw new Error("unparseable");
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

  let parsed;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const out = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Theme keyword: "${prompt}"\nDesign colors that clearly evoke this keyword. The "name" must be a short title in the same language as the keyword (Japanese keyword → Japanese name).`,
          },
        ],
        response_format: { type: "json_schema", json_schema: THEME_SCHEMA },
        max_tokens: 256,
        temperature: 0.8,
      });
      parsed = parseModelOutput(out);
    } catch (e) {
      if (attempt === 1) return json({ error: "ai_failed", detail: String(e && e.message || e) }, 502);
    }
  }

  return json({
    name: typeof parsed.name === "string" ? parsed.name.slice(0, 40) : prompt.slice(0, 40),
    scene: SCENES.includes(parsed.scene) ? parsed.scene : "flow",
    speed: Math.min(2, Math.max(0.4, Number.isFinite(+parsed.speed) ? +parsed.speed : 1)),
    colors: sanitizeColors(parsed),
  });
}

const ID_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newId(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("");
}

async function savePreset(req, env) {
  const text = await req.text();
  if (text.length > 4096) return json({ error: "too_large" }, 413);
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
    const url = new URL(req.url);
    const { pathname } = url;
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
