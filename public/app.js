import { Engine, drawDots, drawFree, hexToRgb } from "./engine.js";
import { CATALOG as CLASSIC, AI_ICON, Formula } from "./scenes.js";
import { STUDIO, FormulaSurface } from "./scenes3d.js";
import { OBJECTS } from "./objects.js";
import { GALLERY } from "./gallery.js";
import { MOTION } from "./motion.js";
import { SOUND } from "./sound.js";
import { SATIN } from "./satin.js";
import { pictures, reloadPictures, addPicture, removePicture, picOpts, pictureEntry } from "./picture.js";
import { sound } from "./audio.js";
import { compile, CLOCK_STYLES, CLOCK_POS, CLOCK_SIZES, SURFACES } from "./formula.js";
import { buildClockMask, FACE_FONTS } from "./clock.js";

const CATALOG = [...OBJECTS.map((s) => ({ ...s, group: "objects" })), ...SATIN, ...SOUND, ...MOTION, ...GALLERY, ...STUDIO.map((s) => ({ ...s, group: "studio" })), ...CLASSIC.map((s) => ({ ...s, group: "classic" }))];
const CLOCK_LABELS = { light: "Light", orbit: "Orbit", dot: "Dot", serif: "Serif", grotesk: "Grotesk", mono: "Mono", condensed: "Condensed", seg: "Segment", analog: "Analog", railway: "Railway", ring: "Ring", word: "Word", progress: "Progress", binary: "Binary", full: "Date", off: "Off" };

const PALETTES = {
  graphite: { name: "Graphite", bg: "#f3f3f1", base: "#dcdcd8", a: "#ff4f1a", b: "#1c1c1e", c: "#a3a3a0" },
  signal: { name: "Signal", bg: "#f2f2f2", base: "#dadada", a: "#d71921", b: "#111111", c: "#b4b4b4" },
  ocean: { name: "Ocean", bg: "#f1f4f8", base: "#d6dde8", a: "#2563eb", b: "#0b1f3a", c: "#93b1e0" },
  moss: { name: "Moss", bg: "#f3f5f0", base: "#d9e0d2", a: "#2f9e57", b: "#173a22", c: "#a6cfa0" },
  sakura: { name: "Sakura", bg: "#faf4f5", base: "#ecdde0", a: "#e2557f", b: "#3a1e29", c: "#f0b6c5" },
  amber: { name: "Amber", bg: "#f7f5ef", base: "#e5e0d1", a: "#f29900", b: "#211c12", c: "#d3c49b" },
  lilac: { name: "Lilac", bg: "#f6f5fa", base: "#e0ddee", a: "#8b5cf6", b: "#2a2150", c: "#c4b5f5" },
  mono: { name: "Mono", bg: "#f4f4f4", base: "#dcdcdc", a: "#3a3a3a", b: "#111111", c: "#9b9b9b" },
};
const HEX = /^#[0-9a-f]{6}$/i;
const IDLES = [0, 1, 3, 5, 10];
const SHUFFLES = [1, 3, 5, 10, 30];
const REACTS = [0.5, 1, 1.6];
const CLOCKS = [...CLOCK_STYLES, "off"];
const STORE_KEY = "dotfield:v1";
const DEFAULTS = {
  scene: "torus", palette: "graphite", name: "", colors: strip(PALETTES.graphite),
  theme: "auto", style: "halftone", shape: "circle", clockStyle: "light", clockPos: "bl", clockSize: "m",
  cell: 14, speed: 1, idle: 3, full: true, interact: true,
  wake: true, burnin: true, eco: false, customScenes: [], react: 1, soundSource: "system", picColor: "original", shuffleScene: false, shufflePalette: false, shuffleEvery: 5,
};
const DISPLAY = new URLSearchParams(location.search).has("display");

function strip(p) {
  const { bg, base, a, b, c } = p;
  return { bg, base, a, b, c };
}
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const svg = (inner) => `<svg viewBox="0 0 24 24">${inner}</svg>`;

/* ---------- Color ---------- */
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const mixHex = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
// Light palettes are the source of truth; dark mode derives a matching night version.
function toDark(c) {
  const [bh, bs] = toHsl(hexToRgb(c.bg));
  const bg = hslHex(bh, Math.min(bs, 0.18), 0.055);
  const [ih, is] = toHsl(hexToRgb(c.b));
  const b = hslHex(ih, Math.min(is, 0.25), 0.92);
  const [ah, as, al] = toHsl(hexToRgb(c.a));
  const a = hslHex(ah, as, Math.min(0.66, Math.max(0.52, al)));
  const [ch, cs, cl] = toHsl(hexToRgb(c.c));
  const cc = hslHex(ch, cs, Math.min(0.48, Math.max(0.3, cl * 0.62)));
  return { bg, base: mixHex(bg, "#ffffff", 0.1), a, b, c: cc };
}

