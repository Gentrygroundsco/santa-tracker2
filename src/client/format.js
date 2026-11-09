// Formatting shared by the website and the broadcast views.
const KM_TO_MI = 0.621371;

export const metric = !['en-US', 'en-LR', 'my'].includes(navigator.language);
export const fmtInt = (n) => Math.floor(n).toLocaleString('en-US');
export const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec.toString().padStart(2, '0')}s`;
};
export const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const place = (p) => (p.home ? 'North Pole' : `${p.name}, ${p.region}`);
export const fmtDist = (km) => (metric ? `${fmtInt(km)} km` : `${fmtInt(km * KM_TO_MI)} mi`);
export const fmtSpeed = (kmh) => (metric ? `${fmtInt(kmh)} km/h` : `${fmtInt(kmh * KM_TO_MI)} mph`);
// Both units, for a worldwide audience.
export const fmtDistBoth = (km) => `${fmtInt(km)} km · ${fmtInt(km * KM_TO_MI)} mi`;
export const fmtSpeedBoth = (kmh) => `${fmtInt(kmh)} km/h · ${fmtInt(kmh * KM_TO_MI)} mph`;

// Wall-clock time at a UTC offset, e.g. "12:04 AM".
export const fmtClock = (t, offsetHours) => {
  const d = new Date(t + offsetHours * 3600e3);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ampm}`;
};
export const fmtZone = (offset) => {
  if (offset === 0) return 'UTC';
  const sign = offset > 0 ? '+' : '−';
  const a = Math.abs(offset);
  const m = Math.round((a % 1) * 60);
  return `UTC${sign}${Math.floor(a)}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
};
export const coords = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;

// The time zone Santa is in: the stop he is at, or the one he is flying to.
export const santaZone = (state) => {
  const stop = state.current || (state.phase === 'flying' && !state.next.home ? state.next : null);
  return stop ? stop.offset : 0;
};
