import test from "node:test";
import assert from "node:assert/strict";
import { makePigeon, parsePigeon, arrivalOf, flownOff, PIGEON_NSID, PIGEON_LIFE_S, PIGEON_MPS } from "../web/js/pigeons.js";
import { receive, hadPigeon, countOf, makeInventoryRecord, parseInventoryRecord, ITEMS } from "../web/js/inventory.js";

const to = "did:plc:abcdefghijklmnopqrstuvwx";
const t0 = Date.parse("2026-11-09T18:00:00Z") / 1000;

test("a pigeon round-trips; what it carries is checked", () => {
  const v = makePigeon({ to, kind: "tidefin", count: 1, from: { lat: 51.5, lon: -0.12 }, note: "for the sea‮!" }, new Date(t0 * 1000));
  assert.equal(v.$type, PIGEON_NSID);
  const p = parsePigeon(v, t0 + 10);
  assert.deepEqual({ ...p, note: undefined }, { to, kind: "tidefin", count: 1, from: { lat: 51.5, lon: -0.12 }, at: t0, note: undefined });
  assert.ok(!/‮/.test(p.note), "no direction tricks in the note");
  const bad = (o) => assert.equal(parsePigeon({ ...v, ...o }, t0 + 10), null, JSON.stringify(o));
  bad({ to: "alice" }); bad({ kind: "sword" }); bad({ kind: "toString" }); bad({ count: 0 }); bad({ count: ITEMS.tidefin.max + 1 }); bad({ count: 1.5 });
  bad({ fromLatE6: 91e6 }); bad({ sentAt: "soon" }); bad({ $type: "app.bsky.feed.post" });
  assert.equal(parsePigeon(v, t0 - 3600), null, "from the future");
  assert.equal(parsePigeon(v, t0 + PIGEON_LIFE_S + 1), null, "flown off after a moon");
  assert.ok(flownOff(t0, t0 + PIGEON_LIFE_S + 1) && !flownOff(t0, t0 + 3600));
});

test("a pigeon flies at 1,000 km/h: London to Paris in about 20 minutes, to the far side in about a day", () => {
  const p = parsePigeon(makePigeon({ to, kind: "moonseed", from: { lat: 51.5, lon: -0.12 } }, new Date(t0 * 1000)), t0);
  const paris = arrivalOf(p, 48.86, 2.35) - t0;
  assert.ok(paris > 18 * 60 && paris < 23 * 60, `${paris / 60} min`);
  const far = arrivalOf(p, -51.5, 179.88) - t0;
  assert.ok(far > 19 * 3600 && far < 21 * 3600, `${far / 3600} h`);
  assert.equal(PIGEON_MPS * 3.6, 1000);
});

test("a pigeon's gift comes once, and waits if it doesn't fit", () => {
  const uri = `at://did:plc:zzzzzzzzzzzzzzzzzzzzzzzz/${PIGEON_NSID}/3mzabc`;
  let inv = { items: { tidefin: 4 }, lunation: -1 };
  assert.equal(receive(inv, uri, "tidefin", 2).why, "full", "five fit: it waits");
  const r = receive(inv, uri, "tidefin", 1);
  assert.ok(r.ok);
  assert.equal(countOf(r.inv, "tidefin"), 5);
  assert.ok(hadPigeon(r.inv, uri));
  assert.equal(receive(r.inv, uri, "tidefin", 1).why, "had");
  const back = parseInventoryRecord(makeInventoryRecord(r.inv));
  assert.deepEqual(back.got, [uri]);
  assert.deepEqual(parseInventoryRecord({ ...makeInventoryRecord(r.inv), got: ["https://evil", uri, uri] }).got, [uri]);
});
