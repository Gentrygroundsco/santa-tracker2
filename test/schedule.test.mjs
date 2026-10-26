import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, santaState, seasonYear, sunPosition, TOTAL_GIFTS } from '../src/client/schedule.js';

const s = buildSchedule(2026);
const stops = s.points.slice(1, -1);

test('route starts on Kiritimati at its local midnight and ends in the last time zone', () => {
  assert.equal(stops[0].name, 'Kiritimati');
  assert.equal(new Date(stops[0].arrive).toISOString(), '2026-12-24T10:00:00.000Z');
  assert.equal(s.finalStop.offset, -11);
  assert.ok(s.landing <= Date.UTC(2026, 11, 25, 13));
});

test('every stop is reached at about local midnight, in time order', () => {
  for (let i = 1; i < s.points.length; i++) {
    assert.ok(s.points[i].arrive >= s.points[i - 1].depart, `${s.points[i].name} out of order`);
  }
  for (const p of stops) {
    const localMinutes = (p.arrive / 60e3 + p.offset * 60) % 1440;
    assert.ok(localMinutes < 60, `${p.name} reached at ${localMinutes} min past local midnight`);
  }
});

test('gift counter reaches the total and never goes backwards', () => {
  let last = -1;
  for (let t = s.takeoff - 60e3; t <= s.landing + 60e3; t += 17e3) {
    const st = santaState(s, t);
    assert.ok(st.gifts >= last);
    assert.ok(Number.isFinite(st.lat) && Number.isFinite(st.lng));
    last = st.gifts;
  }
  assert.ok(Math.abs(last - TOTAL_GIFTS) < stops.length);
});

test('phases and season rollover', () => {
  assert.equal(santaState(s, Date.UTC(2026, 11, 1)).phase, 'prelaunch');
  assert.equal(santaState(s, Date.UTC(2026, 11, 26)).phase, 'landed');
  assert.equal(seasonYear(Date.UTC(2026, 9, 26)), 2026);
  assert.equal(seasonYear(Date.UTC(2026, 11, 26, 1)), 2027);
});

test('sun is over the southern hemisphere at Christmas', () => {
  const sun = sunPosition(Date.UTC(2026, 11, 25, 12));
  assert.ok(sun.lat < -23 && sun.lat > -24);
  assert.ok(Math.abs(sun.lng) < 2);
});

test('route sweeps each time zone instead of zig-zagging', () => {
  const total = s.points[s.points.length - 1].distCum;
  assert.ok(total < 450000, `route is ${Math.round(total)} km`);
});