/* ---------- State ---------- */
function normalize(s) {
  const n = { ...DEFAULTS, ...s };
  const c = n.colors || {};
  n.colors = ["bg", "base", "a", "b", "c"].every((k) => HEX.test(c[k] || "")) ? strip(c) : strip(PALETTES.graphite);
  if (n.palette !== "custom" && !PALETTES[n.palette]) n.palette = "custom";
  n.customScenes = (Array.isArray(n.customScenes) ? n.customScenes : [])
    .filter((x) => x && typeof x.id === "string" && typeof x.expr === "string" && /^ai:[a-z0-9]{4,12}$/.test(x.id))
    .slice(0, 16)
    .map((x) => ({ id: x.id, name: String(x.name || "AI").slice(0, 40), expr: x.expr.slice(0, 320), surface: SURFACES.includes(x.surface) ? x.surface : "flat" }));
  if (!CATALOG.some((x) => x.id === n.scene) && !n.customScenes.some((x) => x.id === n.scene) && !pictures.some((x) => x.id === n.scene)) n.scene = DEFAULTS.scene;
  if (!["original", "palette"].includes(n.picColor)) n.picColor = "original";
  if (!["auto", "light", "dark"].includes(n.theme)) n.theme = "auto";
  if (!["halftone", "dither"].includes(n.style)) n.style = "halftone";
  if (!["square", "circle"].includes(n.shape)) n.shape = "circle";
  if (!CLOCKS.includes(n.clockStyle)) n.clockStyle = s && s.clock === false ? "off" : DEFAULTS.clockStyle;
  if (!CLOCK_POS.includes(n.clockPos)) n.clockPos = DEFAULTS.clockPos;
  if (!CLOCK_SIZES.includes(n.clockSize)) n.clockSize = DEFAULTS.clockSize;
  n.cell = Math.min(24, Math.max(10, Math.round(+n.cell) || 14));
  n.speed = Math.min(2.5, Math.max(0.2, +n.speed || 1));
  n.idle = IDLES.includes(+n.idle) ? +n.idle : 3;
  n.shuffleEvery = SHUFFLES.includes(+n.shuffleEvery) ? +n.shuffleEvery : 5;
  n.shuffleScene = n.shuffleScene === true;
  n.shufflePalette = n.shufflePalette === true;
  for (const k of ["full", "interact", "wake", "burnin"]) n[k] = n[k] !== false;
  n.eco = n.eco === true;
  n.react = REACTS.includes(+n.react) ? +n.react : 1;
  if (!["system", "mic"].includes(n.soundSource)) n.soundSource = "system";
  n.name = typeof n.name === "string" ? n.name.slice(0, 40) : "";
  delete n.clock;
  return n;
}
const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
};
const save = () => {
  if (DISPLAY) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
};

let state = normalize(load());
const engine = new Engine($("#field"));
engine.sound = sound;
const mq = matchMedia("(prefers-color-scheme: dark)");
const isDark = () => state.theme === "dark" || (state.theme === "auto" && mq.matches);
const viewColors = (c = state.colors) => (isDark() ? toDark(c) : c);
const bc = "BroadcastChannel" in window ? new BroadcastChannel("dotfield") : null;

const makeFormula = (expr, surface) => () => (surface && surface !== "flat" ? new FormulaSurface(expr, surface) : new Formula(expr));
function sceneEntry(id = state.scene) {
  const builtin = CATALOG.find((x) => x.id === id);
  if (builtin) return builtin;
  const pic = pictures.find((x) => x.id === id);
  if (pic) return pictureEntry(pic);
  const cs = state.customScenes.find((x) => x.id === id);
  if (cs) return { id: cs.id, name: cs.name, icon: AI_ICON, expr: cs.expr + cs.surface, make: makeFormula(cs.expr, cs.surface) };
  return CATALOG[0];
}
const allScenes = () => [...pictures.map((x) => x.id), ...CATALOG.map((x) => x.id), ...state.customScenes.map((x) => x.id)];

let currentSceneKey = null;
function apply({ instant = false } = {}) {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const vc = viewColors();
  engine.setColors(vc, instant);
  engine.setCell(state.cell);
  engine.speed = state.speed;
  engine.shape = state.shape;
  engine.style = state.style;
  engine.interact = state.interact && !DISPLAY;
  engine.maxFps = state.eco ? 30 : 60;
  engine.burnin = state.burnin;
  engine.react = state.react;
  picOpts.color = state.picColor;
  engine.clockStyle = state.clockStyle === "off" ? "light" : state.clockStyle;
  engine.clockPos = state.clockPos;
  engine.clockSize = state.clockSize;
  engine.setOverlay(saver && state.clockStyle !== "off");
  const entry = sceneEntry();
  const key = entry.id + (entry.expr || "");
  if (currentSceneKey !== key) {
    try {
      engine.setScene(entry.make, instant);
    } catch {
      engine.setScene(CATALOG[0].make, instant);
    }
    currentSceneKey = key;
    updateSceneChip(entry);
  }
  document.documentElement.style.setProperty("--bg", vc.bg);
  document.documentElement.style.setProperty("--accent", vc.a);
  $('meta[name="theme-color"]').content = vc.bg;
  syncControls();
  syncWake();
}

function update(patch, { local = false, ...opts } = {}) {
  const themeBefore = isDark();
  state = normalize({ ...state, ...patch });
  apply(opts);
  if (local) return;
  save();
  if (bc) bc.postMessage({ type: "state", state });
  if (themeBefore !== isDark() || "colors" in patch || "customScenes" in patch) {
    renderSwatches();
    renderSceneGrids();
  }
}
mq.addEventListener("change", () => { apply(); renderSwatches(); });
if (bc) bc.onmessage = (e) => {
  if (e.data && e.data.type === "audio") { if (DISPLAY) sound.feed(e.data.frame); return; }
  if (e.data && e.data.type === "state") {
    state = normalize(e.data.state);
    apply();
    renderSwatches();
    renderSceneGrids();
  }
};

/* ---------- Segmented controls ---------- */
function moveSeg(seg, value, animate = true) {
  const btns = [...seg.querySelectorAll(".seg-btn")];
  const btn = btns.find((b) => b.dataset.v === String(value));
  btns.forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"));
  const ind = seg.querySelector(".seg-ind");
  if (!btn || !btn.offsetWidth) return;
  const x = btn.offsetLeft, w = btn.offsetWidth;
  if (ind.dataset.x && ind.dataset.x !== String(x) && animate) {
    ind.classList.remove("stretch");
    void ind.offsetWidth;
    ind.classList.add("stretch");
  }
  ind.dataset.x = x;
  ind.style.width = w + "px";
  ind.style.transform = `translateX(${x}px)`;
}
const bindSeg = (seg, onPick) => seg.addEventListener("click", (e) => {
  const b = e.target.closest(".seg-btn");
  if (b) onPick(b.dataset.v);
});

