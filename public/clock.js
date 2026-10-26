// Clock faces rendered into a dot mask. tone: 1 = ink, 2 = halo, 3 = accent, 4 = dim;
// alpha carries soft (antialiased) edges for type-based faces.

const F5 = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["0", "1", "0", "0", "0", "1", "0"],
  " ": ["0", "0", "0", "0", "0", "0", "0"],
};
const F3 = {
  0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"], 3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"], 7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"], 9: ["111", "101", "111", "001", "111"],
  "/": ["001", "001", "010", "100", "100"], " ": ["000", "000", "000", "000", "000"], ":": ["0", "1", "0", "1", "0"],
  A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"], C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"], E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"], I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"], K: ["101", "101", "110", "101", "101"], L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"], N: ["110", "101", "101", "101", "101"], O: ["111", "101", "101", "101", "111"],
  P: ["110", "101", "110", "100", "100"], Q: ["010", "101", "101", "110", "011"], R: ["110", "101", "110", "101", "101"],
  S: ["111", "100", "111", "001", "111"], T: ["111", "010", "010", "010", "010"], U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"], W: ["101", "101", "111", "111", "101"], X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"], Z: ["111", "001", "010", "100", "111"],
};
const SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const INK = "#ff0000", ACC = "#00ff00", DIM = "#0000ff";
const pad = (n) => String(n).padStart(2, "0");
const TAU = Math.PI * 2;

let cv, cx;
function surface(cols, rows) {
  if (!cv) {
    cv = document.createElement("canvas");
    cx = cv.getContext("2d", { willReadFrequently: true });
  }
  if (cv.width !== cols || cv.height !== rows) { cv.width = cols; cv.height = rows; }
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.clearRect(0, 0, cols, rows);
  cx.textAlign = "center";
  cx.textBaseline = "alphabetic";
  return cx;
}

const glyphW = (font, str, gap = 1) => [...str].reduce((s, ch) => s + font[ch][0].length, 0) + gap * (str.length - 1);
function bitmap(c, font, str, x, y, s, color, gap = 1) {
  c.fillStyle = color;
  let px = x;
  for (const ch of str) {
    const g = font[ch] || font[" "];
    for (let gy = 0; gy < g.length; gy++)
      for (let gx = 0; gx < g[gy].length; gx++) if (g[gy][gx] === "1") c.fillRect(px + gx * s, y + gy * s, s, s);
    px += (g[0].length + gap) * s;
  }
}

function faceDot(c, cols, rows, d) {
  const str = `${pad(d.getHours())}${d.getSeconds() % 2 ? " " : ":"}${pad(d.getMinutes())}`;
  const wu = glyphW(F5, str);
  const s = Math.max(1, Math.floor(Math.min((cols * 0.62) / wu, (rows * 0.42) / 7)));
  bitmap(c, F5, str, Math.round((cols - wu * s) / 2), Math.round((rows - 7 * s) / 2), s, INK);
}

