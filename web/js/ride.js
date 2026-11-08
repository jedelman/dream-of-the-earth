// Riding the ley highways: pure geometry, no three.js, so Node can test it.
// A ride follows one line's great circle from where you board to the node at
// its end. Rarer is faster: speed doubles per rank.
import { network, rankScale, angle } from "./ley.js";
import { R_EARTH, latLonToVec, vecToLatLon } from "./geo.js";

export const RIDE_BASE = 200000; // m/s on the commonest class (gravity-wells minor)
export const HIGHWAY_MIN_ALT = 900; // metres above sea level
export const HIGHWAY_CLEAR = 300; // metres above terrain where the land is higher
export const halfWidth = (rank) => 22 * rankScale(rank); // metres
export const highwayAltitude = (groundM) => Math.max(HIGHWAY_MIN_ALT, groundM + HIGHWAY_CLEAR);
export const rideSpeed = (rank) => RIDE_BASE * rankScale(rank);
export const captureRadius = (rank) => Math.max(150, 2 * halfWidth(rank));

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

let prepared = null;
function lines() {
  if (prepared) return prepared;
  prepared = network().lines.map((l, i) => ({ ...l, i, n: norm(cross(l.a, l.b)), arc: angle(l.a, l.b) }));
  return prepared;
}
export const lineCount = () => lines().length;
export const lineAt = (i) => lines()[i];

/** Point at fraction t along a line's arc. */
export function pointOn(line, t) {
  const s = Math.sin(line.arc);
  const wa = Math.sin((1 - t) * line.arc) / s, wb = Math.sin(t * line.arc) / s;
  return norm([wa * line.a[0] + wb * line.b[0], wa * line.a[1] + wb * line.b[1], wa * line.a[2] + wb * line.b[2]]);
}

/** Local east/north components of the direction of travel along a line at fraction t (dir = ±1). */
export function tangentEN(line, t, dir) {
  const p = pointOn(line, t);
  const towardB = norm(cross(line.n, p)); // along the circle from a toward b
  const { lat, lon } = vecToLatLon(p);
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  return { e: dir * dot(towardB, east), n: dir * dot(towardB, north) };
}

/**
 * Lines a creature at (lat, lon) is inside the ribbon of: within the capture
 * radius of the great circle and between the line's two nodes.
 * Returns [{ line, t, meters }].
 */
export function linesNear(lat, lon, slackM = 0) {
  const v = latLonToVec(lat, lon);
  const out = [];
  for (const line of lines()) {
    const s = dot(v, line.n);
    const meters = Math.asin(Math.min(1, Math.abs(s))) * R_EARTH;
    if (meters > captureRadius(line.cls.rank) + slackM) continue;
    const q = norm([v[0] - s * line.n[0], v[1] - s * line.n[1], v[2] - s * line.n[2]]);
    const ta = angle(line.a, q), tb = angle(q, line.b);
    if (ta + tb - line.arc > 1e-7) continue; // on the circle but past a node
    out.push({ line, t: ta / line.arc, meters, at: q }); // at: the nearest point on the line (unit vector)
  }
  return out;
}

/**
 * Board a highway: of the lines whose ribbon you're inside, the one best
 * aligned with your heading, and only if you're flying along it (within 60°),
 * so you can cross a highway without being snatched. heading: east/north unit.
 */
export function chooseCapture(lat, lon, heading, exclude = -1) {
  let best = null;
  for (const c of linesNear(lat, lon)) {
    if (c.line.i === exclude) continue;
    const tg = tangentEN(c.line, c.t, 1);
    const align = tg.e * heading.e + tg.n * heading.n;
    const score = Math.abs(align);
    if (score < 0.5) continue;
    if (!best || score > best.score) best = { ...c, dir: align >= 0 ? 1 : -1, score };
  }
  return best;
}

export function startRide(c) {
  return { line: c.line, t: c.t, dir: c.dir, age: 0, speed: 0, done: false };
}

/** Advance a ride by dt seconds. Eases in over ~2 s and out over the last stretch. */
export function advance(ride, dt) {
  const vmax = rideSpeed(ride.line.cls.rank);
  const lengthM = ride.line.arc * R_EARTH;
  const remainingM = (ride.dir > 0 ? 1 - ride.t : ride.t) * lengthM;
  ride.age += dt;
  const easeIn = Math.min(1, ride.age / 2);
  const easeOut = Math.min(1, remainingM / (vmax * 1.2) + 0.02);
  ride.speed = vmax * easeIn * easeIn * Math.min(1, easeOut);
  ride.t += (ride.dir * ride.speed * dt) / lengthM;
  if (ride.t >= 1 || ride.t <= 0) { ride.t = Math.min(1, Math.max(0, ride.t)); ride.done = true; }
  return ride;
}

export const rideLatLon = (ride) => vecToLatLon(pointOn(ride.line, ride.t));
export const remainingMeters = (ride) => (ride.dir > 0 ? 1 - ride.t : ride.t) * ride.line.arc * R_EARTH;

/**
 * At a crossing, hop onto the other line: A/D picks the direction on the new
 * line that turns left or right of the current one.
 */
export function hop(ride, turn) {
  const { lat, lon } = rideLatLon(ride);
  const cur = tangentEN(ride.line, ride.t, ride.dir);
  const wanted = turn < 0 ? { e: -cur.n, n: cur.e } : { e: cur.n, n: -cur.e };
  const other = linesNear(lat, lon).find((c) => c.line.i !== ride.line.i);
  if (!other) return null;
  const tg = tangentEN(other.line, other.t, 1);
  return startRide({ line: other.line, t: other.t, dir: tg.e * wanted.e + tg.n * wanted.n >= 0 ? 1 : -1 });
}

/** Lines other than the current one whose ribbon you're inside right now. */
export function crossings(ride) {
  const { lat, lon } = rideLatLon(ride);
  return linesNear(lat, lon).filter((c) => c.line.i !== ride.line.i);
}