const clockPosSeg = $("#clockPosSeg"), clockSizeSeg = $("#clockSizeSeg");
const soundSrcSeg = $("#soundSrcSeg"), reactSeg = $("#reactSeg"), picColorSeg = $("#picColorSeg");
const shuffleSeg = $("#shuffleSeg");
const themeSeg = $("#themeSeg"), styleSeg = $("#styleSeg"), shapeSeg = $("#shapeSeg"), idleSeg = $("#idleSeg");
const cellIn = $("#cell"), speedIn = $("#speed");
const setRangeFill = (el) => el.style.setProperty("--p", ((el.value - el.min) / (el.max - el.min)) * 100 + "%");

function syncControls() {
  moveSeg(themeSeg, state.theme);
  moveSeg(styleSeg, state.style);
  moveSeg(shapeSeg, state.shape);
  moveSeg(idleSeg, state.idle);
  moveSeg(shuffleSeg, state.shuffleEvery);
  $("#optShuffleScene").checked = state.shuffleScene;
  $("#optShufflePalette").checked = state.shufflePalette;
  shuffleSeg.classList.toggle("off", !state.shuffleScene && !state.shufflePalette);
  moveSeg(clockPosSeg, state.clockPos);
  moveSeg(clockSizeSeg, state.clockSize);
  moveSeg(soundSrcSeg, state.soundSource);
  moveSeg(reactSeg, state.react);
  moveSeg(picColorSeg, state.picColor);
  $("#optSound").checked = sound.on;
  cellIn.value = state.cell;
  speedIn.value = state.speed;
  setRangeFill(cellIn);
  setRangeFill(speedIn);
  $("#cellOut").textContent = state.cell + "px";
  $("#speedOut").textContent = state.speed.toFixed(1) + "×";
  $("#optFull").checked = state.full;
  $("#optInteract").checked = state.interact;
  $("#optWake").checked = state.wake;
  $("#optBurnin").checked = state.burnin;
  $("#optEco").checked = state.eco;
  $$(".swatch").forEach((s) => s.setAttribute("aria-pressed", String(s.dataset.k === state.palette)));
  $$(".clock-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state.clockStyle)));
  $$(".scene-card").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === state.scene)));
}

bindSeg(themeSeg, (v) => update({ theme: v }));
bindSeg(styleSeg, (v) => update({ style: v }));
bindSeg(shapeSeg, (v) => update({ shape: v }));
bindSeg(idleSeg, (v) => update({ idle: +v }));
bindSeg(shuffleSeg, (v) => { update({ shuffleEvery: +v }); shuffleAt = 0; });
bindSeg(clockPosSeg, (v) => { update({ clockPos: v }); previewClock(); });
bindSeg(soundSrcSeg, (v) => {
  update({ soundSource: v });
  if (sound.on && sound.source && sound.source !== v) startSound();
});
bindSeg(reactSeg, (v) => update({ react: +v }));
bindSeg(picColorSeg, (v) => update({ picColor: v }));
bindSeg(clockSizeSeg, (v) => { update({ clockSize: v }); previewClock(); });

let customColors = null;
function renderSwatches() {
  if (state.palette === "custom") customColors = { ...state.colors, name: state.name || "AI" };
  const list = Object.entries(PALETTES);
  if (customColors) list.push(["custom", customColors]);
  $("#swatches").innerHTML = list
    .map(([k, p]) => {
      const v = viewColors(strip(p));
      return `<button class="swatch" data-k="${k}" aria-pressed="${state.palette === k}" style="--sw-bg:${v.bg};--sw-ink:${v.b}" title="${escapeHtml(p.name || k)}">
      <span class="dots"><i style="background:${v.a}"></i><i style="background:${v.b}"></i><i style="background:${v.c}"></i></span>
      <span class="nm">${escapeHtml(p.name || k)}</span></button>`;
    })
    .join("");
}
$("#swatches").addEventListener("click", (e) => {
  const b = e.target.closest(".swatch");
  if (!b) return;
  const k = b.dataset.k;
  const p = k === "custom" ? customColors : PALETTES[k];
  update({ palette: k, colors: strip(p), name: k === "custom" ? p.name : state.name });
});

let cellTimer;
cellIn.addEventListener("input", () => {
  setRangeFill(cellIn);
  $("#cellOut").textContent = cellIn.value + "px";
  clearTimeout(cellTimer);
  cellTimer = setTimeout(() => update({ cell: +cellIn.value }), 90);
});
speedIn.addEventListener("input", () => update({ speed: +speedIn.value }));
for (const [id, key] of [["optShuffleScene", "shuffleScene"], ["optShufflePalette", "shufflePalette"], ["optFull", "full"], ["optInteract", "interact"], ["optWake", "wake"], ["optBurnin", "burnin"], ["optEco", "eco"]]) {
  $("#" + id).addEventListener("change", (e) => update({ [key]: e.target.checked }));
}
$("#btnReset").addEventListener("click", () => {
  const keep = state.customScenes;
  state = normalize({ customScenes: keep });
  customColors = null;
  apply();
  save();
  renderSwatches();
  renderSceneGrids();
  toast("リセットしました");
});

/* ---------- Clock style picker ---------- */
const clockGrid = $("#clockGrid");
clockGrid.innerHTML = CLOCKS.map((k) => `<button class="clock-opt" data-v="${k}">${k === "off"
  ? `<span class="off-ic">${svg('<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>')}</span>`
  : "<canvas></canvas>"}<span>${CLOCK_LABELS[k]}</span></button>`).join("");
