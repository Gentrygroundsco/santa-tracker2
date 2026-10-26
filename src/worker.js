// Serves the static tracker from ./public and a tiny time endpoint so every
// visitor sees Santa in the same place even if their device clock is off.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/time') {
      return Response.json({ now: Date.now() }, { headers: { 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
