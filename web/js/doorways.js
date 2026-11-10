// Doors to other games (Jason, 11-10: "a shrine in Dream can link to the page"). Each stands at a real place, and
// touching it opens that game's page in a new tab. Nothing is stored, and the world around a door is the same as
// without it. Where they stand, pure, so Node can test it; doors.js draws them, landmarks.js puts each in the atlas.

export const DOORWAYS = [
  {
    key: "shinjuku-megadungeon",
    name: "the Shinjuku Megadungeon",
    landmark: "Shinjuku · the megadungeon door",
    lat: 35.691,
    lon: 139.7,
    url: "https://shinjuku-megadungeon.jason-edelman.org",
  },
];

/** A door is built into a world when it's this close to the world's middle (the world regrows 15 km out). */
export const DOOR_REACH_M = 25000;

/** The doors within reach of a world's frame (geo.js), each with where it stands in it: [{ ...door, x, z }]. */
export function doorwaysIn(frame, reach = DOOR_REACH_M) {
  return DOORWAYS.map((d) => ({ ...d, ...frame.toLocal(d.lat, d.lon) })).filter((d) => Math.hypot(d.x, d.z) <= reach);
}

/** Where travelling to a door from the atlas puts you: 14 m south of it (in reach), facing it. */
export const doorLandmark = (d) => ({ name: d.landmark, lat: d.lat - 14 / 111320, lon: d.lon, alt: 4, heading: 0, zoom: 60 });
