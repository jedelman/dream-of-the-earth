import test from "node:test";
import assert from "node:assert/strict";
import { placeOf, placeCentre, parsePlace, placesAround, cellsInBand, PLACE_BASE } from "../web/js/places.js";
import { makeCairn, parseArtifact, fadeOf, renew, cleanNote, MOON_S, FADE_S, NSID, NOTE_MAX } from "../web/js/artifacts.js";

test("every point has one cell, about 11 km across, with a URL that parses back", () => {
  const p = placeOf(44.0, -72.7);
  assert.match(p.url, /^https:\/\/dream-of-the-earth\.jason-edelman\.org\/place\/1\/\d+\/\d+$/);
  assert.deepEqual(parsePlace(p.url), { j: p.j, i: p.i });
  const c = placeCentre(p.j, p.i);
  assert.equal(placeOf(c.lat, c.lon).url, p.url, "a cell's centre is in the cell");
  assert.equal(placeOf(44.0, -72.7).url, p.url, "the same point, the same cell");
  // ~11 km wide in longitude at any latitude
  for (const lat of [0, 45, 70]) {
    const j = placeOf(lat, 0).j, widthKm = ((360 / cellsInBand(j)) * Math.PI / 180) * 6371 * Math.cos((lat * Math.PI) / 180);
    assert.ok(widthKm > 10 && widthKm < 12.5, `${lat}°: ${widthKm.toFixed(1)} km`);
  }
  assert.notEqual(placeOf(44.0, -72.7).url, placeOf(44.2, -72.7).url);
  assert.equal(placeOf(0, 180).url, placeOf(0, -180).url, "the antimeridian wraps");
  assert.ok(placeOf(90, 0).url && placeOf(-90, 0).url, "the poles have cells");
});

test("place URLs that aren't ours, or don't exist, don't parse", () => {
  assert.equal(parsePlace("https://example.com/place/1/3/4"), null);
  assert.equal(parsePlace(`${PLACE_BASE}9999/0`), null);
  assert.equal(parsePlace(`${PLACE_BASE}900/99999`), null);
  assert.equal(parsePlace(`${PLACE_BASE}900/1/x`), null);
});

test("the cells around a point include its own and its neighbours", () => {
  const around = placesAround(44.0, -72.7, 16000), own = placeOf(44.0, -72.7).url;
  assert.ok(around.some((p) => p.url === own));
  assert.ok(around.length >= 9 && around.length <= 30, `${around.length} cells`);
  assert.equal(new Set(around.map((p) => p.url)).size, around.length);
});

test("a cairn record round-trips, with integers only (atproto has no floats)", () => {
  const now = new Date("2026-11-08T18:00:00Z");
  const r = makeCairn({ lat: 44.123456789, lon: -72.7, seed: 12345, hue: 400, note: "  hello\n moon  ", now });
  assert.equal(r.$type, NSID);
  assert.equal(r.latE6, 44123457);
  assert.equal(r.cairn.hue, 40);
  assert.equal(r.note, "hello moon");
  const walk = (v) => (typeof v === "number" ? assert.ok(Number.isInteger(v), `float ${v}`) : v && typeof v === "object" && Object.values(v).forEach(walk));
  walk(r);
  const a = parseArtifact(JSON.parse(JSON.stringify(r)), now.getTime() / 1000);
  assert.equal(a.kind, "cairn");
  assert.equal(a.seed, 12345);
  assert.equal(a.note, "hello moon");
  assert.ok(Math.abs(a.lat - 44.123457) < 1e-9);
});

