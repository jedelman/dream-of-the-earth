// Your creature's editor: re-roll any part of it, choose how many heads or wings, turn its colours round the wheel,
// size it, and spend its twelve stat points. Each change shows at once on the creature itself (the camera turns to
// face it) and is kept on this device. DOM only: main.js supplies the creature through hooks.
//
// The design's three verbs: randomize (a whole new creature), mutate (a couple of parts re-rolled), edit (the rows).
import { h } from "./maker.js";
import { TRAITS, COUNTS, SIZE, parseGenes, generateCreature, TRIANGLE_CAP } from "./creature-graph.js";
import { STATS, BUDGET, MAX } from "./stats.js";
import { canRespec, respecWindow, whenText } from "./moon.js";

const ROWS = [
  { trait: "palette", label: "Colours" },
  { trait: "body", label: "Body" },
  { trait: "heads", label: "Heads" },
  { trait: "eyes", label: "Eyes" },
  { trait: "wings", label: "Wings", pairs: true },
  { trait: "legs", label: "Legs", pairs: true },
  { trait: "tail", label: "Tail" },
  { trait: "spikes", label: "Spikes" },
];
const BODY_WORDS = { ico: "round", octa: "gem", box: "block", cone4: "cone" };
const UNDO_MAX = 40;
// A player's choice, not the world: nothing here needs to come out the same on another phone.
const roll = () => (Math.random() * 2 ** 32) >>> 0;
const swatch = (c) => `hsl(${Math.round(c.h * 360)} ${Math.round(c.s * 100)}% ${Math.round(c.l * 100)}%)`;
const bar = (n) => "▮".repeat(n) + "▯".repeat(MAX - n);
const clone = (c) => ({ seed: c.seed, genes: c.genes ? JSON.parse(JSON.stringify(c.genes)) : null, stats: { ...c.stats } });

/**
 * hooks: { get() -> { seed, genes, stats }, set(next), name(seed) -> string, portrait(on), isMine() -> whether it's the one you keep }.
 * maker: the sheet's owner (one sheet at a time). button: the name button that opens it.
 */
