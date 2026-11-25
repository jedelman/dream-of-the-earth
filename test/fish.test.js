import test from "node:test";
import assert from "node:assert/strict";
import { shoalHomes, kelpHomes, shoalAt, fishAt, burstAt, swirlAt, seaBand, loopOf, shoalLine, SCATTER_LINE, SHOAL, KELP, BURST_S, SWIRL_S } from "../web/js/fishlife.js";
import { RANGE, promptFor, waterAsks } from "../web/js/interactions.js";

// A sea of one depth around (lat, lon), metres east/north of it (floor > 0 is land).
const sea = (lat, lon, floor) => (c) => {
  const f = typeof floor === "function" ? floor(c) : floor;
  return f < 0 ? { p: { x: (c.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180), z: -(c.lat - lat) * 111320 }, floor: f } : null;
};

test("shoals live in water deep enough to swim in, under the surface and over the seabed", () => {
  assert.equal(shoalHomes(10, 50, () => null).length, 0, "none on land");
  assert.equal(shoalHomes(10, 50, sea(10, 50, -2)).length, 0, "none in the shallows");
  const deep = shoalHomes(10, 50, sea(10, 50, -40));
  assert.ok(deep.length > 5 && deep.length <= SHOAL.max, `${deep.length}`);
  for (const s of deep) {
    assert.ok(s.y < -1.5 && s.y >= -31, `${s.y}`);
    assert.ok(s.n >= SHOAL.fish[0] && s.n <= SHOAL.fish[1]);
    assert.ok(s.size >= SHOAL.size[0] && s.size <= SHOAL.size[1]);
  }
  for (const s of shoalHomes(10, 50, sea(10, 50, -6))) assert.ok(s.y > -6 && s.y < -1, `a shallow shoal swims between: ${s.y}`);
});

test("the same shoals in the same places on every phone, and fish for the water they're in", () => {
  assert.deepEqual(shoalHomes(-20, 150, sea(-20, 150, -30)), shoalHomes(-20, 150, sea(-20, 150, -30)));
  assert.ok(shoalHomes(-20, 150, sea(-20, 150, -30)).every((s) => s.band === "tropical" && s.name.endsWith("reef fish")));
  assert.ok(shoalHomes(60, 3, sea(60, 3, -30)).every((s) => s.band === "cold"));
  assert.equal(seaBand(45), "temperate");
  assert.equal(seaBand(-60), "cold");
  assert.equal(seaBand(0), "tropical");
});

test("a shoal swims a loop round its home on the shared clock, and its fish keep together", () => {
  const [s] = shoalHomes(40, -70, sea(40, -70, -25));
  const { r, period } = loopOf(s);
  for (let t = 0; t < period; t += period / 37) {
    const m = shoalAt(s, t);
    assert.ok(Math.hypot(m.x - s.x, m.z - s.z) <= r * 1.1);
    for (let i = 0; i < s.n; i++) {
      const f = fishAt(s, i, t);
      assert.ok(Math.hypot(f.x - m.x, f.z - m.z) < s.size * (1.2 + 0.35 * Math.sqrt(s.n)) * 1.05 + 1e-6, "keeps its place in the shoal");
      assert.ok(f.y <= -0.6);
    }
  }
  assert.deepEqual(shoalAt(s, 12345.6), shoalAt(s, 12345.6));
  // Facing the way it swims.
  const a = shoalAt(s, 100), b = shoalAt(s, 100.05);
  const want = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  assert.ok(Math.abs(Math.atan2(Math.sin(a.yaw - want), Math.cos(a.yaw - want))) < 0.05);
});

test("rushed, a shoal bursts apart and gathers again; touched, it swirls round you and goes back", () => {
  assert.equal(burstAt(-1), 0);
  assert.equal(burstAt(BURST_S), 0);
  assert.ok(Math.abs(burstAt(0.35) - 1) < 1e-9);
  assert.ok(burstAt(1) > burstAt(3));
  const [s] = shoalHomes(40, -70, sea(40, -70, -25));
  const m = shoalAt(s, 50), spread = (b) => Math.max(...Array.from({ length: s.n }, (_, i) => { const f = fishAt(s, i, 50, b); return Math.hypot(f.x - m.x, f.z - m.z); }));
  assert.ok(spread(1) > spread(0) * 3, "scattered wide");
  assert.equal(swirlAt(SWIRL_S), null);
  assert.equal(swirlAt(0), 0);
  const me = { x: m.x + 30, y: s.y, z: m.z };
  const mid = Array.from({ length: s.n }, (_, i) => fishAt(s, i, 50, 0, 0.5, me));
  for (const f of mid) assert.ok(Math.hypot(f.x - me.x, f.z - me.z) < 5 + s.size * 2 + s.size * 2 * Math.sqrt(s.n) + 1, "round you, halfway through");
  const end = fishAt(s, 0, 50, 0, 0.9999, me), own = fishAt(s, 0, 50);
  assert.ok(Math.hypot(end.x - own.x, end.z - own.z) < 0.5, "and back to its own place");
});

