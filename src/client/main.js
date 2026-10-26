import Globe from 'globe.gl';
import * as THREE from 'three';
import { buildSchedule, santaState, seasonYear, sunPosition, distanceKm } from './schedule.js';
import { createSleigh, createTrail, loadSleighModel } from './sleigh.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const R = 100; // globe.gl's globe radius in scene units

// ---------- Clock ----------
// Live mode follows real time (corrected by the server clock). Demo mode runs a
// simulated Christmas Eve at a chosen speed. `?t=2026-12-24T18:00:00Z` pins the
// live clock to another moment, which is handy for previews.
const clock = {
  serverOffset: 0,
  pinnedOffset: params.has('t') ? Date.parse(params.get('t')) - Date.now() : 0,
  demo: false,
  demoTime: 0,
  speed: Number(params.get('speed')) || 1,
  paused: false,
  now() { return this.demo ? this.demoTime : Date.now() + this.serverOffset + this.pinnedOffset; },
};

fetch('/api/time', { cache: 'no-store' })
  .then((r) => r.json())
  .then(({ now }) => { if (Math.abs(now - Date.now()) > 2000) clock.serverOffset = now - Date.now(); })
  .catch(() => {});

let schedule = buildSchedule(seasonYear(clock.now()));

// ---------- Globe ----------
const loader = new THREE.TextureLoader();
const dayNight = new THREE.ShaderMaterial({
  uniforms: {
    dayTexture: { value: loader.load('/img/earth-blue-marble.jpg') },
    nightTexture: { value: loader.load('/img/earth-night.jpg') },
    sunDirection: { value: new THREE.Vector3(1, 0, 0) },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(mat3(modelMatrix) * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec3 sunDirection;
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      float light = dot(normalize(vNormal), normalize(sunDirection));
      vec3 day = texture2D(dayTexture, vUv).rgb;
      vec3 night = texture2D(nightTexture, vUv).rgb;
      // City lights on the night side, with a faint hint of the land beneath.
      vec3 nightSide = night * vec3(1.25, 1.12, 0.95) + day * 0.05;
      float blend = smoothstep(-0.1, 0.1, light);
      vec3 color = mix(nightSide, day, blend);
      // Soft warm scattering along the terminator.
      color += vec3(0.18, 0.08, 0.03) * (1.0 - smoothstep(0.0, 0.1, abs(light))) * 0.35;
      gl_FragColor = vec4(color, 1.0);
    }`,
});

const globe = new Globe($('globe'), { animateIn: true })
  .backgroundImageUrl('/img/night-sky.png')
  .globeMaterial(dayNight)
  .showAtmosphere(true)
  .atmosphereColor('#6fa8ff')
  .atmosphereAltitude(0.16)
  .pointOfView({ lat: 50, lng: 0, altitude: 2.6 })
  // Stops
  .pointLat('lat').pointLng('lng')
  .pointAltitude(0.002)
  .pointRadius((p) => (p.visited ? 0.18 : 0.1))
  .pointColor((p) => (p.visited ? '#f0b429' : 'rgba(255,255,255,0.55)'))
  .pointsTransitionDuration(0)
  .pointLabel((p) => stopTooltip(p))
  // Pulsing ring on the next stop
  .ringColor(() => (t) => `rgba(229,56,59,${0.8 * (1 - t)})`)
  .ringMaxRadius(1.6)
  .ringPropagationSpeed(1.2)
  .ringRepeatPeriod(1400);

const controls = globe.controls();
controls.enableDamping = true;
controls.minDistance = R * 1.08;
controls.maxDistance = R * 6;

// Clouds drifting above the surface
const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.008, 64, 64),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { map: { value: loader.load('/img/clouds.png') }, sunDirection: dayNight.uniforms.sunDirection },
    vertexShader: dayNight.vertexShader,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 sunDirection;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        float day = smoothstep(-0.15, 0.3, dot(normalize(vNormal), normalize(sunDirection)));
        float a = c.a * max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(vec3(0.07 + 0.88 * day), a * (0.12 + 0.43 * day));
      }`,
  }),
);
globe.scene().add(clouds);

// Santa's sleigh and sparkle trail
const sleigh = createSleigh();
const trail = createTrail();
globe.scene().add(sleigh.object, trail.object);
loadSleighModel('/models/santa-sleigh.glb')
  .then((m) => sleigh.useModel(m))
  .catch((err) => console.warn('Using the built-in sleigh; the detailed model failed to load.', err));

