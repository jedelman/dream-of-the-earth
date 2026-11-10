// Places to visit from the HUD's menu: one in every biome (each checked on the
// live site to land in the biome named), plus a few views of the sky, and the
// doors to other games (doorways.js). The clock is always the real one (11-09),
// so you see each at whatever hour it is there.
import { DOORWAYS, doorLandmark } from "./doorways.js";

export const LANDMARKS = [
  { name: "Amazon · rainforest", lat: -3.1, lon: -60.0, alt: 25 },
  { name: "Amazon · forest floor, butterflies", lat: -3.1, lon: -60.0, alt: 4, zoom: 30, heading: 20 },
  { name: "Amazon · fireflies (after dark there)", lat: -3.1, lon: -60.0, alt: 8, zoom: 40, heading: 200 },
  { name: "Amazon · cumulus", lat: -6.0, lon: -62.2, alt: 300, heading: 250 },
  { name: "Amazon · storms and rain", lat: -6.7, lon: -59.9, alt: 300, heading: 0 },
  { name: "Borneo · rainforest", lat: 1.0, lon: 114.0, alt: 25 },
  { name: "Serengeti · savanna", lat: -2.3, lon: 34.8, alt: 6, zoom: 40 },
  { name: "Sonoran · desert", lat: 32.25, lon: -111.2, alt: 15, zoom: 50 },
  { name: "Sahara · desert", lat: 24.5, lon: 9.5, alt: 25 },
  { name: "Tuscany · mediterranean", lat: 43.3, lon: 11.3, alt: 25 },
  { name: "Santa Barbara · mediterranean", lat: 34.45, lon: -119.75, alt: 25 },
  { name: "Florida · subtropical", lat: 28.5, lon: -81.5, alt: 25 },
  { name: "Ethiopia · highland", lat: 9.0, lon: 38.7, alt: 25 },
  { name: "Scottish Highlands · oceanic", lat: 57.0, lon: -4.5, alt: 25 },
  { name: "Vermont · continental", lat: 44.0, lon: -72.7, alt: 25 },
  { name: "Siberia · taiga", lat: 62.0, lon: 110.0, alt: 25 },
  { name: "Mongolia · cold steppe", lat: 47.5, lon: 106.0, alt: 25 },
  { name: "Alaska North Slope · tundra", lat: 70.2, lon: -149.0, alt: 25 },
  { name: "The Alps · tundra, 3 km up", lat: 46.5, lon: 8.0, alt: 200, heading: 180 },
  { name: "Greenland · ice", lat: 72.0, lon: -40.0, alt: 25 },
  { name: "The globe · Africa", lat: 10, lon: 20, zoom: 16000000 },
  ...DOORWAYS.map(doorLandmark),
];

/** The URL query for a landmark, keeping other parameters (seed, stats, detail). */
export function landmarkQuery(l, search = "") {
  const q = new URLSearchParams(search);
  for (const k of ["lat", "lon", "alt", "heading", "zoom", "t", "ride"]) q.delete(k); // t: links from before the real clock
  q.set("lat", l.lat); q.set("lon", l.lon);
  if (l.alt !== undefined) q.set("alt", l.alt);
  if (l.heading !== undefined) q.set("heading", l.heading);
  if (l.zoom !== undefined) q.set("zoom", l.zoom);
  return q.toString();
}