export function buildEditor({ hooks, maker, button }) {
  const undo = [];
  let els = null, dragging = false;

  const change = (fn) => {
    const now = clone(hooks.get());
    undo.push(clone(now));
    if (undo.length > UNDO_MAX) undo.shift();
    const next = fn(now) || now;
    next.genes = parseGenes(next.genes);
    hooks.set(next);
    refresh();
  };
  const withGenes = (c, fn) => { const g = c.genes || {}; fn(g); c.genes = g; return c; };
  const reroll = (trait) => change((c) => withGenes(c, (g) => {
    // A new body should look new: round comes up twice in five, so roll again (a few times) for a different shape.
    const shape = (genes) => generateCreature(c.seed, genes).parts[0].prim, was = shape(c.genes);
    for (let i = 0; i < 6; i++) {
      g.roll = { ...g.roll, [trait]: roll() };
      if (trait !== "body" || shape(g) !== was) break;
    }
  }));
  const count = (trait, by) => change((c) => withGenes(c, (g) => {
    const [lo, hi] = COUNTS[trait], now = generateCreature(c.seed, c.genes).counts[trait];
    g.count = { ...g.count, [trait]: Math.max(lo, Math.min(hi, now + by)) };
  }));
  // Stats change only within a day of a new moon (Jason, 11-09: "respecs only during a new moon"); looks, any time.
  const moonNow = () => canRespec(Date.now() / 1000);
  const stat = (k, by) => !moonNow() ? refresh() : change((c) => {
    const left = BUDGET - STATS.reduce((t, s) => t + c.stats[s], 0);
    const n = c.stats[k] + by;
    if (n < 0 || n > MAX || (by > 0 && left <= 0)) return c;
    c.stats[k] = n;
    return c;
  });

  function build() {
    const name = h("h2", {});
    const info = h("p", { class: "small" });
    const rows = ROWS.map((r) => {
      const value = h("span", { class: "v" });
      const kids = [h("span", { class: "k" }, r.label)];
      if (COUNTS[r.trait]) {
        const less = h("button", { class: "step", "aria-label": `Fewer ${r.label.toLowerCase()}`, onclick: () => count(r.trait, -1) }, "−");
        const more = h("button", { class: "step", "aria-label": `More ${r.label.toLowerCase()}`, onclick: () => count(r.trait, 1) }, "+");
        kids.push(h("span", { class: "n" }, less, value, more));
        r.less = less; r.more = more;
      } else kids.push(h("span", { class: "n" }, value));
      kids.push(h("button", { class: "reroll", "aria-label": `Re-roll ${r.label.toLowerCase()}`, title: "Re-roll", onclick: () => reroll(r.trait) }, "↻"));
      r.value = value;
      return h("div", { class: "trait" }, ...kids);
    });
    // Colours turn round the wheel; size is a slider. One undo step per drag.
    const slider = (attrs, apply) => {
      const el = h("input", { type: "range", ...attrs });
      el.addEventListener("input", () => {
        const v = Number(el.value);
        if (!dragging) { dragging = true; undo.push(clone(hooks.get())); if (undo.length > UNDO_MAX) undo.shift(); }
        const c = clone(hooks.get());
        withGenes(c, (g) => apply(g, v));
        c.genes = parseGenes(c.genes);
        hooks.set(c);
        refresh(el);
      });
      el.addEventListener("change", () => { dragging = false; });
      return el;
    };
    const hue = slider({ min: "0", max: "359", "aria-label": "Turn the colours" }, (g, v) => { g.hue = v; });
    const size = slider({ min: String(SIZE[0]), max: String(SIZE[1]), "aria-label": "Size" }, (g, v) => { g.size = v; });
    const sizeV = h("span", { class: "v" });
    const statRows = STATS.map((k) => {
      const v = h("span", { class: "bar", "aria-hidden": "true" });
      const less = h("button", { class: "step", "aria-label": `Less ${k}`, onclick: () => stat(k, -1) }, "−");
      const more = h("button", { class: "step", "aria-label": `More ${k}`, onclick: () => stat(k, 1) }, "+");
      const row = h("div", { class: "stat" }, h("span", { class: "k" }, k.toUpperCase()), less, v, more);
      return { k, v, less, more, row };
    });
    const left = h("p", { class: "small left", role: "status" });
    const undoBtn = h("button", { onclick: () => { const prev = undo.pop(); if (prev) { hooks.set(prev); refresh(); } } }, "↶ Undo");
    const plain = h("button", { onclick: () => change((c) => { c.genes = null; return c; }) }, "Start over");
    const mutate = h("button", { class: "go", onclick: () => change((c) => withGenes(c, (g) => {
      // Two parts re-rolled, and now and then the colours turned.
      const pool = [...TRAITS];
      for (let i = 0; i < 2; i++) g.roll = { ...g.roll, [pool.splice(Math.floor(Math.random() * pool.length), 1)[0]]: roll() };
      if (Math.random() < 0.3) g.hue = ((g.hue || 0) + 40 + Math.floor(Math.random() * 280)) % 360 || 1;
    })) }, "Mutate");
    const surprise = h("button", { onclick: () => change((c) => ({ seed: roll(), genes: null, stats: c.stats })) }, "A whole new creature");
    // A creature from a link (?seed=…) isn't yours until you say so (or change it).
    const adopt = h("p", { class: "small adopt" }, "This creature came from a link; yours is kept for you. ",
      h("button", { onclick: () => change((c) => c) }, "Make this one mine"));
    els = { name, info, rows, hue, size, sizeV, statRows, left, undoBtn, plain, adopt };
    return [
      name, info, adopt,
      h("div", { class: "traits" }, rows[0], h("div", { class: "trait sub" }, h("span", { class: "k" }, ""), hue), ...rows.slice(1),
        h("div", { class: "trait" }, h("span", { class: "k" }, "Size"), size, sizeV)),
      h("div", { class: "stats" }, ...statRows.map((s) => s.row)), left,
      h("div", { class: "row" }, mutate, surprise),
      h("div", { class: "row" }, undoBtn, plain),
      h("p", { class: "small" }, "Your creature lives on this device and, when you're signed in, in your Bluesky repo, so it follows you to any device. When you're showing yourself, your mutuals see it as it is now."),
    ];
  }

  /** Show the creature as it is. busy: a slider being dragged (left alone so it doesn't jump under the finger). */
  function refresh(busy = null) {
    if (!els) return;
    const c = hooks.get(), g = c.genes || {}, graph = generateCreature(c.seed, c.genes);
    els.name.textContent = hooks.name(c.seed);
    els.info.textContent = `${graph.triangles} of ${TRIANGLE_CAP} triangles${c.genes ? "" : " · just as its seed made it"}`;
    for (const r of ROWS) {
      if (r.trait === "palette") {
        r.value.replaceChildren(...graph.palette.map((p) => h("span", { class: "swatch", style: `background:${swatch(p)}` })));
      } else if (r.trait === "body") {
        r.value.textContent = BODY_WORDS[graph.parts[0].prim] || graph.parts[0].prim;
      } else {
        const n = graph.counts[r.trait], [lo, hi] = COUNTS[r.trait];
        r.value.textContent = r.pairs ? `${n} pair${n === 1 ? "" : "s"}` : String(n);
        r.less.disabled = n <= lo;
        r.more.disabled = n >= hi;
      }
    }
    if (busy !== els.hue) els.hue.value = String(g.hue || 0);
    if (busy !== els.size) els.size.value = String(Math.round(graph.scale * 100));
    els.sizeV.textContent = `${graph.scale.toFixed(2)}×`;
    const spent = STATS.reduce((t, k) => t + c.stats[k], 0);
    const open = moonNow(), nowS = Date.now() / 1000, win = respecWindow(nowS);
    for (const s of els.statRows) {
      s.v.textContent = bar(c.stats[s.k]);
      s.row.setAttribute("aria-label", `${s.k} ${c.stats[s.k]} of ${MAX}`);
      s.less.disabled = !open || c.stats[s.k] <= 0;
      s.more.disabled = !open || c.stats[s.k] >= MAX || spent >= BUDGET;
    }
    const points = spent >= BUDGET ? `All ${BUDGET} points spent.` : `${BUDGET - spent} point${BUDGET - spent === 1 ? "" : "s"} left to spend.`;
    els.left.textContent = open
      ? `The moon is new: stats can change until ${whenText(win.closes, nowS) === "within hours" ? "later today" : whenText(win.closes, nowS)}. ${points}`
      : `Stats change only at the new moon, ${whenText(win.opens, nowS)}. ${points}`;
    els.adopt.hidden = hooks.isMine();
    els.undoBtn.disabled = !undo.length;
    els.plain.disabled = !c.genes;
  }

  function open() {
    const kids = build();
    maker.custom("creature", kids, { trigger: button, classes: ["creature"], onClose: () => { els = null; dragging = false; hooks.portrait(false); } });
    refresh();
    hooks.portrait(true);
  }
  button.addEventListener("click", () => (maker.open === "creature" ? maker.close() : open()));

  return {
    open,
    /** The button's words: your creature's name. */
    setName(name) { button.textContent = `${name.toUpperCase()} ▾`; },
    refresh,
  };
}