function resize() {
  globe.width(window.innerWidth).height(window.innerHeight);
  // On phones the tracker panel covers the bottom, so lift the globe up.
  globe.globeOffset([0, window.innerWidth <= 640 ? -window.innerHeight * 0.04 : 0]);
}
window.addEventListener('resize', resize);
resize();

// ---------- Santa Cam angles ----------
// Each angle places a camera relative to the sleigh: P is its position, f its
// heading, u straight up, r to its side, and s the sleigh's current size.
const CAM_ANGLES = {
  chase: { label: 'Chase', place: (F, L, H) => [[0, F.max.y + 0.16 * L, F.min.z - 0.5 * L], [0, 0.4 * H, F.min.z + 0.65 * L], 'u'] },
  rider: { label: 'Santa’s view', place: (F, L, H) => [[0, F.max.y + 0.2 * H, F.santa.z - 0.04 * L], [0, F.santa.y + 0.1 * H, F.max.z + 0.3 * L], 'u'] },
  side: { label: 'Side', place: (F, L, H) => [[0.78 * L, 0.65 * H, F.min.z + 0.5 * L], [0, 0.45 * H, F.min.z + 0.5 * L], 'u'] },
  front: { label: 'Reindeer', place: (F, L, H) => [[0.12 * L, 0.8 * H, F.max.z + 0.22 * L], [0, 0.45 * H, F.santa.z + 0.1 * L], 'u'] },
  top: { label: 'Overhead', place: (F, L, H) => [[0, 0.75 * L, F.min.z + 0.5 * L], [0, 0, F.min.z + 0.5 * L], 'f'] },
};
// World-space camera position, look target and up vector for an angle, given
// the sleigh's position P, heading f, up u, side r and current scale.
function camPlacement(angle, P, f, u, r, scale) {
  const F = sleigh.frame;
  const L = F.max.z - F.min.z;
  const H = F.max.y - F.min.y;
  const [pos, look, upKey] = CAM_ANGLES[angle].place(F, L, H);
  const toWorld = ([x, y, z]) => P.clone().addScaledVector(r, x * scale).addScaledVector(u, y * scale).addScaledVector(f, z * scale);
  return [toWorld(pos), toWorld(look), upKey === 'f' ? f : u];
}
let mainAngle = 'chase';
let pipAngle = 'side';

// ---------- Camera ----------
// 'follow': globe view that keeps Santa centred. 'free': the user spins the
// globe. 'sleigh': a chase camera riding just behind the sleigh.
let camMode = 'follow';
const setPressed = (btn, on) => { btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); };
let camYaw = 0;
const followBtn = $('follow-btn');
const sleighBtn = $('sleighcam-btn');
function setCamMode(mode) {
  const leavingSleigh = camMode === 'sleigh' && mode !== 'sleigh';
  camMode = mode;
  lastVisited = -2;
  setPressed(followBtn, mode === 'follow');
  setPressed(sleighBtn, mode === 'sleigh');
  document.body.classList.toggle('sleighcam', mode === 'sleigh');
  if (mode === 'sleigh') {
    controls.enabled = false;
    controls.minDistance = 0;
    camYaw = 0;
  } else if (leavingSleigh) {
    controls.target.set(0, 0, 0);
    globe.camera().up.set(0, 1, 0);
    controls.minDistance = R * 1.08;
    controls.enabled = true;
    const st = santaState(schedule, clock.now());
    globe.pointOfView({ lat: THREE.MathUtils.clamp(st.lat, -85, 85), lng: st.lng, altitude: 1.6 }, 900);
  }
}
let dragX = null;
globe.renderer().domElement.addEventListener('pointerdown', (e) => {
  if (camMode === 'sleigh') dragX = e.clientX;
  else setCamMode('free');
});
window.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  camYaw += (e.clientX - dragX) * 0.008;
  dragX = e.clientX;
});
window.addEventListener('pointerup', () => { dragX = null; });
followBtn.addEventListener('click', () => setCamMode(camMode === 'follow' ? 'free' : 'follow'));
sleighBtn.addEventListener('click', () => setCamMode(camMode === 'sleigh' ? 'follow' : 'sleigh'));

