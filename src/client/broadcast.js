// The on-air graphics for OBS: a 1920×1080 layout with a station bug, clocks,
// a lower third, a news-style ticker and full-screen cards, plus an automatic
// "director" that cuts between the globe and the Santa Cam angles.
import { fmtInt, fmtDuration, place, fmtDistBoth, fmtSpeedBoth, fmtClock, fmtZone, santaZone } from './format.js';

const $ = (id) => document.getElementById(id);

// Camera programs, in seconds. The director loops through the one for the
// scene; `alt` is the globe camera's altitude in globe radii.
const PROGRAMS = {
  auto: [
    { view: 'globe', alt: 2.3, dur: 50 },
    { view: 'cam', angle: 'chase', dur: 24 },
    { view: 'globe', alt: 1.25, dur: 40 },
    { view: 'cam', angle: 'side', dur: 20 },
    { view: 'globe', alt: 2.3, dur: 40 },
    { view: 'cam', angle: 'rider', dur: 20 },
    { view: 'globe', alt: 1.25, dur: 35 },
    { view: 'cam', angle: 'front', dur: 18 },
    { view: 'cam', angle: 'top', dur: 14 },
  ],
  globe: [
    { view: 'globe', alt: 2.3, dur: 60 },
    { view: 'globe', alt: 1.25, dur: 60 },
  ],
  cam: [
    { view: 'cam', angle: 'chase', dur: 30 },
    { view: 'cam', angle: 'side', dur: 25 },
    { view: 'cam', angle: 'rider', dur: 25 },
    { view: 'cam', angle: 'front', dur: 20 },
    { view: 'cam', angle: 'top', dur: 15 },
  ],
};
// What the small Santa Cam window shows while the globe is on screen.
const PIP_ANGLES = ['side', 'chase', 'front'];
const CAM_NAMES = { chase: 'Chase cam', side: 'Side cam', rider: 'Santa’s view', front: 'Reindeer cam', top: 'Overhead cam' };

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {object} opts
 * @param {string} opts.scene   auto | globe | cam | countdown | brb | end
 * @param {Function} [opts.setView]  ({view, alt, angle}) => void; moves the camera
 * @param {Function} [opts.setPip]   (angle | null) => void; Santa Cam window
 */
