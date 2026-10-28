// GPU dot renderer: every dot is one instanced quad, shaped and anti-aliased in the fragment
// shader. The engine fills it with positions, radii and colours each frame and copies the
// result onto its 2D canvas. Where WebGL2 isn't available (or the context is lost) `ok` is
// false and the engine keeps drawing with Canvas 2D.

const VERT = `#version 300 es
in vec2 corner;
in vec3 inst;
in vec3 color;
uniform vec2 res;
uniform float dpr;
out vec2 local;
out float rad;
out float fade;
out vec3 col;
void main() {
  float r = inst.z * dpr;
  // Sub-pixel dots are drawn at half a pixel and faded by area, as a rasteriser would.
  fade = r < 0.5 ? (r * r) / 0.25 : 1.0;
  rad = max(r, 0.5);
  local = corner * (rad + 1.0);
  vec2 p = inst.xy * dpr + local;
  gl_Position = vec4(p / res * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  col = color;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 local;
in float rad;
in float fade;
in vec3 col;
uniform bool circle;
out vec4 outColor;
void main() {
  float d = circle ? length(local) : max(abs(local.x), abs(local.y));
  float a = clamp(rad - d + 0.5, 0.0, 1.0) * fade;
  if (a <= 0.0) discard;
  outColor = vec4(col * a, a);
}`;

export class GLDots {
  constructor() {
    this.ok = false;
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(pr, 0, "corner");
    gl.bindAttribLocation(pr, 1, "inst");
    gl.bindAttribLocation(pr, 2, "color");
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    this.u = { res: gl.getUniformLocation(pr, "res"), dpr: gl.getUniformLocation(pr, "dpr"), circle: gl.getUniformLocation(pr, "circle") };

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    this.colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.UNSIGNED_BYTE, true, 4, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.ok = false; });
    this.gl = gl;
    this.alloc(16384);
    this.n = 0;
    this.ok = true;
  }
  alloc(cap) {
    const pos = new Float32Array(cap * 3), col = new Uint8Array(cap * 4);
    if (this.pos) { pos.set(this.pos); col.set(this.col); }
    this.cap = cap; this.pos = pos; this.col = col;
  }
  // Starts a frame the size of `target` (a canvas), with the given CSS-pixel ratio.
  begin(target, dpr) {
    const c = this.canvas;
    if (c.width !== target.width || c.height !== target.height) { c.width = target.width; c.height = target.height; }
    this.dpr = dpr;
    this.n = 0;
  }
  // x, y and radius in CSS pixels; rgb is a [r, g, b] triple of 0–255.
  push(x, y, r, rgb) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++, p = i * 3, q = i * 4;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = r;
    this.col[q] = rgb[0]; this.col[q + 1] = rgb[1]; this.col[q + 2] = rgb[2];
  }
  // Draws the frame over `bg` and copies it onto ctx (whose transform is reset first).
  flush(ctx, bg, circle) {
    const { gl, canvas } = this;
    if (!canvas.width || !canvas.height) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.n) {
      gl.uniform2f(this.u.res, canvas.width, canvas.height);
      gl.uniform1f(this.u.dpr, this.dpr);
      gl.uniform1i(this.u.circle, circle ? 1 : 0);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.pos.subarray(0, this.n * 3), gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.col.subarray(0, this.n * 4), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(canvas, 0, 0);
  }
}