function renderClockPreviews() {
  const v = viewColors(), rgb = Object.fromEntries(Object.entries(v).map(([k, h]) => [k, hexToRgb(h)]));
  const cols = 64, rows = 36, now = new Date();
  for (const btn of $$(".clock-opt")) {
    const cv = btn.querySelector("canvas");
    if (!cv) continue;
    const { tone, alpha } = buildClockMask(btn.dataset.v, cols, rows, now, { x: 0, y: 0 });
    const img = new Uint8ClampedArray(cols * rows * 4);
    for (let j = 0; j < tone.length; j++) {
      const m = tone[j];
      if (m !== 1 && m !== 3 && m !== 4) continue;
      const col = m === 1 ? rgb.b : m === 3 ? rgb.a : rgb.c;
      img.set([col[0], col[1], col[2], m === 4 ? 110 : alpha[j] * 255], j * 4);
    }
    cv.width = cols * 4; cv.height = rows * 4;
    drawDots(cv.getContext("2d"), img, cols, rows, 4, rgb, state.shape, "halftone");
  }
}
$("#clockGrid").addEventListener("click", (e) => {
  const b = e.target.closest(".clock-opt");
  if (!b) return;
  update({ clockStyle: b.dataset.v });
  if (b.dataset.v !== "off") previewClock();
});
// Briefly show the chosen face over the field.
let previewTimer;
function previewClock() {
  if (saver) return;
  engine.setOverlay(true);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (!saver) engine.setOverlay(false); }, 1800);
}

/* ---------- Live previews (scene cards, AI result) ---------- */
const thumbs = new Map();
let thumbLast = 0, thumbTimer = 0;
function addThumb(canvas, make) {
  const cols = 28, rows = 18, cell = 10;
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const low = document.createElement("canvas");
  low.width = cols; low.height = rows;
  const A = { thumb: true, cols, rows, w: canvas.width, h: canvas.height, cell: Math.max(2.6, canvas.width / 80), t: Math.random() * 10, pal: engine.A.pal, rgb: engine.A.rgb, pointer: { x: -99, y: -99, px: -99, py: -99, active: false }, ripples: [] };
  // The scene is built the first time its card scrolls into view.
  thumbs.set(canvas, { make, scene: null, A, low, lctx: low.getContext("2d", { willReadFrequently: true }), ctx: canvas.getContext("2d"), cell });
  if (!thumbTimer) { thumbLast = performance.now(); thumbTimer = setInterval(tickThumbs, 1000 / 24); }
}
function clearThumbs(filter = () => true) {
  for (const k of [...thumbs.keys()]) if (filter(k)) thumbs.delete(k);
  if (!thumbs.size && thumbTimer) { clearInterval(thumbTimer); thumbTimer = 0; }
}
// Only previews in view are drawn, round-robin within a small time budget, so a panel full of
// 3D thumbnails never starves the main field.
let thumbCursor = 0;
function tickThumbs() {
  const now = performance.now();
  thumbLast = now;
  const list = [...thumbs];
  let n = 0;
  for (; n < list.length && performance.now() - now < 10; n++) {
    const [canvas, th] = list[(thumbCursor + n) % list.length];
    if (!canvas.isConnected) { thumbs.delete(canvas); continue; }
    const r = canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
    if (!th.scene) {
      try { th.scene = th.make(); th.scene.init(th.A); } catch { thumbs.delete(canvas); continue; }
    }
    const dt = Math.min(0.25, (now - (th.last || now)) / 1000) * state.speed;
    th.last = now;
    th.A.t += dt;
    if (th.scene.paint) {
      th.scene.update(dt, th.A);
      th.scene.paint(th.ctx, th.A);
      continue;
    }
    if (th.scene.free) {
      th.scene.update(dt, th.A);
      drawFree(th.ctx, th.scene.points(th.A), th.A.w, th.A.h, engine.A.rgb, state.shape);
      continue;
    }
    if (!th.scene.persist) th.lctx.clearRect(0, 0, th.A.cols, th.A.rows);
    th.scene.update(dt, th.A);
    th.scene.draw(th.lctx, th.A);
    drawDots(th.ctx, th.lctx.getImageData(0, 0, th.A.cols, th.A.rows).data, th.A.cols, th.A.rows, th.cell, engine.A.rgb, state.shape, state.style);
  }
  // Pick up next tick where this one ran out of time.
  thumbCursor = list.length ? (thumbCursor + n) % list.length : 0;
}

/* ---------- Scene panel ---------- */
const aiSceneGrid = $("#aiSceneGrid");
function card(entry, i, deletable) {
  return `<button class="scene-card" data-id="${entry.id}" style="--i:${i}" aria-pressed="${entry.id === state.scene}">
    <canvas></canvas><span class="nm">${escapeHtml(entry.name)}<small>${i < 9 && !deletable ? i + 1 : ""}</small></span>
    ${deletable ? `<span class="del" data-del="${entry.id}" role="button" aria-label="削除">${svg('<path d="M6 6l12 12M18 6L6 18"/>')}</span>` : ""}
  </button>`;
}
function renderSceneGrids() {
  if (!panels.scenes.classList.contains("open")) return;
  clearThumbs((c) => c.closest("#panelScenes"));
  // Only the first nine objects carry a number key.
  for (const grid of $$("#panelScenes [data-group]")) {
    grid.innerHTML = CATALOG.filter((e) => e.group === grid.dataset.group).map((e, i) => card(e, grid.dataset.group === "objects" ? i : 99, false)).join("");
  }
  $("#picGrid").innerHTML = pictures.map((p, i) => card(pictureEntry(p), i, true)).join("") +
    `<button class="scene-card add-card" id="picAdd"><span class="add-face">${svg('<path d="M12 5v14M5 12h14"/>')}画像を追加</span><span class="nm">ドロップでも追加</span></button>`;
  requestAnimationFrame(() => moveSeg(picColorSeg, state.picColor, false));
  const custom = state.customScenes.map((c) => sceneEntry(c.id));
  $("#aiScenesField").hidden = !custom.length;
  aiSceneGrid.innerHTML = custom.map((e, i) => card(e, i, true)).join("");
  for (const el of $$("#panelScenes .scene-card[data-id]")) addThumb(el.querySelector("canvas"), sceneEntry(el.dataset.id).make);
}
$("#panelScenes").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    const id = del.dataset.del;
    if (id.startsWith("pic:")) {
      removePicture(id);
      update({ scene: state.scene === id ? DEFAULTS.scene : state.scene });
      renderSceneGrids();
      return;
    }
    update({ customScenes: state.customScenes.filter((x) => x.id !== id), scene: state.scene === id ? "koi" : state.scene });
    return;
  }
  if (e.target.closest("#picAdd")) { $("#picInput").click(); return; }
  const c = e.target.closest(".scene-card");
  if (c) update({ scene: c.dataset.id });
});
function updateSceneChip(entry) {
  const ic = $("#sceneIcon"), nm = $("#sceneName");
  ic.innerHTML = svg(entry.icon);
  nm.textContent = entry.name;
  for (const el of [ic, nm]) {
    el.classList.remove("swap");
    void el.offsetWidth;
    el.classList.add("swap");
  }
}
function stepScene(dir, opts) {
  const ids = allScenes();
  const i = ids.indexOf(state.scene);
  update({ scene: ids[(i + dir + ids.length) % ids.length] }, opts);
}

