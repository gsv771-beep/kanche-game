// Deterministic marble simulation. Pure: no DOM, no Date, no Math.random.
//
// Given the same state and the same shot it always produces the same frames, on any engine.
// That single property buys three things: replays are just a list of shots, an online turn is
// ~30 bytes instead of a position dump, and a server can re-run a shot to check it.
//
// Units are real: metres, seconds, kilograms-ish (mass is relative, only ratios matter).

// The patch. This is ALSO the camera window -- render.js imports it rather than keeping its own
// copy, because when the two drifted apart the field was 26cm taller than the screen, exactly in
// the direction knocked-out marbles fly. Two marbles a shot came to rest where you could not see
// them, and a striker that landed there was impossible to aim. One rectangle, one source.
// Safe to widen: the camera fits by min(W/width, H/height), so the visible extent is always at
// least the field in both axes. Anything inside this rectangle is on screen on every device.
export const FIELD = { x0: -0.50, x1: 0.50, y0: -0.42, y1: 0.82 };
// The board is deliberately NOT to scale. A real 17mm kancha inside a 2.2ft ring is a 39:1
// ratio -- honest, and an unreadable dot on a phone. Everything here is tuned to ~19:1, which
// is what the game looks like in memory rather than in a photograph.
export const RING_R = 0.26;
export const SHOOT_LINE = 0.70;      // the lag line, three feet back in street terms
export const PILL_R = 0.030;         // the small hole dug for Pill Chot

// Striker kinds. The Dhampar is the whole risk/reward of the game, so its numbers are not
// cosmetic. A finger flick delivers roughly fixed ENERGY, not fixed momentum, so a heavier
// marble leaves slower by sqrt(m). Rolling deceleration falls with radius (a = C*g/r), so the
// big one keeps rolling once moving -- but it still cannot reach as far, and being fat and slow
// it parks inside the ring far more often, which is a lost marble under the foul rule.
export const STRIKERS = {
  goli:    { id: 'goli',    label: 'Goli',    r: 0.0140, mass: 1.00, maxSpeed: 5.60, decel: 5.20 },
  dhampar: { id: 'dhampar', label: 'Dhampar', r: 0.0190, mass: 2.48, maxSpeed: 3.55, decel: 3.84 },
};
export const POT_MARBLE = { r: 0.0140, mass: 1.00, decel: 5.20 };

/**
 * What you are playing on. Rolling deceleration is scaled by the surface, so the same flick
 * travels a different distance on each -- which changes every shot in every mode rather than
 * decorating the board.
 *
 * Mud is patches, not a global. Deliberately: they are drawn on the ground, so you can see them
 * and aim around them. Invisible variation -- "unpredictable bumps" -- reads as the game
 * cheating, which is exactly why the hidden steadiness ring had to go.
 */
export const SURFACES = {
  // The maidan is the baseline every number in this game was tuned against, so its friction is
  // exactly 1 and it has no mud. Difficulty belongs in the choice of ground, not in the default.
  maidan:    { id: 'maidan',    label: 'Dusty maidan',  blurb: 'Plain dirt. The ground everything else is measured against.',
               friction: 1.00, patches: 0, mud: 1,
               ground: ['#6b4a2f', '#7d5836', '#5d3f28'], grit: 700 },
  courtyard: { id: 'courtyard', label: 'Concrete aangan', blurb: 'Smooth and fast. Easy to reach, easy to overshoot the line.',
               friction: 0.66, patches: 0, mud: 1,
               ground: ['#6f6b64', '#837d74', '#565049'], grit: 2600 },
  barsaat:   { id: 'barsaat',   label: 'After the rain', blurb: 'Heavy going, and four mud patches. Anything that reaches one stops dead.',
               friction: 1.22, patches: 4, mud: 8,
               ground: ['#57452f', '#6a5539', '#413425'], grit: 900 },
};

