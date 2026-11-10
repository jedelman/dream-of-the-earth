import test from "node:test";
import assert from "node:assert/strict";
import { DOORWAYS, doorwaysIn, doorLandmark, DOOR_REACH_M } from "../web/js/doorways.js";
import { LANDMARKS } from "../web/js/landmarks.js";
import { makeAtlasRecord, parseAtlasRecord } from "../web/js/atlas-record.js";
import { promptFor, RANGE } from "../web/js/interactions.js";
import { makeFrame } from "../web/js/geo.js";

const door = DOORWAYS.find((d) => d.key === "shinjuku-megadungeon");

test("the Shinjuku Megadungeon's door stands at Shinjuku Station and opens its page", () => {
  assert.ok(door);
  assert.equal(door.lat, 35.691);
  assert.equal(door.lon, 139.7);
  assert.equal(door.url, "https://shinjuku-megadungeon.jason-edelman.org");
  for (const d of DOORWAYS) assert.match(d.url, /^https:\/\/[a-z0-9.-]+\.jason-edelman\.org$/, d.key);
  assert.equal(new Set(DOORWAYS.map((d) => d.key)).size, DOORWAYS.length);
});

test("a door is in a world near it, where it really is, and not in one far off", () => {
  const near = doorwaysIn(makeFrame(35.70, 139.71));
  assert.equal(near.length, 1);
  assert.ok(Math.abs(near[0].x - -904) < 5 && Math.abs(near[0].z - 1001) < 5, `${near[0].x}, ${near[0].z}`); // 0.9 km west, 1 km south
  assert.equal(doorwaysIn(makeFrame(35.69, 139.70 + 0.3)).length, 0, "27 km east, out of reach");
  assert.equal(doorwaysIn(makeFrame(-3.1, -60)).length, 0);
  assert.ok(DOOR_REACH_M < 29000, "inside the nearest terrain ring");
});

test("the prompt says where the door goes, and that it opens elsewhere", () => {
  assert.equal(promptFor({ kind: "door", name: door.name }), "Enter the Shinjuku Megadungeon ↗");
  assert.ok(RANGE.door > 0);
});

test("each door is a landmark: found by going there, kept in the atlas, travelled to just south of it, facing it", () => {
  const l = LANDMARKS.find((q) => q.name === door.landmark);
  assert.deepEqual(l, doorLandmark(door));
  const metres = (door.lat - l.lat) * 111320;
  assert.ok(metres > 0 && metres < RANGE.door && l.lon === door.lon && l.heading === 0, "south of it, in reach, facing north");
  const been = { nodes: {}, marks: { [door.landmark]: 1794000000 } };
  assert.deepEqual(parseAtlasRecord(makeAtlasRecord({}, 0, been)).marks, been.marks);
});