function faceFull(c, cols, rows, d) {
  const str = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const wu = glyphW(F5, str);
  const s = Math.max(1, Math.floor(Math.min((cols * 0.5) / wu, (rows * 0.3) / 7)));
  const s2 = Math.max(1, Math.floor(s / 2));
  const date = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${DAYS[d.getDay()]}`;
  const w1 = wu * s, w2 = glyphW(F3, date) * s2;
  const total = 7 * s + 2 * s + 5 * s2 + 2 * s;
  const y0 = Math.round((rows - total) / 2);
  const x0 = Math.round((cols - w1) / 2);
  bitmap(c, F5, str, x0, y0, s, INK);
  bitmap(c, F3, date, Math.round((cols - w2) / 2), y0 + 9 * s, s2, INK);
  const ty = y0 + 9 * s + 5 * s2 + 2 * s;
  for (let k = 0; k < 60; k += 2) {
    c.fillStyle = k <= d.getSeconds() ? ACC : DIM;
    c.fillRect(x0 + Math.round((k / 60) * w1), ty, Math.max(1, s2), Math.max(1, s2));
  }
}

function faceSeg(c, cols, rows, d) {
  const digits = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  const secs = pad(d.getSeconds());
  const u = Math.max(1, Math.floor(Math.min((cols * 0.7) / 31.5, (rows * 0.42) / 9)));
  const u2 = Math.max(1, Math.floor(u / 2));
  const total = 25 * u + 2 * u + 11 * u2;
  const x0 = Math.round((cols - total) / 2), y0 = Math.round((rows - 9 * u) / 2);
  const seg = (x, y, n, uu, color) => {
    const R = { a: [uu, 0, 3 * uu, uu], b: [4 * uu, uu, uu, 3 * uu], c: [4 * uu, 5 * uu, uu, 3 * uu], d: [uu, 8 * uu, 3 * uu, uu], e: [0, 5 * uu, uu, 3 * uu], f: [0, uu, uu, 3 * uu], g: [uu, 4 * uu, 3 * uu, uu] };
    for (const k of "abcdefg") {
      const r = R[k];
      c.fillStyle = SEG[n].includes(k) ? color : DIM;
      c.fillRect(x + r[0], y + r[1], r[2], r[3]);
    }
  };
  const xs = [0, 6 * u, 14 * u, 20 * u];
  for (let k = 0; k < 4; k++) seg(x0 + xs[k], y0, +digits[k], u, INK);
  c.fillStyle = d.getSeconds() % 2 ? DIM : ACC;
  c.fillRect(x0 + 12 * u, y0 + 2 * u, u, u);
  c.fillRect(x0 + 12 * u, y0 + 6 * u, u, u);
  const sx = x0 + 27 * u, sy = y0 + 9 * u - 9 * u2;
  seg(sx, sy, +secs[0], u2, ACC);
  seg(sx + 6 * u2, sy, +secs[1], u2, ACC);
}

function handsAt(c, cols, rows, d, R, style) {
  const cxp = cols / 2, cyp = rows / 2;
  const pt = (ang, rad) => [cxp + Math.cos(ang) * rad, cyp + Math.sin(ang) * rad];
  const line = (ang, r0, r1, w, color) => {
    c.strokeStyle = color; c.lineWidth = w;
    const [x1, y1] = pt(ang, r0), [x2, y2] = pt(ang, r1);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  };
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds(), o = -Math.PI / 2;
  const railway = style === "railway";
  c.lineCap = railway ? "butt" : "round";
  for (let k = 0; k < 60; k++) {
    const ang = (k / 60) * TAU + o;
    if (k % 5 === 0) line(ang, R * (railway ? 0.74 : k % 15 === 0 ? 0.78 : 0.86), R, Math.max(1, R * (railway ? 0.075 : 0.045)), INK);
    else if (railway) line(ang, R * 0.9, R, Math.max(0.8, R * 0.025), INK);
    else { c.fillStyle = DIM; const [x, y] = pt(ang, R * 0.97); c.fillRect(Math.round(x - 0.5), Math.round(y - 0.5), 1, 1); }
  }
  line(((h + m / 60) / 12) * TAU + o, -R * (railway ? 0.18 : 0), R * (railway ? 0.62 : 0.5), Math.max(1.4, R * (railway ? 0.12 : 0.09)), INK);
  line(((m + s / 60) / 60) * TAU + o, -R * (railway ? 0.18 : 0), R * (railway ? 0.92 : 0.76), Math.max(1.1, R * (railway ? 0.09 : 0.06)), INK);
  const sa = (s / 60) * TAU + o;
  line(sa, -R * (railway ? 0.25 : 0.16), R * (railway ? 0.64 : 0.88), Math.max(0.9, R * 0.03), ACC);
  c.fillStyle = ACC;
  if (railway) { const [x, y] = pt(sa, R * 0.64); c.beginPath(); c.arc(x, y, Math.max(1.2, R * 0.09), 0, TAU); c.fill(); }
  c.beginPath(); c.arc(cxp, cyp, Math.max(1, R * 0.06), 0, TAU); c.fill();
}
const faceAnalog = (c, cols, rows, d) => handsAt(c, cols, rows, d, Math.min(cols, rows) * 0.4, "analog");
const faceRailway = (c, cols, rows, d) => handsAt(c, cols, rows, d, Math.min(cols, rows) * 0.42, "railway");

function faceBinary(c, cols, rows, d) {
  const vals = [Math.floor(d.getHours() / 10), d.getHours() % 10, Math.floor(d.getMinutes() / 10), d.getMinutes() % 10, Math.floor(d.getSeconds() / 10), d.getSeconds() % 10];
  const bits = [2, 4, 3, 4, 3, 4];
  const s = Math.max(1, Math.floor(Math.min((cols * 0.5) / 8, (rows * 0.55) / 4)));
  const sq = Math.max(1, s - Math.max(1, Math.round(s / 4)));
  const x0 = Math.round((cols - 8 * s) / 2), y0 = Math.round((rows - 4 * s) / 2);
  for (let col = 0; col < 6; col++) {
    const x = x0 + col * s + Math.floor(col / 2) * s;
    for (let b = 0; b < bits[col]; b++) {
      c.fillStyle = (vals[col] >> b) & 1 ? (col >= 4 ? ACC : INK) : DIM;
      c.fillRect(x, y0 + (3 - b) * s, sq, sq);
    }
  }
}

// Concentric dot rings: hours, minutes, seconds filling up, with the time in the middle.
function faceRing(c, cols, rows, d) {
  const R = Math.min(cols, rows) * 0.44, cxp = cols / 2, cyp = rows / 2;
  const ring = (n, r, lit, head) => {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * TAU - Math.PI / 2;
      c.fillStyle = k === head ? ACC : k < lit ? INK : DIM;
      c.fillRect(Math.round(cxp + Math.cos(ang) * r - 0.5), Math.round(cyp + Math.sin(ang) * r - 0.5), 1, 1);
    }
  };
  const s = d.getSeconds(), m = d.getMinutes(), h = d.getHours() % 12;
  // Fewer dots on small rings so neighbours don't merge.
  const fit = (r) => (TAU * r >= 90 ? 60 : 30);
  const ns = fit(R), nm = fit(R * 0.82);
  ring(ns, R, Math.floor((s * ns) / 60), Math.floor((s * ns) / 60));
  ring(nm, R * 0.82, Math.floor((m * nm) / 60), -1);
  ring(12, R * 0.64, h, -1);
  const str = `${pad(d.getHours())}:${pad(m)}`, sc = Math.max(1, Math.floor((R * 0.9) / glyphW(F3, str)));
  bitmap(c, F3, str, Math.round(cxp - (glyphW(F3, str) * sc) / 2), Math.round(cyp - (5 * sc) / 2), sc, INK);
}

// A word clock in the QLOCKTWO tradition.
const WORD_GRID = ["ITLISASAMPM", "ACQUARTERDC", "TWENTYFIVEX", "HALFSTENFTO", "PASTERUNINE", "ONESIXTHREE", "FOURFIVETWO", "EIGHTELEVEN", "SEVENTWELVE", "TENSEOCLOCK"];
const W = {
  IT: [0, 0, 2], IS: [0, 3, 2], A: [1, 0, 1], QUARTER: [1, 2, 7], TWENTY: [2, 0, 6], FIVEM: [2, 6, 4], HALF: [3, 0, 4], TENM: [3, 5, 3], TO: [3, 9, 2], PAST: [4, 0, 4],
  H9: [4, 7, 4], H1: [5, 0, 3], H6: [5, 3, 3], H3: [5, 6, 5], H4: [6, 0, 4], H5: [6, 4, 4], H2: [6, 8, 3], H8: [7, 0, 5], H11: [7, 5, 6], H7: [8, 0, 5], H12: [8, 5, 6], H10: [9, 0, 3], OCLOCK: [9, 5, 6],
};
function faceWord(c, cols, rows, d) {
  const m5 = Math.floor(d.getMinutes() / 5) * 5;
  let h = d.getHours() % 12;
  const words = ["IT", "IS"];
  const mins = { 0: ["OCLOCK"], 5: ["FIVEM", "PAST"], 10: ["TENM", "PAST"], 15: ["A", "QUARTER", "PAST"], 20: ["TWENTY", "PAST"], 25: ["TWENTY", "FIVEM", "PAST"], 30: ["HALF", "PAST"], 35: ["TWENTY", "FIVEM", "TO"], 40: ["TWENTY", "TO"], 45: ["A", "QUARTER", "TO"], 50: ["TENM", "TO"], 55: ["FIVEM", "TO"] }[m5];
  if (m5 > 30) h = (h + 1) % 12;
  words.push(...mins, "H" + (h === 0 ? 12 : h));
  const lit = new Set();
  for (const w of words) { const [r, col, len] = W[w]; for (let k = 0; k < len; k++) lit.add(r * 11 + col + k); }
  const s = Math.max(1, Math.floor(Math.min((cols * 0.82) / 44, (rows * 0.84) / 60)));
  const x0 = Math.round((cols - 43 * s) / 2), y0 = Math.round((rows - 59 * s) / 2);
  for (let r = 0; r < 10; r++)
    for (let col = 0; col < 11; col++) bitmap(c, F3, WORD_GRID[r][col], x0 + col * 4 * s, y0 + r * 6 * s, s, lit.has(r * 11 + col) ? INK : DIM);
  c.fillStyle = ACC;
  const extra = d.getMinutes() % 5;
  const corners = [[x0 - 2 * s, y0 - 2 * s], [x0 + 44 * s, y0 - 2 * s], [x0 + 44 * s, y0 + 60 * s], [x0 - 2 * s, y0 + 60 * s]];
  for (let k = 0; k < extra; k++) c.fillRect(corners[k][0], corners[k][1], s, s);
}

// Day, hour and minute as dotted progress bars under the time.
function faceProgress(c, cols, rows, d) {
  const str = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const wu = glyphW(F5, str);
  const s = Math.max(1, Math.floor(Math.min((cols * 0.4) / wu, (rows * 0.22) / 7)));
  const width = Math.round(cols * 0.56), x0 = Math.round((cols - width) / 2);
  const gap = Math.max(2, s * 2), total = 7 * s + gap * 4;
  let y = Math.round((rows - total) / 2);
  bitmap(c, F5, str, x0, y, s, INK);
  y += 7 * s + gap * 1.5;
  const bars = [[24, d.getHours() + d.getMinutes() / 60], [60, d.getMinutes() + d.getSeconds() / 60], [60, d.getSeconds()]];
  bars.forEach(([n, v], k) => {
    const step = Math.max(1, Math.floor(width / n));
    for (let i = 0; i < n; i++) {
      c.fillStyle = i < Math.floor(v) ? (k === 2 ? ACC : INK) : DIM;
      c.fillRect(x0 + i * step, Math.round(y + k * gap), 1, 1);
    }
  });
}

// Typeset faces: real fonts rasterised into the grid; antialiasing becomes halftone edges.
function typeFace(family, weight, { italic = false, upper = 0.42, secs = true, tracking = 0 } = {}) {
  return (c, cols, rows, d) => {
    const str = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    let size = rows * upper;
    const font = (sz) => `${italic ? "italic " : ""}${weight} ${sz}px ${family}`;
    c.font = font(size);
    if ("letterSpacing" in c) c.letterSpacing = `${tracking * size}px`;
    const w = c.measureText(str).width;
    if (w > cols * 0.72) size *= (cols * 0.72) / w;
    c.font = font(size);
    if ("letterSpacing" in c) c.letterSpacing = `${tracking * size}px`;
    const m = c.measureText(str);
    const asc = m.actualBoundingBoxAscent || size * 0.7, desc = m.actualBoundingBoxDescent || 0;
    const base = rows / 2 + (asc - desc) / 2;
    c.fillStyle = INK;
    c.fillText(str, cols / 2, base);
    if (secs) {
      const ss = size * 0.24;
      c.font = font(ss);
      if ("letterSpacing" in c) c.letterSpacing = "0px";
      c.fillStyle = ACC;
      c.textAlign = "left";
      c.fillText(pad(d.getSeconds()), cols / 2 + m.width / 2 + size * 0.06, base);
      c.textAlign = "center";
    }
  };
}

export const FACES = {
  dot: faceDot,
  serif: typeFace('"Instrument Serif", Georgia, serif', 400, { italic: true, upper: 0.5 }),
  grotesk: typeFace('Inter, "Segoe UI", sans-serif', 800, { upper: 0.44, tracking: -0.05 }),
  mono: typeFace('"JetBrains Mono", Consolas, monospace', 700, { upper: 0.36 }),
  condensed: typeFace('"Bebas Neue", Impact, sans-serif', 400, { upper: 0.6, secs: false }),
  seg: faceSeg,
  analog: faceAnalog,
  railway: faceRailway,
  ring: faceRing,
  word: faceWord,
  progress: faceProgress,
  binary: faceBinary,
  full: faceFull,
};
export const FACE_FONTS = ['italic 400 20px "Instrument Serif"', '800 20px Inter', '700 20px "JetBrains Mono"', '400 20px "Bebas Neue"'];

export function buildClockMask(style, cols, rows, date, drift) {
  const c = surface(cols, rows);
  (FACES[style] || faceDot)(c, cols, rows, date);
  const px = c.getImageData(0, 0, cols, rows).data;
  // Clamp the burn-in drift so the face never leaves the screen.
  let x0 = cols, x1 = -1, y0 = rows, y1 = -1;
  for (let j = 0; j < cols * rows; j++) {
    if (px[j * 4 + 3] < 32) continue;
    const x = j % cols, y = (j / cols) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const mg = 1;
  const dx = x1 < 0 ? 0 : Math.max(mg - x0, Math.min(cols - 1 - mg - x1, drift.x));
  const dy = y1 < 0 ? 0 : Math.max(mg - y0, Math.min(rows - 1 - mg - y1, drift.y));
  const tone = new Uint8Array(cols * rows);
  const alpha = new Float32Array(cols * rows);
  for (let j = 0; j < cols * rows; j++) {
    const i = j * 4;
    if (px[i + 3] < 32) continue;
    const x = (j % cols) + dx, y = ((j / cols) | 0) + dy;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const k = y * cols + x;
    tone[k] = px[i] > 127 ? 1 : px[i + 1] > 127 ? 3 : 4;
    alpha[k] = px[i + 3] / 255;
  }
  const halo = Math.max(2, Math.round(Math.min(cols, rows) / 40));
  const out = tone.slice();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!tone[y * cols + x]) continue;
      for (let ey = -halo; ey <= halo; ey++)
        for (let ex = -halo; ex <= halo; ex++) {
          const xx = x + ex, yy = y + ey;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          const j = yy * cols + xx;
          if (!out[j]) out[j] = 2;
        }
    }
  return { tone: out, alpha };
}
