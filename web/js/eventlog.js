// A light on-screen log, like a game's chat: a few lines bottom-left that fade.
// On a touch screen, fewer lines that go sooner (the screen is small and the world is the point).
const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const MAX_LINES = COARSE ? 3 : 6, FADE_MS = COARSE ? 5500 : 7000, GONE_MS = FADE_MS + 2000;
let box = null;

/** Add a line. kind: "tree" | "creature" | "highway" | "sky" | "note" (sets its colour). */
export function logLine(text, kind = "note") {
  box ??= document.getElementById("log");
  if (!box) return;
  const line = document.createElement("div");
  line.className = `line ${kind}`;
  line.textContent = text;
  box.appendChild(line);
  while (box.children.length > MAX_LINES) box.firstChild.remove();
  setTimeout(() => line.classList.add("old"), FADE_MS);
  setTimeout(() => line.remove(), GONE_MS);
}
