import Globe from 'globe.gl';
import * as THREE from 'three';
import { buildSchedule, santaState, seasonYear, sunPosition, distanceKm } from './schedule.js';
import { createSleigh, createTrail } from './sleigh.js';
import { startSnow } from './snow.js';

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
  speed: Number(params.get('speed')) || 120,
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
      // City lights glow warm on Christmas Eve, with a hint of the land beneath.
      vec3 nightSide = night * vec3(1.6, 1.35, 1.0) + day * 0.12;
      float blend = smoothstep(-0.12, 0.12, light);
      vec3 color = mix(nightSide, day, blend);
      // Rosy twilight band along the terminator.
      color += vec3(0.35, 0.12, 0.05) * (1.0 - abs(light) / 0.12) * step(abs(light), 0.12) * 0.5;
      gl_FragColor = vec4(color, 1.0);
    }`,
});

const globe = new Globe($('globe'), { animateIn: true })
  .backgroundImageUrl('/img/night-sky.png')
  .globeMaterial(dayNight)
  .showAtmosphere(true)
  .atmosphereColor('#9fc7ff')
  .atmosphereAltitude(0.2)
  .pointOfView({ lat: 50, lng: 0, altitude: 2.6 })
  // Stops
  .pointLat('lat').pointLng('lng')
  .pointAltitude((p) => (p.visited ? 0.012 : 0.004))
  .pointRadius((p) => (p.visited ? 0.32 : 0.16))
  .pointColor((p) => (p.visited ? '#ffd257' : 'rgba(255,255,255,0.75)'))
  .pointsTransitionDuration(0)
  .pointLabel((p) => stopTooltip(p))
  // Santa's path so far (solid) and the route still ahead (dashed)
  .pathPoints('coords').pathPointLat((c) => c[0]).pathPointLng((c) => c[1])
  .pathColor((p) => p.color)
  .pathStroke((p) => p.stroke)
  .pathDashLength((p) => p.dash)
  .pathDashGap((p) => p.gap)
  .pathDashAnimateTime((p) => p.animate)
  .pathTransitionDuration(0)
  .pathResolution(1)
  // Pulsing ring on the next stop
  .ringColor(() => (t) => `rgba(255,70,70,${1 - t})`)
  .ringMaxRadius(3.5)
  .ringPropagationSpeed(2.5)
  .ringRepeatPeriod(900)
  ;

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

function resize() {
  globe.width(window.innerWidth).height(window.innerHeight);
  // On phones the tracker panel covers the bottom, so lift the globe up.
  globe.globeOffset([0, window.innerWidth <= 640 ? -window.innerHeight * 0.2 : 0]);
}
window.addEventListener('resize', resize);
resize();

// ---------- Camera ----------
// 'follow': globe view that keeps Santa centred. 'free': the user spins the
// globe. 'sleigh': a chase camera riding just behind the sleigh.
let camMode = 'follow';
let camYaw = 0;
const followBtn = $('follow-btn');
const sleighBtn = $('sleighcam-btn');
function setCamMode(mode) {
  const leavingSleigh = camMode === 'sleigh' && mode !== 'sleigh';
  camMode = mode;
  lastVisited = -2;
  followBtn.classList.toggle('active', mode === 'follow');
  followBtn.textContent = mode === 'follow' ? '🎯 Following Santa' : '🎯 Follow Santa';
  sleighBtn.classList.toggle('active', mode === 'sleigh');
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
  if (!visible) return;
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
}

// ---------- Route layers ----------
let lastVisited = -1;
let lastRouteYear = null;

function stopTooltip(p) {
  const when = new Date(p.arrive).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const gifts = p.visited ? `<br>🎁 ${Math.round(p.gifts).toLocaleString()} gifts delivered` : '';
  return `<div class="tip"><b>${p.name}</b><br>${p.region}<br>${p.visited ? 'Visited' : 'Arrives'} ${when} (your time)${gifts}</div>`;
}

function updateRouteLayers(state, force) {
  if (!force && state.visited === lastVisited && schedule.year === lastRouteYear) return;
  lastVisited = state.visited;
  lastRouteYear = schedule.year;
  const stops = schedule.points.slice(1, -1);
  stops.forEach((p) => { p.visited = p.index <= state.visited && state.phase !== 'prelaunch'; });
  // Stop markers turn into big pillars up close, so the sleigh cam hides them.
  globe.pointsData(camMode === 'sleigh' ? [] : stops);

  const next = state.next && !state.next.home ? state.next : null;
  globe.ringsData(next ? [next] : []);

  const final = schedule.finalStop;
  setTag(tags.pole, schedule.points[0], '❄️ North Pole');
  setTag(tags.next, next && next !== final ? next : null, next ? `➡️ Next: ${next.name}` : '');
  setTag(tags.final, final, next === final ? `🏁 Next & final: ${final.name}` : `🏁 Final stop: ${final.name}`);
  updatePaths(state);
}

function updatePaths(state) {
  const pts = schedule.points;
  const done = state.phase === 'prelaunch' ? [] : pts.slice(0, state.visited + 1).map((p) => [p.lat, p.lng]);
  const here = [state.lat, state.lng];
  const paths = [];
  if (done.length) paths.push({ coords: [...done, here], color: ['#ff4d4d', '#ffd257'], stroke: 0.6, dash: 1, gap: 0, animate: 0 });
  if ($('route-toggle').checked && state.phase !== 'landed') {
    const ahead = pts.slice(state.visited + 1).map((p) => [p.lat, p.lng]);
    paths.push({ coords: [here, ...ahead], color: 'rgba(255,255,255,0.35)', stroke: 0.25, dash: 0.4, gap: 0.6, animate: 0 });
  }
  globe.pathsData(paths);
}
$('route-toggle').addEventListener('change', () => updateRouteLayers(santaState(schedule, clock.now()), true));

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
const place = (p) => (p.home ? 'the North Pole' : `${p.name}, ${p.region}`);
const metric = !['en-US', 'en-LR', 'my'].includes(navigator.language);
const fmtDist = (km) => (metric ? `${fmtInt(km)} km` : `${fmtInt(km * 0.621371)} mi`);
const fmtSpeed = (kmh) => (metric ? `${fmtInt(kmh)} km/h` : `${fmtInt(kmh * 0.621371)} mph`);

function renderPanel(state, t) {
  const { phase } = state;
  document.body.dataset.phase = phase;
  $('mode-badge').textContent = clock.demo ? 'DEMO' : phase === 'prelaunch' ? 'COUNTDOWN' : phase === 'landed' ? 'HOME' : 'LIVE';
  $('mode-badge').className = `badge ${clock.demo ? 'demo' : phase === 'prelaunch' || phase === 'landed' ? 'idle' : 'live'}`;
  $('clock').textContent = new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

  let status;
  if (phase === 'prelaunch') status = 'Santa is at the North Pole getting the sleigh ready.';
  else if (phase === 'landed') status = 'Santa is safely home at the North Pole. Merry Christmas!';
  else if (phase === 'delivering') status = `Delivering presents in <b>${place(state.current)}</b>`;
  else status = `Flying from <b>${place(state.prev)}</b> to <b>${place(state.next)}</b>`;
  $('status').innerHTML = status;

  $('location').textContent = phase === 'flying'
    ? `${Math.abs(state.lat).toFixed(2)}°${state.lat >= 0 ? 'N' : 'S'}, ${Math.abs(state.lng).toFixed(2)}°${state.lng >= 0 ? 'E' : 'W'}`
    : place(state.current || (phase === 'prelaunch' || phase === 'landed' ? schedule.points[0] : state.prev));

  if (state.next) {
    $('next-stop').textContent = place(state.next);
    $('next-eta').textContent = `Arrives in ${fmtDuration(state.next.arrive - t)} · ${fmtTime(state.next.arrive)} your time`;
  } else {
    $('next-stop').textContent = 'Home sweet home';
    $('next-eta').textContent = 'All stops complete';
  }
  const final = schedule.finalStop;
  $('final-stop').textContent = place(final);
  $('final-eta').textContent = t < final.arrive
    ? `In ${fmtDuration(final.arrive - t)}, then home to the North Pole`
    : t < schedule.landing ? `Delivered! Landing at the North Pole in ${fmtDuration(schedule.landing - t)}` : 'Delivered!';

  const totalStops = schedule.points.length - 2;
  const visited = phase === 'prelaunch' ? 0 : Math.min(totalStops, state.visited);
  $('stops-count').textContent = `${visited} / ${totalStops}`;
  $('distance').textContent = fmtDist(state.distance);
  $('speed').textContent = phase === 'flying' ? fmtSpeed(state.speed) : phase === 'delivering' ? 'Landed' : '0';
  $('cookies').textContent = fmtInt(state.gifts / 2650);
  $('progress-bar').style.width = `${(visited / totalStops) * 100}%`;

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
    ? recent.map((p) => `<li><span class="log-place">${p.name}<small>${p.region}</small></span><span class="log-gifts">🎁 ${fmtInt(p.gifts)}</span></li>`).join('')
    : '<li class="empty">No stops yet. Santa takes off on Christmas Eve.</li>';
}

function renderCountdown(state, t) {
  const overlay = $('countdown');
  if (clock.demo || (state.phase !== 'prelaunch' && state.phase !== 'landed')) { overlay.hidden = true; return; }
  overlay.hidden = overlayDismissed;
  $('mini-countdown').hidden = !overlayDismissed;
  if (state.phase === 'prelaunch') {
    $('cd-title').textContent = 'Santa launches from the North Pole in';
    const ms = schedule.takeoff - t;
    const s = Math.max(0, Math.floor(ms / 1000));
    $('cd-days').textContent = Math.floor(s / 86400);
    $('cd-hours').textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    $('cd-mins').textContent = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    $('cd-secs').textContent = String(s % 60).padStart(2, '0');
    $('cd-sub').textContent = `Takeoff: ${new Date(schedule.takeoff).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} your time`;
    $('mini-countdown').textContent = `🚀 Takeoff in ${fmtDuration(ms)}`;
  } else {
    $('cd-title').textContent = 'Santa made it home!';
    $('cd-days').textContent = '🎄';
    $('cd-hours').textContent = $('cd-mins').textContent = $('cd-secs').textContent = '--';
    $('cd-sub').textContent = `${fmtInt(state.gifts)} gifts delivered to ${schedule.points.length - 2} stops. See you next Christmas Eve!`;
    $('mini-countdown').textContent = '🎄 Santa is home';
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
  clock.demoTime = schedule.takeoff - 20e3;
  document.body.classList.add('demo');
  $('scrub').min = schedule.takeoff - 60e3;
  $('scrub').max = schedule.landing + 60e3;
  if (camMode === 'free') setCamMode('follow');
  lastVisited = lastLogVisited = -2;
  setSpeed(clock.speed);
}
function stopDemo() {
  clock.demo = false;
  document.body.classList.remove('demo');
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
  $('demo-play').textContent = clock.paused ? '▶' : '⏸';
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
    out.innerHTML = `Your nearest stop is <b>${nearest.name}</b> (${fmtDist(distanceKm(me, nearest))} away). Santa arrives around <b>${new Date(nearest.arrive).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b> your time. Be asleep!`;
  }, () => { out.textContent = 'We couldn’t get your location, but Santa arrives everywhere around local midnight.'; }, { timeout: 10000 });
});

// ---------- Animation loop ----------
const tmp = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion() };
const vec = (c) => new THREE.Vector3(c.x, c.y, c.z);
let lastFrame = performance.now();
let lastPanel = 0;
let lastPath = 0;
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
  const t = clock.now();
  if (!clock.demo && seasonYear(t) !== schedule.year) schedule = buildSchedule(seasonYear(t));
  const state = santaState(schedule, t);

  // Sun and clouds
  const sun = sunPosition(t);
  dayNight.uniforms.sunDirection.value.copy(vec(globe.getCoords(sun.lat, sun.lng, 0)));
  clouds.rotation.y += dt * 0.004;

  // Camera distance decides how big Santa is drawn, so he stays visible from space.
  const camDist = globe.camera().position.length();
  const scale = camMode === 'sleigh' ? 0.8 : THREE.MathUtils.clamp((camDist - R) * 0.018, 0.12, 5);
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
  const moving = state.phase === 'flying';
  sleigh.animate(elapsed, moving);

  // Sparkles stream off the back of the sleigh while it flies.
  if (moving || state.phase === 'delivering') {
    const back = tmp.pos.clone().add(tmp.fwd.clone().multiplyScalar(-1.2 * scale));
    for (let i = 0; i < (moving ? 3 : 1); i++) trail.emit(back, scale * (moving ? 0.6 : 1.5));
  }
  trail.update(dt, scale * 0.6);

  // Keep the camera on Santa, easing toward him; the user's zoom is kept.
  if (camMode === 'sleigh') {
    const cam = globe.camera();
    const back = tmp.fwd.clone().applyAxisAngle(tmp.up, camYaw);
    const want = tmp.pos.clone().addScaledVector(back, -6.5).addScaledVector(tmp.up, 2.6);
    const look = tmp.pos.clone().addScaledVector(tmp.fwd, 3).addScaledVector(tmp.up, 0.3);
    const k = Math.min(1, dt * 3);
    if (cam.position.distanceTo(want) > 40) cam.position.copy(want);
    else cam.position.lerp(want, k);
    cam.up.copy(tmp.up);
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
  const pinOpacity = camMode === 'sleigh' ? 0 : THREE.MathUtils.clamp((camDist - R * 1.5) / (R * 0.6), 0, 1);
  placeTag(tags.santa, tmp.pos, pinOpacity);
  for (const el of [tags.pole, tags.next, tags.final]) {
    if (el.point) placeTag(el, vec(globe.getCoords(el.point.lat, el.point.lng, 0.01)), camMode === 'sleigh' ? 0.85 : 1);
    else el.style.opacity = 0;
  }

  $('gifts').textContent = fmtInt(state.gifts);
  if (nowMs - lastPanel > 200) {
    lastPanel = nowMs;
    renderPanel(state, t);
    updateRouteLayers(state);
  }
  if (nowMs - lastPath > 1000 && state.phase === 'flying') {
    lastPath = nowMs;
    updatePaths(state);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

startSnow($('snow'));
