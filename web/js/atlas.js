// Your atlas, as a map (Jason, 11-10: "For the atlas, let's offer it as a map only - but anything not visited is
// fogged/clouded over"). The Earth coloured by its climate, as the land is, under cloud everywhere you haven't been:
// within about 45 km of where you've stood (fog.js), and of the places you've found, it's clear. The places you can
// travel back to (shrines found, ley nodes and landmarks you've been to) are marked: tap one, then Go. Tap anywhere
// clear to hear what's there (the river basin, if you know it). Drag or a stick moves it; the wheel, a pinch, + and −,
// or LB · RB zoom. Before 11-10 it was a list (the landmarks you hadn't found were listed too; now they're under cloud).
// DOM only; main.js supplies the places and the travel.
import { h } from "./maker.js";
import { distanceText } from "./artifacts.js";
import { SEEN_W, SEEN_H, CLEAR_R, cellOf, cellMiddle, cleared, clampView, project, unproject, zoomAbout, panBy } from "./fog.js";

const BEYOND = "#0b0718", NEAR_START = 10; // past the poles; how many degrees across the map opens on, round you

// The land, drawn once (a cell a pixel) when its colours are ready, and kept.
let base = null, basePx = null, building = null;
function buildBase(hooks) {
  if (!building) building = hooks.landReady().then(() => {
    const c = document.createElement("canvas");
    c.width = SEEN_W; c.height = SEEN_H;
    const ctx = c.getContext("2d"), img = ctx.createImageData(SEEN_W, SEEN_H), px = img.data;
    for (let id = 0; id < SEEN_W * SEEN_H; id++) {
      const m = cellMiddle(id), col = hooks.landColour(m.lat, m.lon);
      const v = col == null ? 0x1a2350 : col;
      px[id * 4] = v >> 16; px[id * 4 + 1] = (v >> 8) & 255; px[id * 4 + 2] = v & 255; px[id * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    base = c; basePx = px;
  });
  return building;
}

// The clouds, a cell a pixel: soft lumps of lavender-white, with the seen cells (and the places) cut out.
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function lumpy(x, y, s) { // value noise, wrapping east to west
  const X = x / s, Y = y / s, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, wrap = Math.round(SEEN_W / s);
  const at = (i, j) => hash(((i % wrap) + wrap) % wrap, j);
  const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1), u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
let cloudTone = null;
function buildFog(seen, spots) {
  if (!cloudTone) { cloudTone = new Float32Array(SEEN_W * SEEN_H); for (let y = 0; y < SEEN_H; y++) for (let x = 0; x < SEEN_W; x++) cloudTone[y * SEEN_W + x] = 0.65 * lumpy(x, y, 48) + 0.35 * lumpy(x, y, 12); }
  const c = document.createElement("canvas");
  c.width = SEEN_W; c.height = SEEN_H;
  const ctx = c.getContext("2d"), img = ctx.createImageData(SEEN_W, SEEN_H), px = img.data;
  for (let k = 0; k < SEEN_W * SEEN_H; k++) {
    const t = cloudTone[k], g = 204 + Math.round(t * 40);
    px[k * 4] = g - 8; px[k * 4 + 1] = g - 12; px[k * 4 + 2] = Math.min(255, g + 14); px[k * 4 + 3] = 236 + Math.round(t * 19);
  }
  const R = Math.ceil(CLEAR_R + 1), clear = (row, col, fr, fc) => {
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const r = row + dr; if (r < 0 || r >= SEEN_H) continue;
      const d = Math.hypot(r + 0.5 - fr, col + dc + 0.5 - fc);
      if (d > CLEAR_R + 0.9) continue;
      const k = (r * SEEN_W + (((col + dc) % SEEN_W) + SEEN_W) % SEEN_W) * 4;
      px[k + 3] = d <= CLEAR_R ? 0 : Math.min(px[k + 3], 120); // a thin rim of mist at the edge
    }
  };
  for (const id of seen) { const row = Math.floor(id / SEEN_W), col = id % SEEN_W; clear(row, col, row + 0.5, col + 0.5); }
  for (const s of spots) { const id = cellOf(s.lat, s.lon), row = Math.floor(id / SEEN_W), col = id % SEEN_W; clear(row, col, (90 - s.lat) / 0.25, (s.lon + 180) / 0.25); }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * hooks: { places() -> [{ key, kind ("shrine" | "node" | "mark" | "way" | "spring"), name, lat, lon, colour (css), note, song? }],
 * rivers() -> [[{ lat, lon }]] (rivers whose springs you've drunk from, drawn shining), here() -> { lat, lon },
 * seen() -> Set of cells, tally() -> string, spotWords(lat, lon) -> Promise<string> (what's at a clear spot), landReady()
 * -> Promise, landColour(lat, lon) -> 0xrrggbb | null (sea), travel(key), globe() }.
 */
export function buildAtlas({ maker, button, hooks }) {
  let view = null, ui = null;

  function open() {
    const canvas = h("canvas", { "aria-hidden": "true" });
    const marks = h("div", { class: "marks" }), you = h("div", { class: "you", title: "You" });
    const caption = h("div", { class: "caption", "aria-live": "polite" }, "Loading the map…");
    const zb = (label, text, fn) => h("button", { class: "zoombtn", "aria-label": label, title: label, "data-pad": `atlas-${label}`, onclick: fn }, text);
    const map = h("div", { class: "map", tabindex: "0", "data-nopad": "", role: "application", "aria-label": "Map of where you've been. Arrow keys move it, plus and minus zoom." }, canvas, marks, you,
      h("div", { class: "zoom" }, zb("Nearer", "+", () => zoom(1.6)), zb("Farther", "−", () => zoom(1 / 1.6)), zb("Back to you", "◎", () => centre(true)), zb("The whole Earth", "◯", () => whole())));
    maker.custom("atlas", [
      h("h2", {}, "Your atlas"),
      map,
      caption,
      h("p", { class: "small tally" }, hooks.tally()),
      h("div", { class: "row" }, h("button", { onclick: () => { maker.close(); hooks.globe(); } }, "Show on the globe")),
      h("p", { class: "small" }, "Where you've been is clear; the rest is cloud. Tap a place to go back to it; tap anywhere clear to see what's there. Your atlas is kept on this device and, signed in, in your Bluesky repo, so it follows you."),
    ], { trigger: button, classes: ["atlas"], onClose: () => { ui = null; } });
    ui = { canvas, marks, you, caption, map, fog: null, selected: null, places: hooks.places() };
    hookPointer(map);
    map.addEventListener("keydown", (e) => {
      const step = 60, k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (k) { e.preventDefault(); pan(k[0], k[1]); } else if (e.key === "+" || e.key === "=") zoom(1.6); else if (e.key === "-" || e.key === "_") zoom(1 / 1.6);
    });
    requestAnimationFrame(() => {
      if (!ui) return;
      const { w, hgt } = size();
      view = clampView(view ? { ...hooks.here(), ppd: view.ppd } : { ...hooks.here(), ppd: w / NEAR_START }, w, hgt);
      ui.fog = buildFog(hooks.seen(), [...ui.places, hooks.here()]);
      draw();
      buildBase(hooks).then(() => { if (ui) { ui.caption.textContent = "Tap a place to go back to it."; draw(); } });
    });
  }

  const size = () => { const r = ui.map.getBoundingClientRect(); return { w: Math.max(1, Math.round(r.width)), hgt: Math.max(1, Math.round(r.height)) }; };
  function draw() {
    if (!ui || !view) return;
    const { w, hgt } = size(), dpr = Math.min(2, window.devicePixelRatio || 1), c = ui.canvas;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BEYOND; ctx.fillRect(0, 0, w, hgt);
    // The Earth's picture, and its copies east and west, each clipped to what shows.
    const layer = (img) => {
      if (!img) return;
      const top = hgt / 2 - (90 - view.lat) * view.ppd, cw = view.ppd * 0.25;
      for (let k = -1; k <= 1; k++) {
        const left = w / 2 + (-180 - view.lon + 360 * k) * view.ppd;
        const sx0 = Math.max(0, Math.floor(-left / cw)), sx1 = Math.min(SEEN_W, Math.ceil((w - left) / cw));
        const sy0 = Math.max(0, Math.floor(-top / cw)), sy1 = Math.min(SEEN_H, Math.ceil((hgt - top) / cw));
        if (sx1 <= sx0 || sy1 <= sy0) continue;
        const x0 = Math.floor(left + sx0 * cw), y0 = Math.floor(top + sy0 * cw); // whole pixels, a pixel over: no seams
        ctx.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, x0, y0, Math.ceil(left + sx1 * cw) - x0 + 1, Math.ceil(top + sy1 * cw) - y0);
      }
    };
    layer(base);
    layer(ui.fog);
    // The rivers whose springs you've drunk from, shining from source to sea (each copy east or west that shows).
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const path of hooks.rivers()) {
      for (const [width, colour] of [[4, "rgba(127, 255, 224, .25)"], [1.6, "#9ff7ff"]]) {
        ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = colour;
        let last = null;
        for (const pt of path) {
          const q = project(pt.lat, pt.lon, view, w, hgt);
          if (last && Math.abs(q.x - last.x) > w / 2) ctx.moveTo(q.x, q.y); else if (last) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
          last = q;
        }
        ctx.stroke();
      }
    }
    // Far out, a cleared patch is smaller than a pixel: show each seen cell as a speck of its land, so you can see where
    // you've been on the whole Earth.
    const cw = view.ppd * 0.25;
    if (cw < 2.5 && base) {
      const d = 3, px = basePx;
      for (const id of hooks.seen()) {
        const m = cellMiddle(id), q = project(m.lat, m.lon, view, w, hgt);
        if (q.x < -d || q.x > w + d || q.y < -d || q.y > hgt + d) continue;
        ctx.fillStyle = `rgb(${px[id * 4]},${px[id * 4 + 1]},${px[id * 4 + 2]})`;
        ctx.fillRect(Math.round(q.x - d / 2), Math.round(q.y - d / 2), d, d);
      }
    }
    placeMarks(w, hgt);
  }
  function placeMarks(w, hgt) {
    const here = hooks.here(), p = project(here.lat, here.lon, view, w, hgt);
    Object.assign(ui.you.style, { left: `${p.x}px`, top: `${p.y}px` });
    if (!ui.marks.childElementCount) {
      for (const pl of ui.places) {
        const b = h("button", { class: `mark ${pl.kind}`, "aria-label": `${pl.name}${pl.note ? `, ${pl.note}` : ""}`, title: pl.name, "data-pad": `atlas-${pl.key}`, onclick: (e) => { e.stopPropagation(); select(pl); } });
        if (pl.colour) b.style.background = pl.colour;
        b._place = pl;
        ui.marks.append(b);
      }
    }
    for (const b of ui.marks.children) {
      const q = project(b._place.lat, b._place.lon, view, w, hgt), show = q.x > -6 && q.x < w + 6 && q.y > -6 && q.y < hgt + 6;
      b.hidden = !show;
      if (show) Object.assign(b.style, { left: `${q.x}px`, top: `${q.y}px` });
      b.classList.toggle("on", ui.selected === b._place);
    }
  }
  function select(pl) {
    ui.selected = pl;
    const here = hooks.here(), km = distanceText(metres(here, pl));
    const go = h("button", { class: "go", "data-pad": "atlas-go", onclick: () => { maker.close(); hooks.travel(pl.key); } }, "Go");
    const song = pl.song ? h("button", { class: "song", "data-pad": "atlas-song", title: "Its spring stone's song", "aria-label": "Hear its spring stone's song", onclick: () => pl.song() }, "♪") : null;
    ui.caption.replaceChildren(go, song ?? "", h("span", { class: "who" }, pl.name), h("span", { class: "where" }, ` · ${km}${pl.note ? ` · ${pl.note}` : ""}`));
    draw();
    go.focus({ preventScroll: true }); // so A, then A again, goes there (and Enter, from the keyboard)
  }
  function tapAt(x, y) {
    const { w, hgt } = size(), at = unproject(x, y, view, w, hgt);
    ui.selected = null;
    draw();
    if (!cleared(at.lat, at.lon, hooks.seen(), [...ui.places, hooks.here()])) { ui.caption.textContent = "Cloud. You haven't been here yet."; return; }
    ui.caption.textContent = "…";
    const asked = ui;
    hooks.spotWords(at.lat, at.lon).then((words) => { if (ui === asked && !ui.selected) ui.caption.textContent = words; });
  }
  const metres = (a, b) => { const r = Math.PI / 180, s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(s))); };
  function zoom(f, x, y) { const { w, hgt } = size(); view = zoomAbout(view, f, x ?? w / 2, y ?? hgt / 2, w, hgt); draw(); }
  function pan(dx, dy) { const { w, hgt } = size(); view = panBy(view, dx, dy, w, hgt); draw(); }
  function centre(near) { const { w, hgt } = size(); view = clampView({ ...hooks.here(), ppd: near ? Math.max(view.ppd, w / NEAR_START) : view.ppd }, w, hgt); draw(); }
  function whole() { const { w, hgt } = size(); view = clampView({ lat: 0, lon: view.lon, ppd: 0 }, w, hgt); draw(); }

  // Drag to move, pinch or the wheel to zoom, a tap (no drag) to ask what's there.
  function hookPointer(el) {
    const down = new Map();
    let moved = 0, pinch = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      el.setPointerCapture(e.pointerId);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 1) moved = 0;
      if (down.size === 2) { const [a, b] = [...down.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    el.addEventListener("pointermove", (e) => {
      const was = down.get(e.pointerId);
      if (!was) return;
      const now = { x: e.clientX, y: e.clientY };
      down.set(e.pointerId, now);
      if (down.size === 1) { moved += Math.hypot(now.x - was.x, now.y - was.y); pan(now.x - was.x, now.y - was.y); }
      else if (down.size === 2) {
        const [a, b] = [...down.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = el.getBoundingClientRect();
        if (pinch > 0) zoom(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pinch = d; moved = 99;
      }
    });
    const up = (e) => {
      if (!down.has(e.pointerId)) return;
      down.delete(e.pointerId);
      if (!down.size && moved < 6 && e.type === "pointerup") { const r = el.getBoundingClientRect(); tapAt(e.clientX - r.left, e.clientY - r.top); }
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }

  button.addEventListener("click", () => (maker.open === "atlas" ? maker.close() : open()));
  addEventListener("resize", () => { if (ui) draw(); });
  return {
    open,
    refresh(n) {
      button.textContent = `ATLAS${n ? ` (${n})` : ""} ▾`;
      if (!ui) return;
      ui.places = hooks.places(); ui.marks.replaceChildren();
      ui.fog = buildFog(hooks.seen(), [...ui.places, hooks.here()]);
      draw();
    },
    /** A controller in the open atlas: the stick moves the map, LB · RB (or the right stick) zoom. */
    pad(turn, thrust, zoomBy, dt) {
      if (!ui || !view) return;
      if (turn || thrust) pan(-turn * 420 * dt, thrust * 420 * dt);
      if (zoomBy) zoom(Math.exp(-zoomBy * 2.2 * dt));
    },
    /** For tests: what the map shows. */
    state: () => ui && view && { view: { ...view }, marks: [...ui.marks.children].filter((b) => !b.hidden).map((b) => b._place.key), caption: ui.caption.textContent, based: !!base },
  };
}
