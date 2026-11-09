// Your atlas: the places you've been, to travel back to (Jason, 11-09: "fast travel only available to places you've
// been to", and "we should have fewer shrines and allow fast travel to them"). For now, the shrines you've found.
// DOM only; main.js supplies the list and the travel.
import { h } from "./maker.js";
import { distanceText } from "./artifacts.js";

/** hooks: { shrines() -> [{ key, name, colour (css), state words, metres }] nearest first, travel(key), globe() }. */
export function buildAtlas({ maker, button, hooks }) {
  function open() {
    const list = hooks.shrines();
    const rows = list.map((s) => h("li", {},
      h("span", { class: "swatch", style: `background:${s.colour}` }),
      h("span", { class: "who" }, s.name),
      h("span", { class: "where" }, `${distanceText(s.metres)} · ${s.state}`),
      h("button", { class: "go", "aria-label": `Travel to ${s.name}`, onclick: () => { maker.close(); hooks.travel(s.key); } }, "Go")));
    maker.custom("atlas", [
      h("h2", {}, list.length ? `Shrines you've found (${list.length})` : "Shrines you've found"),
      list.length ? h("ul", { class: "cairns" }, rows) : h("p", {}, "None yet. Shrines are the columns of light; walk up to one and it goes in your atlas."),
      list.length ? h("div", { class: "row" }, h("button", { onclick: () => { maker.close(); hooks.globe(); } }, "Show on the globe")) : null,
      h("p", { class: "small" }, "Places you've been, to travel back to. Your atlas is kept on this device and, signed in, in your Bluesky repo, so it follows you."),
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
