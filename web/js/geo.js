// Geography helpers. Pure functions, no DOM, so Node tests can import them.

export const R_EARTH = 6371008.8; // metres, mean radius
export const DEG = Math.PI / 180;

/** Terrarium encoding: height = (R * 256 + G + B / 256) - 32768, in metres. */
export const terrariumHeight = (r, g, b) => r * 256 + g + b / 256 - 32768;

/** Slippy-map tile containing a coordinate. */
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latR = lat * DEG;
  const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  return { x, y }; // fractional
}

/** Inverse: fractional tile coordinates to lon/lat. */
export function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / DEG;
  return { lon, lat };
}

/**
 * A local east/north frame around an origin, good for tens of kilometres
 * (curvature ignored). three.js axes: x = east, y = up, z = -north.
 */
export function makeFrame(lat0, lon0) {
  const kx = R_EARTH * Math.cos(lat0 * DEG) * DEG; // metres per degree of longitude
  const kz = R_EARTH * DEG; // metres per degree of latitude
  return {
    lat0,
    lon0,
    toLocal(lat, lon) {
      let dLon = lon - lon0;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      return { x: dLon * kx, z: -(lat - lat0) * kz };
    },
    toLatLon(x, z) {
      let lon = lon0 + x / kx;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      return { lat: lat0 - z / kz, lon };
    },
  };
}

/** Unit vector (x toward 0N 0E, z toward the north pole) to lat/lon in degrees. */
export function vecToLatLon([x, y, z]) {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(z / r) / DEG, lon: Math.atan2(y, x) / DEG };
}

export function latLonToVec(lat, lon) {
  const c = Math.cos(lat * DEG);
  return [c * Math.cos(lon * DEG), c * Math.sin(lon * DEG), Math.sin(lat * DEG)];
}

/** Great-circle distance in metres. */
export function distance(lat1, lon1, lat2, lon2) {
  const a = latLonToVec(lat1, lon1), b = latLonToVec(lat2, lon2);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) * R_EARTH;
}

/** A point `meters` away from (lat, lon) toward `bearingDeg` (clockwise from north). */
export function offset(lat, lon, bearingDeg, meters) {
  const d = meters / R_EARTH, b = bearingDeg * DEG, p1 = lat * DEG, l1 = lon * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  let lon2 = l2 / DEG;
  if (lon2 > 180) lon2 -= 360;
  if (lon2 < -180) lon2 += 360;
  return { lat: p2 / DEG, lon: lon2 };
}
