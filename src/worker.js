// Serves the static tracker from ./public and a tiny time endpoint so every
// visitor sees Santa in the same place even if their device clock is off.
// /broadcast is the same page laid out as on-air graphics for OBS.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/time') {
      return Response.json({ now: Date.now() }, { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/broadcast' || url.pathname === '/broadcast/') {
      const res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
      const out = new Response(res.body, res);
      out.headers.set('cache-control', 'no-cache');
      out.headers.set('x-robots-tag', 'noindex');
      return out;
    }
    return env.ASSETS.fetch(request);
  },
};