test("kelp grows in forests on cool, shallow seabeds only, reaching towards the surface", () => {
  assert.equal(kelpHomes(5, 100, sea(5, 100, -10)).length, 0, "not in the tropics");
  assert.equal(kelpHomes(75, 10, sea(75, 10, -10)).length, 0, "not in polar seas");
  assert.equal(kelpHomes(45, -125, sea(45, -125, -60)).length, 0, "not too deep");
  assert.equal(kelpHomes(45, -125, sea(45, -125, -1)).length, 0, "not on the beach");
  // Somewhere on a temperate coast, some forests.
  let found = 0;
  for (let k = 0; k < 20; k++) {
    const lat = 36 + k * 0.01, lon = -122;
    const list = kelpHomes(lat, lon, sea(lat, lon, -12));
    found += list.length;
    for (const kp of list) assert.ok(kp.height >= 2 && kp.height <= 12 - 0.8, `${kp.height}`);
    assert.ok(list.length <= KELP.max);
  }
  assert.ok(found > 50, `${found}`);
  assert.deepEqual(kelpHomes(36.1, -122, sea(36.1, -122, -12)), kelpHomes(36.1, -122, sea(36.1, -122, -12)));
});

test("a shoal answers a touch: its prompt, its lines, and it outbids splashing the sea", () => {
  assert.equal(promptFor({ kind: "shoal", name: "little silver fish" }), "Greet the shoal of little silver fish");
  assert.ok(RANGE.shoal > 0);
  assert.equal(waterAsks([{ kind: "shoal" }]), false);
  const line = shoalLine("little silver fish", "Nyo", 7, 0);
  assert.ok(line.includes("little silver fish"));
  assert.notEqual(shoalLine("x", "Nyo", 7, 0), undefined);
  assert.ok(SCATTER_LINE("little ice fish", true).includes("tap the shoal"));
  assert.ok(!SCATTER_LINE("little ice fish", false).includes("tap"));
});

test("reefs grow on warm, shallow seabeds, in patches, four forms in a reef's colours; a coral answers a touch", async () => {
  const { coralHomes, coralLine, REEF, CORAL_FORMS } = await import("../web/js/fishlife.js");
  assert.equal(coralHomes(50, -5, sea(50, -5, -10)).length, 0, "no reefs in cool water");
  assert.equal(coralHomes(-16.5, 146, sea(-16.5, 146, -60)).length, 0, "none too deep");
  assert.equal(coralHomes(-16.5, 146, sea(-16.5, 146, -1)).length, 0, "none in the surf");
  assert.equal(coralHomes(-16.5, 146, () => null).length, 0, "none on land");
  const reef = coralHomes(-16.5, 146, sea(-16.5, 146, -10));
  assert.ok(reef.length > 50 && reef.length <= REEF.max, `${reef.length}`);
  assert.deepEqual(new Set(reef.map((c) => c.form)), new Set(CORAL_FORMS));
  assert.ok(reef.every((c) => c.size > 0 && c.size <= 10 * 0.6 && c.hsl.length === 3));
  assert.deepEqual(reef, coralHomes(-16.5, 146, sea(-16.5, 146, -10)), "the same reef for everyone");
  assert.ok(coralHomes(-16.5, 146, sea(-16.5, 146, -1.8)).every((c) => c.size <= 1.8 * 0.6 + 1e-9), "small in the shallows");
  assert.equal(promptFor({ kind: "coral", name: "brain coral" }), "Brush the brain coral");
  assert.match(coralLine("sea fan", 3, 0), /sea fan/);
  assert.equal(waterAsks([{ kind: "coral" }]), false);
});

