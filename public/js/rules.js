// Match state and the street rules. Pure logic -- no canvas, no audio. Everything a shot does
// to the match happens in applyShot(), so the bot can run the real rules in its head and the
// online layer can replay a turn from just the shot record.
import { rng } from './rng.js';
import { simulate, marble, RING_R, SHOOT_LINE, STRIKERS, POT_MARBLE, dist } from './physics.js';
const POT_R = POT_MARBLE.r;

export const SKINS = ['doodh', 'kanch', 'neeli', 'lakhoti', 'steel'];
export const MODES = {
  chakri: { id: 'chakri', label: 'Chakri', blurb: 'Marbles on the ring, one in the middle. Knock one out — but touch a second and your turn is over.' },
  pill:   { id: 'pill',   label: 'Pill Chot', blurb: 'Race to 100. Every chot on their marble is 10. At 100, sink it in the hole to finish.' },
};

// Simple Pill Chot: a count, not a stake. Each chot on an opponent is ten, and at a hundred you
// must still put your marble in the hole to finish -- so the last shot of the game is a touch
// shot, not a hit, which is a nice reversal after ten shots of hunting.
//
// Between chots you have to go back through the hole. Without that the game collapses: after a
// hit your marble is sitting right next to theirs, so the next hit is free, and two bots simply
// shoved each other across the patch at a 95% hit rate while whoever shot first won every
// single game. Going via the hole is what the street rule means by taking the hole's help -- it
// is central, nothing can knock you out of it, and everything is nearer from there.
export const CHOT_POINTS = 10;
/**
 * The street count runs to a hundred, which assumes a crowd -- with four other marbles to hunt
 * you reach it quickly. Head-to-head it is ten chots, and since each one has to be paid for
 * with a trip back through the hole, that measured out at nearly sixty shots a game. So the
 * count scales with the company: fifty for a duel, a hundred for three, and so on.
 */
export const targetFor = (players) => 50 * (players - 1);
const CHOT_BONUS = 1;   // hitting an armed chot wins their marble plus this much from their stash

// Chances. A turn is not one shot: miss and your striker stays exactly where it stopped, and
// you shoot again from there. What makes position matter is that a miss leaves you somewhere,
// and where it leaves you is the next problem.
//
// EVERY shot spends a chance and a score refunds one, capped at the set. So a player who keeps
// scoring keeps the board -- earned, shot by shot -- while anyone missing runs out fast. The
// first cut simply refilled the set on any score, which sounds similar and is not: scoring once
// in three shots then held the board forever. Measured, a strong player took 95% of the shots
// and the opponent never got a turn at all in 13 games out of 15.
export const CHANCES = 3;

// A hard ceiling on a turn, whatever you are doing with it. Chances alone do not bound a turn:
// a scoring shot is net-neutral, so a player on a run still cleared the entire ring in one
// visit and the opponent never picked up a marble. In the street that is a fair result; in a
// game against a bot it means you never see the bot play.
export const TURN_SHOTS = 4;

// Where the k-th marble sits in the pile. Concentric rings, and within a ring the slots are
// filled in mirror pairs so that ANY number of marbles gives a pile that is symmetric about the
// shooting axis. This is not fussiness: a lopsided pile hands one seat a better line on every
// single break, and bot-vs-bot testing showed it swinging the win rate from 30% to 65%.
export function pileSlot(k) {
  const S = 0.0315;                       // ring spacing, a touch over one marble diameter
  let ring = 0, base = 0;
  for (;;) {
    const cap = ring === 0 ? 1 : Math.max(3, Math.floor(2 * Math.PI * ring));
    if (k < base + cap) {
      if (ring === 0) return { x: 0, y: 0 };
      const i = k - base;
      // order within the ring: 0, 1, cap-1, 2, cap-2 ... so every prefix stays mirrored
      const j = i === 0 ? 0 : (i % 2 ? (i + 1) / 2 : cap - i / 2);
      const th = Math.PI / 2 + (j * 2 * Math.PI) / cap;
      return { x: Math.cos(th) * ring * S, y: Math.sin(th) * ring * S };
    }
    base += cap; ring++;
  }
}