const RESTITUTION = 0.93;   // glass on glass is very lively
const WALL_BOUNCE = 0.25;   // the edge of the patch is dirt, not a cushion
const DT = 1 / 240;         // fixed physics step; render frames are sampled every 4th step
const FRAME_EVERY = 4;
const REST_SPEED = 0.015;   // below this a marble is treated as stopped
const MAX_TIME = 9.0;

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * The power, 0..1, needed to knock `target` clear of the ring with a square hit from (fx, fy).
 * The same arithmetic the bot aims with -- it belongs on screen too. Without it the player has
 * no way to know that a shot which visibly HITS can still be too weak to score, which reads as
 * the game being broken rather than as the shot being soft.
 */
export function powerToClear(striker, target, ringR, fx, fy) {
  const spec = STRIKERS[striker.striker] || STRIKERS.goli;
  const dc = Math.hypot(target.x, target.y);
  const travel = Math.max(0.01, ringR + target.r - dc + 0.02);
  const vT = Math.sqrt(2 * target.decel * travel);
  const K = ((1 + RESTITUTION) * striker.mass) / (striker.mass + target.mass);
  const vImpact = vT / Math.max(K, 0.05);
  const L = dist(fx, fy, target.x, target.y);
  // striker.decel, not the spec's: that is the one the surface has been folded into.
  return Math.sqrt(vImpact * vImpact + 2 * striker.decel * L) / spec.maxSpeed;
}

/** A marble in play. `owner` is the player index that staked it; null for the pot. */
export function marble(id, x, y, opts = {}) {
  const spec = opts.striker ? STRIKERS[opts.striker] : POT_MARBLE;
  return {
    id, x, y, vx: 0, vy: 0,
    // The surface is baked into the marble's own deceleration, so every formula that already
    // reads marble.decel -- the aim assist, the power guidance, the bot's arithmetic -- accounts
    // for the ground without knowing the ground exists.
    r: spec.r, mass: spec.mass, decel: spec.decel * (opts.friction ?? 1),
    striker: opts.striker || null,
    owner: opts.owner ?? null,
    skin: opts.skin || 'kanch',
    out: false,      // latched: once it crosses the line it is out for good
    inPill: false,
    resting: true,
  };
}

function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy), min = a.r + b.r;
  if (d === 0 || d >= min) return 0;
  const nx = dx / d, ny = dy / d;

  // push apart by inverse mass so a Dhampar barely moves when a goli shoulders it
  const ima = 1 / a.mass, imb = 1 / b.mass, overlap = min - d;
  a.x -= nx * overlap * (ima / (ima + imb)); a.y -= ny * overlap * (ima / (ima + imb));
  b.x += nx * overlap * (imb / (ima + imb)); b.y += ny * overlap * (imb / (ima + imb));

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn > 0) return 0;                       // already separating
  const j = (-(1 + RESTITUTION) * vn) / (ima + imb);
  a.vx -= nx * j * ima; a.vy -= ny * j * ima;
  b.vx += nx * j * imb; b.vy += ny * j * imb;
  return Math.abs(vn);                        // impact speed, for the click sound
}

/**
 * Run one shot to rest.
 * @param marbles  live array (mutated copy is made internally)
 * @param shot     { id, angle, power, striker }  power 0..1, angle in radians
 * @param opts     { pill: bool, ringR }
 * @returns { frames, events, marbles }  frames are flat [x,y,...] at 60fps for playback
 */
