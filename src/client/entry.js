import { broadcast, scene, hasWebGL } from './mode.js';

if (broadcast) {
  document.documentElement.classList.add('broadcast');
  document.body.classList.add('broadcast', `scene-${scene}`);
}

// The "be right back" and ending scenes are plain cards, so they skip the 3D
// globe entirely and load instantly. So does a device without WebGL.
if (broadcast && (scene === 'brb' || scene === 'end')) {
  import('./cards.js').then((m) => m.start(scene));
} else if (!hasWebGL()) {
  import('./cards.js').then((m) => m.start('lite'));
} else {
  import('./main.js');
}