/* ---------- Panels ---------- */
const panels = { scenes: $("#panelScenes"), settings: $("#panelSettings"), ai: $("#panelAI"), display: $("#panelDisplay") };
const panelBtns = { scenes: $("#btnScenes"), settings: $("#btnSettings"), ai: $("#btnAI"), display: $("#btnDisplay") };
let openPanelName = null;

function openPanel(name) {
  if (openPanelName === name) return closePanels();
  closePanels();
  openPanelName = name;
  panels[name].classList.add("open");
  panels[name].setAttribute("aria-hidden", "false");
  panelBtns[name].classList.add("active");
  if (name === "scenes") renderSceneGrids();
  if (name === "settings") renderClockPreviews();
  requestAnimationFrame(() => {
    syncControls();
    if (name === "ai") setTimeout(() => $("#aiInput").focus({ preventScroll: true }), 120);
  });
}
function closePanels() {
  for (const k in panels) {
    panels[k].classList.remove("open");
    panels[k].setAttribute("aria-hidden", "true");
    panelBtns[k].classList.remove("active");
  }
  if (document.activeElement && document.activeElement.closest(".panel")) document.activeElement.blur();
  openPanelName = null;
  setTimeout(() => { if (!openPanelName) clearThumbs(); }, 400);
}
for (const k in panelBtns) panelBtns[k].addEventListener("click", () => openPanel(k));
$$("[data-close]").forEach((b) => b.addEventListener("click", closePanels));

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, extra = "") {
  const el = $("#toast");
  el.innerHTML = `<span class="dot"></span><span>${escapeHtml(msg)}</span>${extra ? `<span class="url">${escapeHtml(extra)}</span>` : ""}`;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), extra ? 6000 : 2400);
}

/* ---------- Clock chip ---------- */
const hmEl = $("#clockHM"), sEl = $("#clockS");
function tickClock() {
  const d = new Date();
  hmEl.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  sEl.textContent = String(d.getSeconds()).padStart(2, "0");
  sEl.classList.remove("tick");
  void sEl.offsetWidth;
  sEl.classList.add("tick");
}
tickClock();
setInterval(tickClock, 1000);

/* ---------- Screensaver ---------- */
let saver = false, saverAt = 0, saverOrigin = null, enteredFs = false, lastActive = performance.now();

async function enterSaver(fromUser, screen) {
  if (saver) return;
  closePanels();
  saver = true;
  saverAt = performance.now();
  saverOrigin = null;
  document.body.classList.add("saver");
  engine.setOverlay(state.clockStyle !== "off");
  engine.pointer.active = false;
  syncWake();
  if (fromUser && (state.full || screen) && document.documentElement.requestFullscreen) {
    try {
      if (screen && document.fullscreenElement) await document.exitFullscreen();
      await document.documentElement.requestFullscreen(screen ? { screen } : undefined);
      enteredFs = true;
    } catch {}
  }
}
function exitSaver() {
  if (!saver || DISPLAY) return;
  saver = false;
  document.body.classList.remove("saver");
  engine.setOverlay(false);
  if (enteredFs && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  enteredFs = false;
  lastActive = performance.now();
  syncWake();
}
const saverGrace = () => performance.now() - saverAt < 700;

setInterval(() => {
  if (saver || !state.idle || DISPLAY) return;
  if (document.activeElement && document.activeElement.matches("input[type=text], textarea")) return;
  if (performance.now() - lastActive > state.idle * 60000) enterSaver(false);
}, 1000);

$("#btnPlay").addEventListener("click", () => enterSaver(true));

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => toast("全画面に切り替えできませんでした"));
}
$("#btnFull").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("fs", !!document.fullscreenElement);
  if (!document.fullscreenElement && saver && enteredFs) {
    enteredFs = false;
    exitSaver();
  }
});

