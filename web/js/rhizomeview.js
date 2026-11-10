// Your rhizome, drawn (rhizome.js): a map of the slots and links you've grown toward, in the sheet from the RHIZOME button.
// Tap a slot to fill it with a gem of its colour (or, with a moonseed working, take its gem out); tap a link to see what
// it does. What's still in fog shows only as faint points, so you can see the rhizome is there, not what it holds.
// DOM only; main.js supplies the state and the moves.
import { h } from "./maker.js";
import { effectWords, POWERS, LOOKS, GEM_OF } from "./rhizome.js";
import { ITEMS } from "./inventory.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k);
  return el;
};
export const HUE = { rose: "#ff7ad9", cyan: "#7af0ff", gold: "#ffd34d" };
const GLYPH = { power: "★", ceiling: "▲", boost: "+", deeper: "◆", look: "✿", grow: "✚" };

/** A summary of what your woken links give, in words. */
export function effectsWords(fx) {
  const out = [];
  for (const p of fx.powers) out.push(POWERS[p].name);
  for (const [k, n] of Object.entries(fx.boosts)) out.push(`+${n} ${k}`);
  for (const [k, n] of Object.entries(fx.ceilings)) out.push(`${k} up to ${6 + n}`);
  for (const c of fx.deeper) out.push(`deeper ${c} dreams`);
  for (const l of fx.looks) out.push(LOOKS[l]);
  return out;
}

/**
 * hooks: { rhizome() -> R, filled() -> { slot: gem }, view() -> viewOf(...), effects() -> effectsOf(...), gems() -> { gem: n },
 * slot(i) -> words or null (null: done), unslot(i) -> words or null, canUnslot(i), respecOpen() }.
 */
