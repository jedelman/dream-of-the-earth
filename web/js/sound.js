// Little sounds, synthesized: no audio files. The audio context starts on the
// first tap (browsers allow sound only after a gesture). M mutes; the choice is
// remembered on this device.
import { mulberry32 } from "./rng.js";

let ctx = null, master = null, noiseBuf = null;
let muted = false, unlocked = false;
try { muted = localStorage.getItem("dream-muted") === "1"; } catch { /* private mode: not remembered */ }

function audio() {
  if (muted || !unlocked) return null;
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    const r = mulberry32(99);
    for (let k = 0; k < d.length; k++) d[k] = r() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
const env = (g, t, peak, attack, release) => {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
};
function tone(type, f0, f1, t, dur, peak, f2 = null) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.4);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, peak, 0.01, dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, peak, type, f0, f1, q = 1) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, peak, 0.02, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t); s.stop(t + dur + 0.1);
}

export const sound = {
  get muted() { return muted; },
  /** Call from a user gesture: browsers allow sound only after one. */
  unlock() { unlocked = true; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem("dream-muted", muted ? "1" : "0"); } catch { /* not remembered */ }
    if (muted && ctx) ctx.suspend();
    return muted;
  },
  /** A creature's squeak: smaller creatures squeak higher. */
  squeak(pitch = 1) {
    if (!audio()) return;
    const t = ctx.currentTime;
    tone("triangle", 900 * pitch, 1900 * pitch, t, 0.16, 0.5, 1300 * pitch);
  },
  /** A cairn answering: a click of stone, then a small bell. */
  chime() {
    if (!audio()) return;
    const t = ctx.currentTime;
    noise(t, 0.05, 0.25, "bandpass", 2400, 1800, 6);
    tone("sine", 784, 783, t + 0.04, 1.8, 0.22);
    tone("sine", 1176, 1174, t + 0.05, 1.4, 0.09);
    tone("sine", 1568, 1565, t + 0.06, 0.9, 0.04);
  },
  /** A butterfly's two quick chirps. */
  chirp() {
    if (!audio()) return;
    const t = ctx.currentTime;
    tone("sine", 2600, 3400, t, 0.06, 0.25);
    tone("sine", 2900, 3800, t + 0.09, 0.06, 0.2);
  },
  /** A firefly's glow: one soft rising bell. */
  glow() {
    if (!audio()) return;
    const t = ctx.currentTime;
    tone("sine", 880, 1320, t, 0.5, 0.14);
    tone("sine", 1320, 1980, t + 0.12, 0.6, 0.07);
  },
  /** Something vast humming back: two low voices, slightly apart. */
  hum() {
    if (!audio()) return;
    const t = ctx.currentTime;
    tone("sine", 72, 70, t, 2.2, 0.5, 66);
    tone("sine", 108.5, 104, t + 0.15, 2.0, 0.25, 99);
    tone("triangle", 216, 211, t + 0.3, 1.6, 0.06);
  },
  /** Leaves: a burst of filtered noise. */
  rustle() {
    if (!audio()) return;
    const t = ctx.currentTime;
    noise(t, 0.7, 0.35, "bandpass", 2400, 1400, 0.8);
    noise(t + 0.12, 0.5, 0.2, "bandpass", 3200, 1800, 1.2);
  },
  /** Something heavy landing (a coconut, a cone). */
  thud() {
    if (!audio()) return;
    const t = ctx.currentTime + 0.35;
    tone("sine", 140, 60, t, 0.18, 0.6);
  },
  /** A bunny's two little sniffs. */
  sniff() {
    if (!audio()) return;
    const t = ctx.currentTime;
    noise(t, 0.07, 0.18, "bandpass", 3200, 2600, 3);
    noise(t + 0.13, 0.06, 0.15, "bandpass", 3400, 2800, 3);
  },
  /** A frog: a low, buzzy croak, twice. Bigger frogs croak lower. quiet: one far off, at night. */
  croak(pitch = 1, quiet = false) {
    if (!audio()) return;
    const t = ctx.currentTime, v = quiet ? 0.06 : 0.22;
    tone("sawtooth", 210 * pitch, 150 * pitch, t, 0.11, v, 170 * pitch);
    tone("sawtooth", 230 * pitch, 160 * pitch, t + 0.17, 0.14, v * 0.9, 180 * pitch);
  },
  /** A little bird's song: a few bright notes, different every time it's asked (n). quiet: one off in the trees. */
  song(n = 0, quiet = false) {
    if (!audio()) return;
    const t = ctx.currentTime, v = quiet ? 0.05 : 0.18;
    const notes = 3 + (n % 3);
    for (let i = 0; i < notes; i++) {
      const f = 2600 + ((n * 7 + i * 5) % 9) * 260;
      tone("sine", f, f * (i % 2 ? 1.25 : 0.85), t + i * 0.11, 0.08, v);
    }
  },
  /** Wings: little birds taking off. */
  flutter() {
    if (!audio()) return;
    const t = ctx.currentTime;
    noise(t, 0.35, 0.16, "bandpass", 1100, 700, 1.5);
  },
  /** A shrine taking you: a rising shimmer, a different chord for each kind of spell. */
  shrine(kind = "shape") {
    if (!audio()) return;
    const t = ctx.currentTime;
    const root = { shape: 392, camera: 440, world: 349.2 }[kind] ?? 392;
    noise(t, 1.6, 0.12, "bandpass", 1200, 5200, 2);
    [1, 1.25, 1.5, 1.875, 2.5].forEach((m, i) => {
      tone("sine", root * m, root * m * 1.003, t + i * 0.09, 1.8 - i * 0.15, 0.13);
      tone("triangle", root * m * 2.002, root * m * 2, t + i * 0.09 + 0.02, 0.9, 0.03);
    });
  },
  /** Stepping onto a highway: a rising rush. */
  whoosh() {
    if (!audio()) return;
    const t = ctx.currentTime;
    noise(t, 0.9, 0.35, "lowpass", 300, 4000, 0.7);
    tone("sine", 220, 880, t, 0.9, 0.15, 1320);
  },
};
