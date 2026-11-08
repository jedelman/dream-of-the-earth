// Places to visit from the HUD's menu: one in every biome (each checked on the
// live site to land in the biome named), plus a few views of the sky. `t` is a
// moment with good light there; the clock runs on from it.
export const LANDMARKS = [
  { name: "Amazon · rainforest", lat: -3.1, lon: -60.0, alt: 25, t: "2026-11-08T16:00:00Z" },
  { name: "Amazon · forest floor, butterflies", lat: -3.1, lon: -60.0, alt: 4, zoom: 30, heading: 20, t: "2026-11-08T16:00:00Z" },
  { name: "Amazon · fireflies at night", lat: -3.1, lon: -60.0, alt: 8, zoom: 40, heading: 200, t: "2026-11-09T02:00:00Z" },
  { name: "Amazon · cumulus at sunset", lat: -6.0, lon: -62.2, alt: 300, heading: 250, t: "2026-11-08T21:40:00Z" },
  { name: "Amazon · storms and rain", lat: -6.7, lon: -59.9, alt: 300, heading: 0, t: "2026-11-08T16:00:00Z" },
  { name: "Borneo · rainforest", lat: 1.0, lon: 114.0, alt: 25, t: "2026-11-08T04:30:00Z" },
  { name: "Serengeti · savanna", lat: -2.3, lon: 34.8, alt: 6, zoom: 40, t: "2026-11-08T09:40:00Z" },
  { name: "Sonoran · desert", lat: 32.25, lon: -111.2, alt: 15, zoom: 50, t: "2026-11-08T19:00:00Z" },
  { name: "Sahara · desert", lat: 24.5, lon: 9.5, alt: 25, t: "2026-11-08T11:20:00Z" },
  { name: "Tuscany · mediterranean", lat: 43.3, lon: 11.3, alt: 25, t: "2026-11-08T11:15:00Z" },
  { name: "Santa Barbara · mediterranean", lat: 34.45, lon: -119.75, alt: 25, t: "2026-11-08T20:00:00Z" },
  { name: "Florida · subtropical", lat: 28.5, lon: -81.5, alt: 25, t: "2026-11-08T17:00:00Z" },
  { name: "Ethiopia · highland", lat: 9.0, lon: 38.7, alt: 25, t: "2026-11-08T09:30:00Z" },
  { name: "Scottish Highlands · oceanic", lat: 57.0, lon: -4.5, alt: 25, t: "2026-11-08T12:20:00Z" },
  { name: "Vermont · continental", lat: 44.0, lon: -72.7, alt: 25, t: "2026-11-08T16:30:00Z" },
  { name: "Siberia · taiga", lat: 62.0, lon: 110.0, alt: 25, t: "2026-11-08T04:40:00Z" },
  { name: "Mongolia · cold steppe", lat: 47.5, lon: 106.0, alt: 25, t: "2026-11-08T05:00:00Z" },
  { name: "Alaska North Slope · tundra", lat: 70.2, lon: -149.0, alt: 25, t: "2026-07-01T22:00:00Z" },
  { name: "The Alps · tundra, 3 km up", lat: 46.5, lon: 8.0, alt: 200, heading: 180, t: "2026-11-08T11:30:00Z" },
  { name: "Greenland · ice", lat: 72.0, lon: -40.0, alt: 25, t: "2026-07-01T14:40:00Z" },
  { name: "The globe · Africa", lat: 10, lon: 20, zoom: 16000000, t: "2026-11-08T11:00:00Z" },
];

/** The URL query for a landmark, keeping other parameters (seed, stats, detail). */
export function landmarkQuery(l, search = "") {
  const q = new URLSearchParams(search);
  for (const k of ["lat", "lon", "alt", "heading", "zoom", "t", "ride"]) q.delete(k);
  q.set("lat", l.lat); q.set("lon", l.lon);
  if (l.alt !== undefined) q.set("alt", l.alt);
  if (l.heading !== undefined) q.set("heading", l.heading);
  if (l.zoom !== undefined) q.set("zoom", l.zoom);
  if (l.t) q.set("t", l.t);
  return q.toString();
}