// ---------- Screen-space tags (Santa marker, next stop, final stop) ----------
const tags = {
  santa: $('santa-marker'),
  pole: makeTag('tag pole'),
  next: makeTag('tag next'),
  final: makeTag('tag final'),
};
// The Santa marker sits with its dot on the point; the others sit just above it.
tags.santa.anchor = 'translate(-50%, calc(-100% + 9px))';
function makeTag(className) {
  const el = document.createElement('div');
  el.className = className;
  $('tags').appendChild(el);
  return el;
}
function setTag(el, point, text) {
  el.point = point;
  el.textContent = text;
}
const projected = new THREE.Vector3();
function placeTag(el, worldPos, opacity = 1) {
  const cam = globe.camera();
  // Hide points on the far side of the globe.
  const toCam = cam.position.clone().sub(worldPos);
  const facing = worldPos.clone().normalize().dot(toCam.normalize());
  projected.copy(worldPos).project(cam);
  const visible = facing > 0.05 && projected.z < 1 && opacity > 0.02;
  el.style.opacity = visible ? opacity : 0;
  if (!visible) return null;
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  el.style.transform = `translate(${x}px, ${y}px) ${el.anchor || 'translate(-50%, -100%)'}`;
  return { x, y };
}

// ---------- Route layers ----------
let lastVisited = -1;
let lastRouteYear = null;

function stopTooltip(p) {
  const when = new Date(p.arrive).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const gifts = p.visited ? `<br>${Math.round(p.gifts).toLocaleString()} gifts delivered` : '';
  return `<div class="tip"><b>${p.name}</b>, ${p.region}<br>${p.visited ? 'Visited' : 'Arrives'} ${when} your time${gifts}</div>`;
}

function updateRouteLayers(state, force) {
  if (!force && state.visited === lastVisited && schedule.year === lastRouteYear) return;
  lastVisited = state.visited;
  lastRouteYear = schedule.year;
  const stops = schedule.points.slice(1, -1);
  stops.forEach((p) => { p.visited = p.index <= state.visited && state.phase !== 'prelaunch'; });
  // Stop markers turn into big pillars up close, so the sleigh cam hides them.
  // Places Santa has visited show as small dots (no route lines); "Full route" adds the stops ahead.
  globe.pointsData(camMode === 'sleigh' ? [] : showRoute ? stops : stops.filter((p) => p.visited));

  const next = state.next && !state.next.home ? state.next : null;
  globe.ringsData(next ? [next] : []);

  const final = schedule.finalStop;
  setTag(tags.pole, schedule.points[0], 'NORTH POLE');
  setTag(tags.next, next && next !== final ? next : null, next ? `NEXT  ${next.name}` : '');
  setTag(tags.final, final, next === final ? `NEXT & FINAL  ${final.name}` : `FINAL  ${final.name}`);
}

let showRoute = false;
$('route-btn').addEventListener('click', () => {
  showRoute = !showRoute;
  setPressed($('route-btn'), showRoute);
  updateRouteLayers(santaState(schedule, clock.now()), true);
});

// ---------- Panel ----------
const fmtInt = (n) => Math.floor(n).toLocaleString();
const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
};
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const place = (p) => (p.home ? 'North Pole' : `${p.name}, ${p.region}`);
const metric = !['en-US', 'en-LR', 'my'].includes(navigator.language);
const fmtDist = (km) => (metric ? `${fmtInt(km)} km` : `${fmtInt(km * 0.621371)} mi`);
const fmtSpeed = (kmh) => (metric ? `${fmtInt(kmh)} km/h` : `${fmtInt(kmh * 0.621371)} mph`);

const fmtClock = (t, offsetHours) => {
  const d = new Date(t + offsetHours * 3600e3);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ampm}`;
};
const fmtZone = (offset) => {
  if (offset === 0) return 'UTC';
  const sign = offset > 0 ? '+' : '−';
  const a = Math.abs(offset);
  const m = Math.round((a % 1) * 60);
  return `UTC${sign}${Math.floor(a)}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
};
const coords = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;

