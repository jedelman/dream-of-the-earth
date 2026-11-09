// The SHARE sheet: the picture you just took, your words for it, a description for people who can't see it, then Post to
// Bluesky (signed in) or Save the image. DOM only; main.js takes the picture and does the posting.
import { h } from "./maker.js";
import { postProblem, POST_MAX } from "./share.js";

const count = (s) => (Intl.Segmenter ? [...new Intl.Segmenter().segment(s)].length : Array.from(s).length);

/**
 * hooks: { canPost() -> "yes" | "signin" (not signed in) | "again" (signed in without the scope), post({ blob, text, alt,
 * width, height }) -> Promise<web url of the post>, signIn() }.
 */
export function buildShareSheet({ maker, button, hooks }) {
  let url = null;
  /** shot: { blob, width, height }; text, alt: words to start from. */
  function open(shot, text, alt) {
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(shot.blob);
    const words = h("textarea", { rows: "4", "aria-label": "What you'd like to say" });
    words.value = text;
    const left = h("span", { class: "count" });
    const said = () => { const n = count(words.value); left.textContent = `${n} / ${POST_MAX}`; left.classList.toggle("over", n > POST_MAX); };
    words.addEventListener("input", said);
    said();
    const describe = h("textarea", { rows: "3", "aria-label": "A description of the picture" });
    describe.value = alt;
    const msg = h("p", { class: "msg", role: "status" });
    const can = hooks.canPost();
    const post = h("button", { class: "go" }, can === "yes" ? "Post to Bluesky" : can === "again" ? "Sign in again to post" : "Sign in to post");
    post.addEventListener("click", async () => {
      if (can !== "yes") { hooks.signIn(); return; }
      const why = postProblem(words.value, describe.value);
      if (why) { msg.textContent = why; return; }
      post.disabled = true;
      msg.textContent = "Posting…";
      try {
        const web = await hooks.post({ ...shot, text: words.value, alt: describe.value });
        msg.replaceChildren("Posted. ", h("a", { href: web, target: "_blank", rel: "noopener" }, "See it on Bluesky"));
        post.textContent = "Posted";
      } catch (e) { msg.textContent = `It didn't post: ${e.message}`; post.disabled = false; }
    });
    const save = h("a", { class: "button", href: url, download: `dream-of-the-earth-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${shot.blob.type === "image/png" ? "png" : "jpg"}` }, "Save the image");
    maker.custom("share", [
      h("h2", {}, "Share this moment"),
      h("img", { class: "shot", src: url, alt: "The picture you took", width: String(shot.width), height: String(shot.height) }),
      h("label", { class: "words" }, "Your words ", left, words),
      h("details", {}, h("summary", {}, "Description (for people who can't see it)"), describe),
      h("div", { class: "row" }, post, save), msg,
      h("p", { class: "small" }, "The address in your words links to this very spot: whoever taps it lands where you are, looking the way you look."),
    ], { trigger: button, classes: ["share"], onClose: () => { if (url) { URL.revokeObjectURL(url); url = null; } } });
  }
  return { open };
}
