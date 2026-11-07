// Where the sun is, for a real place and a real moment. The standard
// low-precision solar position formula (good to about 1°), enough for light
// and shadow direction.
import { DEG } from "./geo.js";

/** Returns { altitude, azimuth } in degrees; azimuth clockwise from north. */
export function sunPosition(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * DEG; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * DEG; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
  const ha = ((gmst * 15 + lon) * DEG - ra); // hour angle
  const phi = lat * DEG;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { altitude: alt / DEG, azimuth: ((az / DEG) + 360) % 360 };
}

/** Sun direction in the local three.js frame (x east, y up, z -north), unit length. */
export function sunDirection({ altitude, azimuth }) {
  const a = altitude * DEG, z = azimuth * DEG;
  return { x: Math.cos(a) * Math.sin(z), y: Math.sin(a), z: -Math.cos(a) * Math.cos(z) };
}
