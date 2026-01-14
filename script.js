/**
 * CloseLogic Landing — Top-left reference recreation
 * Output file: script.js
 *
 * Motion requirements:
 * - Subtle parallax on mouse move (no aggressive motion)
 * - Hover: charts gently lift (handled in CSS) + gold glow intensifies
 * - Ambient float loop is CSS (6–8s)
 */

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('holoFrame');
  if (!frame) return;

  if (prefersReducedMotion()) {
    // Respect OS-level motion preference.
    return;
  }

  let raf = 0;

  function setVarsFromPointer(clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (clientX - cx) / rect.width;  // -0.5..0.5-ish
    const dy = (clientY - cy) / rect.height; // -0.5..0.5-ish

    // Keep it extremely subtle
    const maxPx = 6;     // translate in px
    const maxRot = 1.2;  // rotate in degrees

    const px = Math.max(-maxPx, Math.min(maxPx, dx * maxPx * 2));
    const py = Math.max(-maxPx, Math.min(maxPx, dy * maxPx * 2));
    const rx = Math.max(-maxRot, Math.min(maxRot, -dy * maxRot * 2));
    const ry = Math.max(-maxRot, Math.min(maxRot, dx * maxRot * 2));

    frame.style.setProperty('--px', px.toFixed(2));
    frame.style.setProperty('--py', py.toFixed(2));
    frame.style.setProperty('--rx', rx.toFixed(2));
    frame.style.setProperty('--ry', ry.toFixed(2));

    // Gold glow origin (percentage)
    const gx = ((clientX - rect.left) / rect.width) * 100;
    const gy = ((clientY - rect.top) / rect.height) * 100;
    frame.style.setProperty('--gx', `${gx.toFixed(1)}%`);
    frame.style.setProperty('--gy', `${gy.toFixed(1)}%`);
  }

  function onMove(e) {
    if (raf) return;
    const { clientX, clientY } = e;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      setVarsFromPointer(clientX, clientY);
    });
  }

  function onEnter() {
    frame.classList.add('is-hover');
  }

  function onLeave() {
    frame.classList.remove('is-hover');
    frame.style.setProperty('--px', '0');
    frame.style.setProperty('--py', '0');
    frame.style.setProperty('--rx', '0');
    frame.style.setProperty('--ry', '0');
    frame.style.setProperty('--gx', '50%');
    frame.style.setProperty('--gy', '50%');
  }

  frame.addEventListener('mousemove', onMove, { passive: true });
  frame.addEventListener('mouseenter', onEnter);
  frame.addEventListener('mouseleave', onLeave);
});


