// Your pouch: what you carry (inventory.js), from the BAG button in the top-right stack. DOM only; main.js supplies
// the inventory and what using a thing does.
import { h } from "./maker.js";
import { ITEMS, ITEM_KINDS, countOf } from "./inventory.js";

const USE = { moonseed: "Eat one" };

/** hooks: { inventory() -> { items, lunation }, use(kind), nextSeed() -> words for when the next moonseed falls }. */
export function buildBag({ maker, button, hooks }) {
  function open() {
    const inv = hooks.inventory(), have = ITEM_KINDS.filter((k) => countOf(inv, k) > 0);
    const rows = have.map((k) => {
      const it = ITEMS[k], n = countOf(inv, k);
      return h("li", {},
        h("span", { class: `icon item-${k}`, "aria-hidden": "true" }),
        h("span", { class: "what" }, `${n === 1 ? it.name : it.plural} × ${n}`),
        h("span", { class: "about" }, it.about),
        USE[k] ? h("button", { class: "go", onclick: () => { maker.close(); hooks.use(k); } }, USE[k]) : null);
    });
    maker.custom("bag", [
      h("h2", {}, "Your pouch"),
      have.length ? h("ul", { class: "items" }, rows) : h("p", {}, "Your pouch is empty."),
      h("p", { class: "small" }, `A moonseed falls for you at each new moon (the next ${hooks.nextSeed()}). What you carry is kept on this device and, signed in, in your Bluesky repo, so it follows you.`),
    ], { trigger: button, classes: ["bag"] });
  }
  button.addEventListener("click", () => (maker.open === "bag" ? maker.close() : open()));
  return {
    open,
    /** The button's words: how many things you carry. */
    refresh() {
      const inv = hooks.inventory(), n = ITEM_KINDS.reduce((t, k) => t + countOf(inv, k), 0);
      button.textContent = `BAG${n ? ` (${n})` : ""} ▾`;
      if (maker.open === "bag") open();
    },
  };
}
