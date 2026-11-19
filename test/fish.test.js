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

test("the sea's real warmth (NOAA ERSSTv5) decides who lives where, once it's in", async () => {
  const fs = await import("node:fs");
  const { parseSst, warmthAt } = await import("../web/js/sst.js");
  const { kelpWater } = await import("../web/js/fishlife.js");
  const g = parseSst(JSON.parse(fs.readFileSync(new URL("../web/data/sst.json", import.meta.url))));
  assert.ok(g && g.cold.length === 89 * 180);
  const w = (lat, lon) => warmthAt(g, lat, lon);
  assert.equal(seaBand(27.9, w(27.9, 34.3)), "tropical", "the northern Red Sea is reef water, latitude or not");
  assert.equal(seaBand(-16.5, w(-16.5, 146)), "tropical", "the Great Barrier Reef");
  assert.equal(seaBand(36.6, w(36.6, -122)), "temperate", "Monterey Bay");
  assert.equal(seaBand(78, w(78, 15)), "cold", "Svalbard");
  assert.ok(kelpWater(-34.2, w(-34.2, 18.3)), "kelp off Cape Point");
  assert.ok(kelpWater(56, w(56, 3)), "kelp in the North Sea");
  assert.ok(!kelpWater(38, w(38, 15)), "none in the warm Mediterranean summer");
  assert.ok(!kelpWater(27.9, w(27.9, 34.3)), "none on a Red Sea reef");
  assert.ok(Math.abs(w(0, 179.9).cold - w(0, -179.9).cold) < 1, "the dateline joins");
  // With the grid, shoals off Monterey are temperate fish even though it's within reef latitudes of nothing.
  assert.ok(shoalHomes(36.6, -122, sea(36.6, -122, -30), w).every((s) => s.band === "temperate"));
});