export function buildRhizomeView({ maker, button, hooks }) {
  let sel = null; // { slot: i } or { link: i }
  function open() {
    const R = hooks.rhizome(), filled = hooks.filled(), v = hooks.view(), fx = hooks.effects(), gems = hooks.gems(), respec = hooks.respecOpen();
    // Framed on what you've grown toward (with some fog round it), so the map grows as you do.
    const vis = [...v.visible].map((i) => R.slots[i]);
    const xs = vis.map((q) => q.x), ys = vis.map((q) => q.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.min(3.1, Math.max(0.8, Math.max(...xs) - Math.min(...xs) + 0.45, Math.max(...ys) - Math.min(...ys) + 0.45));
    const map = svg("svg", { viewBox: `${cx - span / 2} ${cy - span / 2} ${span} ${span}`, class: "rhizome-map", role: "img", "aria-label": "Your rhizome" });
    // Fog: the base slots you can't see yet, as faint points.
    for (const s of R.slots) if (s.sprout === -1 && !v.visible.has(s.i)) map.append(svg("circle", { cx: s.x, cy: s.y, r: 0.012, class: "fog" }));
    // Slots and links can be reached and pressed without a pointer (11-10: Jason, "can't slot crystals in the rhizome
    // with a controller"): each takes focus (Tab, or a controller's D-pad), and Enter or Space presses it.
    const pressable = (key, label, fn) => ({ tabindex: "0", role: "button", "aria-label": label, "data-pad": key, onclick: fn, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); fn(); } } });
    for (const i of v.links) {
      const l = R.links[i], A = R.slots[l.a], B = R.slots[l.b], woken = v.woken.has(i);
      const col = A.colour === B.colour ? HUE[A.colour] : "#e9e5ff";
      map.append(svg("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: woken ? "link woken" : "link", style: woken ? `stroke:${col}` : null }));
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      map.append(svg("g", { class: `glyph ${woken ? "woken" : ""} ${sel?.link === i ? "sel" : ""}`, ...pressable(`link-${i}`, `Link: ${effectWords(l.effect)}${woken ? " (woken)" : ""}`, () => { sel = { link: i }; open(); }) },
        svg("circle", { cx: mx, cy: my, r: 0.045 }),
        svg("text", { x: mx, y: my + 0.022, "text-anchor": "middle" }, GLYPH[l.effect.kind])));
    }
    for (const i of v.visible) {
      const s = R.slots[i], gem = filled[i];
      map.append(svg("circle", {
        cx: s.x, cy: s.y, r: 0.058,
        class: `slot ${gem ? "full" : ""} ${v.fillable.has(i) ? "can" : ""} ${sel?.slot === i ? "sel" : ""} ${s.start ? "start" : ""}`,
        style: gem ? `fill:${HUE[s.colour]}` : `stroke:${HUE[s.colour]}`,
        ...pressable(`slot-${i}`, `${s.colour} slot${gem ? `, holding a ${ITEMS[gem].name}` : v.fillable.has(i) ? ", a gem can go here" : ""}${s.start ? ", where you begin" : ""}`, () => { sel = { slot: i }; open(); }),
      }));
    }
    // What's selected, and what you can do with it.
    const info = h("div", { class: "info" });
    // After an action the map redraws; a controller's focus goes back to the slot or link it was about.
    const back = sel?.slot != null ? `slot-${sel.slot}` : sel?.link != null ? `link-${sel.link}` : null;
    const act = (label, fn, cls = "go") => h("button", { class: cls, "data-pad": back, onclick: () => { const why = fn(); if (why) msg.textContent = why; else open(); } }, label);
    const msg = h("p", { class: "msg", role: "status" });
    if (sel?.slot !== undefined && R.slots[sel.slot] && v.visible.has(sel.slot)) {
      const s = R.slots[sel.slot], gem = GEM_OF[s.colour], have = gems[gem] ?? 0;
      const touching = v.links.map((i) => R.links[i]).filter((l) => l.a === s.i || l.b === s.i);
      info.append(h("p", {}, `A ${s.colour} slot${s.start ? ", where you begin" : ""}${filled[s.i] ? `, holding a ${ITEMS[filled[s.i]].name}` : ""}.`));
      if (touching.length) info.append(h("ul", {}, touching.map((l) => h("li", { class: v.woken.has(l.i) ? "woken" : "" }, `${GLYPH[l.effect.kind]} ${effectWords(l.effect)}${v.woken.has(l.i) ? " (woken)" : ""}`))));
      if (!filled[s.i] && v.fillable.has(s.i)) info.append(have > 0 ? act(`Set a ${ITEMS[gem].name} here (${have})`, () => hooks.slot(s.i)) : h("p", { class: "small" }, `No ${ITEMS[gem].plural}: they come from the dreams behind ${s.colour === "rose" ? "pink" : s.colour} shrines.`));
      if (filled[s.i]) info.append(respec ? (hooks.canUnslot(s.i) ? act("Take the gem out", () => hooks.unslot(s.i), "") : h("p", { class: "small" }, "Others hang from this one: take theirs out first.")) : h("p", { class: "small" }, "Gems move only with a moonseed working (eat one from the BAG)."));
    } else if (sel?.link !== undefined && R.links[sel.link]) {
      const l = R.links[sel.link];
      info.append(h("p", {}, `${GLYPH[l.effect.kind]} ${effectWords(l.effect)}${l.effect.kind === "power" ? `: ${POWERS[l.effect.power].about}` : ""}`),
        h("p", { class: "small" }, v.woken.has(l.i) ? "Woken." : "Fill both its ends to wake it."));
    } else {
      info.append(h("p", { class: "small" }, "Tap a slot or a link. You begin at the three slots in the middle; each gem you set shows the slots it links to."));
    }
    const words = effectsWords(fx);
    maker.custom("rhizome", [
      h("h2", {}, "Your rhizome"),
      h("p", { class: "gems" }, ["rose", "cyan", "gold"].map((c) => h("span", { class: "gem", style: `color:${HUE[c]}` }, `◆ ${gems[GEM_OF[c]] ?? 0} ${c}`))),
      map, info, msg,
      h("p", { class: "woke" }, words.length ? `Woken: ${words.join(" · ")}.` : "Nothing woken yet: fill both ends of a link."),
      h("p", { class: "small" }, "Gems come from dreams, behind awake shrines. Your rhizome is grown from your own seed: no one else's is the same."),
    ], { trigger: button, classes: ["rhizome"], onClose: () => { sel = null; } });
  }
  button.addEventListener("click", () => (maker.open === "rhizome" ? maker.close() : open()));
  return { open, refresh() { if (maker.open === "rhizome") open(); } };
}