export function simulate(marbles, shot, opts = {}) {
  const ringR = opts.ringR ?? RING_R;
  const usePill = !!opts.pill;
  const m = marbles.map((x) => ({ ...x }));
  const shooter = m.find((x) => x.id === shot.id);
  if (!shooter) throw new Error(`no marble ${shot.id}`);

  // A marble resting in the pill is frozen by the loop below, so shooting it out has to lift it
  // first. This is what lets the hole work as a staging post rather than a trap.
  shooter.inPill = false;
  const spec = STRIKERS[shooter.striker] || POT_MARBLE;
  const speed = Math.max(0, Math.min(1, shot.power)) * (spec.maxSpeed ?? 5.6);
  shooter.vx = Math.cos(shot.angle) * speed;
  shooter.vy = Math.sin(shot.angle) * speed;

  // `touched` is every non-striker marble involved in ANY collision, not just the one the
  // striker met first -- a marble knocked into its neighbour has touched two, and under the
  // clean-hit rule that ends the turn.
  const events = { firstContact: null, knockedOut: [], pilled: [], impacts: [], touched: [],
                   strikerInRing: false, settledAt: 0, inMud: false };
  const mud = opts.mud || [];
  const frames = [];
  const snap = () => { const f = new Float32Array(m.length * 2); m.forEach((x, i) => { f[i * 2] = x.x; f[i * 2 + 1] = x.y; }); frames.push(f); };
  snap();

  let t = 0, step = 0;
  while (t < MAX_TIME) {
    for (let s = 0; s < FRAME_EVERY; s++) {
      t += DT; step++;
      for (const a of m) {
        if (a.inPill) { a.vx = a.vy = 0; continue; }
        a.x += a.vx * DT; a.y += a.vy * DT;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > 0) {
          // Mud is local and visible: cross one and it drags you down hard.
          let dec = a.decel;
          for (const p of mud) {
            if (dist(a.x, a.y, p.x, p.y) < p.r) { dec = a.decel * p.mult; if (a.id === shot.id) events.inMud = true; break; }
          }
          const ns = sp - dec * DT;
          if (ns <= REST_SPEED) { a.vx = a.vy = 0; } else { a.vx *= ns / sp; a.vy *= ns / sp; }
        }
        // the patch has a lip; marbles do not escape into the road
        if (a.x - a.r < FIELD.x0) { a.x = FIELD.x0 + a.r; a.vx = -a.vx * WALL_BOUNCE; }
        if (a.x + a.r > FIELD.x1) { a.x = FIELD.x1 - a.r; a.vx = -a.vx * WALL_BOUNCE; }
        if (a.y - a.r < FIELD.y0) { a.y = FIELD.y0 + a.r; a.vy = -a.vy * WALL_BOUNCE; }
        if (a.y + a.r > FIELD.y1) { a.y = FIELD.y1 - a.r; a.vy = -a.vy * WALL_BOUNCE; }
      }
      for (let i = 0; i < m.length; i++) {
        for (let j = i + 1; j < m.length; j++) {
          const hit = collide(m[i], m[j]);
          if (hit > 0.05) {
            events.impacts.push({ t, speed: hit, frame: frames.length });
            for (const q of [m[i], m[j]]) if (!q.striker && !events.touched.includes(q.id)) events.touched.push(q.id);
            if (!events.firstContact && (m[i].id === shot.id || m[j].id === shot.id)) {
              events.firstContact = m[i].id === shot.id ? m[j].id : m[i].id;
            }
          }
        }
      }
      for (const a of m) {
        // "fully outside the line" is the street rule, not centre-out
        if (!a.out && dist(a.x, a.y, 0, 0) > ringR + a.r) { a.out = true; if (!a.striker) events.knockedOut.push(a.id); }
        if (usePill && !a.inPill && dist(a.x, a.y, 0, 0) < PILL_R && Math.hypot(a.vx, a.vy) < 1.25) {
          a.inPill = true; a.vx = a.vy = 0; events.pilled.push(a.id);
        }
      }
    }
    snap();
    if (m.every((a) => Math.hypot(a.vx, a.vy) === 0)) break;
  }

  events.settledAt = t;
  // The striker resting inside the circle is a foul -- it is now just another marble in the pot.
  events.strikerInRing = !usePill && dist(shooter.x, shooter.y, 0, 0) <= ringR + shooter.r;
  for (const a of m) { a.resting = true; a.vx = a.vy = 0; }
  return { frames, events, marbles: m };
}