export function newMatch({ seed = 1, mode = 'chakri', players, ante = 4, ringR = RING_R, first = null } = {}) {
  const r = rng(seed);
  const ps = players.map((p, i) => ({
    id: i, name: p.name, kind: p.kind || 'human', level: p.level || 'champ',
    avatar: p.avatar || 'chotu', striker: p.striker || 'goli', skin: p.skin || SKINS[i % SKINS.length],
    stash: p.stash ?? 20, won: 0, armed: false,
  }));
  const m = { mode, seed, rng: r, ringR, ante, players: ps, target: targetFor(ps.length),
              // Who shoots first is a toss, not a fixture. In a race to a target the opener has
              // a real edge -- measured at four wins in five between identical bots -- and in
              // the street it is settled by lagging rather than by seating.
              turn: first ?? r.int(ps.length), pot: 0, marbles: [], phase: 'shoot',
              winner: null, shotNo: 0, chances: CHANCES, turnShots: 0, log: [], lastEvents: null, note: '' };

  if (mode === 'chakri') {
    const n = ante * ps.length;
    ps.forEach((p) => { p.stash -= ante; });
    m.pot = n;   // the centre marble is added below, on the house
    // A real pile is dumped, not laid out: golden-angle packing with a little jitter reads as
    // a heap while guaranteeing nothing starts overlapping.
    // Marbles sit ON the ring with one in the middle, not heaped at the centre. That single
    // change turns this from a power game into a precision one: every edge marble is a short
    // push from being out, so the difficulty is hitting exactly one of them.
    const rr = ringR - POT_R - 0.006;
    for (let i = 0; i < n; i++) {
      // start at the top and space evenly -- a full ring is mirror-symmetric by construction,
      // so neither seat gets the better line
      const th = Math.PI / 2 + (i * 2 * Math.PI) / n;
      m.marbles.push(marble(`p${i}`, Math.cos(th) * rr, Math.sin(th) * rr, { skin: r.pick(SKINS) }));
    }
    m.marbles.push(marble('pc', 0, 0, { skin: r.pick(SKINS) }));   // the one in the middle
    m.pot = n + 1;
  } else {
    // Nothing on the field but the players themselves and the hole. The only targets are each
    // other's marbles, which is what makes it a hunt rather than a demolition.
    ps.forEach((p) => { p.points = 0; p.needsHole = false; });
    m.scatter = true;
  }
  addStrikers(m);
  return m;
}

function addStrikers(m) {
  m.players.forEach((p, i) => {
    // Pill Chot starts everyone spread around the hole at equal range, not shoulder to shoulder
    // on the line: two marbles that begin 11cm apart just shove each other sideways all game.
    const pos = m.scatter ? scatterStart(i, m.players.length)
      : { x: (i - (m.players.length - 1) / 2) * 0.11, y: SHOOT_LINE };
    m.marbles.push(marble(strikerId(i), pos.x, pos.y, { striker: p.striker, owner: i, skin: p.skin }));
  });
}
/** Evenly around the hole, mirrored about the shooting axis so no seat starts closer. */
function scatterStart(i, n) {
  const th = Math.PI / 2 - (Math.PI * (2 * i + 1)) / (2 * n) + Math.PI / 2;
  return { x: Math.cos(th) * 0.30, y: Math.sin(th) * 0.30 + 0.12 };
}
export const strikerId = (i) => `s${i}`;
export const strikerOf = (m, i) => m.marbles.find((x) => x.id === strikerId(i));
export const current = (m) => m.players[m.turn];
/** Shots left in the current turn -- whichever of the two limits bites first. */
export const shotsLeft = (m) => Math.max(0, Math.min(m.chances, TURN_SHOTS - m.turnShots));
export const potMarbles = (m) => m.marbles.filter((x) => !x.striker && !x.out && !x.inPill);
export const fieldMarblesOf = (m, pid) => m.marbles.filter((x) => !x.striker && x.owner === pid && !x.captured);
export const pointsOf = (m, pid) => m.players[pid].points || 0;

/**
 * Lagging: before a game everyone throws at the hole from the line and the closest shoots first.
 * It is how the street settles turn order, and it matters here -- measured between identical
 * bots, whoever opens wins 70-78% of matches. A coin should not decide that; a shot should.
 * Ties go to the earlier thrower, which is the convention and avoids a re-throw loop.
 */
export function lagWinner(distances) {
  let best = 0;
  for (let i = 1; i < distances.length; i++) if (distances[i] < distances[best]) best = i;
  return best;
}

