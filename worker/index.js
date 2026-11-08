// Dream of the Earth Worker. Static assets (web/) are served before this code
// runs; this handles only what isn't a file. No state, no logs.
import { parsePlace, placeCentre } from "../web/js/places.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json(
        { ok: true, version: env.VERSION },
        { headers: { "cache-control": "no-store" } },
      );
    }
    // A place: what artifacts point at (places.js). Opening one opens the game there.
    if (url.pathname.startsWith("/place/")) {
      const cell = parsePlace(`https://dream-of-the-earth.jason-edelman.org${url.pathname}`);
      if (!cell) return new Response("Not a place in the dream.", { status: 404 });
      const c = placeCentre(cell.j, cell.i);
      return Response.redirect(`${url.origin}/?lat=${c.lat.toFixed(5)}&lon=${c.lon.toFixed(5)}&alt=60`, 302);
    }
    return env.ASSETS.fetch(request);
  },
};
