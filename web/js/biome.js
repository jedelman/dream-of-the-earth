// Biomes from the Köppen-Geiger climate map (Beck et al. 2023, 1991-2020) and
// Jason's rule: "Biomes shift by elevation and latitude bands, so higher
// latitude = colder adjacent climate = higher elevation."
//
// Each Köppen class becomes a moisture regime and a rung on a temperature
// ladder. Ground that rises above its surroundings climbs the ladder: air cools
// ~6.5 °C per km, and a rung is ~6 °C, so every ~900 m of relief is one rung
// colder. Pure, so Node can test it.

export const RUNG_M = 900;

// Köppen number -> [code, moisture, rung]. Moisture: wet | seasonal | arid.
export const KOPPEN = {
  1: ["Af", "wet", 5], 2: ["Am", "wet", 5], 3: ["Aw", "seasonal", 5],
  4: ["BWh", "arid", 4], 5: ["BWk", "arid", 1], 6: ["BSh", "arid", 3], 7: ["BSk", "arid", 2],
  8: ["Csa", "seasonal", 4], 9: ["Csb", "seasonal", 4], 10: ["Csc", "seasonal", 3],
  11: ["Cwa", "wet", 4], 12: ["Cwb", "seasonal", 3], 13: ["Cwc", "seasonal", 3],
  14: ["Cfa", "wet", 4], 15: ["Cfb", "wet", 3], 16: ["Cfc", "wet", 2],
  17: ["Dsa", "seasonal", 2], 18: ["Dsb", "seasonal", 2], 19: ["Dsc", "seasonal", 1], 20: ["Dsd", "seasonal", 1],
  21: ["Dwa", "wet", 2], 22: ["Dwb", "wet", 2], 23: ["Dwc", "wet", 1], 24: ["Dwd", "wet", 1],
  25: ["Dfa", "wet", 2], 26: ["Dfb", "wet", 2], 27: ["Dfc", "wet", 1], 28: ["Dfd", "wet", 1],
  29: ["ET", "wet", 0], 30: ["EF", "wet", -1],
};

// The ladders, from ice (-1) to the warmest rung (5).
const LADDERS = {
  wet: ["ice", "tundra", "taiga", "continental", "oceanic", "subtropical", "rainforest"],
  seasonal: ["ice", "tundra", "taiga", "continental", "highland", "mediterranean", "savanna"],
  arid: ["ice", "tundra", "colddesert", "coldsteppe", "steppe", "desert", "desert"],
};

/**
 * What grows, and how much. color: the land. density: the chance a 40 m cell
 * holds a tree or shrub, picked from plants ([species, weight]): each biome's
 * charismatic trees (kapok and banyan in the rainforest, baobab and umbrella
 * thorn on the savanna, giant sequoia in the highlands...). cover: the
 * chance a 10 m cell holds grass or moss, picked from ground. butterflies:
 * 0..1 by day. fireflies: whether they come out at night.
 */
export const BIOMES = {
  rainforest:    { color: 0x10b870, density: 0.95, plants: [["ficus", 4], ["ceiba", 1.5], ["cocos", 1.5], ["shrub", 0.5]], cover: 0.25, ground: [["grass", 1]], butterflies: 1.0, fireflies: true },
  savanna:       { color: 0xd2c24a, density: 0.1, plants: [["vachellia", 4], ["adansonia", 2], ["shrub", 1.5]], cover: 0.6, ground: [["grass", 1]], butterflies: 0.6, fireflies: true },
  desert:        { color: 0xffbf6a, density: 0.04, plants: [["carnegiea", 5], ["shrub", 3]], cover: 0.03, ground: [["grass", 1]], butterflies: 0.05, fireflies: false },
  colddesert:    { color: 0xd8b590, density: 0.04, plants: [["shrub", 1]], cover: 0.06, ground: [["grass", 1]], butterflies: 0.05, fireflies: false },
  steppe:        { color: 0xd6cf6a, density: 0.05, plants: [["shrub", 1]], cover: 0.6, ground: [["grass", 1]], butterflies: 0.3, fireflies: false },
  coldsteppe:    { color: 0xbcc68a, density: 0.07, plants: [["shrub", 1]], cover: 0.5, ground: [["grass", 1]], butterflies: 0.25, fireflies: false },
  mediterranean: { color: 0x9ec85a, density: 0.4, plants: [["cupressus", 2.5], ["quercus", 3.5], ["shrub", 3]], cover: 0.3, ground: [["grass", 1]], butterflies: 0.7, fireflies: true },
  subtropical:   { color: 0x48d070, density: 0.65, plants: [["ficus", 2.5], ["quercus", 3], ["cocos", 2], ["shrub", 1]], cover: 0.3, ground: [["grass", 1]], butterflies: 0.8, fireflies: true },
  highland:      { color: 0x80d08c, density: 0.35, plants: [["sequoiadendron", 2], ["picea", 2.5], ["quercus", 2], ["shrub", 1]], cover: 0.45, ground: [["grass", 1]], butterflies: 0.5, fireflies: false },
  oceanic:       { color: 0x5fd16a, density: 0.35, plants: [["quercus", 5], ["picea", 0.8], ["shrub", 2]], cover: 0.5, ground: [["grass", 1]], butterflies: 0.5, fireflies: true },
  continental:   { color: 0x36b48a, density: 0.7, plants: [["quercus", 4], ["picea", 4.5], ["shrub", 1]], cover: 0.3, ground: [["grass", 1]], butterflies: 0.5, fireflies: true },
  taiga:         { color: 0x1f8a78, density: 0.6, plants: [["picea", 8.5], ["shrub", 1.5]], cover: 0.25, ground: [["moss", 1], ["grass", 1]], butterflies: 0.2, fireflies: false },
  tundra:        { color: 0xb6a6d9, density: 0.04, plants: [["shrub", 1]], cover: 0.5, ground: [["moss", 3], ["grass", 2]], butterflies: 0.15, fireflies: false },
  ice:           { color: 0xf2f0ff, density: 0, plants: [], cover: 0, ground: [], butterflies: 0, fireflies: false },
};

/**
 * The biome for a Köppen class, climbed by local relief (metres the ground
 * stands above its surroundings). Class 0 (no data) falls back to a
 * latitude-and-height ladder.
 */
export function biomeFor(koppen, reliefM = 0, lat = 0, heightM = 0) {
  let moisture, rung;
  if (KOPPEN[koppen]) [, moisture, rung] = KOPPEN[koppen];
  else {
    // No climate data here (small islands, coastal edges): temperature from
    // latitude alone, then the lapse rate.
    moisture = "wet";
    const t = 27 - 0.009 * lat * lat - 6.5 * Math.max(0, heightM) / 1000;
    rung = t < -8 ? -1 : t < 0 ? 0 : t < 6 ? 1 : t < 12 ? 2 : t < 18 ? 3 : t < 24 ? 4 : 5;
  }
  const climbed = Math.max(-1, Math.min(5, rung - Math.floor(Math.max(0, reliefM) / RUNG_M)));
  return LADDERS[moisture][climbed + 1];
}

export const koppenCode = (k) => (KOPPEN[k] ? KOPPEN[k][0] : "");
