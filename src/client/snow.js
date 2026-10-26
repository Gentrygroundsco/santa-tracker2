// Gentle snowfall drawn on a 2D canvas over the globe.
export function startSnow(canvas) {
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let flakes = [];
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = reduceMotion ? 0 : Math.min(140, Math.round((canvas.width * canvas.height) / 14000));
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 0.6 + Math.random() * 2.2,
      v: 15 + Math.random() * 35,
      drift: Math.random() * Math.PI * 2,
    }));
  };
  window.addEventListener('resize', resize);
  resize();
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const f of flakes) {
      f.y += f.v * dt;
      f.drift += dt;
      f.x += Math.sin(f.drift) * 12 * dt;
      if (f.y > canvas.height + 5) { f.y = -5; f.x = Math.random() * canvas.width; }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
