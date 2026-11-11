// Film a trailer: node scripts/trailer.mjs [baseUrl] [outDir] [shot,shot]
// One-second clips of Dream's main moments, cut together, ending on a long shot of the start screen (the birth question)
// over the turning globe, with a score made for the trailer. Needs web/ served (e.g. `python3 -m http.server 8788
// --directory web`), Playwright, and ffmpeg. Writes trailer.mp4. Name shots to retake just those and recut.
//
// It films with the game's own film mode (?film=30, __dream.filmStart/filmStep): each frame is exactly 1/30 s of game
// time, however slowly a headless browser renders it, and each is screenshotted. The clock is the real one, so where
// it's day and night depends on when you film: the shots below go where the light is at filming time (see SHOTS).
// Tiles come from AWS: the browser goes through the session's proxy when there is one.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = (process.argv[2] || 'http://127.0.0.1:8788/').replace(/\/?$/, '/');
const out = process.argv[3] || 'trailer-out';
const only = process.argv[4] ? process.argv[4].split(',') : null;
fs.mkdirSync(out, { recursive: true });
const W = 1280, H = 720, FPS = 30, FADE = 0.6, HOLD = 6;
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;

const browser = await chromium.launch({ proxy, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
// Steps only queue the drawing; a screenshot flushes it. The eye rising through the sky is the slowest thing to draw
// in software rendering (up to a minute for a frame), so be patient, and flush as you go.
page.setDefaultTimeout(300000);
const flush = () => page.screenshot({ type: 'jpeg', quality: 10, clip: { x: 0, y: 0, width: 16, height: 16 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const CLEAN = '#hud, #corner, #status, #log, #whos, #help, #act, #up, #down { visibility: hidden !important; }';
async function open(q, { clean = true } = {}) {
  await page.goto(`${base}?film=${FPS}&detail=1&${q}`);
  await page.waitForFunction(() => window.__dream && window.__dream.ready, null, { timeout: 120000, polling: 250 });
  if (clean) await page.addStyleTag({ content: CLEAN });
  await page.evaluate(() => window.__dream.filmStart());
}
const step = (n = 1) => page.evaluate((k) => window.__dream.filmStep(k), n);
const key = (k, down) => (down ? page.keyboard.down(k) : page.keyboard.up(k));
// a spot on screen where a tap would pick this kind of thing (the game's own picking)
const find = (kind) => page.evaluate((k) => {
  for (let r = 0; r < 34; r++) for (let a = 0; a < Math.max(1, r * 6); a++) {
    const x = 640 + Math.cos((a / Math.max(1, r * 6)) * Math.PI * 2) * r * 18, y = 380 + Math.sin((a / Math.max(1, r * 6)) * Math.PI * 2) * r * 11;
    if (x > 20 && x < 1260 && y > 20 && y < 700 && window.__dream.pickAt(x, y) === k) return { x, y };
  }
  return null;
}, kind);

const shotsDir = path.join(out, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });
async function film(name, frames, each, stride = 1) {
  const dir = path.join(shotsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    if (each) await each(i);
    await step(stride);   // stride > 1: a time-lapse
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  const mp4 = path.join(shotsDir, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%03d.jpg'), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', mp4]);
  return mp4;
}
const flyFwd = async (name, q, warm = 45) => { await open(q); await key('KeyW', true); await step(warm); const f = await film(name, FPS); await key('KeyW', false); return f; };

// ---------------------------------------------------------------------------------------------- where the light is
// The game's clock is the real one. This picks, for each kind of shot, a place where it's day (or night) right now.
const hourAt = (lon) => ((new Date().getUTCHours() + new Date().getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24;
const day = (lon) => hourAt(lon) > 8 && hourAt(lon) < 16.5;
const night = (lon) => hourAt(lon) > 20.5 || hourAt(lon) < 4;
const pickPlace = (list, ok) => list.find((p) => ok(p.lon)) || list[0];
const FOREST = pickPlace([{ lat: -3.1, lon: -60.0 }, { lat: 1.0, lon: 114.0 }, { lat: 0.5, lon: 25.0 }], day);          // Amazon, Borneo, Congo
const FIREFLIES = pickPlace([{ lat: 1.0, lon: 114.0 }, { lat: -3.1, lon: -60.0 }, { lat: 0.5, lon: 25.0 }], night);
const CANYON = pickPlace([{ lat: 36.07, lon: -112.13, heading: 20 }, { lat: 27.98, lon: 86.92, heading: 200 }, { lat: 46.5, lon: 8.0, heading: 180 }], day);   // Grand Canyon, Everest, Alps
const MEADOW = pickPlace([{ lat: 44.0, lon: -72.7 }, { lat: 52.0, lon: -1.5 }, { lat: 36.0, lon: 138.0 }], day);        // Vermont, England, Japan
// wherever on Earth the sun is low right now: savannas for a run into it, coasts for its glint on the sea
const nearest = (list, h) => list.slice().sort((a, b) => Math.abs(hourAt(a.lon) - h) - Math.abs(hourAt(b.lon) - h))[0];
const GOLDEN = nearest([{ lat: 9.5, lon: 2.4 }, { lat: 0.5, lon: 37.5 }, { lat: 22, lon: 78 }, { lat: 15, lon: 102 }, { lat: -17, lon: 130 },
  { lat: -15, lon: -48 }, { lat: 20, lon: -100 }, { lat: 20.5, lon: -156.3 }, { lat: -20, lon: 25 }, { lat: 12, lon: -8 }], 17.2);
const COAST = nearest([{ lat: 25, lon: -80 }, { lat: -4.2, lon: 40.2 }, { lat: 14.6, lon: -17.9 }, { lat: 19, lon: 72.2 }, { lat: 12.8, lon: 100.6 },
  { lat: -33.9, lon: 151.5 }, { lat: 21.2, lon: -158.1 }, { lat: 34.2, lon: -119.6 }, { lat: 36.6, lon: -9.5 }, { lat: -34.2, lon: 18.2 }], 17);
const ll = (p) => `lat=${p.lat}&lon=${p.lon}`;
// a ley node where it's day, for the stones and the sky beings
const { nearestNode } = await import(new URL('../web/js/ley.js', import.meta.url));
const NODE = pickPlace([{ lat: 31.7, lon: -112.8 }, { lat: 0, lon: -58.8 }, { lat: 1, lon: 113 }, { lat: 0, lon: 20 }], day);
Object.assign(NODE, (({ lat, lon }) => ({ lat, lon }))(nearestNode(NODE.lat, NODE.lon).node));
console.log('UTC', new Date().toISOString().slice(11, 16), JSON.stringify({ FOREST, FIREFLIES, CANYON, MEADOW, GOLDEN, COAST, NODE }));

const SHOTS = {
  // over the Grand Canyon (or wherever it's day): real elevation, the curved horizon
  canyon: () => flyFwd('canyon', `seed=21&${ll(CANYON)}&alt=260&heading=${CANYON.heading}&zoom=60`, 60),
  // the low sun: running into it across a savanna, wherever it's setting now
  golden: async () => {
    await open(`seed=13&${ll(GOLDEN)}&alt=5&zoom=30`);
    // face the sun
    await page.evaluate(async () => { const d = window.__dream, { sunPosition } = await import('/js/sun.js'); const sp = window.__dream.spawn; const p = sunPosition(new Date(), sp.lat, sp.lon); d.state.heading = -p.azimuth; });
    await key('KeyW', true); await step(40); const f = await film('golden', FPS); await key('KeyW', false); return f;
  },
  // the sea where the sun is low: shader waves, foam, the glint
  sea: async () => {
    await open(`seed=5&born=sea&stats=1,6,1,2,2&${ll(COAST)}&alt=5&zoom=40`);
    await page.evaluate(async () => { const d = window.__dream, { sunPosition } = await import('/js/sun.js'); const sp = window.__dream.spawn; const p = sunPosition(new Date(), sp.lat, sp.lon); d.state.heading = -p.azimuth; });
    await key('KeyW', true); await step(50); const f = await film('sea', FPS); await key('KeyW', false); return f;
  },
  // gliding over the rainforest canopy: kapok and banyan
  canopy: () => flyFwd('canopy', `seed=8&${ll(FOREST)}&alt=30&heading=90&zoom=40`),
  // tap a tree, go to it, and it shakes: the low angle with its crown in frame
  tree: async () => {
    await open(`seed=8&${ll(FOREST)}&alt=4&zoom=34&heading=60`);
    await step(30);
    const t = await find('tree');
    if (t) {
      await page.mouse.click(t.x, t.y);
      for (let i = 0; i < 40 && (await page.evaluate(() => !!window.__dream.state.target)); i++) await step(10);
    }
    await step(6);
    return film('tree', FPS);
  },
  // tap yourself: a squeak, a hop, and the close-up
  squeak: async () => {
    await open(`seed=13&${ll(MEADOW)}&alt=5&zoom=24&heading=150`);
    await step(50);
    const me = await find('self');
    if (me) await page.mouse.click(me.x, me.y);
    await step(4);
    return film('squeak', FPS);
  },
  // woods of spreading oak and spruce, wherever it's day
  critters: async () => { await open(`seed=13&${ll(MEADOW)}&alt=5&zoom=30&heading=0`); await key('KeyW', true); await step(50); const f = await film('critters', FPS); await key('KeyW', false); return f; },
  // the standing stones at a ley node, under the pillar of light: stand back and look at the ring
  stones: async () => {
    await open(`seed=21&lat=${NODE.lat - 0.0003}&lon=${NODE.lon}&alt=5&zoom=24&heading=0`);
    await step(60);
    return film('stones', FPS);
  },
  // step into the ring and touch: the light lifts you, to choose a lane
  lift: async () => {
    await open(`seed=21&lat=${NODE.lat - 0.00004}&lon=${NODE.lon}&alt=5&zoom=30&heading=0`);
    await step(45);
    await key('KeyE', true); await step(3); await key('KeyE', false);
    await step(4);
    return film('lift', FPS);
  },
  // a ley highway: ley-space at absurd speed
  ride: async () => { await open(`seed=21&ride=137&zoom=60`); await step(90); return film('ride', FPS); },
  // a sky being drifting along a ley line, looked up at past you (perception 4 sees them)
  beings: async () => {
    await open(`seed=21&stats=2,2,2,2,4&lat=${NODE.lat + 0.02}&lon=${NODE.lon}&alt=6&zoom=60&heading=0`);
    await step(30);
    // turn to face the nearest one (they ride the ley lines a few kilometres up)
    await page.evaluate(() => {
      const d = window.__dream, p = d.state.pos;
      let best = null;
      for (const m of d.world().beings.group.children) { const dx = m.position.x - p.x, dz = m.position.z - p.z, dd = Math.hypot(dx, dz); if (!best || dd < best.dd) best = { dx, dz, dd }; }
      if (best) d.state.heading = Math.atan2(-best.dx, -best.dz);
    });
    await step(30);
    const b = await find('being');
    if (b) await page.mouse.click(b.x, b.y);
    await step(20);
    return film('beings', FPS);
  },
  // fireflies at night: cup one, and the ones nearby flare
  fireflies: async () => {
    await open(`seed=8&${ll(FIREFLIES)}&alt=8&zoom=40&heading=200`);
    await step(60);
    await key('KeyE', true); await step(3); await key('KeyE', false);
    await step(6);
    return film('fireflies', FPS);
  },
  // from the creature out to the whole planet, wrapped in the golden ley grid
  // the soaring eye: it lets go of you and rises until the whole Earth turns below (eight seconds, time-lapsed into one)
  globe: async () => { await open(`seed=21&${ll(FOREST)}&alt=30&zoom=60&heading=0`); await step(20); await page.evaluate(() => window.__dream.testSpell('soaring')); return film('globe', FPS, null, 9); },
};
const ORDER = ['canyon', 'golden', 'canopy', 'tree', 'squeak', 'critters', 'stones', 'lift', 'ride', 'fireflies', 'sea', 'globe'];
const clips = [];
for (const name of ORDER) {
  const mp4 = path.join(shotsDir, `${name}.mp4`);
  if (only && !only.includes(name) && fs.existsSync(mp4)) { clips.push(mp4); continue; }
  const t0 = Date.now();
  try { clips.push(await SHOTS[name]()); console.log('filmed', name, `${((Date.now() - t0) / 1000).toFixed(0)} s`); } catch (e) { console.log('MISSED', name, String(e).slice(0, 200)); }
}

// ---------------------------------------------------------------------------------------------- the start screen
// The birth question, as a newcomer first sees it, held over the globe in its golden ley grid, where the soaring eye
// rises to. (In the game it shows before the world has grown, over black; here the globe stands behind it.)
const title = path.join(shotsDir, 'title.mp4');
if (!only || only.includes('title') || !fs.existsSync(title)) {
  await open(`seed=21&${ll(FOREST)}&alt=30&zoom=60`, { clean: false });
  await page.addStyleTag({ content: '#hud, #status, #log, #whos, #act, #up, #down { visibility: hidden !important; }' });
  await page.evaluate(() => window.__dream.testSpell('soaring'));
  for (let i = 0; i < 11; i++) { await step(30); await flush(); }   // the eye rises to the whole Earth
  await page.evaluate(() => {
    const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) e.append(k); return e; };
    const choice = (b, t, w) => el('button', `go born-${b}`, el('b', '', t), el('span', '', w));
    window.__dream.maker().custom('birth', [
      el('h2', '', 'Where were you born?'),
      el('p', '', "You're about to wake on the Earth, near one of its ley nodes."),
      el('div', 'births',
        choice('land', 'On land', 'You run, and wake on land. Your swim sleeps until you wear a tidefin.'),
        choice('sea', 'In the sea', 'You swim and dive, and wake in coastal water. Your run sleeps until you wear a mossfoot.')),
      el('p', 'small', 'Tidefins lie on the seabed, mossfeet in meadows inland, and now and then the tide leaves one on a beach. Eat a moonseed to be born again.'),
    ], { classes: ['birth'] });
  });
  await step(60);
  await film('title', FPS * HOLD);
  console.log('filmed title');
}
await browser.close();

// ---------------------------------------------------------------------------------------------- the score
// Dream has no music of its own (only its creatures' sounds), so the trailer gets a score made for it: a slow,
// shimmering pad in D Lydian, a bell arpeggio, a whoosh into the ley highway, and a last chord held under the start
// screen. Rendered offline in the browser from a fixed seed, so every take sounds the same.
const music = path.join(out, 'score.wav');
const total = clips.length + HOLD;
const rideAt = ORDER.filter((n) => clips.some((c) => c.endsWith(`/${n}.mp4`))).indexOf('ride');
{
  const b2 = await chromium.launch();
  const p2 = await b2.newPage();
  await p2.goto('about:blank');
  const b64 = await p2.evaluate(async ({ total, rideAt, hold }) => {
    const sr = 44100, ctx = new OfflineAudioContext(2, Math.ceil(sr * (total + 2)), sr);
    let s = 20261111 >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = ctx.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 3; out.connect(ctx.destination);
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(out);
    const verb = ctx.createConvolver(); const ir = ctx.createBuffer(2, sr * 4, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 2.2); }
    verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.6; verb.connect(wet).connect(master);
    const bus = (g, send) => { const b = ctx.createGain(); b.gain.value = g; b.connect(master); const x = ctx.createGain(); x.gain.value = send; b.connect(x).connect(verb); return b; };
    const padBus = bus(0.2, 0.75), bellBus = bus(0.3, 0.9), fxBus = bus(0.35, 0.6);
    const D = 146.83, hz = (st) => D * 2 ** (st / 12);
    // the pad: soft triangles, Dmaj7 and E/D (the Lydian lift), changing every four seconds, a slow filter breathing
    const chords = [[0, 4, 7, 11, 16], [2, 6, 9, 14, 18], [0, 4, 7, 11, 14], [2, 6, 9, 13, 18]];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7; lp.connect(padBus);
    lp.frequency.setValueAtTime(420, 0);
    for (let t = 0; t < total + 2; t += 2) lp.frequency.linearRampToValueAtTime(t % 4 ? 950 : 520, t);
    const span = 4;
    for (let k = 0, t = 0; t < total + 1; k++, t += span) {
      const last = t + span >= total - 0.5, ch = last ? [0, 4, 7, 11, 14, 19] : chords[k % chords.length];
      const len = last ? total - t + 2 : span + 1.2;
      for (const st of ch) for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(st - 12); o.detune.value = det;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 1.2); g.gain.setValueAtTime(0.05, t + len - 1.2); g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(g).connect(lp); o.start(t); o.stop(t + len);
      }
      if (last) break;
    }
    // the bells: a wandering arpeggio on the Lydian scale, two notes a second, sparser at the start and under the title
    const scale = [0, 2, 4, 6, 7, 9, 11];
    let deg = 7;
    for (let t = 0.6; t < total - 0.5; t += 0.5) {
      if (rnd() < (t < 2 || t > total - hold ? 0.35 : 0.8)) {
        deg = Math.max(3, Math.min(17, deg + [-2, -1, 1, 2, 3][Math.floor(rnd() * 5)]));
        const f = hz(scale[deg % 7] + 12 * Math.floor(deg / 7) + 12), pan = ctx.createStereoPanner(); pan.pan.value = rnd() * 1.4 - 0.7; pan.connect(bellBus);
        for (const [m, a, d] of [[1, 1, 2.6], [2.76, 0.35, 1.4], [5.4, 0.12, 0.7]]) {
          const o = ctx.createOscillator(); o.frequency.value = f * m; const g = ctx.createGain();
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(pan); o.start(t); o.stop(t + d + 0.05);
        }
      }
    }
    // a whoosh into the ley highway: noise sweeping up, then away
    if (rideAt >= 0) {
      const t = rideAt - 0.5, n = ctx.createBuffer(1, sr * 2, sr), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = n;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.7); bp.frequency.exponentialRampToValueAtTime(800, t + 1.8);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      src.connect(bp).connect(g).connect(fxBus); src.start(t); src.stop(t + 2);
    }
    const buf = await ctx.startRendering();
    // to a 16-bit WAV
    const n = buf.length, view = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, x) => { for (let i = 0; i < x.length; i++) view.setUint8(o + i, x.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, n * 4, true);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < n; i++) { view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(view.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { total, rideAt, hold: HOLD });
  fs.writeFileSync(music, Buffer.from(b64, 'base64'));
  await b2.close();
}

// ---------------------------------------------------------------------------------------------- cutting it together
const n = clips.length;
const inputs = [...clips, title].flatMap((c) => ['-i', c]);
const cuts = clips.map((_, i) => `[${i}:v]`).join('') + `concat=n=${n}:v=1:a=0[cuts]`;
const filter = `${cuts};[cuts]settb=AVTB,fps=${FPS}[c];[${n}:v]settb=AVTB,fps=${FPS}[t];[c][t]xfade=transition=fade:duration=${FADE}:offset=${n - FADE}[v0];` +
  `[v0]fade=t=in:d=0.4,fade=t=out:st=${(total - FADE - 0.8).toFixed(2)}:d=0.8[v];` +
  `[${n + 1}:a]loudnorm=I=-18:TP=-2:LRA=9,afade=t=in:d=0.4,afade=t=out:st=${(total - FADE - 2.6).toFixed(2)}:d=2.6,atrim=end=${(total - FADE).toFixed(2)}[a]`;
const final = path.join(out, 'trailer.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-i', music, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
console.log('wrote', final, `(${(total - FADE).toFixed(1)} s)`);
console.log(errors.length ? 'page errors:\n' + [...new Set(errors)].slice(0, 10).join('\n') : 'no page errors');