/* ---------- Wake lock ---------- */
let wakeLock = null;
async function syncWake() {
  const want = state.wake && (saver || DISPLAY) && document.visibilityState === "visible";
  if (want && !wakeLock && "wakeLock" in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch {}
  } else if (!want && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", syncWake);

/* ---------- Sound ---------- */
// The PC's own audio comes in through screen sharing ("share system audio"); the browser asks
// each time, so it is never switched on without a click.
const soundBtn = $("#btnSound");
let soundBusy = false, soundTimer = 0;
async function startSound() {
  if (DISPLAY || soundBusy) return;
  soundBusy = true;
  try {
    await sound.start(state.soundSource);
    toast(state.soundSource === "mic" ? "マイクの音に連動します" : "PC の音に連動します");
  } catch (e) {
    const msg = e && e.message === "noaudio" ? "「システムの音声も共有する」をオンにして、画面全体を選んでください"
      : e && e.message === "unsupported" ? "このブラウザは PC の音に未対応です。設定でマイクを選べます"
      : e && e.name === "NotAllowedError" ? (state.soundSource === "mic" ? "マイクが許可されませんでした" : "")
      : "音声を取得できませんでした";
    if (msg) toast(msg);
    syncSound(false);
  } finally {
    soundBusy = false;
  }
}
const toggleSound = () => (sound.on ? sound.stop() : startSound());
function syncSound(on) {
  soundBtn.classList.toggle("active", on);
  soundBtn.classList.toggle("live", on);
  soundBtn.setAttribute("aria-pressed", String(on));
  $("#optSound").checked = on;
  clearInterval(soundTimer);
  soundTimer = 0;
  soundBtn.style.removeProperty("--lv");
  if (!on) return;
  soundTimer = setInterval(() => {
    soundBtn.style.setProperty("--lv", (sound.level * 0.6 + sound.beat * 0.4).toFixed(3));
    // Display windows can't capture on their own, so they get the analysed frames.
    if (bc && sound.io) bc.postMessage({ type: "audio", frame: sound.frame() });
  }, 33);
}
sound.onchange = syncSound;
soundBtn.addEventListener("click", toggleSound);
$("#optSound").addEventListener("change", (e) => {
  if (e.target.checked !== sound.on) toggleSound();
});

/* ---------- Pictures ---------- */
// Images are turned into dots here in the browser and kept in localStorage only.
async function importPictures(files) {
  const list = [...files].filter((f) => /^image\//.test(f.type));
  if (!list.length || DISPLAY) return;
  let last = null;
  for (const f of list) {
    try { last = await addPicture(f); }
    catch (e) { toast(e && e.message === "quota" ? "保存できる容量を超えました。不要な画像を削除してください" : "画像を読み込めませんでした"); break; }
  }
  if (!last) return;
  update({ scene: last.id });
  renderSceneGrids();
  toast(list.length > 1 ? `${list.length} 枚の画像を追加しました` : "画像をドットに変換しました");
}
$("#picInput").addEventListener("change", (e) => { importPictures(e.target.files); e.target.value = ""; });
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); document.body.classList.add("dropping"); });
addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
addEventListener("drop", (e) => {
  document.body.classList.remove("dropping");
  if (!hasFiles(e)) return;
  e.preventDefault();
  importPictures(e.dataTransfer.files);
});
addEventListener("paste", (e) => {
  if (e.target.closest && e.target.closest("input, textarea")) return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (files.length) importPictures(files);
});
// Another window (or a display window) added or removed a picture.
addEventListener("storage", (e) => {
  if (e.key !== "dotfield:pictures") return;
  reloadPictures();
  state = normalize(state);
  apply();
  renderSceneGrids();
});

/* ---------- Auto shuffle ---------- */
// Every few minutes, a random other scene and/or palette. Only the main window decides; display
// windows follow through the shared state. Nothing changes while a panel is open.
let shuffleAt = 0;
const pickOther = (list, cur) => { const l = list.filter((x) => x !== cur); return l[Math.floor(Math.random() * l.length)]; };
setInterval(() => {
  if (DISPLAY || (!state.shuffleScene && !state.shufflePalette)) { shuffleAt = 0; return; }
  const now = Date.now();
  if (!shuffleAt) shuffleAt = now + state.shuffleEvery * 60000;
  if (now < shuffleAt || openPanelName) return;
  shuffleAt = now + state.shuffleEvery * 60000;
  const patch = {};
  if (state.shuffleScene) patch.scene = pickOther(allScenes(), state.scene);
  if (state.shufflePalette) {
    const k = pickOther(Object.keys(PALETTES), state.palette);
    Object.assign(patch, { palette: k, colors: strip(PALETTES[k]) });
  }
  update(patch);
}, 1000);

/* ---------- Theme ---------- */
$("#btnTheme").addEventListener("click", () => update({ theme: isDark() ? "light" : "dark" }));

