// The Bluesky button and its sheets: sign in (or just look, by handle), leave a
// cairn, tend one of yours. DOM only: main.js supplies the world through hooks.
import { NOTE_MAX, distanceText } from "./artifacts.js";

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k);
  return el;
};

/**
 * hooks: { look(handle), signIn(handle), signOut(), stopLooking(), preview(spec | null), leave({ seed, hue, note }),
 *          renew(entry), takeDown(entry), cairns() -> [{ a, metres, age }] nearest first, travel(a), globe(),
 *          flock() -> [{ did, handle, metres, doing }] nearest first, travelToMutual(did), toggleShare() }.
 *          Each may return a promise; errors are shown in the sheet.
 */
export function buildMaker(hooks) {
  const button = document.getElementById("me"), sheet = document.getElementById("sheet"), list = document.getElementById("cairns");
  let person = { did: null, handle: null, signedIn: false }, open = null, sharing = { on: true, can: false }, counts = [0, 0];
  let custom = null; // another module's sheet in the same place: { trigger, onClose }

  const endCustom = () => {
    if (!custom) return;
    const c = custom;
    custom = null;
    c.trigger?.setAttribute("aria-expanded", "false");
    sheet.classList.remove(...c.classes);
    c.onClose?.();
  };
  const close = () => {
    if (open === "leave" || open === "tend") hooks.preview(null); // the camera comes back to you
    open = null;
    endCustom();
    sheet.hidden = true;
    sheet.replaceChildren();
    button.setAttribute("aria-expanded", "false");
    list.setAttribute("aria-expanded", "false");
  };
  const show = (name, ...kids) => {
    if (open === "leave" && name !== "leave") hooks.preview(null);
    if (custom && name !== open) endCustom();
    open = name;
    sheet.replaceChildren(h("button", { class: "x", "aria-label": "Close", onclick: close }, "×"), ...kids);
    sheet.hidden = false;
    button.setAttribute("aria-expanded", "true");
    sheet.querySelector("input, textarea, .go")?.focus();
  };
  const busy = async (btn, msgEl, job) => {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "…";
    msgEl.textContent = "";
    try { await job(); } catch (e) { msgEl.textContent = e.message || String(e); btn.disabled = false; btn.textContent = label; }
  };

  function signInSheet(prefill = "") {
    const input = h("input", { type: "text", placeholder: "you.bsky.social", autocomplete: "username", autocapitalize: "off", spellcheck: "false", value: prefill, "aria-label": "Your Bluesky handle" });
    const msg = h("p", { class: "msg", role: "status" });
    const go = h("button", { class: "go", type: "submit" }, "Sign in");
    const look = h("button", { type: "button", onclick: () => busy(look, msg, () => hooks.look(input.value)) }, "Just look");
    show("signin",
      h("h2", {}, "Your mutuals' cairns"),
      h("p", {}, "See what your Bluesky mutuals left in the dream, and leave cairns of your own."),
      h("form", { onsubmit: (e) => { e.preventDefault(); busy(go, msg, () => hooks.signIn(input.value)); } }, input, h("div", { class: "row" }, go, look)),
      msg,
      h("p", { class: "small" }, "Signing in lets the game write two kinds of record to your Bluesky repo: the cairns you leave, and your creature's current plan (one record, overwritten, so your mutuals can see you fly; you can turn it off). It also reads your mute list, so muted accounts stay out of your world. Records are public on the network; the game only shows mutuals'. Just look only reads."));
  }
  function menuSheet() {
    const msg = h("p", { class: "msg", role: "status" });
    if (person.signedIn) {
      show("menu",
        h("h2", {}, person.handle ? `@${person.handle}` : "Signed in"),
        h("div", { class: "col" },
          h("button", { class: "go", onclick: leaveSheet }, "Leave a cairn here"),
          sharing.can
            ? h("button", { onclick: async () => { await hooks.toggleShare(); menuSheet(); } }, sharing.on ? "Showing you to mutuals: turn off" : "Hidden from mutuals: show me")
            : h("button", { onclick: () => signInSheet(person.handle || "") }, "Sign in again to show yourself to mutuals"),
          h("button", { onclick: (e) => busy(e.currentTarget, msg, async () => { await hooks.signOut(); close(); }) }, "Sign out")),
        msg);
    } else {
      show("menu",
        h("h2", {}, person.handle ? `Looking as @${person.handle}` : "Looking"),
        h("div", { class: "col" },
          h("button", { class: "go", onclick: () => signInSheet(person.handle || "") }, "Sign in to leave cairns"),
          h("button", { onclick: async () => { await hooks.stopLooking(); close(); } }, "Stop looking")),
        msg);
    }
  }
  function leaveSheet() {
    let seed = (Math.random() * 2 ** 32) >>> 0, hue = (seed >>> 8) % 360; // a fresh cairn each time: this is a player's choice, not the world
    const note = h("textarea", { maxlength: String(NOTE_MAX), rows: "3", placeholder: "Something for whoever finds it (optional)", "aria-label": "Note" });
    const count = h("span", { class: "count" }, `0/${NOTE_MAX}`);
    note.addEventListener("input", () => { count.textContent = `${Array.from(note.value).length}/${NOTE_MAX}`; });
    const hueIn = h("input", { type: "range", min: "0", max: "359", value: String(hue), "aria-label": "Crystal colour" });
    const swatch = h("span", { class: "swatch" });
    const paint = () => { swatch.style.background = `hsl(${hue} 85% 62%)`; hooks.preview({ seed, hue }); };
    hueIn.addEventListener("input", () => { hue = Number(hueIn.value); paint(); });
    const msg = h("p", { class: "msg", role: "status" });
    const go = h("button", { class: "go" }, "Leave it");
    go.addEventListener("click", () => busy(go, msg, async () => { await hooks.leave({ seed, hue, note: note.value }); close(); }));
    show("leave",
      h("h2", {}, "Leave a cairn"),
      h("div", { class: "row" },
        h("button", { onclick: () => { seed = (Math.random() * 2 ** 32) >>> 0; paint(); } }, "↻ Another shape"),
        swatch, hueIn),
      h("label", {}, note, count),
      h("p", { class: "small" }, "It stands for one moon, here. Your mutuals will find it; anyone can read it on the network."),
      h("div", { class: "row" }, go, h("button", { onclick: close }, "Cancel")),
      msg);
    paint();
  }

  function listSheet() {
    const here = hooks.flock();
    const hereItems = here.map((m) => h("li", {},
      h("span", { class: "swatch", style: "background:#9ef0ff" }),
      h("span", { class: "who" }, m.handle ? `@${m.handle}` : "a mutual"),
      h("span", { class: "where" }, `${distanceText(m.metres)} · ${m.doing}`),
      h("button", { class: "go", "aria-label": `Travel to ${m.handle ? "@" + m.handle : "them"}`, onclick: () => { close(); hooks.travelToMutual(m.did); } }, "Go")));
    const rows = hooks.cairns();
    const items = rows.map(({ a, metres, age }) => h("li", {},
      h("span", { class: "swatch", style: `background:hsl(${a.hue} 85% 62%)` }),
      h("span", { class: "who" }, a.own ? "yours" : a.handle ? `@${a.handle}` : "someone"),
      h("span", { class: "where" }, `${distanceText(metres)} · ${age}`),
      a.note ? h("span", { class: "what" }, `\u201c${a.note}\u201d`) : null,
      h("button", { class: "go", "aria-label": `Travel to ${a.own ? "your" : a.handle ? "@" + a.handle + "'s" : "the"} cairn`, onclick: () => { close(); hooks.travel(a); } }, "Go")));
    show("list",
      here.length ? h("h2", {}, `In the dream now (${here.length})`) : null,
      here.length ? h("ul", { class: "cairns" }, hereItems) : null,
      h("h2", {}, rows.length ? `Cairns to visit (${rows.length})` : "Cairns to visit"),
      rows.length ? h("ul", { class: "cairns" }, items) : h("p", {}, person.signedIn ? "None of your mutuals has left a cairn yet. Leave the first: Bluesky \u25be, then Leave a cairn here." : "None of your mutuals has left a cairn yet."),
      h("div", { class: "row" },
        h("button", { class: "go", onclick: () => (person.signedIn ? leaveSheet() : signInSheet(person.handle || "")) }, person.signedIn ? "Leave one here" : "Sign in to leave one"),
        h("button", { onclick: () => { close(); hooks.globe(); } }, "Show on the globe")),
      h("p", { class: "small" }, "Your mutuals' cairns, anywhere in the dream, nearest first. On the globe, tap a dot to go there."));
    list.setAttribute("aria-expanded", "true");
  }
  list.addEventListener("click", () => (open === "list" ? close() : listSheet()));

  button.addEventListener("click", () => {
    if (open) return close();
    if (!person.did) signInSheet();
    else menuSheet();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && open) close(); });

  return {
    /** Who's looking: { did, handle, signedIn }. */
    setPerson(p) {
      person = p;
      button.textContent = p.did ? `@${p.handle || "…"}${p.signedIn ? "" : " (LOOKING)"} ▾` : "BLUESKY ▾";
      button.classList.toggle("on", !!p.did);
      list.hidden = !p.did;
      if (open === "menu") menuSheet();
    },
    /** How many cairns there are to visit, and mutuals in the dream (the button); refreshes the list if it's open. */
    setCount(n, here = 0) {
      if (n === counts[0] && here === counts[1]) return;
      counts = [n, here];
      list.textContent = `CAIRNS${n ? ` (${n})` : ""}${here ? ` \u00b7 ${here} HERE` : ""} \u25be`;
      if (open === "list") listSheet();
    },
    /** Whether your creature is shown to mutuals: { on, can } (can: this sign-in covers it). */
    setSharing(s) {
      sharing = s;
      if (open === "menu") menuSheet();
    },
    openLeave: () => (person.signedIn ? leaveSheet() : signInSheet(person.handle || "")),
    /** Your own cairn: renew it or take it down. info: { note, age, left } in words. */
    openTend(entry, info) {
      const msg = h("p", { class: "msg", role: "status" });
      const renew = h("button", { class: "go" }, "Renew for another moon");
      renew.addEventListener("click", () => busy(renew, msg, async () => { await hooks.renew(entry); close(); }));
      const down = h("button", {}, "Take it down");
      down.addEventListener("click", () => busy(down, msg, async () => { await hooks.takeDown(entry); close(); }));
      show("tend",
        h("h2", {}, "Your cairn"),
        info.note ? h("p", { class: "quote" }, `“${info.note}”`) : null,
        h("p", { class: "small" }, `Left ${info.age}. ${info.left}`),
        person.signedIn ? h("div", { class: "row" }, renew, down) : h("div", { class: "row" }, h("button", { class: "go", onclick: () => signInSheet(person.handle || "") }, "Sign in to tend it")),
        msg);
    },
    close,
    get open() { return open; },
    /** Another module's sheet in the same place (one sheet at a time). trigger: its button; onClose: when it goes. */
    custom(name, kids, { trigger = null, onClose = null, classes = [] } = {}) {
      show(name, ...kids);
      button.setAttribute("aria-expanded", "false");
      custom = { trigger, onClose, classes };
      trigger?.setAttribute("aria-expanded", "true");
      sheet.classList.add(...classes);
    },
  };
}
