// What happens when you reach something you tapped: ranges, names and the
// lines the log shows. Pure, so Node can test it. Variety comes from hashes, so
// the same tree answers the same way for everyone.
import { hash2 } from "./plantforms.js";

/** How close you need to be (metres) before a tapped thing answers. */
export const RANGE = { tree: 20, butterfly: 30, being: 3000, highway: 170, artifact: 30, critter: 26, shrine: 24 };

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
// Small creatures answering a gentle touch, and running from a rush. A binky is the twisting jump of a happy rabbit.
const CRITTER_LINES = {
  bunny: (n, me) => [`The ${n} sniffs ${me}'s nose and decides you're all right.`, `The ${n} does a little twisting jump. That's a binky: it's happy.`, `The ${n} flicks its ears at you and goes back to nibbling.`, `The ${n} leans into the pat, eyes half shut.`],
  frog: (n) => [`The ${n} puffs out its throat: ribbit.`, `The ${n} blinks at you, very slowly.`, `Boop. The ${n} croaks, unbothered.`, `The ${n} sits up a little taller, pleased.`],
  bird: (n) => [`The ${n} sings three notes back.`, `The ${n} tilts its head, then answers.`, `The ${n} hops closer to listen, and trills.`, `The ${n} fluffs up and sings a little louder.`],
};
export function critterLine(kind, name, me, seed, n = 0) {
  return pickOf(CRITTER_LINES[kind](name, me), hash2(seed, n, 47));
}
const FLED = { bunny: (n) => `Too fast for the ${n}: it bolts.`, frog: (n) => `The ${n} leaps away from you.`, bird: (n) => `The ${n} takes off in a flurry.` };
/** Running from you. The first time, a hint: tap one, and you'll walk up gently. */
export const fledLine = (kind, name, first) => FLED[kind](name) + (first ? " Tap one to walk up gently." : "");
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

// ---- What's in reach: the prompt and its focus ----
// Everything in reach glints; the one you're most likely after gets the prompt,
// "(E) Shake the baobab", and the interact button does it.

/** The prompt's words for a thing in reach: { kind, species?, hue? }. */
export function promptFor(c) {
  if (c.kind === "tree") {
    if (c.species === "carnegiea") return "Hug the saguaro";
    if (c.species === "sequoiadendron") return "Push the giant sequoia";
    if (c.species === "shrub") return "Rustle the shrub";
    return `Shake the ${TREE_NAMES[c.species] ?? c.species}`;
  }
  if (c.kind === "butterfly") return `Greet the ${hueName(c.hue)} butterfly`;
  if (c.kind === "shrine") return `Touch ${c.name}`;
  if (c.kind === "critter") return c.species === "bunny" ? `Pet the ${c.name}` : c.species === "frog" ? `Boop the ${c.name}` : `Whistle to the ${c.name}`;
  if (c.kind === "being") return "Hum to the sky being";
  if (c.kind === "highway") return "Board the highway";
  if (c.kind === "ride") return "Step off";
  if (c.kind === "artifact") return c.own ? "Tend your cairn" : c.handle ? `Read @${c.handle}'s cairn` : "Read the cairn";
  return "Squeak";
}

// Small things close at hand come before big things far off: under a highway,
// beside a tree, with a sky being on the horizon, the tree is what you meant.
const BIAS = { shrine: -0.08, artifact: -0.05, critter: -0.02, butterfly: 0, tree: 0.05, highway: 0.3, being: 0.4 };

/**
 * How much a thing in reach wants the prompt (lower wins). c: { kind, d, range, facing, species? },
 * facing being the cosine between your heading and the way to it (1 straight ahead).
 */
export function focusScore(c) {
  const bias = (BIAS[c.kind] ?? 0.5) + (c.kind === "tree" && c.species === "shrub" ? 0.2 : 0);
  return c.d / c.range + 0.35 * (1 - (c.facing ?? 1)) + bias;
}

/**
 * The thing that gets the prompt, or null. It sticks to the current one (by key)
 * unless another is clearly better, so the prompt doesn't flicker between two trees.
 */
export function chooseFocus(cands, currentKey = null, hold = 0.15) {
  let best = null, bestS = Infinity, cur = null, curS = Infinity;
  for (const c of cands) {
    const s = focusScore(c);
    if (s < bestS) { best = c; bestS = s; }
    if (c.key === currentKey) { cur = c; curS = s; }
  }
  return cur && curS <= bestS + hold ? cur : best;
}

/** The few things that glint: the best-scoring n, focus first. */
export function glinting(cands, focus, n = 5) {
  const rest = cands.filter((c) => c !== focus).sort((a, b) => focusScore(a) - focusScore(b));
  return (focus ? [focus, ...rest] : rest).slice(0, n);
}

// ---- Artifacts ----
/** How long ago, in words: "today", "yesterday", "3 days ago". */
export function ago(sinceS, nowS) {
  const d = Math.floor((nowS - sinceS) / 86400);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}
/** The log line for reading a cairn: its note, who left it and when; or, with no note, that someone did. */
export function cairnLine(a, nowS, fade = 1) {
  const who = a.handle ? `@${a.handle}` : "someone", when = ago(a.since, nowS);
  const tail = fade < 1 ? " It's fading with the moon." : "";
  return a.note ? `\u201c${a.note}\u201d \u2014 ${who}, ${when}.${tail}` : `${who} left a cairn here ${when}.${tail}`;
}