/** Put every striker back on the shooting line, for the lag throw. */
export function lineUp(m) {
  m.players.forEach((p, i) => {
    const s = strikerOf(m, i);
    s.x = (i - (m.players.length - 1) / 2) * 0.11; s.y = SHOOT_LINE;
    s.vx = s.vy = 0; s.out = false; s.inPill = false;
  });
}

/** Where the striker sits for the shot about to be taken. */
export function shotOrigin(m, i) {
  const s = strikerOf(m, i);
  return { x: s.x, y: s.y };
}

function respot(m, i) {
  const s = strikerOf(m, i);
  const spread = (i - (m.players.length - 1) / 2) * 0.11;
  s.x = spread; s.y = SHOOT_LINE; s.vx = s.vy = 0; s.out = false; s.inPill = false;
}

/**
 * Apply one shot. `shot` is { angle, power, foul }  -- angle already includes the player's
 * release error, so the record replays exactly.
 * Returns { frames, events, summary } for the renderer.
 */
export function applyShot(m, shot) {
  const p = current(m);
  const id = strikerId(p.id);
  // Taking the line: after a successful chot your striker usually lies inside the ring, where
  // the next shot is easy but a miss forfeits it. Kids give you the choice of walking back to
  // the line instead. It is the single best strategic decision in the game, so it is a rule.
  if (shot.fromLine) respot(m, p.id);
  // Snapshot before the sim: the renderer replays these marbles against the returned frames,
  // including the ones applyShot is about to remove from the board.
  const before = m.marbles.map((x) => ({ ...x }));
  const res = simulate(m.marbles, { ...shot, id }, { ringR: m.ringR, pill: m.mode === 'pill' });
  m.marbles = res.marbles;
  m.shotNo++; m.turnShots++;
  m.log.push({ by: p.id, angle: shot.angle, power: shot.power, foul: !!shot.foul });

  const sum = { by: p.id, gained: 0, lost: 0, foul: false, chot: null, pilled: false, continues: false, note: '' };
  const ev = res.events;

  if (shot.foul) {                                   // thumb lifted: overdrawn flick
    sum.foul = true; sum.note = 'Thumb lifted — foul.';
    payFoul(m, p, sum);
  } else if (m.mode === 'chakri') {
    const outs = ev.knockedOut.length;
    m.chances -= 1;                           // every shot costs one
    // The clean-hit rule: a shot may disturb exactly one marble. Knock one into its neighbour,
    // or carom your striker through the pack, and the turn is over however much went out.
    const dirty = ev.touched.length > 1;
    if (dirty) {
      sum.continues = false; sum.dirty = true;
      sum.note = `Touched ${ev.touched.length} marbles — turn over.`;
    } else if (outs > 0) {
      p.stash += outs; p.won += outs; m.pot -= outs; sum.gained = outs;
      m.marbles = m.marbles.filter((x) => !ev.knockedOut.includes(x.id));
      m.chances = Math.min(CHANCES, m.chances + 1);   // ...and a score buys that one back
      sum.continues = m.chances > 0;
      sum.note = 'Clean — out and yours. Shoot again.';
    } else {
      sum.continues = m.chances > 0;
      sum.note = sum.continues
        ? `${ev.firstContact ? 'Hit it — not hard enough to cross the line' : 'Missed'} — ${m.chances} chance${m.chances > 1 ? 's' : ''} left.`
        : ev.firstContact ? 'Hit it, but never hard enough. Turn over.' : 'Chances used up.';
    }
    // The striker-in-ring forfeit is judged when the TURN ends, not on every miss -- otherwise
    // the chances rule and the forfeit rule contradict each other and a miss inside the ring
    // costs you the striker before you have had your other shots.
    if (!sum.continues && ev.strikerInRing) {
      sum.foul = true;
      sum.note = 'Turn over with the striker stuck in the ring — forfeit.';
      payFoul(m, p, sum);
    }
    sum.chancesLeft = m.chances;
  } else {
    const me = strikerOf(m, p.id);
    m.chances -= 1;
    const hit = ev.firstContact && m.marbles.find((x) => x.id === ev.firstContact);
    const chot = hit && hit.striker && hit.owner !== p.id;

    if (chot && p.needsHole) {
      sum.continues = m.chances > 0;
      sum.note = `No count — go through the hole first. ${p.points}.`;
    } else if (chot) {
      p.points += CHOT_POINTS;
      // (Tried docking the victim ten as well, to stop this being a pure race. Measured: it
      // doubled game length to over a hundred shots and did nothing at all for the first-mover
      // edge. Dropped.)
      p.needsHole = true;                       // now back to the hole before the next one counts
      m.chances = Math.min(CHANCES, m.chances + 1);
      sum.gained = CHOT_POINTS; sum.chot = hit.owner;
      sum.continues = m.chances > 0;
      sum.note = p.points >= m.target
        ? `${p.points}! Now sink it in the hole.`
        : `Chot — ${p.points}. Back through the hole.`;
    } else if (me.inPill) {
      if (p.points >= m.target) {
        sum.finished = true; sum.continues = false;
        sum.note = 'In the hole at a hundred. Game.';
      } else {
        // The hole is a staging post: central, everything is nearer from it, and nothing can
        // knock you out of it. Paid for with the shot it took to get there.
        p.needsHole = false;
        m.chances = Math.min(CHANCES, m.chances + 1);
        sum.pilled = true; sum.continues = m.chances > 0;
        sum.note = `Through the hole — hunting again, ${p.points} so far.`;
      }
    } else {
      sum.continues = m.chances > 0;
      sum.note = sum.continues ? `No chot — ${m.chances} left.` : 'No chot. Turn over.';
    }
    sum.chancesLeft = m.chances;
  }

  if (sum.continues && m.turnShots >= TURN_SHOTS) { sum.continues = false; sum.note += ' Turn over.'; }
  if (!sum.continues) {
    // In Pill Chot your marble stays on the patch between turns -- it is a target, and that
    // exposure is the game. Only Chakri walks the striker back behind the line.
    if (m.mode === 'chakri') respot(m, p.id);
    m.turn = (m.turn + 1) % m.players.length;
    m.chances = CHANCES; m.turnShots = 0;
  }
  checkOver(m);
  m.lastEvents = ev; m.note = sum.note;
  return { frames: res.frames, events: ev, summary: sum, before };
}

