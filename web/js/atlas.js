// Your atlas: the places you've been, to travel back to (Jason, 11-09: "fast travel only available to places you've
// been to", "places you've been = ley nodes you've touched", and "we should have fewer shrines and allow fast travel to
// them"). Shrines you've found, ley nodes you've come within two kilometres of (or arrived at on a highway), and the
// landmarks you've been to; the landmarks you haven't are listed too, as places still to find. DOM only; main.js supplies
// the lists and the travel.
import { h } from "./maker.js";
import { distanceText } from "./artifacts.js";

/**
 * hooks: { shrines() -> [{ key, name, colour (css), state words, metres }] nearest first, nodes() -> [{ key, name, metres }],
 * landmarks() -> [{ key, name, been, metres }], travel(key), globe() }.
 */
export function buildAtlas({ maker, button, hooks }) {
  function open() {
    const shrines = hooks.shrines(), nodes = hooks.nodes(), marks = hooks.landmarks(), seen = marks.filter((m) => m.been), unseen = marks.filter((m) => !m.been);
    const go = (key, name) => h("button", { class: "go", "aria-label": `Travel to ${name}`, onclick: () => { maker.close(); hooks.travel(key); } }, "Go");
    const list = (rows) => h("ul", { class: "cairns" }, rows);
    const total = shrines.length + nodes.length + seen.length;
    maker.custom("atlas", [
      h("h2", {}, total ? `Your atlas (${total})` : "Your atlas"),
      h("h3", {}, `Shrines (${shrines.length})`),
      shrines.length ? list(shrines.map((s) => h("li", {}, h("span", { class: "swatch", style: `background:${s.colour}` }), h("span", { class: "who" }, s.name), h("span", { class: "where" }, `${distanceText(s.metres)} · ${s.state}`), go(s.key, s.name))))
        : h("p", { class: "small" }, "None yet. Shrines are the columns of light; walk up to one and it goes here."),
      h("h3", {}, `Ley nodes (${nodes.length})`),
      nodes.length ? list(nodes.map((n) => h("li", {}, h("span", { class: "swatch node" }), h("span", { class: "who" }, n.name), h("span", { class: "where" }, distanceText(n.metres)), go(n.key, n.name))))
        : h("p", { class: "small" }, "None yet. Come within two kilometres of a node (where the gold highways meet), or ride a highway to its end."),
      h("h3", {}, `Landmarks (${seen.length} of ${marks.length})`),
      seen.length ? list(seen.map((m) => h("li", {}, h("span", { class: "swatch mark" }), h("span", { class: "who" }, m.name), h("span", { class: "where" }, distanceText(m.metres)), go(m.key, m.name)))) : null,
      unseen.length ? h("details", {}, h("summary", {}, `Still to find (${unseen.length})`), list(unseen.sort((a, b) => a.metres - b.metres).map((m) => h("li", { class: "unseen" }, h("span", { class: "swatch mark" }), h("span", { class: "who" }, m.name), h("span", { class: "where" }, distanceText(m.metres)))))) : null,
      total ? h("div", { class: "row" }, h("button", { onclick: () => { maker.close(); hooks.globe(); } }, "Show on the globe")) : null,
      h("p", { class: "small" }, "Places you've been, to travel back to. To a mutual, or a cairn one left, takes a portal (BAG ▾). Your atlas is kept on this device and, signed in, in your Bluesky repo, so it follows you."),
    ], { trigger: button, classes: ["atlas"] });
  }
  button.addEventListener("click", () => (maker.open === "atlas" ? maker.close() : open()));
  return {
    open,
    refresh(n) {
      button.textContent = `ATLAS${n ? ` (${n})` : ""} ▾`;
      if (maker.open === "atlas") open();
    },
  };
}
