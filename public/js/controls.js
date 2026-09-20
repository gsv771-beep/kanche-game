// Button controls: the discoverable scheme, and the default.
//
// The drag gesture is nicer once you know it, but it shows nothing until you already know what
// to do, and on a phone it can run off the edge of the board mid-pull. Buttons cannot fail to
// be found, work one-handed, and need no gesture at all.
//
// The meter is the three-tap golf/Stick Cricket pattern, which is decades old because it works:
//   tap 1  SHOOT     -- a marker starts sweeping across the bar
//   tap 2  POWER     -- locks how hard you hit; the marker turns and runs back
//   tap 3  RELEASE   -- tap inside the green band for a true line; miss it and the shot pulls
// Two decisions, one button, and every bit of state is on screen.

const POWER_MS = 1150;        // a full sweep of the bar
const ACC_MS = 720;           // the return run -- faster, because this is the skill
const BAND = 0.075;           // half-width of the green band, as a fraction of the bar
export const MAX_PULL = 7 * Math.PI / 180;   // worst-case angular error on a badly timed release
const STEP = 2.2 * Math.PI / 180;            // one tap of an aim arrow
const SWEEP = 34 * Math.PI / 180;            // per second, holding an aim arrow down

export function createControls() {
  return { angle: -Math.PI / 2, stage: 'idle', power: 0, marker: 0, t0: 0, acc: 0, held: 0 };
}

export const nudge = (c, dir) => { c.angle += dir * STEP; };
export const sweep = (c, dir, dt) => { c.angle += dir * SWEEP * dt; };

/** Advance the meter. Returns true while a shot is being set up. */
export function tick(c, now) {
  if (c.stage === 'power') {
    // ping-pong so a mistimed tap is never punished by having to wait for a wrap-around
    const u = ((now - c.t0) % (POWER_MS * 2)) / POWER_MS;
    c.marker = u <= 1 ? u : 2 - u;
    return true;
  }
  if (c.stage === 'accuracy') {
    const u = Math.min(1, (now - c.t0) / ACC_MS);
    c.marker = c.power * (1 - u);
    if (u >= 1) { c.stage = 'late'; c.acc = c.power; }   // never tapped: worst case
    return true;
  }
  return c.stage === 'late';
}

/**
 * One press of SHOOT. Returns a shot once the third tap lands, otherwise null.
 * The angular error is derived here and folded into the shot, so the record still replays.
 */
export function press(c, now) {
  if (c.stage === 'idle') { c.stage = 'power'; c.t0 = now; c.marker = 0; return null; }
  if (c.stage === 'power') {
    c.power = Math.max(0.08, c.marker);
    c.stage = 'accuracy'; c.t0 = now;
    return null;
  }
  if (c.stage === 'accuracy' || c.stage === 'late') {
    c.acc = c.marker;
    c.stage = 'idle';
    // The band sits at zero -- the marker's home. Distance from it is how late you were.
    const miss = Math.max(0, Math.abs(c.acc) - BAND) / Math.max(0.0001, c.power);
    return { power: c.power, missed: miss, band: Math.abs(c.acc) <= BAND };
  }
  return null;
}

export const inBand = (c) => c.stage === 'accuracy' && Math.abs(c.marker) <= BAND;
export const bandWidth = BAND;
export const cancel = (c) => { c.stage = 'idle'; c.marker = 0; c.power = 0; };
