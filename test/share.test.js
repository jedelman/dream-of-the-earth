import test from "node:test";
import assert from "node:assert/strict";
import { spotUrl, defaultText, facetsFor, postProblem, makeShotPost, postWebUrl, SITE } from "../web/js/share.js";

const enc = new TextEncoder(), slice = (s, f) => new TextDecoder().decode(enc.encode(s).slice(f.index.byteStart, f.index.byteEnd));

test("the link opens the game where you were, looking the way you looked", () => {
  const u = new URL(spotUrl({ lat: 67.47812, lon: -89.98333, heading: 212.6, alt: 0.4, zoom: 34.2 }));
  assert.equal(u.host, SITE);
  assert.deepEqual(Object.fromEntries(u.searchParams), { lat: "67.47812", lon: "-89.98333", heading: "213", alt: "2", zoom: "34" });
});

test("facets: the site's address links to the spot, #tags are tags, counted in bytes (emoji and accents too)", () => {
  const url = spotUrl({ lat: 1, lon: 2 });
  const text = `Tikrée 🌅 in the tundra.\n\n${SITE} #DreamOfTheEarth #ブルー`;
  const f = facetsFor(text, url);
  assert.equal(f.length, 3);
  assert.equal(slice(text, f[0]), SITE);
  assert.equal(f[0].features[0].uri, url);
  assert.equal(slice(text, f[1]), "#DreamOfTheEarth");
  assert.equal(f[1].features[0].tag, "DreamOfTheEarth");
  assert.equal(slice(text, f[2]), "#ブルー");
  assert.deepEqual(facetsFor("no link here, and a#nottag", url), [], "a # inside a word isn't a tag");
});

test("the default words, and what stops a post", () => {
  const t = defaultText({ name: "Tikree", where: "in the tundra", when: "at sunset" });
  assert.ok(t.startsWith("Tikree, in the tundra, at sunset.") && t.includes(SITE) && t.includes("#DreamOfTheEarth"));
  assert.equal(postProblem(t, ""), null);
  assert.ok(postProblem("  ", ""));
  assert.ok(postProblem("x".repeat(301), "").includes("300"));
});

test("the post record: text, facets, one image with its alt and shape", () => {
  const blob = { $type: "blob", ref: { $link: "bafk" }, mimeType: "image/png", size: 1234 };
  const p = makeShotPost({ text: `Hi ${SITE}`, alt: "A creature at dusk", url: "https://x/", blob, width: 1820, height: 896, now: new Date(0) });
  assert.equal(p.$type, "app.bsky.feed.post");
  assert.deepEqual(p.embed.images[0], { image: blob, alt: "A creature at dusk", aspectRatio: { width: 1820, height: 896 } });
  assert.equal(p.facets.length, 1);
  assert.equal(p.createdAt, "1970-01-01T00:00:00.000Z");
  assert.equal(postWebUrl("at://did:plc:abc/app.bsky.feed.post/3mzz", "jason-edelman.org"), "https://bsky.app/profile/jason-edelman.org/post/3mzz");
});
