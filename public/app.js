import { Engine } from "./engine.js";
import { SCENES, SCENE_ORDER } from "./scenes.js";

const PALETTES = {
  koi: { name: "Koi", bg: "#f4f5f7", base: "#dde1e8", a: "#ff5a1f", b: "#20242c", c: "#aab2c0" },
  mono: { name: "Mono", bg: "#f5f5f7", base: "#e0e0e5", a: "#1d1d1f", b: "#55555c", c: "#b4b4bc" },
  sea: { name: "Sea", bg: "#f2f6fa", base: "#d8e2ee", a: "#0a84ff", b: "#06315e", c: "#86c8ff" },
  moss: { name: "Moss", bg: "#f4f6f1", base: "#dce3d5", a: "#2fb157", b: "#1d4a2a", c: "#a9d6a3" },
  sunset: { name: "Sunset", bg: "#faf5f2", base: "#ece0d8", a: "#ff375f", b: "#4f2147", c: "#ffb38a" },
  lilac: { name: "Lilac", bg: "#f6f5fa", base: "#e2dfee", a: "#a14fe0", b: "#30235e", c: "#c9b9f6" },
  citrus: { name: "Citrus", bg: "#f9f8f1", base: "#e8e5d4", a: "#f5a300", b: "#2c2a1e", c: "#c8d96f" },
};
const HEX = /^#[0-9a-f]{6}$/i;
const IDLES = [0, 1, 3, 5, 10];
const DEFAULTS = {
  scene: "koi", palette: "koi", name: "", colors: strip(PALETTES.koi),
  cell: 14, speed: 1, shape: "square", idle: 3, clock: true, full: true, interact: true,
};
const STORE_KEY = "dotfield:v1";

function strip(p) {
  const { bg, base, a, b, c } = p;
  return { bg, base, a, b, c };
}
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  const n = { ...DEFAULTS, ...s };
  if (!SCENES[n.scene]) n.scene = DEFAULTS.scene;
  const c = n.colors || {};
  n.colors = ["bg", "base", "a", "b", "c"].every((k) => HEX.test(c[k] || "")) ? strip(c) : strip(PALETTES.koi);
  if (n.palette !== "custom" && !PALETTES[n.palette]) n.palette = "custom";
  n.cell = Math.min(24, Math.max(10, Math.round(+n.cell) || 14));
  n.speed = Math.min(2.5, Math.max(0.2, +n.speed || 1));
  if (!["square", "circle"].includes(n.shape)) n.shape = "square";
  n.idle = IDLES.includes(+n.idle) ? +n.idle : 3;
  n.clock = n.clock !== false;
  n.full = n.full !== false;
  n.interact = n.interact !== false;
  n.name = typeof n.name === "string" ? n.name.slice(0, 40) : "";
  return n;
}
const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
};
const save = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
};

let state = normalize(load());
const engine = new Engine($("#field"));
let currentScene = null;
let customColors = state.palette === "custom" ? { ...state.colors, name: state.name || "AI" } : null;

function apply({ instant = false } = {}) {
  engine.setColors(state.colors, instant);
  engine.setCell(state.cell);
  engine.speed = state.speed;
  engine.shape = state.shape;
  engine.interact = state.interact;
  if (currentScene !== state.scene) {
    engine.setScene(SCENES[state.scene], instant);
    currentScene = state.scene;
  }
  document.documentElement.style.setProperty("--bg", state.colors.bg);
  document.documentElement.style.setProperty("--accent", state.colors.a);
  $('meta[name="theme-color"]').content = state.colors.bg;
  syncControls();
}

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
function bindSeg(seg, onPick) {
  seg.addEventListener("click", (e) => {
    const b = e.target.closest(".seg-btn");
    if (b) onPick(b.dataset.v);
  });
}

/* ---------- Controls ---------- */
const sceneSeg = $("#sceneSeg"), shapeSeg = $("#shapeSeg"), idleSeg = $("#idleSeg");
const cellIn = $("#cell"), speedIn = $("#speed");