function renderPanel(state, t) {
  const { phase } = state;
  document.body.dataset.phase = phase;
  const [pillText, pillClass] = clock.demo ? ['SIMULATION', 'sim']
    : phase === 'prelaunch' ? ['PRE-FLIGHT', 'pre']
    : phase === 'landed' ? ['FLIGHT COMPLETE', 'done'] : ['LIVE TRACKING', 'live'];
  $('mode-text').textContent = pillText;
  $('mode-badge').className = `status-pill ${pillClass}`;
  $('season-year').textContent = schedule.year;
  $('clock-utc').textContent = `${new Date(t).toISOString().slice(11, 19)} UTC`;
  $('clock-local').textContent = new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

  let status;
  if (phase === 'prelaunch') status = 'Santa is at the North Pole preparing for departure.';
  else if (phase === 'landed') status = 'Santa has returned to the North Pole. Every stop has been delivered.';
  else if (phase === 'delivering') status = `Delivering gifts in <b>${place(state.current)}</b>`;
  else if (state.prev.home) status = `Departed the North Pole, en route to <b>${place(state.next)}</b>`;
  else if (state.next.home) status = `Heading home to <b>the North Pole</b>`;
  else status = `En route from <b>${state.prev.name}</b> to <b>${state.next.name}</b>`;
  $('status').innerHTML = status;
  $('santacam-caption').textContent = phase === 'prelaunch' ? 'North Pole · Pre-flight'
    : phase === 'landed' ? 'North Pole · Landed'
    : phase === 'delivering' ? `Over ${state.current.name}` : `En route to ${state.next.name}`;

  // Where Santa is now
  const here = state.current || (phase === 'flying' ? null : schedule.points[0]);
  $('location').textContent = here ? place(here) : coords(state.lat, state.lng);
  $('location-sub').textContent = phase === 'delivering' ? 'Delivering gifts'
    : phase === 'flying' ? `In flight from ${state.prev.home ? 'the North Pole' : state.prev.name}`
    : phase === 'prelaunch' ? 'Pre-flight checks' : 'Landed';

  if (state.next) {
    $('next-stop').textContent = place(state.next);
    $('next-eta').textContent = `Arrives in ${fmtDuration(state.next.arrive - t)} · ${fmtTime(state.next.arrive)} your time`;
  } else {
    $('next-stop').textContent = 'None';
    $('next-eta').textContent = 'All deliveries complete';
  }
  const final = schedule.finalStop;
  $('final-stop').textContent = place(final);
  $('final-eta').textContent = t < final.arrive
    ? `In ${fmtDuration(final.arrive - t)}, then home to the North Pole`
    : t < schedule.landing ? `Delivered. North Pole landing in ${fmtDuration(schedule.landing - t)}` : 'Delivered';

  const totalStops = schedule.points.length - 2;
  const visited = phase === 'prelaunch' ? 0 : Math.min(totalStops, state.visited);
  const pct = phase === 'landed' ? 100 : (100 * (t - schedule.takeoff)) / (schedule.landing - schedule.takeoff);
  $('progress-pct').textContent = `${Math.max(0, Math.min(100, pct)).toFixed(phase === 'flying' || phase === 'delivering' ? 1 : 0)}%`;
  $('progress-bar').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  $('stops-count').textContent = `${visited} of ${totalStops} stops`;
  $('distance').textContent = fmtDist(state.distance);
  $('speed').textContent = phase === 'flying' ? fmtSpeed(state.speed) : phase === 'delivering' ? 'Stationary' : '0';

  // Local time where Santa is: the zone of the stop he is at or flying to.
  const zoneStop = state.current || (phase === 'flying' && !state.next.home ? state.next : null);
  const offset = zoneStop ? zoneStop.offset : 0;
  $('santa-time').textContent = fmtClock(t, offset);
  $('santa-zone').textContent = zoneStop ? fmtZone(offset) : 'UTC';

  renderCountdown(state, t);
  renderLog(state);
}

let lastLogVisited = -1;
function renderLog(state) {
  if (state.visited === lastLogVisited) return;
  lastLogVisited = state.visited;
  const end = state.phase === 'prelaunch' ? 0 : Math.min(state.visited, schedule.points.length - 2);
  const recent = schedule.points.slice(Math.max(1, end - 11), end + 1).filter((p) => !p.home).reverse();
  $('log').innerHTML = recent.length
    ? recent.map((p) => `<li><span class="log-place">${p.name}</span><span class="log-gifts">${fmtInt(p.gifts)}</span>`
      + `<span class="log-meta">${p.region}</span><span class="log-time">${fmtClock(p.arrive, p.offset)} local</span></li>`).join('')
    : '<li class="empty">No deliveries yet. Tracking begins when Santa departs on Christmas Eve.</li>';
}

