// Dream of the Earth Worker. Static assets (web/) are served before this code
// runs; this handles only what isn't a file. No state, no logs.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json(
        { ok: true, version: env.VERSION },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return env.ASSETS.fetch(request);
  },
};