test("untrusted records are checked field by field", () => {
  const now = new Date("2026-11-08T18:00:00Z"), nowS = now.getTime() / 1000;
  const good = makeCairn({ lat: 10, lon: 20, seed: 1, hue: 2, note: "hi", now });
  const bad = (patch, why) => assert.equal(parseArtifact({ ...good, ...patch }, nowS), null, why);
  bad({ $type: "app.bsky.feed.post" }, "wrong type");
  bad({ kind: "bomb" }, "unknown kind");
  bad({ kind: "postcard" }, "a kind not built yet");
  bad({ latE6: 10.5 }, "a float");
  bad({ latE6: 91e6 }, "off the planet");
  bad({ place: placeOf(11, 20).url }, "claims a different place than it stands in");
  bad({ cairn: { seed: -1, hue: 2 } }, "bad seed");
  bad({ cairn: { seed: 1, hue: 360 } }, "bad hue");
  bad({ createdAt: "2027-01-01T00:00:00Z" }, "from the future");
  bad({ createdAt: "yesterday" }, "not a date");
  bad({ note: "x".repeat(2000) }, "a huge note");
  assert.equal(parseArtifact(null, nowS), null);
  assert.equal(parseArtifact([good], nowS), null);
  const long = parseArtifact({ ...good, note: "é".repeat(300) }, nowS);
  assert.equal(Array.from(long.note).length, NOTE_MAX, "long notes are cut to 140 characters");
  assert.equal(cleanNote("a\u202eb\u0000c"), "a b c", "no direction overrides or control characters");
});

test("artifacts fade with the moon, and renewing brings them back", () => {
  const t0 = Date.parse("2026-11-08T00:00:00Z") / 1000;
  assert.equal(fadeOf(t0, t0), 1);
  assert.equal(fadeOf(t0, t0 + 20 * 86400), 1, "still whole three weeks on");
  const mid = fadeOf(t0, t0 + MOON_S - FADE_S / 2);
  assert.ok(mid > 0.45 && mid < 0.55, "half gone halfway through the last week");
  assert.equal(fadeOf(t0, t0 + MOON_S + 1), 0, "gone after a moon");
  const old = makeCairn({ lat: 1, lon: 1, seed: 1, hue: 1, now: new Date((t0 - 40 * 86400) * 1000) });
  const back = parseArtifact(renew(old, new Date(t0 * 1000)), t0);
  assert.equal(fadeOf(back.since, t0), 1, "renewed: another moon");
});

import { cairnForm, cairnTriangles, CAIRN_TRIANGLES } from "../web/js/artifacts.js";
test("a cairn grows the same from the same seed, and stays under its triangle cap", () => {
  assert.deepEqual(cairnForm(42), cairnForm(42));
  const shapes = new Set();
  for (let s = 0; s < 500; s++) {
    const f = cairnForm(s * 2654435761);
    assert.ok(cairnTriangles(f) <= CAIRN_TRIANGLES, `seed ${s}: ${cairnTriangles(f)} triangles`);
    assert.ok(f.height > 3.5 && f.height < 18, `seed ${s}: ${f.height.toFixed(2)} m`);
    shapes.add(`${f.stones.length}:${f.height.toFixed(1)}`);
  }
  assert.ok(shapes.size > 20, "seeds give many different cairns");
});

import { metresBetween, distanceText, byDistance, WORLD_URL } from "../web/js/artifacts.js";
test("every cairn also points at the world, so one query lists them all", () => {
  const r = makeCairn({ lat: 1, lon: 2, seed: 3, hue: 4, now: new Date("2026-11-08T00:00:00Z") });
  assert.equal(r.world, WORLD_URL);
  assert.ok(parseArtifact(r, Date.parse("2026-11-08T00:00:00Z") / 1000), "with the world link");
  const { world, ...older } = r;
  assert.ok(parseArtifact(older, Date.parse("2026-11-08T00:00:00Z") / 1000), "records from before the link still parse");
  assert.equal(parseArtifact({ ...r, world: "https://example.com/" }, Date.parse("2026-11-08T00:00:00Z") / 1000), null, "a different world is refused");
});
test("the list: nearest first, distances in words", () => {
  assert.ok(Math.abs(metresBetween(0, 0, 0, 1) - 111195) < 50, "a degree of longitude at the equator");
  assert.equal(distanceText(43), "40 m");
  assert.equal(distanceText(3240), "3.2 km");
  assert.equal(distanceText(5388123), "5,388 km");
  const list = byDistance([{ lat: -3.1, lon: -60 }, { lat: 44.01, lon: -72.7 }], 44, -72.7);
  assert.equal(list[0].lat, 44.01);
  assert.ok(list[0].metres < 2000 && list[1].metres > 5e6);
});