test("some coral heads have little fish of their own, hovering over them; they hide when you come close and come out when you keep still", async () => {
  const { coralHomes, reefFishOf, reefFishAt, hideStep, REEF_FISH, HIDE_LINE } = await import("../web/js/fishlife.js");
  const reef = coralHomes(-16.5, 146, sea(-16.5, 146, -10));
  const homes = reef.map((c) => [c, reefFishOf(c)]).filter(([, rf]) => rf);
  const share = homes.length / reef.length;
  assert.ok(share > 0.25 && share < 0.65, `${share}`);
  assert.deepEqual(homes.map(([, rf]) => rf), reef.map(reefFishOf).filter(Boolean), "the same fish on every phone");
  for (const [c, rf] of homes.slice(0, 40)) {
    assert.ok(rf.n >= REEF_FISH.n[0] && rf.n <= REEF_FISH.n[1] && rf.size >= REEF_FISH.size[0] && rf.size <= REEF_FISH.size[1]);
    for (let t = 0; t < 30; t += 0.7) for (let i = 0; i < rf.n; i++) {
      const f = reefFishAt(c, rf, i, t);
      assert.ok(Math.hypot(f.x - c.x, f.z - c.z) < c.size * 2 + 3, "keeps to its coral");
      assert.ok(f.y > c.floor + c.size * 0.4 && f.y < 0, "over the coral, under the surface");
      assert.equal(f.scale, 1);
      const hid = reefFishAt(c, rf, i, t, 1);
      assert.ok(Math.hypot(hid.x - c.x, hid.z - c.z) < c.size * 0.2 + 1e-9 && hid.y < f.y && hid.scale < 0.2, "hidden inside");
    }
  }
  // Coming close: in, fast. Still a while: out again, slowly. Gone: out again.
  let h = 0;
  for (let k = 0; k < 4; k++) h = hideStep(h, 0.1, 3, 2, 0);
  assert.equal(h, 1);
  assert.equal(hideStep(1, 0.1, 3, 2, 5) < 1, true, "kept still: coming out");
  let out = 1;
  for (let k = 0; k < 20; k++) out = hideStep(out, 0.1, 30, 2, 0);
  assert.equal(out, 0, "gone off: all out");
  assert.equal(hideStep(0, 0.1, 30, 2, 0), 0, "far off: never hide");
  assert.match(HIDE_LINE("little blue damselfish", "brain coral", true), /duck into the brain coral\. Keep still/);
  assert.ok(!HIDE_LINE("x", "y", false).includes("Keep still"));
});

test("anemones grow on reefs, each with two anemonefish that come out round you when you visit", async () => {
  const { anemoneHomes, anemoneFishAt, visitAt, anemoneLine, ANEMONE, VISIT_S } = await import("../web/js/fishlife.js");
  assert.equal(anemoneHomes(50, -5, sea(50, -5, -10)).length, 0, "not in cool water");
  assert.equal(anemoneHomes(-16.5, 146, sea(-16.5, 146, -40)).length, 0, "not too deep");
  const list = anemoneHomes(-16.5, 146, sea(-16.5, 146, -8));
  assert.ok(list.length > 3 && list.length <= ANEMONE.max, `${list.length}`);
  assert.deepEqual(list, anemoneHomes(-16.5, 146, sea(-16.5, 146, -8)));
  const a = list[0], me = { x: a.x + 6, y: a.floor + 3, z: a.z };
  for (let t = 0; t < 20; t += 0.5) for (let i = 0; i < ANEMONE.fish; i++) {
    const f = anemoneFishAt(a, i, t);
    assert.ok(Math.hypot(f.x - a.x, f.z - a.z) <= a.size * 0.4, "at home in its tentacles");
    const v = anemoneFishAt(a, i, t, 0.5, me);
    assert.ok(Math.hypot(v.x - me.x, v.z - me.z) < 2.5, "half-way through a visit, round you");
  }
  assert.equal(visitAt(VISIT_S + 0.1), null);
  assert.equal(visitAt(0), 0);
  assert.equal(promptFor({ kind: "anemone", name: "anemone" }), "Visit the anemone");
  assert.equal(waterAsks([{ kind: "anemone" }]), false);
  assert.ok(RANGE.anemone > 0);
  assert.match(anemoneLine("Nyo", 4, 0), /anemone/);
});