function payFoul(m, p, sum) {
  if (p.stash > 0) { p.stash -= 1; p.won -= 1; sum.lost = 1; } else return;
  // The forfeit goes back into the ring -- but only up to a cap. Without one, two bad players
  // feed the pot faster than they clear it and the game literally never ends. Past the cap the
  // marble is handed straight to the next player, so persistent fouling bleeds you dry.
  const cap = m.ante * m.players.length * 2;
  if (m.mode === 'chakri' && m.pot < cap) {
    m.pot += 1;
    const s = pileSlot(m.pot - 1);
    m.marbles.push(marble(`p${m.shotNo}x`, s.x, s.y, { skin: m.rng.pick(SKINS) }));
  } else {
    const nxt = m.players[(p.id + 1) % m.players.length];
    nxt.stash += 1; nxt.won += 1;
  }
}

function checkOver(m) {
  if (m.mode === 'chakri') {
    if (m.players.some((p) => p.stash <= 0)) return finish(m);   // cleaned out: pockets empty
    if (m.pot <= 0 || potMarbles(m).length === 0) finish(m);
  } else {
    // A hundred is not enough on its own -- it has to be sunk.
    const done = m.players.find((p) => p.points >= m.target && strikerOf(m, p.id).inPill);
    if (done) { m.phase = 'over'; m.winner = done.id; }
  }
}
function finish(m) {
  m.phase = 'over';
  const best = Math.max(...m.players.map((p) => p.won));
  const top = m.players.filter((p) => p.won === best);
  m.winner = top.length === 1 ? top[0].id : null;   // null means a tie
}

/**
 * Kali Jota -- the odd/even side bet played on the sidelines while someone else shoots.
 * The hider closes a fist over some marbles; the caller says odd (kali) or even (jota).
 * Right, the caller takes the handful. Wrong, the caller pays the same number across.
 */
export function kaliJota(m, callerId, hiderId, call, handful) {
  const n = Math.max(1, Math.min(5, handful));
  const isOdd = n % 2 === 1;
  const right = (call === 'kali') === isOdd;
  const caller = m.players[callerId], hider = m.players[hiderId];
  const moved = Math.min(n, right ? hider.stash : caller.stash);
  if (right) { caller.stash += moved; caller.won += moved; hider.stash -= moved; hider.won -= moved; }
  else { caller.stash -= moved; caller.won -= moved; hider.stash += moved; hider.won += moved; }
  return { n, isOdd, right, moved };
}
