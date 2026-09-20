// The shot gesture. One drag does all three jobs a real flick does: line, power, and a clean
// release.
//
// Press ANYWHERE and drag back -- not on the marble. On a phone your thumb covers whatever it
// touches, and the marble is the one thing you need to see. Aim is relative to where you landed.
//
// The skill layer is the steadiness ring: wide the instant you touch, tightening to a dot as you
// settle (~340ms), holding steady for a beat, then shaking wider again because your hand tires.
// Release inside the tight window and the marble goes exactly where the line says. Release early
// or late and it pulls, by an angle proportional to how wide the ring was.
import { STRIKERS, dist } from './physics.js';
import { toWorld, pxPerM } from './render.js';

const SETTLE = 340, WINDOW = 620;   // ms
const BIG = 0.085, TIGHT = 0.011, MAXR = 0.10;   // ring radius, metres
export const FOUL_AT = 0.92;        // drag past this and the thumb lifts: foul

export function steadiness(heldMs) {
  if (heldMs < SETTLE) return BIG + (TIGHT - BIG) * (heldMs / SETTLE);
  if (heldMs < SETTLE + WINDOW) return TIGHT;
  const over = (heldMs - SETTLE - WINDOW) / 1000;
  const wobble = Math.sin(heldMs / 90) * 0.006 * Math.min(1, over * 2);
  return Math.min(MAXR, TIGHT + over * 0.075 + Math.abs(wobble));
}
/** How far a release at this steadiness pulls the shot, as a standard deviation in radians. */
export const spreadFor = (steady) => Math.max(0, steady - TIGHT) * 1.45;
export const inWindow = (steady) => steady <= TIGHT * 1.4;

/** Where the marble actually goes if nothing is in the way -- for the aim assist line. */
export function predictPath(marbles, origin, angle, power, strikerId, assist = 1) {
  const me = marbles.find((m) => m.id === strikerId);
  const spec = STRIKERS[me?.striker] || STRIKERS.goli;
  const v0 = power * spec.maxSpeed;
  const range = (v0 * v0) / (2 * spec.decel) * Math.max(0.2, assist);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const pts = [{ x: origin.x, y: origin.y }];
  const step = 0.012;
  for (let d = step; d <= range; d += step) {
    const x = origin.x + ux * d, y = origin.y + uy * d;
    pts.push({ x, y });
    for (const o of marbles) {
      if (o.id === strikerId || o.out || o.inPill) continue;
      if (dist(x, y, o.x, o.y) < o.r + (me?.r || 0.0085)) return pts;
    }
  }
  return pts;
}

/**
 * @param canvas
 * @param api { isActive, origin, strikerId, marbles, assist, onShoot(shot), onAim(state) }
 */
export function attachInput(canvas, api) {
  let p0 = null, p = null, t0 = 0, id = null;

  const maxDrag = () => Math.min(canvas.clientWidth, canvas.clientHeight) * 0.36;

  function aimNow() {
    if (!p0) return null;
    const dx = p.x - p0.x, dy = p.y - p0.y;
    const len = Math.hypot(dx, dy);
    const origin = api.origin();
    // Slingshot: pull back, it goes forward. Below a few px there is no line yet, so hold last.
    const angle = len > 6 ? Math.atan2(-dy, -dx) : (aimNow.last ?? -Math.PI / 2);
    aimNow.last = angle;
    const power = Math.min(1, len / maxDrag());
    const steady = steadiness(performance.now() - t0);
    return {
      x: origin.x, y: origin.y, angle, power, steady,
      inWindow: inWindow(steady), foulAt: FOUL_AT,
      path: predictPath(api.marbles(), origin, angle, power, api.strikerId(), api.assist()),
    };
  }

  const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', (e) => {
    if (!api.isActive() || id !== null) return;
    id = e.pointerId; p0 = p = pt(e); t0 = performance.now();
    // Capture can throw if the pointer is already gone; never let that skip the rest.
    try { canvas.setPointerCapture(id); } catch {}
    e.preventDefault();
    api.onAim(aimNow());
  });

  // Move and release listen on the WINDOW, not the canvas. Pulling back from a marble sitting
  // near the bottom of the board runs your thumb straight off the canvas and onto the footer
  // within about 60px -- on the canvas alone the drag would silently stop tracking there.
  addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    p = pt(e); e.preventDefault();
    api.onAim(aimNow());
  }, { passive: false });

  const release = (e) => {
    if (e.pointerId !== id) return;
    const a = aimNow();
    id = null; p0 = p = null;
    api.onAim(null);
    if (!a || a.power < 0.04) return;         // a tap is not a shot
    api.onShoot({ angle: a.angle, power: a.power, steady: a.steady, foul: a.power > FOUL_AT });
  };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', (e) => { if (e.pointerId === id) { id = null; p0 = p = null; api.onAim(null); } });

  // iOS: kill pinch/double-tap zoom over the board outright
  ['gesturestart', 'gesturechange', 'touchmove'].forEach((n) =>
    canvas.addEventListener(n, (e) => e.preventDefault(), { passive: false }));

  return { tick: () => { if (p0) api.onAim(aimNow()); } };
}
