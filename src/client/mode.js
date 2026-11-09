// How this page was opened: the public website, or a broadcast view for OBS
// (/broadcast?scene=...).
const params = new URLSearchParams(location.search);

export const broadcast = location.pathname.replace(/\/+$/, '') === '/broadcast' || params.has('broadcast');
export const SCENES = ['auto', 'globe', 'cam', 'countdown', 'brb', 'end'];
const asked = (params.get('scene') || 'auto').toLowerCase();
export const scene = broadcast && SCENES.includes(asked) ? asked : 'auto';

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
