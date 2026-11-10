import fs from "node:fs";
const names = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { network } = await import(new URL("../../web/js/ley.js", import.meta.url).href);
const nodes = network().nodes, map = {};
nodes.forEach((n, i) => { const k = `${n.lat.toFixed(2)},${n.lon.toFixed(2)}`; if (map[k]) throw new Error("dup key " + k); if (!names[i]) throw new Error("no name " + i); map[k] = names[i]; });
const lines = Object.entries(map).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
const js = `// Names for the ley nodes (Jason, 11-10: "Also we need to name these nodes!! I'm so lost"). Each is named for where it
// really is: the nearest town if it's on land, the sea or gulf it lies in, "off" a town near the shore, or, out on the
// open ocean, plain coordinates. Worked out once, offline, from Natural Earth (public domain: populated places, marine
// areas, regions, countries; naturalearthdata.com), and read over by hand. The 128 nodes are fixed, so nothing is
// loaded at run time. Keyed by latitude and longitude to two places.
export const NODE_NAMES = {
${lines}
};

/** A node's key in NODE_NAMES. */
export const nodeKey = (n) => \`\${n.lat.toFixed(2)},\${n.lon.toFixed(2)}\`;
/** Where a node is, in words ("Bordeaux, France", "the Gulf of Mexico", "the open Pacific, 0° 112°W"), or null. */
export const placeOfNode = (n) => (n ? NODE_NAMES[nodeKey(n)] ?? null : null);
`;
fs.writeFileSync(new URL("../../web/js/nodenames.js", import.meta.url), js);
console.log(Object.keys(map).length, "names written");