/* ---------- Displays ---------- */
let screenDetails = null;
const screensEl = $("#screens");
function renderScreens() {
  if (!screenDetails) { screensEl.innerHTML = ""; return; }
  const list = screenDetails.screens;
  screensEl.innerHTML = list.map((s, i) => {
    const ar = s.width / s.height, w = ar >= 1 ? 40 : 40 * ar, h = ar >= 1 ? 40 / ar : 40;
    const badges = `${s.isPrimary ? "<em>メイン</em>" : ""}${s === screenDetails.currentScreen ? "<em>現在</em>" : ""}`;
    return `<div class="screen" style="--i:${i}">
      <span class="screen-shape"><i style="width:${w}px;height:${h}px"></i></span>
      <span class="screen-meta"><b>${escapeHtml(s.label || `Display ${i + 1}`)}</b><small>${s.width}×${s.height}</small>${badges}</span>
      <span class="screen-btns"><button data-open="${i}">表示</button><button class="primary" data-start="${i}">開始</button></span>
    </div>`;
  }).join("");
}
screensEl.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]"), s = e.target.closest("[data-start]");
  if (!screenDetails) return;
  if (o) openDisplay(screenDetails.screens[+o.dataset.open], +o.dataset.open);
  if (s) enterSaver(true, screenDetails.screens[+s.dataset.start]);
});
async function detectScreens(silent = false) {
  if (!("getScreenDetails" in window)) {
    if (!silent) toast("このブラウザはディスプレイ選択に未対応です");
    return;
  }
  try {
    screenDetails = await window.getScreenDetails();
    screenDetails.addEventListener("screenschange", renderScreens);
    screenDetails.addEventListener("currentscreenchange", renderScreens);
    renderScreens();
  } catch {
    if (!silent) toast("ディスプレイへのアクセスが許可されませんでした");
  }
}
function openDisplay(screen, i) {
  const f = screen
    ? `popup,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
    : "popup,width=1280,height=720";
  const w = window.open("/?display=1", `dotfield-display-${screen ? i : "w"}`, f);
  if (!w) toast("ポップアップがブロックされました");
}
$("#btnDetect").addEventListener("click", () => detectScreens());
$("#btnOpenWindow").addEventListener("click", () => openDisplay(null));
navigator.permissions?.query({ name: "window-management" }).then((p) => { if (p.state === "granted") detectScreens(true); }).catch(() => {});

/* Display window: an always-on face for a second monitor. */
let barTimer;
function showBar() {
  document.body.classList.add("show-bar");
  clearTimeout(barTimer);
  barTimer = setTimeout(() => document.body.classList.remove("show-bar"), 2600);
}
if (DISPLAY) {
  $("#dbPrev").addEventListener("click", () => stepScene(-1, { local: true }));
  $("#dbNext").addEventListener("click", () => stepScene(1, { local: true }));
  $("#dbFull").addEventListener("click", toggleFullscreen);
  $("#dbClose").addEventListener("click", () => window.close());
}

/* ---------- Pointer & keyboard ---------- */
const canvas = $("#field");
let lastRipple = 0, lastPos = null;
addEventListener("pointermove", (e) => {
  // Browsers fire synthetic moves under a still cursor when layout changes; those aren't activity.
  const moved = !lastPos || e.clientX !== lastPos.x || e.clientY !== lastPos.y;
  lastPos = { x: e.clientX, y: e.clientY };
  if (DISPLAY) { if (moved) showBar(); return; }
  if (saver) {
    if (saverGrace() || !moved) return;
    if (!saverOrigin) saverOrigin = { x: e.clientX, y: e.clientY };
    else if (Math.hypot(e.clientX - saverOrigin.x, e.clientY - saverOrigin.y) > 14) exitSaver();
    return;
  }
  if (moved) lastActive = performance.now();
  const onField = e.target === canvas;
  engine.setPointer(e.clientX, e.clientY, onField && state.interact);
  const now = performance.now();
  if (onField && state.interact && now - lastRipple > 160 && Math.abs(e.movementX) + Math.abs(e.movementY) > 18) {
    engine.addRipple(e.clientX, e.clientY, 0.25);
    lastRipple = now;
  }
});
document.addEventListener("pointerleave", () => engine.setPointer(-999, -999, false));
addEventListener("pointerdown", (e) => {
  if (DISPLAY) {
    showBar();
    if (e.target === canvas) toggleFullscreen();
    return;
  }
  if (saver) {
    if (!saverGrace()) exitSaver();
    return;
  }
  lastActive = performance.now();
  if (e.target === canvas) {
    if (state.interact) engine.addRipple(e.clientX, e.clientY, 1);
    closePanels();
  }
});
addEventListener("wheel", () => {
  if (saver && !saverGrace()) exitSaver();
  lastActive = performance.now();
}, { passive: true });

addEventListener("keydown", (e) => {
  if (DISPLAY) {
    if (e.key === "ArrowRight") stepScene(1, { local: true });
    else if (e.key === "ArrowLeft") stepScene(-1, { local: true });
    else if (e.key.toLowerCase() === "f") toggleFullscreen();
    showBar();
    return;
  }
  if (saver) {
    e.preventDefault();
    if (!saverGrace()) exitSaver();
    return;
  }
  lastActive = performance.now();
  const tgt = e.target instanceof Element ? e.target : document.body;
  if (tgt.matches("input[type=text], textarea")) {
    if (e.key === "Escape") closePanels();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.key === " " && !tgt.closest("button")) { e.preventDefault(); enterSaver(true); }
  else if (k === "f") toggleFullscreen();
  else if (k === "s") openPanel("settings");
  else if (k === "a") openPanel("ai");
  else if (k === "d") openPanel("display");
  else if (k === "m") toggleSound();
  else if (k === "t") update({ theme: isDark() ? "light" : "dark" });
  else if (k === "c") { update({ clockStyle: CLOCKS[(CLOCKS.indexOf(state.clockStyle) + 1) % CLOCKS.length] }); if (state.clockStyle !== "off") previewClock(); }
  else if (e.key === "ArrowRight") stepScene(1);
  else if (e.key === "ArrowLeft") stepScene(-1);
  else if (e.key === "Escape") closePanels();
  else if (/^[1-9]$/.test(e.key)) update({ scene: CATALOG[+e.key - 1].id });
});

/* ---------- AI patterns ---------- */
const aiForm = $("#aiForm"), aiInput = $("#aiInput"), aiSubmit = $("#aiSubmit"), aiResult = $("#aiResult");
let aiBusy = false;
const newId = () => "ai:" + Math.random().toString(36).slice(2, 8).padEnd(6, "0");

function renderAICard(entry, colors, speed) {
  clearThumbs((c) => c.closest("#aiResult"));
  const v = viewColors(colors);
  aiResult.innerHTML = `<div class="ai-card">
    <div class="row"><div><div class="nm">${escapeHtml(entry.name)}</div><div class="meta">${(entry.surface || "flat").toUpperCase()} · ${speed.toFixed(1)}×</div></div>
      <span class="check">${svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')}</span></div>
    <canvas class="preview"></canvas>
    <div class="pal">${[v.bg, v.base, v.c, v.a, v.b].map((h) => `<i style="background:${h}"></i>`).join("")}</div>
    <textarea class="code" spellcheck="false" aria-label="式">${escapeHtml(entry.expr)}</textarea>
    <div class="code-err"></div>
  </div>`;
  addThumb(aiResult.querySelector("canvas"), () => makeFormula(entry.expr, entry.surface)());
  const code = aiResult.querySelector(".code"), err = aiResult.querySelector(".code-err");
  let t;
  code.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const expr = code.value.trim();
      try {
        compile(expr);
        code.classList.remove("bad");
        err.textContent = "";
        update({ customScenes: state.customScenes.map((x) => (x.id === entry.id ? { ...x, expr } : x)), scene: entry.id });
        clearThumbs((c) => c.closest("#aiResult"));
        addThumb(aiResult.querySelector("canvas"), makeFormula(expr, entry.surface));
      } catch (ex) {
        code.classList.add("bad");
        err.textContent = ex.message;
      }
    }, 350);
  });
}

aiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = aiInput.value.trim();
  if (!prompt) {
    aiInput.classList.remove("shake");
    void aiInput.offsetWidth;
    aiInput.classList.add("shake");
    return;
  }
  if (aiBusy) return;
  aiBusy = true;
  aiSubmit.classList.add("busy");
  aiSubmit.disabled = true;
  clearThumbs((c) => c.closest("#aiResult"));
  aiResult.innerHTML = `<div class="ai-card" aria-busy="true"><div class="row"><div class="skel-line" style="width:45%"></div><div class="skel-line" style="width:12%"></div></div>
    <div class="skel-box skel-preview"></div><div class="pal">${'<div class="skel-box"></div>'.repeat(5)}</div><div class="skel-line" style="width:90%"></div>
    <div class="ai-progress"><i></i></div></div>`;
  try {
    const res = await fetch("/api/theme", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    if (!res.ok) throw new Error(res.status);
    const t = await res.json();
    compile(t.expr);
    const entry = { id: newId(), name: t.name, expr: t.expr, surface: SURFACES.includes(t.surface) ? t.surface : "flat" };
    customColors = { ...t.colors, name: t.name };
    update({
      customScenes: [entry, ...state.customScenes].slice(0, 16),
      scene: entry.id, palette: "custom", colors: t.colors, speed: t.speed, name: t.name,
    });
    renderAICard(entry, t.colors, t.speed);
  } catch {
    aiResult.innerHTML = "";
    toast("生成に失敗しました");
  } finally {
    aiBusy = false;
    aiSubmit.classList.remove("busy");
    aiSubmit.disabled = false;
  }
});
$("#aiChips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  aiInput.value = b.textContent;
  aiForm.requestSubmit();
});

/* ---------- Share ---------- */
const shareBtn = $("#btnShare");
shareBtn.addEventListener("click", async () => {
  if (shareBtn.classList.contains("busy")) return;
  shareBtn.classList.add("busy");
  try {
    const { customScenes, theme, ...config } = state;
    const cs = customScenes.find((x) => x.id === state.scene);
    if (cs) config.formula = { name: cs.name, expr: cs.expr, surface: cs.surface };
    const res = await fetch("/api/presets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }) });
    if (!res.ok) throw new Error(res.status);
    const { id } = await res.json();
    const url = `${location.origin}/?p=${id}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {}
    toast(copied ? "リンクをコピーしました" : "共有リンク", url);
  } catch {
    toast("共有に失敗しました");
  } finally {
    shareBtn.classList.remove("busy");
  }
});