test("lake fish: shoals in a lake swim under its own surface, over its bed, and are freshwater fish", () => {
  // A lake 371 m up (its surface 372.2, its dream bed 363), all round the point.
  const lake = (lat, lon) => (c) => ({ p: { x: (c.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180), z: -(c.lat - lat) * 111320 }, floor: 363, top: 372.2, lake: "Lake Geneva" });
  const list = shoalHomes(46.4, 6.5, lake(46.4, 6.5));
  assert.ok(list.length > 3 && list.length <= SHOAL.max, `${list.length}`);
  const sea = new Set(shoalHomes(46.4, 6.5, (c) => ({ ...lake(46.4, 6.5)(c), floor: -9.2, top: undefined, lake: undefined })).map((s) => s.name));
  for (const s of list) {
    assert.equal(s.lake, "Lake Geneva");
    assert.equal(s.top, 372.2);
    assert.ok(s.y < 372.2 - 1.5 && s.y > 363, `between surface and bed: ${s.y}`);
    assert.ok(!sea.has(s.name), `not a sea fish: ${s.name}`);
    for (let t = 0; t < 200; t += 7.3) for (let i = 0; i < s.n; i++) assert.ok(fishAt(s, i, t).y <= 372.2 - 0.6, "never out of the water");
  }
  assert.ok(list.every((s) => /perch|roach|minnows/.test(s.name)), "middle-latitude lake fish");
  assert.ok(shoalHomes(-1, 33, lake(-1, 33)).every((s) => /cichlids|tilapia/.test(s.name)), "warm lakes: cichlids and tilapia");
  assert.ok(shoalHomes(62, 30, lake(62, 30)).every((s) => /char|grayling/.test(s.name)), "cold lakes: char and grayling");
  // A lake too shallow (less than 4 m from surface to bed) has none, and the sea's shoals are as they were.
  assert.equal(shoalHomes(46.4, 6.5, (c) => ({ ...lake(46.4, 6.5)(c), floor: 369 })).length, 0);
  const s0 = shoalHomes(40, -70, (c) => ({ p: { x: 0, z: 0 }, floor: -25 }))[0];
  assert.equal(s0.top, 0);
  assert.equal(s0.lake, null);
});

