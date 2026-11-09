// Your pouch: what you carry (inventory.js), from the BAG button in the top-right stack, and what you wear: two things
// at once, put on and taken off here. DOM only; main.js supplies the inventory and what using a thing does.
import { h } from "./maker.js";
import { ITEMS, ITEM_KINDS, WORN_MAX, countOf, wornOf } from "./inventory.js";

const USE = { moonseed: "Eat one" };

/**
 * hooks: { inventory() -> { items, worn, lunation }, use(kind), nextSeed() -> words for when the next moonseed falls,
 * wear(kind), takeOff(kind), whyNot() -> why you can't change what you wear just now, or null }.
 */
export function buildBag({ maker, button, hooks }) {
  function open() {
    const inv = hooks.inventory(), have = ITEM_KINDS.filter((k) => countOf(inv, k) > 0), worn = wornOf(inv);
    const why = hooks.whyNot(), full = worn.length >= WORN_MAX;
    const act = (fn) => () => { if (fn()) open(); };
    const rows = have.map((k) => {
      const it = ITEMS[k], n = countOf(inv, k), on = worn.includes(k);
      let button = null;
      if (USE[k]) button = h("button", { class: "go", onclick: () => { maker.close(); hooks.use(k); } }, USE[k]);
      else if (it.wear && on) button = h("button", { class: "go", disabled: !!why, title: why || "", onclick: act(() => hooks.takeOff(k)) }, "Take off");
      else if (it.wear) button = h("button", { class: "go", disabled: !!why || full, title: why || (full ? `You can wear ${WORN_MAX} things at once` : ""), onclick: act(() => hooks.wear(k)) }, "Wear");
      return h("li", { class: on ? "worn" : "" },
        h("span", { class: `icon item-${k}`, "aria-hidden": "true" }),
        h("span", { class: "what" }, `${n === 1 ? it.name : it.plural} × ${n}${on ? " · worn" : ""}`),
        h("span", { class: "about" }, it.about),
        button);
    });
    const wornWords = worn.length ? worn.map((k) => `the ${ITEMS[k].name}`).join(" and ") : "nothing";
    maker.custom("bag", [
      h("h2", {}, "Your pouch"),
      h("p", { class: "wearing" }, `Wearing ${wornWords} (${worn.length} of ${WORN_MAX}).${why ? ` ${why}` : ""}`),
      have.length ? h("ul", { class: "items" }, rows) : h("p", {}, "Your pouch is empty."),
      h("p", { class: "small" }, `You can wear ${WORN_MAX} things at once, and change them on the ground or in the water. A moonseed falls for you at each new moon (the next ${hooks.nextSeed()}). What you carry is kept on this device and, signed in, in your Bluesky repo, so it follows you.`),
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
