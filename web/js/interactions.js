// What happens when you reach something you tapped: ranges, names and the
// lines the log shows. Pure, so Node can test it. Variety comes from hashes, so
// the same tree answers the same way for everyone.
import { hash2 } from "./plantforms.js";

/** How close you need to be (metres) before a tapped thing answers. */
export const RANGE = { tree: 20, butterfly: 30, being: 3000, highway: 170 };

export const TREE_NAMES = {
  ceiba: "kapok", ficus: "banyan", cocos: "coconut palm", adansonia: "baobab", vachellia: "umbrella thorn",
  carnegiea: "saguaro", quercus: "oak", cupressus: "cypress", sequoiadendron: "giant sequoia", picea: "spruce",
  shrub: "shrub", grass: "grass", moss: "moss",
};

const pickOf = (list, h) => list[h % list.length];

// What falls out of each tree when you shake it (the bursts use the same keys).
export const TREE_LINES = {
  ceiba: ["Kapok fluff drifts down like snow.", "Silky seeds float off on the wind."],
  ficus: ["Figs patter onto the roots.", "A bat drops out, offended, and flaps away."],
  cocos: ["A coconut thuds down beside you.", "The fronds clatter like applause."],
  adansonia: ["Dry pods rattle in the baobab.", "The baobab creaks, very old and unbothered."],
  vachellia: ["Thorns rattle; a seed pod twirls down.", "A weaver bird scolds you from the crown."],
  carnegiea: ["The saguaro does not shake. Ouch.", "You hug the saguaro. Regret is instant."],
  quercus: ["Acorns drop. Leaves spin down.", "A squirrel chatters at you, outraged."],
  cupressus: ["The cypress sways, solemn as a candle flame.", "A breath of resin. The cypress hardly moves."],
  sequoiadendron: ["You push the giant sequoia. It has stood a thousand years; it doesn't notice.", "Somewhere far above, a cone lets go."],
  picea: ["Needles shower down, smelling of resin.", "A cone bounces off your head."],
  shrub: ["The shrub rustles. Something small scurries out.", "Berries wobble. Nothing falls."],
  grass: ["The grass hisses and settles."],
  moss: ["The moss is soft. Nothing happens, gently."],
};

/** The log line for shaking a tree. n counts shakes, so a second shake can say something else. */
export function treeLine(species, seed, blossom = false, n = 0) {
  const name = TREE_NAMES[species] ?? species;
  if (blossom && species !== "carnegiea") return `You shake the ${name}. Petals scatter everywhere.`;
  const what = pickOf(TREE_LINES[species] ?? ["It rustles."], hash2(seed, n, 31));
  return species === "carnegiea" || species === "sequoiadendron" ? what : `You shake the ${name}. ${what}`;
}

const HUES = [[0.03, "red"], [0.1, "orange"], [0.17, "golden"], [0.3, "lime"], [0.5, "teal"], [0.66, "blue"], [0.8, "violet"], [0.97, "pink"], [1.01, "red"]];
const hueName = (hue) => HUES.find(([h]) => hue < h)[1];
export function butterflyLine(hue, seed, n = 0) {
  const c = hueName(hue);
  return pickOf([`The ${c} butterfly squeaks and loops around you.`, `A ${c} butterfly squeaks hello and lands on your nose.`, `The ${c} butterfly squeaks, then pretends it didn't.`], hash2(seed, n, 41));
}
export function beingLine(seed, n = 0) {
  return pickOf(["The sky being hums, low and slow, and the air shimmers.", "Something vast hums back at you. Your feathers tingle.", "The sky being turns one of its many eyes toward you, and hums."], hash2(seed, n, 51));
}
export function selfLine(name, n = 0) {
  return pickOf([`${name} squeaks!`, `${name} squeaks, very pleased with itself.`, `${name} lets out a tiny squeak.`, `${name} squeaks at the sky.`], hash2(n, 7, 61));
}
export const highwayLine = (cls, km) => `You step onto the ${cls} highway. ${Math.round(km).toLocaleString("en")} km to the next node.`;

// Every creature has a name, grown from its seed like everything else.
const SYL = ["mi", "bo", "zu", "ka", "lo", "pi", "ny", "ree", "fa", "o", "ul", "quo", "shi", "va", "pom", "tik", "ash", "ella", "nu", "bri"];
export function creatureName(seed) {
  const h = hash2(seed | 0, 3, 71);
  const n = 2 + (h % 2);
  let s = "";
  for (let k = 0; k < n; k++) s += SYL[hash2(h, k, 72) % SYL.length];
  return s[0].toUpperCase() + s.slice(1);
}
