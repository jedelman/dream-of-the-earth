// The ley networks, oriented on the globe the way leylinesMap orients them.
// Rotation re-implemented from leylines-solids' calc.mjs (Apache-2.0): rotate
// about x by -bearing, about y by -latitude, about z by longitude, so the
// solid's +x vertex lands on (latitude, longitude).
import { LEY_DATA } from "./leydata.js";
import { vecToLatLon, latLonToVec, DEG } from "./geo.js";

const rotX = ([x, y, z], t) => [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];
const rotY = ([x, y, z], t) => [x * Math.cos(t) + z * Math.sin(t), y, -x * Math.sin(t) + z * Math.cos(t)];
const rotZ = ([x, y, z], t) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t), z];

/** Orient unit vectors: form "diamond" (no pre-rotation), as both catalogue entries use. */
export function orient(points, lat, lon, bearing) {
  const tb = -bearing * DEG, ty = -lat * DEG, tz = lon * DEG;
  return points.map((p) => rotZ(rotY(rotX(p, tb), ty), tz));
}

// leylinesMap catalogue parameters: Becker-Hagens at 31.72, 31.2, bearing 0;
// gravity wells at 0, 0, 0. Rank: rarer (fewer lines) is faster and larger,
// doubling per rank (design proposal).
export const CLASSES = [
  { id: "gwMajor", name: "Gravity wells, major", data: "gwMajor", at: [0, 0, 0], rank: 3 },
  { id: "gwBasic", name: "Gravity wells, basic", data: "gwBasic", at: [0, 0, 0], rank: 2 },
  { id: "beckerhagens", name: "Becker-Hagens", data: "beckerhagens", at: [31.72, 31.2, 0], rank: 1 },
  { id: "gwMinor", name: "Gravity wells, minor", data: "gwMinor", at: [0, 0, 0], rank: 0 },
];
export const rankScale = (rank) => 2 ** rank; // 1, 2, 4, 8

let cache = null;

/** All ley lines as { cls, a, b } with unit vectors, plus the nodes that sit on a line. */
export function network() {
  if (cache) return cache;
  const lines = [];
  const nodes = new Map(); // key -> { vec, lat, lon, classes:Set }
  const key = (v) => v.map((c) => c.toFixed(6)).join(",");
  for (const cls of CLASSES) {
    const { points, lines: pairs } = LEY_DATA[cls.data];
    const pts = orient(points, ...cls.at);
    for (const [i, j] of pairs) {
      lines.push({ cls, a: pts[i], b: pts[j] });
      for (const v of [pts[i], pts[j]]) {
        const k = key(v);
        if (!nodes.has(k)) nodes.set(k, { vec: v, ...vecToLatLon(v), classes: new Set() });
        nodes.get(k).classes.add(cls.id);
      }
    }
  }
  cache = { lines, nodes: [...nodes.values()] };
  return cache;
}

/** Points along the great circle a→b, every `stepDeg` degrees (inclusive of ends). */
export function greatCircle(a, b, stepDeg) {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const n = Math.max(1, Math.ceil(omega / (stepDeg * DEG)));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (omega < 1e-9) { out.push(a); continue; }
    const s = Math.sin(omega);
    const wa = Math.sin((1 - t) * omega) / s, wb = Math.sin(t * omega) / s;
    out.push([wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]);
  }
  return out;
}

/** Angular distance (radians) between unit vectors. */
export const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

/** The node nearest a coordinate, with its distance in metres. */
export function nearestNode(lat, lon) {
  const v = latLonToVec(lat, lon);
  let best = null, bestA = Infinity;
  for (const n of network().nodes) {
    const a = angle(v, n.vec);
    if (a < bestA) { bestA = a; best = n; }
  }
  return { node: best, meters: bestA * 6371008.8 };
}
