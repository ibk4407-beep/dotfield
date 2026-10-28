// Sound input: the PC's own audio (captured through screen sharing with "share system audio")
// or the microphone, reduced each frame to a few smoothed bands, a log spectrum, a waveform
// and beats. Nothing is recorded or sent anywhere.
export const BANDS = 48;
const WAVE = 1024;
const { exp, max, min, sqrt, sin, floor, abs } = Math;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

class Sound {
  constructor() {
    this.on = false;
    this.source = null;
    this.level = this.bass = this.mid = this.high = this.beat = 0;
    this.beats = 0;
    this.spec = new Float32Array(BANDS);
    this.wave = new Float32Array(WAVE);
    this.left = new Float32Array(256);
    this.right = new Float32Array(256);
    this.onchange = null;
    this.t = 0;
    this._fake = { t: -1, spec: new Float32Array(BANDS), wave: new Float32Array(WAVE), left: new Float32Array(256), right: new Float32Array(256) };
  }

  // "system" asks for a shared screen with its audio; "mic" for the microphone.
  async start(source = "system") {
    this.stop();
    let stream;
    if (source === "mic") {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } else {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("unsupported");
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
        systemAudio: "include", windowAudio: "system", selfBrowserSurface: "exclude", surfaceSwitching: "exclude", monitorTypeSurfaces: "include",
      });
      // Only the sound is needed; dropping the picture keeps the share cheap.
      for (const v of stream.getVideoTracks()) v.stop();
      if (!stream.getAudioTracks().length) throw new Error("noaudio");
    }
    const track = stream.getAudioTracks()[0];
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0.55;
    const split = ctx.createChannelSplitter(2);
    const anL = ctx.createAnalyser(), anR = ctx.createAnalyser();
    anL.fftSize = anR.fftSize = 512;
    // Analysers only run while connected to the output; a muted gain keeps them pulled.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(an); src.connect(split);
    split.connect(anL, 0); split.connect(anR, 1);
    an.connect(mute); anL.connect(mute); anR.connect(mute);
    mute.connect(ctx.destination);
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const bins = an.frequencyBinCount, hz = ctx.sampleRate / an.fftSize;
    // Log-spaced band edges from 32 Hz to 14 kHz.
    const edges = new Int32Array(BANDS + 1);
    for (let i = 0; i <= BANDS; i++) edges[i] = min(bins - 1, max(1, Math.round((32 * Math.pow(14000 / 32, i / BANDS)) / hz)));
    this.io = { stream, track, ctx, an, anL, anR, freq: new Float32Array(bins), time: new Float32Array(an.fftSize), tl: new Float32Array(512), tr: new Float32Array(512), edges, raw: new Float32Array(BANDS) };
    this.peak = 0.35; this.lvPeak = 0.08; this.avgBass = 0; this.prevBass = 0; this.lastBeat = 0;
    track.addEventListener("ended", () => this.stop());
    this.on = true;
    this.source = source;
    this.onchange?.(true);
  }

  stop() {
    const io = this.io;
    this.io = null;
    if (io) {
      for (const tr of io.stream.getTracks()) tr.stop();
      io.ctx.close().catch(() => {});
    }
    const was = this.on;
    this.on = false;
    this.feedAt = 0;
    this.level = this.bass = this.mid = this.high = this.beat = 0;
    this.spec.fill(0); this.wave.fill(0); this.left.fill(0); this.right.fill(0);
    if (was) this.onchange?.(false);
  }

  // Called once per frame by the engine.
  update(dt) {
    this.t += dt;
    if (this.feedAt && performance.now() - this.feedAt > 1500) { this.on = false; this.feedAt = 0; this.onchange?.(false); }
    const io = this.io;
    if (!io) { if (!this.feedAt) this.beat *= exp(-dt * 7); return; }
    const { an, anL, anR, freq, time, tl, tr, edges, raw } = io;
    an.getFloatFrequencyData(freq);
    an.getFloatTimeDomainData(time);
    let top = 0;
    for (let b = 0; b < BANDS; b++) {
      const a = edges[b], z = max(a + 1, edges[b + 1]);
      let s = -200;
      for (let i = a; i < z; i++) s = max(s, freq[i]);
      // Treble carries less energy; tilt it up so the spectrum reads evenly.
      const v = clamp01((s + 84 + (b / BANDS) * 14) / 56);
      raw[b] = v;
      if (v > top) top = v;
    }
    // Slow automatic gain so quiet and loud sources both fill the range.
    this.peak = max(0.32, top > this.peak ? top : this.peak - dt * 0.04);
    const g = 1 / this.peak;
    const kUp = min(1, dt * 30), kDn = min(1, dt * 7);
    let bass = 0, mid = 0, high = 0;
    for (let b = 0; b < BANDS; b++) {
      const v = clamp01(raw[b] * g) ** 2;
      const c = this.spec[b];
      this.spec[b] = c + (v - c) * (v > c ? kUp : kDn);
      if (b < 10) bass += v; else if (b < 30) mid += v; else high += v;
    }
    bass /= 10; mid /= 20; high /= 18;
    let rms = 0;
    for (let i = 0; i < time.length; i++) rms += time[i] * time[i];
    rms = sqrt(rms / time.length);
    this.lvPeak = max(0.04, rms > this.lvPeak ? rms : this.lvPeak - dt * 0.01);
    const level = clamp01(rms / this.lvPeak);
    const ease = (cur, v) => cur + (v - cur) * (v > cur ? kUp : kDn);
    this.bass = ease(this.bass, bass); this.mid = ease(this.mid, mid); this.high = ease(this.high, high); this.level = ease(this.level, level);

    // Beats: the bass jumping clearly above its recent average.
    this.avgBass += (bass - this.avgBass) * min(1, dt * 2.2);
    const now = this.t;
    if (bass > this.avgBass * 1.22 + 0.05 && bass - this.prevBass > 0.025 && now - this.lastBeat > 0.26 && level > 0.08) {
      this.lastBeat = now;
      this.beats++;
      this.beat = 1;
    } else this.beat *= exp(-dt * 7);
    this.prevBass = bass;

    // The waveform starts at a rising zero crossing so it holds still on screen.
    let z0 = 0;
    for (let i = 1; i < time.length - WAVE; i++) if (time[i - 1] < 0 && time[i] >= 0) { z0 = i; break; }
    const wg = 0.9 / this.lvPeak / 2.4;
    for (let i = 0; i < WAVE; i++) this.wave[i] = time[z0 + i] * wg;
    anL.getFloatTimeDomainData(tl); anR.getFloatTimeDomainData(tr);
    let rSum = 0;
    for (let i = 0; i < 256; i++) rSum += abs(tr[i * 2]);
    const mono = rSum < 1e-4;
    for (let i = 0; i < 256; i++) { this.left[i] = tl[i * 2] * wg; this.right[i] = (mono ? tl[(i * 2 + 37) % 512] : tr[i * 2]) * wg; }
  }

  // A compact frame for display windows, which can't open their own capture.
  frame() {
    return { level: this.level, bass: this.bass, mid: this.mid, high: this.high, beat: this.beat, beats: this.beats, spec: this.spec, wave: this.wave, left: this.left, right: this.right };
  }
  feed(f) {
    if (this.io) return;
    if (!this.on) { this.on = true; this.onchange?.(true); }
    this.feedAt = performance.now();
    for (const k of ["level", "bass", "mid", "high", "beat", "beats"]) this[k] = f[k];
    this.spec.set(f.spec); this.wave.set(f.wave); this.left.set(f.left); this.right.set(f.right);
  }

  // A calm stand-in signal for sound scenes while nothing is connected (and for previews).
  fake(t) {
    const F = this._fake;
    if (F.t === t) return F;
    F.t = t;
    const ph = t * (96 / 60), fr = ph - floor(ph);
    const beat = exp(-fr * 6) * (floor(ph) % 4 === 3 ? 0.6 : 1);
    F.beat = beat; F.beats = floor(ph);
    F.bass = 0.25 + 0.45 * beat;
    F.mid = 0.3 + 0.12 * sin(t * 0.7);
    F.high = 0.2 + 0.1 * sin(t * 1.9 + 1);
    F.level = 0.35 + 0.25 * beat;
    for (let b = 0; b < BANDS; b++) {
      const x = b / BANDS;
      const v = (0.62 - x * 0.42) + (x < 0.22 ? beat * 0.35 * (1 - x / 0.22) : 0)
        + 0.16 * sin(x * 9 + t * 1.3) + 0.1 * sin(x * 23 - t * 2.1) + 0.06 * sin(x * 51 + t * 5.3);
      F.spec[b] = clamp01(v * 0.75);
    }
    for (let i = 0; i < WAVE; i++) {
      const a = (i / WAVE) * Math.PI * 2;
      F.wave[i] = (0.32 + beat * 0.2) * sin(a * 2) + 0.12 * sin(a * 7 + t * 3) + 0.05 * sin(a * 19 - t * 7);
    }
    for (let i = 0; i < 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      F.left[i] = (0.4 + beat * 0.15) * sin(a * 3 + t * 0.5);
      F.right[i] = (0.4 + beat * 0.15) * sin(a * 2 + t * 0.31);
    }
    return F;
  }
}

export const sound = new Sound();
// What a scene should listen to: the live signal, or the stand-in.
export const sig = (A) => (sound.on ? sound : sound.fake(A.t));