function renderCountdown(state, t) {
  const overlay = $('countdown');
  if (clock.demo || (state.phase !== 'prelaunch' && state.phase !== 'landed')) { overlay.hidden = true; return; }
  overlay.hidden = overlayDismissed;
  $('mini-countdown').hidden = !overlayDismissed;
  if (state.phase === 'prelaunch') {
    $('cd-kicker').textContent = 'Departure from the North Pole';
    $('cd-title').textContent = 'Santa takes off in';
    const ms = schedule.takeoff - t;
    const s = Math.max(0, Math.floor(ms / 1000));
    $('cd-days').textContent = Math.floor(s / 86400);
    $('cd-hours').textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    $('cd-mins').textContent = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    $('cd-secs').textContent = String(s % 60).padStart(2, '0');
    $('cd-sub').textContent = `Scheduled departure: ${new Date(schedule.takeoff).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} your time. Live tracking starts automatically.`;
    $('mini-countdown').textContent = `Departure in ${fmtDuration(ms)}`;
  } else {
    $('cd-kicker').textContent = 'Flight complete';
    $('cd-title').textContent = 'Santa is back at the North Pole';
    $('cd-days').textContent = $('cd-hours').textContent = $('cd-mins').textContent = $('cd-secs').textContent = '--';
    $('cd-sub').textContent = `${fmtInt(state.gifts)} gifts delivered across ${schedule.points.length - 2} stops. Tracking returns next Christmas Eve.`;
    $('mini-countdown').textContent = 'Flight complete';
  }
}

let overlayDismissed = false;
$('cd-explore').addEventListener('click', () => { overlayDismissed = true; });
$('mini-countdown').addEventListener('click', () => { overlayDismissed = false; });

// ---------- Demo mode ----------
function startDemo() {
  clock.demo = true;
  clock.paused = false;
  schedule = buildSchedule(seasonYear(Date.now() + clock.serverOffset + clock.pinnedOffset));
  // Start just before the first delivery so there is something to watch right away.
  clock.demoTime = schedule.points[1].arrive - 45e3;
  document.body.classList.add('demo');
  setPressed($('demo-btn'), true);
  $('scrub').min = schedule.takeoff - 60e3;
  $('scrub').max = schedule.landing + 60e3;
  if (camMode === 'free') setCamMode('follow');
  lastVisited = lastLogVisited = -2;
  setSpeed(clock.speed);
}
function stopDemo() {
  clock.demo = false;
  document.body.classList.remove('demo');
  setPressed($('demo-btn'), false);
  schedule = buildSchedule(seasonYear(clock.now()));
  lastVisited = lastLogVisited = -2;
  const url = new URL(location.href);
  url.searchParams.delete('demo');
  history.replaceState(null, '', url);
}
function setSpeed(speed) {
  clock.speed = speed;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
}
$('cd-demo').addEventListener('click', startDemo);
$('demo-btn').addEventListener('click', () => (clock.demo ? stopDemo() : startDemo()));
$('demo-exit').addEventListener('click', stopDemo);
$('demo-play').addEventListener('click', () => {
  clock.paused = !clock.paused;
  $('demo-play').innerHTML = `<svg><use href="#i-${clock.paused ? 'play' : 'pause'}"/></svg>`;
  $('demo-play').setAttribute('aria-label', clock.paused ? 'Play' : 'Pause');
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
$('scrub').addEventListener('input', (e) => { clock.demoTime = Number(e.target.value); lastVisited = -2; });
if (params.has('demo')) startDemo();

// ---------- Where's my stop? ----------
$('near-btn').addEventListener('click', () => {
  const out = $('near-result');
  if (!navigator.geolocation) { out.textContent = 'Location is not available in this browser.'; return; }
  out.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const me = { lat: coords.latitude, lng: coords.longitude };
    const stops = schedule.points.slice(1, -1);
    const nearest = stops.reduce((best, p) => (distanceKm(me, p) < distanceKm(me, best) ? p : best), stops[0]);
    out.innerHTML = `Your nearest stop is <b>${nearest.name}</b>, ${fmtDist(distanceKm(me, nearest))} away. Santa is expected around <b>${new Date(nearest.arrive).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b> your time.`;
  }, () => { out.textContent = 'Location unavailable. Santa reaches each area at about local midnight.'; }, { timeout: 10000 });
});