function setRangeFill(el) {
  const p = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty("--p", p + "%");
}

function renderSwatches() {
  const list = Object.entries(PALETTES);
  if (customColors) list.push(["custom", customColors]);
  $("#swatches").innerHTML = list
    .map(([k, p]) => `<button class="swatch" data-k="${k}" aria-pressed="${state.palette === k}" style="--sw-bg:${p.bg}" title="${escapeHtml(p.name || k)}">
      <span class="dots"><i style="background:${p.a}"></i><i style="background:${p.b}"></i><i style="background:${p.c}"></i></span>
      <span class="nm">${escapeHtml(p.name || k)}</span></button>`)
    .join("");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function syncControls() {
  moveSeg(sceneSeg, state.scene);
  moveSeg(shapeSeg, state.shape);
  moveSeg(idleSeg, state.idle);
  cellIn.value = state.cell;
  speedIn.value = state.speed;
  setRangeFill(cellIn);
  setRangeFill(speedIn);
  $("#cellOut").textContent = state.cell + "px";
  $("#speedOut").textContent = state.speed.toFixed(1) + "×";
  $("#optClock").checked = state.clock;
  $("#optFull").checked = state.full;
  $("#optInteract").checked = state.interact;
  $$(".swatch").forEach((s) => s.setAttribute("aria-pressed", String(s.dataset.k === state.palette)));
}

function update(patch, opts) {
  state = normalize({ ...state, ...patch });
  apply(opts);
  save();
}

bindSeg(sceneSeg, (v) => update({ scene: v }));
bindSeg(shapeSeg, (v) => update({ shape: v }));
bindSeg(idleSeg, (v) => update({ idle: +v }));

$("#swatches").addEventListener("click", (e) => {
  const b = e.target.closest(".swatch");
  if (!b) return;
  const k = b.dataset.k;
  const p = k === "custom" ? customColors : PALETTES[k];
  update({ palette: k, colors: strip(p), name: k === "custom" ? p.name : "" });
});

let cellTimer;
cellIn.addEventListener("input", () => {
  setRangeFill(cellIn);
  $("#cellOut").textContent = cellIn.value + "px";
  clearTimeout(cellTimer);
  cellTimer = setTimeout(() => update({ cell: +cellIn.value }), 90);
});
speedIn.addEventListener("input", () => update({ speed: +speedIn.value }));
$("#optClock").addEventListener("change", (e) => update({ clock: e.target.checked }));
$("#optFull").addEventListener("change", (e) => update({ full: e.target.checked }));
$("#optInteract").addEventListener("change", (e) => update({ interact: e.target.checked }));
$("#btnReset").addEventListener("click", () => {
  state = normalize({});
  customColors = null;
  renderSwatches();
  apply();
  save();
  toast("リセットしました");
});

/* ---------- Panels ---------- */
const panels = { settings: $("#panelSettings"), ai: $("#panelAI") };
const panelBtns = { settings: $("#btnSettings"), ai: $("#btnAI") };
let openPanelName = null;

function openPanel(name) {
  if (openPanelName === name) return closePanels();
  closePanels();
  openPanelName = name;
  panels[name].classList.add("open");
  panels[name].setAttribute("aria-hidden", "false");
  panelBtns[name].classList.add("active");
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
}
panelBtns.settings.addEventListener("click", () => openPanel("settings"));
panelBtns.ai.addEventListener("click", () => openPanel("ai"));
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

async function enterSaver(fromUser) {
  if (saver) return;
  closePanels();
  saver = true;
  saverAt = performance.now();
  saverOrigin = null;
  document.body.classList.add("saver");
  engine.setOverlay(state.clock);
  engine.pointer.active = false;
  if (fromUser && state.full && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
      enteredFs = true;
    } catch {}
  }
}
function exitSaver() {
  if (!saver) return;
  saver = false;
  document.body.classList.remove("saver");
  engine.setOverlay(false);
  if (enteredFs && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  enteredFs = false;
  lastActive = performance.now();
}
const saverGrace = () => performance.now() - saverAt < 700;

setInterval(() => {
  if (saver || !state.idle) return;
  if (document.activeElement && document.activeElement.matches("input[type=text]")) return;
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

/* ---------- Pointer & keyboard ---------- */
const canvas = $("#field");
let lastRipple = 0;
addEventListener("pointermove", (e) => {
  if (saver) {
    if (saverGrace()) return;
    if (!saverOrigin) saverOrigin = { x: e.clientX, y: e.clientY };
    else if (Math.hypot(e.clientX - saverOrigin.x, e.clientY - saverOrigin.y) > 14) exitSaver();
    return;
  }
  lastActive = performance.now();
  const onField = e.target === canvas;
  engine.setPointer(e.clientX, e.clientY, onField && state.interact);
  const now = performance.now();
  if (onField && state.interact && now - lastRipple > 110 && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) {
    engine.addRipple(e.clientX, e.clientY, 0.35);
    lastRipple = now;
  }
});
document.addEventListener("pointerleave", () => engine.setPointer(-999, -999, false));
addEventListener("pointerdown", (e) => {
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
  if (saver) {
    e.preventDefault();
    if (!saverGrace()) exitSaver();
    return;
  }
  lastActive = performance.now();
  const tgt = e.target instanceof Element ? e.target : document.body;
  if (tgt.matches("input[type=text]")) {
    if (e.key === "Escape") closePanels();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.key === " " && !tgt.closest("button")) { e.preventDefault(); enterSaver(true); }
  else if (k === "f") toggleFullscreen();
  else if (k === "s") openPanel("settings");
  else if (k === "a") openPanel("ai");
  else if (e.key === "Escape") closePanels();
  else if (/^[1-5]$/.test(e.key)) update({ scene: SCENE_ORDER[+e.key - 1] });
});

/* ---------- AI theme ---------- */
const aiForm = $("#aiForm"), aiInput = $("#aiInput"), aiSubmit = $("#aiSubmit"), aiResult = $("#aiResult");
const SCENE_LABEL = { koi: "Koi", wave: "Wave", rain: "Rain", flow: "Flow", life: "Life" };
let aiBusy = false;

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
  aiResult.innerHTML = `<div class="ai-card" aria-busy="true"><div class="row"><div class="skel-line" style="width:45%"></div><div class="skel-line" style="width:18%"></div></div>
    <div class="pal">${'<div class="skel-box"></div>'.repeat(5)}</div></div>`;
  try {
    const res = await fetch("/api/theme", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    if (!res.ok) throw new Error(res.status);
    const t = await res.json();
    customColors = { ...t.colors, name: t.name };
    renderSwatches();
    update({ palette: "custom", colors: t.colors, scene: t.scene, speed: t.speed, name: t.name });
    const c = t.colors;
    aiResult.innerHTML = `<div class="ai-card"><div class="row"><div><div class="nm">${escapeHtml(t.name)}</div>
      <div class="meta">${SCENE_LABEL[t.scene]} · ${t.speed.toFixed(1)}×</div></div>
      <span class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>
      <div class="pal">${[c.bg, c.base, c.c, c.a, c.b].map((h) => `<i style="background:${h}" title="${h}"></i>`).join("")}</div></div>`;
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
    const res = await fetch("/api/presets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config: state }) });
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
  const tasks = [engine.firstFrame, wait(1100), document.fonts ? document.fonts.ready.catch(() => {}) : null];
  if (pid && /^[A-Za-z0-9]{6,16}$/.test(pid)) {
    tasks.push(
      fetch(`/api/presets/${pid}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !d.config) return;
          state = normalize(d.config);
          if (state.palette === "custom") customColors = { ...state.colors, name: state.name || "Shared" };
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
  if (shared) setTimeout(() => toast("共有された設定を読み込みました"), 700);
  else if (pid) setTimeout(() => toast("共有リンクが見つかりません"), 700);
}
boot();

window.__dotfield = { engine, get state() { return state; }, enterSaver, exitSaver, get saver() { return saver; }, get idleFor() { return performance.now() - lastActive; } };