/* ---------- Glass specular + magnetic buttons ---------- */
let glassRaf = 0, gx = 0, gy = 0;
addEventListener("pointermove", (e) => {
  gx = e.clientX; gy = e.clientY;
  if (glassRaf) return;
  glassRaf = requestAnimationFrame(() => {
    glassRaf = 0;
    for (const el of $$(".glass")) {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", gx - r.left + "px");
      el.style.setProperty("--my", gy - r.top + "px");
    }
  });
});
for (const el of $$(".icon-btn, .play-btn")) {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.18}px ${(e.clientY - r.top - r.height / 2) * 0.18}px`;
  });
  el.addEventListener("pointerleave", () => (el.style.translate = ""));
}
for (const el of $$(".play-btn, .primary-btn")) {
  el.addEventListener("pointerdown", (e) => {
    const r = el.getBoundingClientRect();
    const s = document.createElement("span");
    const size = Math.max(r.width, r.height) * 2.2;
    s.className = "press-ripple";
    s.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${size}px;height:${size}px`;
    el.appendChild(s);
    s.addEventListener("animationend", () => s.remove());
  });
}
for (const el of $$("[data-enter]")) {
  el.addEventListener("animationend", (e) => {
    if (e.target !== el) return;
    el.style.animation = "none";
    el.style.opacity = "1";
  });
}
addEventListener("resize", () => syncControls());

/* ---------- Boot ---------- */
async function boot() {
  renderSwatches();
  apply({ instant: true });
  const pid = new URLSearchParams(location.search).get("p");
  let shared = false;
  const fontsReady = document.fonts ? Promise.all(FACE_FONTS.map((f) => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready) : null;
  const tasks = [engine.firstFrame, wait(DISPLAY ? 500 : 1100), fontsReady];
  if (pid && /^[A-Za-z0-9]{6,16}$/.test(pid)) {
    tasks.push(
      fetch(`/api/presets/${pid}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !d.config) return;
          const { formula, ...cfg } = d.config;
          const patch = { ...cfg, theme: state.theme, customScenes: state.customScenes, react: state.react, soundSource: state.soundSource };
          if (formula && formula.expr) {
            const entry = { id: newId(), name: formula.name || "Shared", expr: formula.expr, surface: formula.surface || "flat" };
            patch.customScenes = [entry, ...state.customScenes].slice(0, 16);
            patch.scene = entry.id;
          }
          state = normalize(patch);
          customColors = state.palette === "custom" ? { ...state.colors, name: state.name || "Shared" } : null;
          renderSwatches();
          apply({ instant: true });
          save();
          shared = true;
        })
        .catch(() => {})
    );
  }
  await Promise.all(tasks);
  if (pid) history.replaceState(null, "", location.pathname);
  document.body.classList.add("ready");
  $("#skeleton").classList.add("done");
  $("#skeleton").setAttribute("aria-busy", "false");
  requestAnimationFrame(() => syncControls());
  setTimeout(() => syncControls(), 400);
  if (DISPLAY) {
    await enterSaver(false);
    setTimeout(() => toast("クリックで全画面"), 500);
  }
  if (shared) setTimeout(() => toast("共有された設定を読み込みました"), 700);
  else if (pid) setTimeout(() => toast("共有リンクが見つかりません"), 700);
}
boot();

window.__dotfield = {
  engine, sound, update, enterSaver, exitSaver, openPanel, closePanels,
  get state() { return state; }, get saver() { return saver; }, get idleFor() { return performance.now() - lastActive; }, get thumbs() { return thumbs.size; },
};