// ---------- Santa Cam window ----------
// A live picture-in-picture view of the sleigh, drawn into a corner of the
// globe's canvas right after the globe itself renders.
const pipEl = $('santacam');
const pipCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 4000);
let pipOn = true;
const pipSize = new THREE.Vector2();
const pipState = { pos: null, look: null, up: new THREE.Vector3() };

function setPip(on) {
  pipOn = on;
  pipEl.hidden = !on;
  $('santacam-btn').classList.toggle('active', on);
}
function setPipAngle(angle) {
  pipAngle = angle;
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('active', b.dataset.cam === angle));
  $('santacam-name').textContent = CAM_ANGLES[angle].label;
  pipState.pos = null;
}
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => setPipAngle(b.dataset.cam)));
$('santacam-btn').addEventListener('click', () => setPip(!pipOn));
$('santacam-close').addEventListener('click', () => setPip(false));
$('santacam-expand').addEventListener('click', () => {
  // Swap: the window's angle goes full screen, and the window shows the globe-friendly chase view.
  mainAngle = pipAngle;
  camYaw = 0;
  setCamMode('sleigh');
  setPipAngle(pipAngle === 'chase' ? 'side' : 'chase');
});
setPipAngle(pipAngle);
if (window.innerWidth <= 640) setPip(false);

function renderSantaCam(P, f, u, r, s, dt) {
  if (!pipOn) return;
  const rect = pipEl.querySelector('.santacam-view').getBoundingClientRect();
  if (rect.width < 10) return;
  const [pos, look, camUp] = camPlacement(pipAngle, P, f, u, r, s);
  const k = Math.min(1, dt * 4);
  if (!pipState.pos || pipState.pos.distanceTo(pos) > 20 * s) {
    pipState.pos = pos.clone(); pipState.look = look.clone(); pipState.up.copy(camUp);
  } else {
    pipState.pos.lerp(pos, k); pipState.look.lerp(look, k); pipState.up.lerp(camUp, k).normalize();
  }
  pipCam.position.copy(pipState.pos);
  pipCam.up.copy(pipState.up);
  pipCam.lookAt(pipState.look);
  pipCam.aspect = rect.width / rect.height;
  pipCam.updateProjectionMatrix();

  const renderer = globe.renderer();
  renderer.getSize(pipSize);
  const y = pipSize.y - rect.bottom;
  renderer.setScissorTest(true);
  renderer.setScissor(rect.left, y, rect.width, rect.height);
  renderer.setViewport(rect.left, y, rect.width, rect.height);
  // The halo and sparkles are sized for the main view and look like blobs up close.
  sleigh.showHalo(false);
  trail.object.visible = false;
  renderer.render(globe.scene(), pipCam);
  trail.object.visible = true;
  sleigh.showHalo(camMode !== 'sleigh');
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, pipSize.x, pipSize.y);
}

// ---------- Animation loop ----------
const tmp = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion() };
const vec = (c) => new THREE.Vector3(c.x, c.y, c.z);
let lastFrame = performance.now();
let lastPanel = 0;
let elapsed = 0;