test("a shoal you greet while swimming follows you a little way, never out of the water, then swims home", async () => {
  const { SHOAL_FOLLOW, shoalFollowStart, shoalFollowStep, shoalHomeS, shoalHomeAt, shoalFollowLine } = await import("../web/js/fishlife.js");
  const s = { key: "shoal1", x: 0, z: 0, y: -6, floor: -20, top: 0, lake: null, n: 7, size: 1.4, seed: 0.37, name: "little silver fish" };
  const sea = (x) => (x > 400 ? null : -20); // a shore 400 m east
  const floorAt = (x) => sea(x);
  const dt = 0.1, start = shoalAt(s, 100);
  // It settles a few metres off, at about your depth, under the surface and over the bed.
  let me = { x: start.x + 12, y: -5, z: start.z, speed: 0, swimming: true }, f = shoalFollowStart(s, start, 0), t = 0, r, bubbles = 0;
  for (; t < 6; t += dt) { r = shoalFollowStep(s, f, me, floorAt, dt, t); if (r.bubble) bubbles++; }
  let d = Math.hypot(r.at.x - me.x, r.at.z - me.z);
  assert.ok(d >= SHOAL_FOLLOW.near[0] - 0.6 && d <= SHOAL_FOLLOW.near[1] + 0.6, `settles beside you (${d.toFixed(2)} m)`);
  assert.ok(r.at.y < -1.2 && r.at.y > -19, "under the surface, over the bed");
  assert.equal(r.done, null);
  // It keeps up when you swim on (6 m/s for 15 s), without a jump.
  let prev = { ...r.at }, maxStep = 0, maxD = 0;
  for (const t1 = t + 15; t < t1; t += dt) {
    me = { ...me, x: me.x + 6 * dt, speed: 6 };
    r = shoalFollowStep(s, f, me, floorAt, dt, t);
    maxStep = Math.max(maxStep, Math.hypot(r.at.x - prev.x, r.at.y - prev.y, r.at.z - prev.z)); prev = { ...r.at };
    maxD = Math.max(maxD, Math.hypot(r.at.x - me.x, r.at.z - me.z));
    if (r.bubble) bubbles++;
  }
  assert.equal(r.done, null, "still with you");
  assert.ok(maxD < 20, `keeps up (${maxD.toFixed(1)} m behind at most)`);
  assert.ok(maxStep < 1.5, "no jumps");
  assert.ok(bubbles >= 1, "bubbles now and then");
  // Tired: after its time it turns back.
  let g = shoalFollowStart(s, start, 0), meStill = { x: start.x + 6, y: -6, z: start.z, speed: 0, swimming: true };
  for (t = 0; t <= SHOAL_FOLLOW.s + 0.5; t += dt) r = shoalFollowStep(s, g, meStill, floorAt, dt, t);
  assert.equal(r.done, "tired");
  // Home: past its leash. (Swim on at 8 m/s.)
  g = shoalFollowStart(s, start, 0); me = { ...meStill };
  for (t = 0, r = { done: null }; !r.done && t < 50; t += dt) { me = { ...me, z: me.z - 8 * dt, speed: 8 }; r = shoalFollowStep(s, g, me, floorAt, dt, t); }
  assert.equal(r.done, "home");
  assert.ok(Math.hypot(g.x - s.x, g.z - s.z) <= SHOAL_FOLLOW.leash + 2);
  // Lost: you dash off faster than it can follow.
  g = shoalFollowStart(s, start, 0); me = { ...meStill };
  for (t = 0, r = { done: null }; !r.done && t < 20; t += dt) { me = { ...me, x: me.x - 80 * dt, speed: 15 }; r = shoalFollowStep(s, g, me, floorAt, dt, t); }
  assert.equal(r.done, "lost");
  // Shore: it never swims out of the water, and turns back when you leave it.
  const near = { ...s, x: 360 }; // a shoal that lives by the shore
  g = shoalFollowStart(near, { x: 380, y: -6, z: 0, yaw: 0 }, 0); me = { x: 385, y: -3, z: 0, speed: 3, swimming: true };
  for (t = 0, r = { done: null }; !r.done && t < 30; t += dt) {
    me = me.x < 430 ? { ...me, x: me.x + 3 * dt } : { ...me, y: 2, swimming: false };
    r = shoalFollowStep(near, g, me, floorAt, dt, t);
    assert.ok(g.x <= 400 + 1e-6, "never ashore");
  }
  assert.equal(r.done, "shore");
  // Home it goes, joining its loop where everyone sees it, smoothly.
  const from = { x: g.x, y: g.y, z: g.z }, dur = shoalHomeS(s, from, 200);
  assert.ok(dur > 2);
  const a0 = shoalHomeAt(s, from, 0, dur, 200);
  assert.ok(Math.hypot(a0.x - from.x, a0.y - from.y, a0.z - from.z) < 1e-6, "starts where it turned back");
  const end = shoalHomeAt(s, from, dur - 0.01, dur, 200 + dur - 0.01), loop = shoalAt(s, 200 + dur - 0.01);
  assert.ok(Math.hypot(end.x - loop.x, end.z - loop.z) < 0.5, "ends on its loop");
  assert.equal(shoalHomeAt(s, from, dur, dur, 200 + dur), null);
  // The fish follow their middle when it's given.
  const fish = fishAt(s, 0, 50, 0, 0, null, { x: 1000, y: -5, z: 1000, yaw: 0 });
  assert.ok(Math.hypot(fish.x - 1000, fish.z - 1000) < 10);
  assert.match(shoalFollowLine("start", s.name), /fall in behind you/);
  for (const w of ["tired", "home", "lost", "shore"]) assert.match(shoalFollowLine(w, s.name), /little silver fish/);
});

