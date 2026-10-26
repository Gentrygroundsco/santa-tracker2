import { STOPS, NORTH_POLE } from './route.js';

const MIN = 60e3;
const HOUR = 60 * MIN;
const EARTH_RADIUS_KM = 6371;
export const TOTAL_GIFTS = 7_300_000_000;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Point a fraction `f` of the way along the great circle from a to b.
export function interpolate(a, b, f) {
  const φ1 = toRad(a.lat), λ1 = toRad(a.lng), φ2 = toRad(b.lat), λ2 = toRad(b.lng);
  const d = distanceKm(a, b) / EARTH_RADIUS_KM;
  if (d < 1e-9) return { lat: a.lat, lng: a.lng };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lng: toDeg(Math.atan2(y, x)) };
}

// Midnight on Christmas morning, local time, for a given UTC offset.
const localMidnight = (year, offset) => Date.UTC(year, 11, 25) - offset * HOUR;

// Santa reaches every stop at about local midnight. Stops that share a time
// zone are spread across the time before the next zone starts (at most an hour).
export function buildSchedule(year) {
  const stops = STOPS.map(([name, region, lat, lng, offset, pop]) => {
    // Unwrap longitudes across the date line so "east to west" works there.
    let sortLng = lng;
    if (offset > 6 && lng < 0) sortLng += 360;
    if (offset < -6 && lng > 0) sortLng -= 360;
    return { name, region, lat, lng, offset, pop, sortLng };
  });

  const offsets = [...new Set(stops.map((s) => s.offset))].sort((a, b) => b - a);
  const ordered = [];
  offsets.forEach((offset, i) => {
    const start = localMidnight(year, offset);
    const next = i + 1 < offsets.length ? localMidnight(year, offsets[i + 1]) : start + HOUR;
    const window = Math.min(HOUR, next - start);
    // Sweep each time zone north to south (or south to north), whichever end
    // is closer to where Santa just was, so the route doesn't zig-zag.
    const group = stops.filter((s) => s.offset === offset).sort((a, b) => b.lat - a.lat || b.sortLng - a.sortLng);
    const prev = ordered[ordered.length - 1] || NORTH_POLE;
    if (distanceKm(prev, group[group.length - 1]) < distanceKm(prev, group[0])) group.reverse();
    const slot = window / group.length;
    group.forEach((s, j) => {
      s.arrive = start + j * slot;
      s.depart = s.arrive + Math.min(slot * 0.4, 3 * MIN);
      ordered.push(s);
    });
  });

  const totalPop = ordered.reduce((sum, s) => sum + s.pop, 0);
  const takeoff = Date.UTC(year, 11, 24, 9);
  const last = ordered[ordered.length - 1];
  const landing = last.depart + 45 * MIN;

  // Points: North Pole (takeoff), every stop, North Pole (landing).
  const points = [
    { ...NORTH_POLE, arrive: takeoff, depart: takeoff, home: true },
    ...ordered,
    { ...NORTH_POLE, arrive: landing, depart: landing, home: true },
  ];

  let gifts = 0;
  let dist = 0;
  points.forEach((p, i) => {
    p.index = i;
    if (i > 0) dist += distanceKm(points[i - 1], p);
    gifts += p.home ? 0 : Math.round((p.pop / totalPop) * TOTAL_GIFTS);
    p.giftsCum = gifts;
    p.distCum = dist;
    p.gifts = i > 0 ? p.giftsCum - points[i - 1].giftsCum : 0;
  });

  return { year, takeoff, landing, points, finalStop: last };
}

// The season shown at time t: this Christmas until Dec 26 (UTC), then next year's.
export function seasonYear(t) {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  return t >= Date.UTC(y, 11, 26) ? y + 1 : y;
}

// Index of the last point whose arrival is <= t.
function lastArrived(points, t) {
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].arrive <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function santaState(schedule, t) {
  const { points, takeoff, landing } = schedule;
  const home = points[0];

  if (t < takeoff) {
    return { phase: 'prelaunch', lat: home.lat, lng: home.lng, gifts: 0, distance: 0, speed: 0,
      visited: 0, next: points[1], prev: home, heading: points[1] };
  }
  if (t >= landing) {
    const end = points[points.length - 1];
    return { phase: 'landed', lat: end.lat, lng: end.lng, gifts: end.giftsCum, distance: end.distCum, speed: 0,
      visited: points.length - 2, next: null, prev: points[points.length - 2], heading: end };
  }

  const i = lastArrived(points, t);
  const p = points[i];
  const next = points[i + 1];
  // Gifts for a stop are handed out steadily from leaving the previous stop to leaving this one.
  const giftsBetween = (from, to) => {
    const f = Math.min(1, Math.max(0, (t - from.depart) / (to.depart - from.depart || 1)));
    return from.giftsCum + f * (to.giftsCum - from.giftsCum);
  };

  if (t < p.depart) {
    // Delivering at stop p.
    return { phase: 'delivering', lat: p.lat, lng: p.lng, gifts: giftsBetween(points[i - 1], p),
      distance: p.distCum, speed: 0, visited: i, current: p, next, prev: points[i - 1], heading: next };
  }

  // Flying from p to next.
  const f = (t - p.depart) / (next.arrive - p.depart);
  const pos = interpolate(p, next, f);
  const legKm = next.distCum - p.distCum;
  return { phase: 'flying', lat: pos.lat, lng: pos.lng, gifts: giftsBetween(p, next),
    distance: p.distCum + f * legKm, speed: legKm / ((next.arrive - p.depart) / HOUR),
    visited: i, next, prev: p, heading: next, legFraction: f };
}

// Subsolar point, for the day/night shading on the globe.
export function sunPosition(t) {
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const day = (t - start) / 86400e3;
  const g = (2 * Math.PI / 365) * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  let lng = -(utcMinutes + eqTime - 720) / 4;
  lng = ((lng + 540) % 360) - 180;
  return { lat: toDeg(decl), lng };
}