function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  elapsed += dt;

  if (clock.demo && !clock.paused) {
    clock.demoTime += dt * 1000 * clock.speed;
    if (clock.demoTime > schedule.landing + 90e3) clock.demoTime = schedule.takeoff - 20e3;
    $('scrub').value = clock.demoTime;
  }
  if (clock.demo) $('scrub-time').textContent = `${new Date(clock.demoTime).toISOString().slice(5, 16).replace('T', ' ')} UTC`;
  const t = clock.now();
  if (!clock.demo && seasonYear(t) !== schedule.year) schedule = buildSchedule(seasonYear(t));
  const state = santaState(schedule, t);

  // Sun and clouds
  const sun = sunPosition(t);
  dayNight.uniforms.sunDirection.value.copy(vec(globe.getCoords(sun.lat, sun.lng, 0)));
  clouds.rotation.y += dt * 0.004;

  // Camera distance decides how big Santa is drawn, so he stays visible from space.
  const camDist = globe.camera().position.length();
  const scale = camMode === 'sleigh' ? 0.8 : THREE.MathUtils.clamp((camDist - R) * 0.009, 0.12, 2.2);
  const alt = (1.5 + scale * 1.2) / R;

  // Place and orient the sleigh toward where it is heading.
  tmp.pos.copy(vec(globe.getCoords(state.lat, state.lng, alt)));
  const head = state.heading || schedule.points[1];
  tmp.target.copy(vec(globe.getCoords(head.lat, head.lng, alt)));
  tmp.up.copy(tmp.pos).normalize();
  tmp.fwd.copy(tmp.target).sub(tmp.pos);
  tmp.fwd.sub(tmp.up.clone().multiplyScalar(tmp.fwd.dot(tmp.up)));
  if (tmp.fwd.lengthSq() > 1e-6) {
    tmp.fwd.normalize();
    tmp.right.crossVectors(tmp.up, tmp.fwd).normalize();
    tmp.m.makeBasis(tmp.right, tmp.up, tmp.fwd);
    tmp.q.setFromRotationMatrix(tmp.m);
    sleigh.object.quaternion.slerp(tmp.q, Math.min(1, dt * 4));
  }
  sleigh.object.position.copy(tmp.pos);
  sleigh.object.scale.setScalar(scale);
  sleigh.showHalo(camMode !== 'sleigh');
  const moving = state.phase === 'flying';
  sleigh.animate(elapsed, moving);

  // Sparkles stream off the back of the sleigh while it flies.
  if (moving || state.phase === 'delivering') {
    const back = tmp.pos.clone().addScaledVector(tmp.fwd, (sleigh.frame.min.z - 0.3) * scale).addScaledVector(tmp.up, 0.4 * scale);
    if (moving || Math.random() < 0.3) trail.emit(back, scale * 0.4);
  }
  trail.update(dt, scale * 0.35);

  // Keep the camera on Santa, easing toward him; the user's zoom is kept.
  if (camMode === 'sleigh') {
    const cam = globe.camera();
    // Dragging swings the camera around the sleigh.
    const f = tmp.fwd.clone().applyAxisAngle(tmp.up, camYaw);
    const r = tmp.right.clone().applyAxisAngle(tmp.up, camYaw);
    const [want, look, camUp] = camPlacement(mainAngle, tmp.pos, f, tmp.up, r, scale);
    const k = Math.min(1, dt * 3);
    if (cam.position.distanceTo(want) > 20 * scale) cam.position.copy(want);
    else cam.position.lerp(want, k);
    cam.up.lerp(camUp, k).normalize();
    controls.target.copy(look);
    cam.lookAt(look);
  } else if (camMode === 'follow') {
    const pov = globe.pointOfView();
    let dLng = state.lng - pov.lng;
    dLng = ((dLng + 540) % 360) - 180;
    const k = Math.min(1, dt * 2.5);
    const lat = THREE.MathUtils.clamp(pov.lat + (state.lat - pov.lat) * k, -85, 85);
    globe.pointOfView({ lat, lng: pov.lng + dLng * k, altitude: pov.altitude }, 0);
  }

  // Screen tags: the Santa pin fades out once the 3D sleigh is big enough to see.
  const pinOpacity = camMode === 'sleigh' ? 0 : THREE.MathUtils.clamp((camDist - R * 1.35) / (R * 0.4), 0, 1);
  const santaAt = placeTag(tags.santa, tmp.pos, pinOpacity);
  for (const el of [tags.pole, tags.next, tags.final]) {
    // The sleigh view is immersive, so map labels are hidden there.
    if (!el.point || camMode === 'sleigh') { el.style.opacity = 0; continue; }
    const at = placeTag(el, vec(globe.getCoords(el.point.lat, el.point.lng, 0.01)));
    // Don't let a stop label sit on top of Santa's marker.
    if (at && santaAt && pinOpacity > 0.5 && Math.hypot(at.x - santaAt.x, at.y - santaAt.y) < 70) el.style.opacity = 0;
  }

  renderSantaCam(tmp.pos, tmp.fwd, tmp.up, tmp.right, scale, dt);

  $('gifts').textContent = fmtInt(state.gifts);
  if (nowMs - lastPanel > 200) {
    lastPanel = nowMs;
    renderPanel(state, t);
    updateRouteLayers(state);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

