// Views without the 3D globe: the "be right back" and ending scenes for OBS,
// and a simple live status page for devices that can't show WebGL.
import { buildSchedule, santaState, seasonYear } from './schedule.js';
import { clock, keepClockSynced } from './clock.js';
import { createBroadcast } from './broadcast.js';
import { fmtInt, fmtDuration, place } from './format.js';

const $ = (id) => document.getElementById(id);

export function start(kind) {
  keepClockSynced();
  document.body.classList.add('cards');
  $('loading').classList.add('done');
  let schedule = buildSchedule(seasonYear(clock.now()));

  if (kind === 'lite') {
    $('lite').hidden = false;
    const render = () => {
      const t = clock.now();
      if (seasonYear(t) !== schedule.year) schedule = buildSchedule(seasonYear(t));
      const state = santaState(schedule, t);
      $('lite-gifts').textContent = fmtInt(state.gifts);
      $('lite-status').textContent = state.phase === 'prelaunch' ? `Santa takes off in ${fmtDuration(schedule.takeoff - t)}`
        : state.phase === 'landed' ? 'Santa is home at the North Pole'
        : state.phase === 'delivering' ? `Delivering gifts in ${place(state.current)}`
        : `Flying to ${place(state.next)}`;
      $('lite-next').textContent = state.next ? `Next stop: ${place(state.next)}, in ${fmtDuration(state.next.arrive - t)}` : '';
    };
    render();
    setInterval(render, 250);
    return;
  }

  const bc = createBroadcast({ scene: kind });
  let last = performance.now();
  const frame = (nowMs) => {
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const t = clock.now();
    if (seasonYear(t) !== schedule.year) schedule = buildSchedule(seasonYear(t));
    bc.frame(santaState(schedule, t), t, schedule, dt, nowMs);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
