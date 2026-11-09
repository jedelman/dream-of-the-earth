// Sharing a screenshot to Bluesky (Jason, 11-09: "OMG Claude this is so gorgeous. Can we add a 'share screenshot to
// bluesky' button?"). The post itself: your words, the picture with its alt text, the game's address made a link to the
// very spot (anyone who taps it lands where you were, looking the way you looked), and any #tags made tags. Facets are
// counted in UTF-8 bytes, as Bluesky wants. Pure, so Node can test it.

export const SITE = "dream-of-the-earth.jason-edelman.org";
export const POST_MAX = 300; // graphemes, Bluesky's limit
export const ALT_MAX = 2000;
/** Bluesky takes images up to about a megabyte. */
export const IMAGE_MAX_BYTES = 950000;

const bytes = (s) => new TextEncoder().encode(s).length;
const graphemes = (s) => (typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter().segment(s)].length : Array.from(s).length);

/** The address that opens the game where you are: place, heading, height, zoom. */
export function spotUrl({ lat, lon, heading, alt, zoom }) {
  const q = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5) });
  if (heading != null) q.set("heading", String(Math.round(heading)));
  if (alt != null) q.set("alt", String(Math.max(2, Math.round(alt))));
  if (zoom != null) q.set("zoom", String(Math.round(zoom)));
  return `https://${SITE}/?${q}`;
}

/** Words to start from: who, where, when, and the link (the caption is yours to change). */
export function defaultText({ name, where, when }) {
  return `${name}, ${where}${when ? `, ${when}` : ""}.\n\n${SITE} #DreamOfTheEarth`;
}

/** Facets for a post's text: the site's address (wherever it is) as a link to `url`, and every #tag as a tag. */
export function facetsFor(text, url) {
  const out = [];
  const at = text.indexOf(SITE);
  if (at >= 0) out.push({ index: { byteStart: bytes(text.slice(0, at)), byteEnd: bytes(text.slice(0, at + SITE.length)) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] });
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
    const start = m.index + m[1].length;
    out.push({ index: { byteStart: bytes(text.slice(0, start)), byteEnd: bytes(text.slice(0, start + 1 + m[2].length)) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  return out.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

/** Why a post can't go as written, or null. */
export function postProblem(text, alt) {
  if (!text.trim()) return "Say something with it.";
  if (graphemes(text) > POST_MAX) return `That's ${graphemes(text)} characters; Bluesky takes ${POST_MAX}.`;
  if (graphemes(alt) > ALT_MAX) return `The description is over ${ALT_MAX} characters.`;
  return null;
}

/** The post record: text, facets, and one image (blob: its uploaded ref; width, height: its size in pixels). */
export function makeShotPost({ text, alt, url, blob, width, height, now = new Date() }) {
  return {
    $type: "app.bsky.feed.post",
    text,
    facets: facetsFor(text, url),
    embed: { $type: "app.bsky.embed.images", images: [{ image: blob, alt: alt || "", aspectRatio: { width, height } }] },
    createdAt: now.toISOString(),
  };
}

/** A post's web address from its at:// URI and your handle. */
export function postWebUrl(uri, handle) {
  const rkey = String(uri).split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}
