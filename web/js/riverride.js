// Riding a river: the watersheds' third stage, "enter" (Jason, 11-10: "All 3, in stages"; know, see, enter). Jason,
// 11-19: "Riding a river should have speed based on depth and flow volume." Pure, so Node can test it; main.js rides.
//
// How much water a river carries at a point comes from how much land drains to it there. On a basin's main stem (the
// line the river quests climb) that's the basin's area, scaled by how far down the stem you are: Hack's law (stream
// length grows as drained area to the 0.6, Hack 1957), so area grows as length to the 1/0.6. Off the main stems, the
// river's Natural Earth rank stands in (rank 1 the great rivers, 12 the least). Discharge is a runoff of 0.01 m³/s for
// each km² (about 300 mm of rain a year reaching the river). Depth grows with discharge as Leopold and Maddock's
// hydraulic geometry has it (depth ∝ Q^0.4, 1953; the coefficient is a typical one). The ride's speed is a dream speed
// grown from the depth, so deep, full rivers carry you fast and shallow ones slowly.

export const RUNOFF = 0.01; // m³/s per km² drained
export const HACK = 0.6; // length ∝ area^0.6
export const DEPTH_K = 0.27, DEPTH_B = 0.4; // depth (m) = K · Q^B
export const SPEED_PER_M = 15, SPEED_MIN = 6, SPEED_MAX = 320; // ride speed (m/s) per metre of depth, and its bounds

/** Land drained at a point on a main stem (km²): the basin's area, by Hack's law from how far up the stem it is. */
export function stemArea(basinKm2, lenKm, sFromSeaKm) {
  const fromSource = Math.max(0, Math.min(lenKm, lenKm - sFromSeaKm));
  return basinKm2 * (fromSource / Math.max(1e-9, lenKm)) ** (1 / HACK);
}
/** Land drained by a river of a Natural Earth rank (km²), where no main stem says better: a great river half a million. */
export const rankArea = (rank) => 10 ** (6 - 0.35 * Math.max(0, rank));
/** Discharge (m³/s) from area drained (km²). */
export const dischargeOf = (km2) => RUNOFF * Math.max(0, km2);
/** Depth (m) from discharge (m³/s). */
export const depthOf = (q) => DEPTH_K * Math.max(0, q) ** DEPTH_B;
/** How fast a river carries you (m/s), from its depth. */
export const rideSpeed = (depth) => Math.max(SPEED_MIN, Math.min(SPEED_MAX, SPEED_PER_M * depth));

/** Everything about a river at a point: { area (km²), discharge (m³/s), depth (m), speed (m/s) }. */
export function riverAt({ basinKm2 = null, lenKm = null, sFromSeaKm = null, rank = 8 } = {}) {
  const area = basinKm2 && lenKm && sFromSeaKm != null ? Math.max(stemArea(basinKm2, lenKm, sFromSeaKm), rankArea(12)) : rankArea(rank);
  const discharge = dischargeOf(area), depth = depthOf(discharge);
  return { area, discharge, depth, speed: rideSpeed(depth) };
}

/** The nearest point of a stem's line (quests.json: [[lat, lon, s km from the sea], ...]) to (lat, lon): { s, km }. */
export function nearestOnStem(line, lat, lon) {
  const kx = Math.cos((lat * Math.PI) / 180);
  let best = { s: 0, km: Infinity };
  for (let k = 1; k < line.length; k++) {
    const [a0, a1, as] = line[k - 1], [b0, b1, bs] = line[k];
    const ax = (a1 - lon) * kx, ay = a0 - lat, bx = (b1 - lon) * kx, by = b0 - lat, dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-12)));
    const km = Math.hypot(ax + dx * t, ay + dy * t) * 111.32;
    if (km < best.km) best = { s: as + (bs - as) * t, km };
  }
  return best;
}

/**
 * Where the ride goes next along a polyline (local [x, z] points, downstream): { k, t } after moving d metres from
 * segment k, t metres in; { end: true, over } when the line runs out, over the metres left.
 */
export function advance(line, k, t, d) {
  let kk = k, tt = t + d;
  while (kk < line.length - 1) {
    const L = Math.hypot(line[kk + 1][0] - line[kk][0], line[kk + 1][1] - line[kk][1]);
    if (tt <= L) return { k: kk, t: tt };
    tt -= L;
    kk++;
  }
  return { end: true, over: tt };
}
/** The point and the way downstream at segment k, t metres in: { x, z, dx, dz } (dx, dz a unit vector). */
export function pointAt(line, k, t) {
  const a = line[Math.min(k, line.length - 2)], b = line[Math.min(k + 1, line.length - 1)];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = Math.min(1, t / L);
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L };
}

const KMH = (v) => Math.round(v * 3.6);
/** The words as the river takes you: "The Loire takes you, about 4 m deep and 1,200 m³ a second: 220 km/h downstream." */
export function rideLine(name, r) {
  const who = name ? `The ${name}` : "The river";
  const q = r.discharge >= 100 ? Math.round(r.discharge / 100) * 100 : Math.max(1, Math.round(r.discharge));
  return `${who} takes you, about ${r.depth < 2 ? r.depth.toFixed(1) : Math.round(r.depth)} m deep and ${q.toLocaleString("en")} m³ a second: ${KMH(r.speed).toLocaleString("en")} km/h downstream.`;
}
