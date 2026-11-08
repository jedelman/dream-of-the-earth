import test from "node:test";
import assert from "node:assert/strict";
import { planPath, astar } from "../web/js/pathfind.js";

const flat = () => 10;
const length = (from, path) => path.reduce((s, p, k) => s + Math.hypot(p.x - (k ? path[k - 1].x : from.x), p.z - (k ? path[k - 1].z : from.z)), 0);

test("open ground: straight there", () => {
  const p = planPath({ x: 0, z: 0 }, { x: 1000, z: 300 }, flat, { run: 20, swim: 5 });
  assert.equal(p.length, 1);
  assert.deepEqual(p[0], { x: 1000, z: 300 });
});

test("a lake in the way: slow swimmers walk round, strong swimmers cross", () => {
  // A round lake 600 m across between start and goal.
  const lake = (x, z) => (Math.hypot(x - 500, z) < 300 ? -20 : 10);
  const from = { x: 0, z: 0 }, to = { x: 1000, z: 0 };
  const walker = planPath(from, to, lake, { run: 68, swim: 4 });
  const swimmer = planPath(from, to, lake, { run: 8, swim: 40 });
  assert.ok(length(from, walker) > 1100, `walker goes round: ${length(from, walker)}`);
  assert.ok(walker.every((p) => Math.hypot(p.x - 500, p.z) >= 250), "and stays out of the water");
  assert.ok(length(from, swimmer) < 1050, `swimmer crosses: ${length(from, swimmer)}`);
});

test("a cliff wall with a gap: through the gap", () => {
  // A wall along x = 500 rising 300 m in a few metres, except a gap around z = 400.
  const wall = (x, z) => (Math.abs(x - 500) < 20 && Math.abs(z - 400) > 60 ? 400 : 10);
  const p = planPath({ x: 0, z: 0 }, { x: 1000, z: 0 }, wall, { run: 20, swim: 5 });
  assert.ok(p, "there is a way");
  const crossing = p.find((q, k) => (k ? p[k - 1].x : 0) < 500 && q.x >= 480);
  assert.ok(p.some((q) => Math.abs(q.z - 400) < 90), JSON.stringify(p));
  assert.ok(crossing);
});

test("walled in: no way", () => {
  const pit = (x, z) => (Math.hypot(x, z) > 100 && Math.hypot(x, z) < 160 ? 500 : 10);
  assert.equal(planPath({ x: 0, z: 0 }, { x: 800, z: 0 }, pit, { run: 20, swim: 5 }), null);
});

test("A* agrees with a hand-worked grid", () => {
  // 3×3, the middle blocked: the corners route round it.
  const I = Infinity, cost = new Float32Array([1, 1, 1, 1, I, 1, 1, 1, 1]);
  const path = astar(cost, 3, 3, [0, 0], [2, 2]);
  assert.equal(path.length, 5); // no cutting the blocked corner
  assert.ok(path.every(([i, j]) => !(i === 1 && j === 1)));
});