test("cleaning stations: cleaner wrasse dance over a few big coral heads, and pick you over if you keep still beside one", async () => {
  const { coralHomes, reefFishOf, cleanerOf, cleanerAt, cleanStep, cleanerLine, CLEANER } = await import("../web/js/fishlife.js");
  const reef = coralHomes(-16.5, 146, sea(-16.5, 146, -10));
  const stations = reef.map((c) => [c, cleanerOf(c)]).filter(([, cl]) => cl);
  assert.ok(stations.length >= 2 && stations.length < reef.length * 0.2, `${stations.length} of ${reef.length}`);
  assert.deepEqual(stations.map(([, cl]) => cl), reef.map(cleanerOf).filter(Boolean), "the same stations on every phone");
  for (const [c, cl] of stations) {
    assert.ok(c.form === "brain" || c.form === "table", "big heads only");
    assert.equal(reefFishOf(c), null, "not a head with fish of its own");
    assert.ok(cl.n >= CLEANER.n[0] && cl.n <= CLEANER.n[1]);
    for (let t = 0; t < 20; t += 0.37) for (let i = 0; i < cl.n; i++) {
      const f = cleanerAt(c, cl, i, t);
      assert.ok(Math.hypot(f.x - c.x, f.z - c.z) < c.size + 1, "dances over its coral");
      assert.ok(f.y > c.floor + c.size * 0.5 && f.y < 0, "over the coral, under the surface");
    }
  }
  // The dance is a bob: up and down over the coral.
  const [c, cl] = stations[0], ys = Array.from({ length: 40 }, (_, k) => cleanerAt(c, cl, 0, k * 0.1).y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.3, "it bobs");
  // Come out to you: at your skin, facing you, never inside you, and never far.
  const me = { x: c.x + 3, y: c.floor + c.size + 1, z: c.z, r: 1.4 }, offs = [];
  for (let t = 0; t < 15; t += 0.23) for (let i = 0; i < cl.n; i++) {
    const f = cleanerAt(c, cl, i, t, 1, me), d = Math.hypot(f.x - me.x, f.z - me.z);
    assert.ok(d > me.r * 0.85 && d < me.r * 1.1 + 0.31, `at your skin: ${d}`);
    assert.ok(Math.abs(f.y - me.y) < me.r, "about your height");
    const face = Math.atan2(-(me.x - f.x), -(me.z - f.z)), off = Math.abs(Math.atan2(Math.sin(f.yaw - face), Math.cos(f.yaw - face)));
    offs.push(off);
  }
  assert.ok(Math.min(...offs) < 0.1, "turns in to face you to pick");
  assert.ok(Math.max(...offs) > 1.2, "side-on as it circles you");
  // Halfway out: between home and you, with no jumps along the way.
  let prev = cleanerAt(c, cl, 1, 5, 0, me);
  for (let k = 1; k <= 20; k++) { const f = cleanerAt(c, cl, 1, 5 + k * 0.05, k / 20, me); assert.ok(Math.hypot(f.x - prev.x, f.y - prev.y, f.z - prev.z) < 1.2, "smooth"); prev = f; }
  // The cleaning, step by step. Moving: they stay home.
  let s = null;
  for (let k = 0; k < 50; k++) s = cleanStep(s, 0.1, 3, 2.5, 0, k * 0.1);
  assert.equal(s.come, 0, "you're moving: they stay home");
  // Still beside it: they come, say so once, pick you over, and say when they're done.
  s = null; const said = [];
  let t = 0;
  for (; t < 30 && !said.includes("clean"); t += 0.1) { s = cleanStep(s, 0.1, 3, 2.5, 1.5 + t, t); if (s.what) said.push(s.what); }
  assert.deepEqual(said, ["came", "clean"]);
  assert.ok(t > CLEANER.come + CLEANER.cleanS - 0.2 && t < CLEANER.come + CLEANER.cleanS + 1, `${t}`);
  // Then the station rests: keep still as long as you like, they don't come again for a while.
  for (let k = 0; k < 50; k++) { s = cleanStep(s, 0.1, 3, 2.5, 99, t + k * 0.1); assert.ok(!s.what || s.what === null); }
  assert.equal(s.come, 0, "resting");
  let back = s, again = null;
  for (let k = 0; k < 600 && !again; k++) { back = cleanStep(back, 0.1, 3, 2.5, 99, t + 5 + k * 0.1); if (back.what) again = back.what; }
  assert.equal(again, "came", "after its rest, it cleans again");
  // Moving off halfway: they leave, and the cleaning starts over.
  s = null;
  for (let k = 0; k < 40; k++) s = cleanStep(s, 0.1, 3, 2.5, 2 + k, k * 0.1);
  assert.ok(s.picked > 0);
  s = cleanStep(s, 0.1, 3, 2.5, 0, 4.1);
  assert.equal(s.what, "left");
  assert.equal(s.picked, 0);
  // Too far: never.
  s = null;
  for (let k = 0; k < 50; k++) s = cleanStep(s, 0.1, CLEANER.reach + 2.5 + 1, 2.5, 99, k * 0.1);
  assert.equal(s.come, 0);
  assert.match(cleanerLine("seen", "Nyo", "brain coral", "two"), /^A cleaning station: two little cleaner wrasse dance over the brain coral\. Keep still/);
  for (let k = 0; k < 4; k++) { assert.match(cleanerLine("came", "Nyo", "brain coral", "two", k), /Nyo/); assert.match(cleanerLine("clean", "Nyo", "table coral", "two", k), /table coral/); }
  assert.match(cleanerLine("left", "Nyo", "brain coral"), /dart back to their brain coral/);
});
