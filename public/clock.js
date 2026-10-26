// Clock faces rendered into a dot mask: 1 = ink, 2 = halo, 3 = accent, 4 = dim.

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
  "/": ["001", "001", "010", "100", "100"], " ": ["000", "000", "000", "000", "000"],
  A: ["010", "101", "111", "101", "101"], D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
  H: ["101", "101", "111", "101", "101"], I: ["111", "010", "010", "010", "111"],
  M: ["101", "111", "111", "101", "101"], N: ["110", "101", "101", "101", "101"],
  O: ["111", "101", "101", "101", "111"], R: ["110", "101", "110", "101", "101"],
  S: ["111", "100", "111", "001", "111"], T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"], W: ["101", "101", "111", "111", "101"],
};
const SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const INK = "#ff0000", ACC = "#00ff00", DIM = "#0000ff";
const pad = (n) => String(n).padStart(2, "0");

let cv, cx;
function surface(cols, rows) {
  if (!cv) {
    cv = document.createElement("canvas");
    cx = cv.getContext("2d", { willReadFrequently: true });
  }
  if (cv.width !== cols || cv.height !== rows) { cv.width = cols; cv.height = rows; }
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.clearRect(0, 0, cols, rows);
  return cx;
}

const glyphW = (font, str, gap = 1) => [...str].reduce((s, ch) => s + font[ch][0].length, 0) + gap * (str.length - 1);
function bitmap(c, font, str, x, y, s, color, gap = 1) {
  c.fillStyle = color;
  let px = x;
  for (const ch of str) {
    const g = font[ch];
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
  // Seconds as a dotted progress track
  const ty = y0 + 9 * s + 5 * s2 + 2 * s;
  const steps = 60, len = w1;
  for (let k = 0; k < steps; k += 2) {
    const x = x0 + Math.round((k / steps) * len);
    c.fillStyle = k <= d.getSeconds() ? ACC : DIM;
    c.fillRect(x, ty, Math.max(1, s2), Math.max(1, s2));
  }
}

function faceSeg(c, cols, rows, d) {
  const digits = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  const secs = pad(d.getSeconds());
  // Widths in units: 4 digits (5u) + gaps + colon; seconds at half scale.
  const u = Math.max(1, Math.floor(Math.min((cols * 0.7) / 31.5, (rows * 0.42) / 9)));
  const u2 = Math.max(1, Math.floor(u / 2));
  const total = 25 * u + 2 * u + 11 * u2;
  const x0 = Math.round((cols - total) / 2), y0 = Math.round((rows - 9 * u) / 2);
  const seg = (x, y, n, uu, color) => {
    c.fillStyle = color;
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

function faceAnalog(c, cols, rows, d) {
  const R = Math.min(cols, rows) * 0.4;
  const cxp = cols / 2, cyp = rows / 2;
  const pt = (ang, rad) => [cxp + Math.cos(ang) * rad, cyp + Math.sin(ang) * rad];
  c.lineCap = "round";
  for (let k = 0; k < 60; k++) {
    const ang = (k / 60) * Math.PI * 2 - Math.PI / 2;
    if (k % 5 === 0) {
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, R * 0.045);
      const [x1, y1] = pt(ang, R * (k % 15 === 0 ? 0.78 : 0.86));
      const [x2, y2] = pt(ang, R);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    } else {
      c.fillStyle = DIM;
      const [x, y] = pt(ang, R * 0.97);
      c.fillRect(Math.round(x - 0.5), Math.round(y - 0.5), 1, 1);
    }
  }
  const hand = (ang, len, width, color, tail = 0) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    const [x1, y1] = pt(ang + Math.PI, tail);
    const [x2, y2] = pt(ang, len);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  };
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
  const T = Math.PI * 2, o = -Math.PI / 2;
  hand(((h + m / 60) / 12) * T + o, R * 0.5, Math.max(1.4, R * 0.09), INK);
  hand(((m + s / 60) / 60) * T + o, R * 0.76, Math.max(1.1, R * 0.06), INK);
  hand((s / 60) * T + o, R * 0.88, Math.max(0.9, R * 0.03), ACC, R * 0.16);
  c.fillStyle = ACC;
  c.beginPath(); c.arc(cxp, cyp, Math.max(1, R * 0.07), 0, T); c.fill();
}

function faceBinary(c, cols, rows, d) {
  const vals = [Math.floor(d.getHours() / 10), d.getHours() % 10, Math.floor(d.getMinutes() / 10), d.getMinutes() % 10, Math.floor(d.getSeconds() / 10), d.getSeconds() % 10];
  const bits = [2, 4, 3, 4, 3, 4];
  const s = Math.max(1, Math.floor(Math.min((cols * 0.5) / 8, (rows * 0.55) / 4)));
  const sq = Math.max(1, s - Math.max(1, Math.round(s / 4)));
  const width = 6 * s + 2 * s;
  const x0 = Math.round((cols - width) / 2), y0 = Math.round((rows - 4 * s) / 2);
  for (let col = 0; col < 6; col++) {
    const x = x0 + col * s + Math.floor(col / 2) * s;
    for (let b = 0; b < bits[col]; b++) {
      const on = (vals[col] >> b) & 1;
      c.fillStyle = on ? (col >= 4 ? ACC : INK) : DIM;
      c.fillRect(x, y0 + (3 - b) * s, sq, sq);
    }
  }
}

const FACES = { dot: faceDot, full: faceFull, seg: faceSeg, analog: faceAnalog, binary: faceBinary };

export function buildClockMask(style, cols, rows, date, drift) {
  const c = surface(cols, rows);
  (FACES[style] || faceDot)(c, cols, rows, date);
  const px = c.getImageData(0, 0, cols, rows).data;
  // Clamp the burn-in drift so the face never leaves the screen.
  let x0 = cols, x1 = -1, y0 = rows, y1 = -1;
  for (let j = 0; j < cols * rows; j++) {
    if (px[j * 4 + 3] < 100) continue;
    const x = j % cols, y = (j / cols) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const m = 1;
  const dx = x1 < 0 ? 0 : Math.max(m - x0, Math.min(cols - 1 - m - x1, drift.x));
  const dy = y1 < 0 ? 0 : Math.max(m - y0, Math.min(rows - 1 - m - y1, drift.y));
  const mask = new Uint8Array(cols * rows);
  for (let j = 0; j < cols * rows; j++) {
    const i = j * 4;
    if (px[i + 3] < 100) continue;
    const x = (j % cols) + dx, y = ((j / cols) | 0) + dy;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    mask[y * cols + x] = px[i] > 127 ? 1 : px[i + 1] > 127 ? 3 : 4;
  }
  const halo = Math.max(2, Math.round(Math.min(cols, rows) / 40));
  const out = mask.slice();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!mask[y * cols + x]) continue;
      for (let dy = -halo; dy <= halo; dy++)
        for (let dx = -halo; dx <= halo; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          const j = yy * cols + xx;
          if (!out[j]) out[j] = 2;
        }
    }
  return out;
}