export function createBroadcast({ scene, setView = () => {}, setPip = () => {} }) {
  const host = location.host;
  const root = $('bc');
  root.hidden = false;
  $('bc-url').textContent = host;

  // ---------- Director ----------
  const program = PROGRAMS[scene] || PROGRAMS.auto;
  let step = -1;
  let stepEnds = 0;
  let mode = null; // 'idle' before takeoff and after landing, 'flight' in between
  let pipIndex = 0;
  let pipEnds = 0;
  let switching = false;
  const fade = $('bc-fade');

  // Dip to black, move the camera while the screen is dark, then fade back.
  function cut(apply) {
    if (switching) return;
    switching = true;
    fade.classList.add('on');
    setTimeout(() => {
      try { apply(); } finally {
        setTimeout(() => { fade.classList.remove('on'); switching = false; }, 180);
      }
    }, 420);
  }

  function showStep(s) {
    setView(s);
    $('bc-camlabel').textContent = s.view === 'cam' ? `SANTA CAM · ${CAM_NAMES[s.angle].toUpperCase()}` : '';
    document.body.classList.toggle('bc-cam', s.view === 'cam');
  }

  function direct(phase, nowMs) {
    const wanted = phase === 'flying' || phase === 'delivering' ? 'flight' : 'idle';
    if (wanted !== mode) {
      const first = mode === null;
      mode = wanted;
      step = -1;
      stepEnds = 0;
      if (mode === 'idle') {
        // Before takeoff and after landing: a slow orbit of the globe, or the
        // sleigh parked at the North Pole on the Santa Cam scene.
        const s = scene === 'cam' ? { view: 'cam', angle: 'chase' } : { view: 'orbit' };
        first ? showStep(s) : cut(() => showStep(s));
      }
    }
    if (mode === 'flight' && nowMs >= stepEnds) {
      step = (step + 1) % program.length;
      const s = program[step];
      stepEnds = nowMs + s.dur * 1000;
      cut(() => showStep(s));
    }
    // Santa Cam window: cycles angles while the globe is on screen.
    const onGlobe = !document.body.classList.contains('bc-cam');
    if (nowMs >= pipEnds) {
      pipIndex = (pipIndex + 1) % PIP_ANGLES.length;
      pipEnds = nowMs + 20000;
    }
    setPip(onGlobe ? PIP_ANGLES[pipIndex] : null);
  }

  // ---------- Ticker ----------
  // A continuous strip: items are added on the right as space frees up and
  // removed once they scroll off the left, so new deliveries join smoothly.
  const track = $('bc-ticker-inner');
  const trackBox = $('bc-ticker-track');
  let tickerItems = ['Live coverage of Santa’s Christmas Eve flight'];
  let tickerNext = 0;
  let tickerOffset = 0;
  let tickerWidth = 0;
  const queue = [];

  function setTickerItems(items) {
    if (items.join('|') === tickerItems.join('|')) return;
    tickerItems = items;
    tickerNext = 0;
  }
  function tickTicker(dt) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    tickerOffset -= 5.5 * rem * dt;
    const visible = trackBox.clientWidth;
    while (tickerWidth + tickerOffset < visible + 200 && tickerItems.length) {
      const el = document.createElement('span');
      el.className = 'bc-tick';
      el.innerHTML = tickerItems[tickerNext % tickerItems.length];
      tickerNext++;
      track.appendChild(el);
      const w = el.offsetWidth;
      queue.push(w);
      tickerWidth += w;
    }
    while (queue.length && tickerOffset + queue[0] < 0) {
      const w = queue.shift();
      track.firstElementChild.remove();
      tickerOffset += w;
      tickerWidth -= w;
    }
    track.style.transform = `translate3d(${tickerOffset.toFixed(1)}px,0,0)`;
  }

  function buildTicker(state, t, schedule) {
    const stops = schedule.points.slice(1, -1);
    const first = stops[0];
    const final = schedule.finalStop;
    const zones = new Set(stops.map((p) => p.offset)).size;
    const follow = `Follow Santa on your phone: <b>${host}</b>`;
    if (state.phase === 'prelaunch') {
      return [
        `Santa departs the North Pole at <b>${new Date(schedule.takeoff).toISOString().slice(11, 16)} UTC</b> on December 24`,
        `<b>${stops.length}</b> stops across <b>${zones}</b> time zones`,
        `First stop: <b>${place(first)}</b>`,
        `Santa reaches every stop at about <b>local midnight</b>`,
        `Final stop: <b>${place(final)}</b>, then home to the North Pole`,
        follow,
      ];
    }
    if (state.phase === 'landed') {
      return [
        `Santa is home. <b>${fmtInt(state.gifts)}</b> gifts delivered`,
        `<b>${stops.length}</b> stops in <b>${zones}</b> time zones`,
        `Distance flown: <b>${fmtDistBoth(state.distance)}</b>`,
        `Merry Christmas from the Santa Tracker`,
        follow,
      ];
    }
    const done = stops.filter((p) => p.index <= state.visited).slice(-12).reverse();
    const items = done.map((p) => `Delivered: <b>${place(p)}</b> · ${fmtInt(p.gifts)} gifts at ${fmtClock(p.arrive, p.offset)} local`);
    if (state.next && !state.next.home) items.splice(Math.min(3, items.length), 0, `Next stop: <b>${place(state.next)}</b>`);
    items.push(follow);
    return items.length > 1 ? items : [`Santa has left the North Pole · first stop <b>${place(first)}</b>`, follow];
  }

  // ---------- Cards ----------
  function cardFor(phase) {
    if (scene === 'brb') return 'brb';
    if (scene === 'end') return phase === 'landed' ? 'home' : 'end';
    if (phase === 'prelaunch') return 'countdown';
    if (phase === 'landed') return 'home';
    if (scene === 'countdown') return 'airborne';
    return null;
  }

  function renderCard(kind, state, t, schedule) {
    const card = $('bc-card');
    card.hidden = !kind;
    document.body.classList.toggle('bc-card-on', Boolean(kind));
    if (!kind) return;
    card.dataset.kind = kind;
    const showDigits = kind === 'countdown';
    $('bc-digits').hidden = !showDigits;
    $('bc-card-stats').hidden = showDigits;

    if (showDigits) {
      const s = Math.max(0, Math.floor((schedule.takeoff - t) / 1000));
      $('bc-d').textContent = Math.floor(s / 86400);
      $('bc-h').textContent = pad(Math.floor((s % 86400) / 3600));
      $('bc-m').textContent = pad(Math.floor((s % 3600) / 60));
      $('bc-s').textContent = pad(s % 60);
    } else {
      const next = state.next && !state.next.home ? place(state.next) : 'North Pole';
      $('bc-card-gifts').textContent = fmtInt(state.gifts);
      $('bc-card-next-k').textContent = state.phase === 'landed' ? 'Stops' : 'Next stop';
      $('bc-card-next').textContent = state.phase === 'landed' ? String(schedule.points.length - 2) : next;
      $('bc-card-dist').textContent = fmtDistBoth(state.distance);
    }

    const takeoffUtc = new Date(schedule.takeoff).toISOString().slice(11, 16);
    const copy = {
      countdown: ['Live coverage', 'Santa takes off in', `Departure from the North Pole at ${takeoffUtc} UTC on December 24`],
      airborne: ['Live now', 'Santa is on his way', `Delivering gifts around the world · ${host}`],
      home: ['Flight complete', 'Santa is home', `Every stop delivered. Merry Christmas! · ${host}`],
      brb: ['Stand by', 'We’ll be right back', state.phase === 'prelaunch' ? `Santa takes off in ${fmtDuration(schedule.takeoff - t)}` : `Santa is still flying · ${host}`],
      end: ['Thanks for watching', 'Merry Christmas!', state.phase === 'prelaunch' ? `Santa takes off in ${fmtDuration(schedule.takeoff - t)} · ${host}` : `Keep following Santa live at ${host}`],
    }[kind];
    $('bc-card-kicker').textContent = copy[0];
    $('bc-card-title').textContent = copy[1];
    $('bc-card-sub').textContent = copy[2];
  }

  // ---------- Lower third and clocks ----------
  function renderText(state, t, schedule) {
    const { phase } = state;
    const live = phase === 'flying' || phase === 'delivering';
    const [pill, cls] = phase === 'prelaunch' ? ['PRE-FLIGHT', 'pre'] : phase === 'landed' ? ['FLIGHT COMPLETE', 'done'] : ['LIVE', 'live'];
    $('bc-pill-text').textContent = pill;
    $('bc-pill').className = `status-pill ${cls}`;
    $('bc-year').textContent = schedule.year;
    $('bc-utc').textContent = new Date(t).toISOString().slice(11, 19);
    const offset = santaZone(state);
    $('bc-santa-time').textContent = live ? `${fmtClock(t, offset)} ${fmtZone(offset)}` : 'North Pole';

    if (live) {
      if (phase === 'delivering') {
        $('bc-now').textContent = place(state.current);
        $('bc-now-sub').textContent = 'Delivering gifts now';
      } else {
        $('bc-now').textContent = state.prev.home ? 'Left the North Pole' : `Left ${state.prev.name}`;
        $('bc-now-sub').textContent = fmtSpeedBoth(state.speed);
      }
      $('bc-next').textContent = state.next ? place(state.next) : 'North Pole';
      $('bc-next-sub').textContent = state.next ? `Arrives in ${fmtDuration(state.next.arrive - t)}` : '';
      const final = schedule.finalStop;
      $('bc-final').textContent = place(final);
      $('bc-final-sub').textContent = t < final.arrive ? `In ${fmtDuration(final.arrive - t)}, then home` : `Delivered · home in ${fmtDuration(schedule.landing - t)}`;
      $('bc-dist').textContent = fmtDistBoth(state.distance);
      const total = schedule.points.length - 2;
      $('bc-stops').textContent = `${Math.min(total, state.visited)} / ${total}`;
      const pct = (100 * (t - schedule.takeoff)) / (schedule.landing - schedule.takeoff);
      $('bc-progress').style.width = `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
    }
    $('bc-ticker-label').textContent = phase === 'prelaunch' ? (schedule.takeoff - t < 86400e3 ? 'TONIGHT' : 'COMING UP') : phase === 'landed' ? 'FINAL TOTALS' : 'LATEST';
  }

  // ---------- Per-frame entry point ----------
  let lastText = 0;
  let lastVisited = null;
  let lastPhase = null;
  return {
    frame(state, t, schedule, dt, nowMs) {
      $('bc-gifts').textContent = fmtInt(state.gifts);
      if (nowMs - lastText > 250) {
        lastText = nowMs;
        renderText(state, t, schedule);
        renderCard(cardFor(state.phase), state, t, schedule);
        if (state.visited !== lastVisited || state.phase !== lastPhase) {
          lastVisited = state.visited;
          lastPhase = state.phase;
          setTickerItems(buildTicker(state, t, schedule));
        }
      }
      direct(state.phase, nowMs);
      tickTicker(dt);
    },
  };
}
