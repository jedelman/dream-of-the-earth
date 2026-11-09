// The sky's clock: where the Moon and the planets are, now, for the game's astrological clock (Jason, 11-09: "we
// should totally show the moon in the sky and exaggerated planets (5 degrees of orb) in their positions … pin to actual
// clock time so we can use an astrological clock for the game"). Pure, so Node can test it against JPL Horizons.
//
// Planets: JPL's "Approximate Positions of the Planets", Table 1 (Keplerian elements and rates, mean ecliptic and
// equinox of J2000, valid 1800-2050; nominal errors 10-600 arcseconds), from ssd.jpl.nasa.gov/planets/approx_pos.html.
// Pluto isn't in that table any more; its row is the older JPL one, checked against Horizons in test/astro.test.js.
// The Moon: the Astronomical Almanac's low-precision series (a few tenths of a degree). Both far inside a 5° disc.
const DEG = Math.PI / 180;
const wrap = (d) => ((d % 360) + 360) % 360;

// [a (au), e, I, L, long. perihelion, long. node] and their rates per Julian century.
const ELEMENTS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  pluto: [[39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]],
};
export const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
export const GLYPH = { sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃", saturn: "♄", uranus: "⛢", neptune: "♆", pluto: "♇" };
export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

/** Julian centuries since J2000.0 at t (s since 1970). (UT for TT: a minute's difference, nothing at this scale.) */
export const centuries = (t) => (t / 86400 + 2440587.5 - 2451545.0) / 36525;

/** Heliocentric ecliptic (J2000) position of a planet, au: [x, y, z]. */
function helio(name, T) {
  const [e0, r] = ELEMENTS[name];
  const [a, e, I, L, wbar, node] = e0.map((v, i) => v + r[i] * T);
  const w = wbar - node;
  let M = wrap(L - wbar);
  if (M > 180) M -= 360;
  // Kepler's equation, M = E - e sin E, by Newton's method (degrees, as JPL gives it).
  const es = e / DEG;
  let E = M + es * Math.sin(M * DEG);
  for (let k = 0; k < 8; k++) {
    const dM = M - (E - es * Math.sin(E * DEG)), dE = dM / (1 - e * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  const xp = a * (Math.cos(E * DEG) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E * DEG);
  const cw = Math.cos(w * DEG), sw = Math.sin(w * DEG), cO = Math.cos(node * DEG), sO = Math.sin(node * DEG), cI = Math.cos(I * DEG), sI = Math.sin(I * DEG);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** General precession in longitude since J2000 (degrees): the zodiac is tropical, measured from the equinox of date. */
const precession = (T) => 1.396971 * T;

/** A planet seen from Earth: ecliptic longitude and latitude of date (degrees), distance (au). */
export function planetEcliptic(name, t) {
  const T = centuries(t), p = helio(name, T), o = helio("earth", T);
  const x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  return { lon: wrap(Math.atan2(y, x) / DEG + precession(T)), lat: Math.atan2(z, Math.hypot(x, y)) / DEG, dist: Math.hypot(x, y, z) };
}

/** The Moon: ecliptic longitude and latitude of date (degrees), distance (Earth radii). Astronomical Almanac, low precision. */
export function moonEcliptic(t) {
  const T = centuries(t), s = (a, b) => Math.sin((a + b * T) * DEG), c = (a, b) => Math.cos((a + b * T) * DEG);
  const lon = 218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const lat = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const par = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  return { lon: wrap(lon), lat, dist: 1 / Math.sin(par * DEG) };
}

/** The Sun's ecliptic longitude of date (degrees), the same way sun.js reckons it. */
export function sunLongitude(t) {
  const d = t / 86400 + 2440587.5 - 2451545.0, g = (357.529 + 0.98560028 * d) * DEG;
  return wrap(280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

/** From ecliptic of date to altitude and azimuth (degrees) for a place at time t. */
export function horizontal({ lon, lat }, t, plat, plon) {
  const T = centuries(t), eps = (23.439291 - 0.0130042 * T) * DEG, L = lon * DEG, B = lat * DEG;
  const ra = Math.atan2(Math.sin(L) * Math.cos(eps) - Math.tan(B) * Math.sin(eps), Math.cos(L));
  const dec = Math.asin(Math.sin(B) * Math.cos(eps) + Math.cos(B) * Math.sin(eps) * Math.sin(L));
  const d = t / 86400 + 2440587.5 - 2451545.0;
  const gmst = wrap(280.46061837 + 360.98564736629 * d);
  const ha = (gmst + plon) * DEG - ra, phi = plat * DEG;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { altitude: alt / DEG, azimuth: wrap(az / DEG) };
}

/** Where a longitude falls in the tropical zodiac: { sign (0-11), name, glyph, deg (0-30) }. */
export function zodiac(lon) {
  const i = Math.floor(wrap(lon) / 30);
  return { sign: i, name: SIGNS[i], glyph: SIGN_GLYPH[i], deg: wrap(lon) - i * 30 };
}

/**
 * The whole clock at t: [{ body, glyph, lon, lat, retro }] for the Sun, the Moon and the planets (retro: moving
 * backward along the zodiac, seen from Earth), plus the Moon's illuminated fraction and whether it's waxing.
 */
export function skyClock(t) {
  const bodies = [{ body: "sun", lon: sunLongitude(t), lat: 0, retro: false }];
  const m = moonEcliptic(t);
  bodies.push({ body: "moon", lon: m.lon, lat: m.lat, retro: false });
  for (const p of PLANETS) {
    const a = planetEcliptic(p, t), b = planetEcliptic(p, t + 86400);
    const step = ((b.lon - a.lon + 540) % 360) - 180;
    bodies.push({ body: p, lon: a.lon, lat: a.lat, retro: step < 0 });
  }
  const elong = wrap(m.lon - bodies[0].lon); // 0 new, 180 full
  return { bodies: bodies.map((b) => ({ ...b, glyph: GLYPH[b.body] })), moonLit: (1 - Math.cos(elong * DEG)) / 2, waxing: elong < 180 };
}
