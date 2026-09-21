// Aiming on the board, by touch.
//
// This was a slingshot: pull back and the marble launched the other way. That is the Angry Birds
// metaphor and it is the wrong one for a marble, which you flick FORWARD -- the first person to
// play it said "I have to move left to strike right", which is exactly what a slingshot does.
//
// Now it is direct: put a finger on the board and the aim line points from your striker at your
// finger. Drag it around and the line sweeps with it. Nothing to invert, nothing to learn, and
// you can aim straight at the marble you want to hit. Power is not in this gesture at all -- it
// belongs to the SHOOT meter, where it is visible.
import { STRIKERS, dist } from './physics.js';
import { toWorld } from './render.js';

/** Where the marble goes if nothing is in the way -- the assist line, drawn under the marbles. */
export function predictPath(marbles, origin, angle, power, strikerId, assist = 1) {
  const me = marbles.find((m) => m.id === strikerId);
  const spec = STRIKERS[me?.striker] || STRIKERS.goli;
  const v0 = power * spec.maxSpeed;
  // me.decel carries the surface, so the assist line shortens on rough ground by itself.
  const range = ((v0 * v0) / (2 * (me?.decel || spec.decel))) * Math.max(0.2, assist);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const pts = [{ x: origin.x, y: origin.y }];
  for (let d = 0.012; d <= range; d += 0.012) {
    const x = origin.x + ux * d, y = origin.y + uy * d;
    pts.push({ x, y });
    for (const o of marbles) {
      if (o.id === strikerId || o.out || o.inPill) continue;
      if (dist(x, y, o.x, o.y) < o.r + (me?.r || 0.014)) return pts;
    }
  }
  return pts;
}

/** The first marble the aim line runs into -- the one the power guidance is about. */
export function firstOnLine(marbles, origin, angle, strikerId) {
  const me = marbles.find((m) => m.id === strikerId);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  for (let d = 0.012; d <= 2.2; d += 0.012) {
    const x = origin.x + ux * d, y = origin.y + uy * d;
    for (const o of marbles) {
      if (o.id === strikerId || o.out || o.inPill) continue;
      if (dist(x, y, o.x, o.y) < o.r + (me?.r || 0.014)) return o;
    }
  }
  return null;
}

/**
 * @param canvas
 * @param api { isActive, origin, onAngle(rad), onDragging(bool) }
 */
export function attachInput(canvas, api) {
  let id = null;

  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return toWorld(e.clientX - r.left, e.clientY - r.top);
  };
  const point = (e) => {
    const w = at(e), o = api.origin();
    const dx = w.x - o.x, dy = w.y - o.y;
    if (Math.hypot(dx, dy) < 0.02) return;      // too close to the striker to mean a direction
    api.onAngle(Math.atan2(dy, dx));
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!api.isActive() || id !== null) return;
    id = e.pointerId;
    try { canvas.setPointerCapture(id); } catch {}
    e.preventDefault();
    api.onDragging(true);
    point(e);
  });

  // On the window, not the canvas: aiming at something near the bottom of the board puts a
  // thumb past the canvas edge, and canvas-only listeners stop tracking there mid-sweep.
  addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    e.preventDefault();
    point(e);
  }, { passive: false });

  const end = (e) => { if (e.pointerId === id) { id = null; api.onDragging(false); } };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);

  // iOS: no pinch, no double-tap zoom, no rubber-banding over the board
  ['gesturestart', 'gesturechange', 'touchmove'].forEach((n) =>
    canvas.addEventListener(n, (ev) => ev.preventDefault(), { passive: false }));
}
