// The clock every view runs on.
//
// Live mode follows real time, corrected against Cloudflare's clock. Demo mode
// runs a simulated Christmas Eve at a chosen speed. For rehearsals,
// `?t=2026-12-24T18:00:00Z` starts the live clock at another moment and
// `&warp=60` runs it 60 times faster.
const params = new URLSearchParams(location.search);
const started = Date.now();
const pinned = params.has('t') ? Date.parse(params.get('t')) : NaN;

export const clock = {
  serverOffset: 0,
  warp: Math.max(1, Number(params.get('warp')) || 1),
  demo: false,
  demoTime: 0,
  speed: Number(params.get('speed')) || 1,
  paused: false,
  liveNow() {
    if (Number.isFinite(pinned)) return pinned + (Date.now() - started) * this.warp;
    return Date.now() + this.serverOffset;
  },
  now() { return this.demo ? this.demoTime : this.liveNow(); },
};

// Device clocks can be off by minutes. The Date header on a static file comes
// from Cloudflare's edge (to the second) and costs no Worker requests, so it
// is safe to check now and then even with lots of viewers.
export async function syncClock() {
  try {
    const sent = Date.now();
    const res = await fetch(`/robots.txt?sync=${sent}`, { cache: 'no-store' });
    const received = Date.now();
    let server = Date.parse(res.headers.get('date'));
    if (!Number.isFinite(server)) {
      // No readable Date header: ask the Worker instead.
      server = (await (await fetch('/api/time', { cache: 'no-store' })).json()).now - 500;
    }
    // The header is rounded down to the second, so its midpoint is the best guess.
    const offset = server + 500 - (sent + received) / 2;
    clock.serverOffset = Math.abs(offset) > 1500 ? offset : 0;
  } catch {
    // Offline or blocked: keep the device clock.
  }
}

export function keepClockSynced(everyMs = 10 * 60e3) {
  syncClock();
  setInterval(syncClock, everyMs);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncClock(); });
}
