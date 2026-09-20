// Match state and the street rules. Pure logic -- no canvas, no audio. Everything a shot does
// to the match happens in applyShot(), so the bot can run the real rules in its head and the
// online layer can replay a turn from just the shot record.
import { rng } from './rng.js';
import { simulate, marble, RING_R, SHOOT_LINE, STRIKERS, dist } from './physics.js';

export const SKINS = ['doodh', 'kanch', 'neeli', 'lakhoti', 'steel'];
export const MODES = {
  chakri: { id: 'chakri', label: 'Chakri', blurb: 'Stake marbles in the ring. Knock them out, keep them.' },
  pill:   { id: 'pill',   label: 'Pill Chot', blurb: 'Land in the pill to arm yourself, then chot their marbles.' },
};
const CHOT_BONUS = 1;   // hitting an armed chot wins their marble plus this much from their stash

// Chances. In the street game a turn is not one shot: miss and your striker stays exactly where
// it stopped, and you shoot again from there. That is what makes position matter -- a miss
// leaves you somewhere, and where it leaves you is the next problem. A turn ends when the
// chances run out, not on the first mistake.
export const CHANCES = 3;

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

export function newMatch({ seed = 1, mode = 'chakri', players, ante = 4, ringR = RING_R } = {}) {
  const r = rng(seed);
  const ps = players.map((p, i) => ({
    id: i, name: p.name, kind: p.kind || 'human', level: p.level || 'champ',
    avatar: p.avatar || 'chotu', striker: p.striker || 'goli', skin: p.skin || SKINS[i % SKINS.length],
    stash: p.stash ?? 20, won: 0, armed: false,
  }));
  const m = { mode, seed, rng: r, ringR, ante, players: ps, turn: 0, pot: 0, marbles: [], phase: 'shoot',
              winner: null, shotNo: 0, chances: CHANCES, log: [], lastEvents: null, note: '' };

  if (mode === 'chakri') {
    const n = ante * ps.length;
    ps.forEach((p) => { p.stash -= ante; });
    m.pot = n;
    // A real pile is dumped, not laid out: golden-angle packing with a little jitter reads as
    // a heap while guaranteeing nothing starts overlapping.
    for (let i = 0; i < n; i++) {
      const s = pileSlot(i);
      m.marbles.push(marble(`p${i}`, s.x, s.y, { skin: r.pick(SKINS) }));
    }
  } else {
    // Pill Chot: the pill sits at the centre, everyone's stake is scattered across the patch.
    ps.forEach((p) => {
      p.stash -= ante;
      for (let i = 0; i < ante; i++) {
        let x, y, tries = 0;
        do {
          x = r.range(-0.40, 0.40); y = r.range(-0.40, 0.34); tries++;
        } while (tries < 60 && (dist(x, y, 0, 0) < 0.10 || m.marbles.some((q) => dist(x, y, q.x, q.y) < 0.062)));
        m.marbles.push(marble(`f${p.id}_${i}`, x, y, { owner: p.id, skin: p.skin }));
      }
    });
  }
  addStrikers(m);
  return m;
}

function addStrikers(m) {
  m.players.forEach((p, i) => {
    const spread = (i - (m.players.length - 1) / 2) * 0.11;
    m.marbles.push(marble(strikerId(i), spread, SHOOT_LINE, { striker: p.striker, owner: i, skin: p.skin }));
  });
}
export const strikerId = (i) => `s${i}`;
export const strikerOf = (m, i) => m.marbles.find((x) => x.id === strikerId(i));
export const current = (m) => m.players[m.turn];
export const potMarbles = (m) => m.marbles.filter((x) => !x.striker && !x.out && !x.inPill);
export const fieldMarblesOf = (m, pid) => m.marbles.filter((x) => !x.striker && x.owner === pid && !x.captured);

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
  m.shotNo++;
  m.log.push({ by: p.id, angle: shot.angle, power: shot.power, foul: !!shot.foul });

  const sum = { by: p.id, gained: 0, lost: 0, foul: false, chot: null, pilled: false, continues: false, note: '' };
  const ev = res.events;

  if (shot.foul) {                                   // thumb lifted: overdrawn flick
    sum.foul = true; sum.note = 'Thumb lifted — foul.';
    payFoul(m, p, sum);
  } else if (m.mode === 'chakri') {
    const outs = ev.knockedOut.length;
    if (outs > 0) {
      p.stash += outs; p.won += outs; m.pot -= outs; sum.gained = outs;
      m.marbles = m.marbles.filter((x) => !ev.knockedOut.includes(x.id));
      m.chances = CHANCES;                    // a score buys the whole turn back
      sum.continues = true;
      sum.note = outs > 1 ? `${outs} out in one chot!` : 'Out — shoot again.';
    } else {
      m.chances -= 1;
      sum.continues = m.chances > 0;
      sum.note = sum.continues
        ? `${ev.firstContact ? 'Touched, nothing out' : 'Missed'} — ${m.chances} chance${m.chances > 1 ? 's' : ''} left.`
        : 'Chances used up.';
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
    if (!p.armed) {
      if (me.inPill) { p.armed = true; sum.pilled = true; sum.continues = true; sum.note = 'In the pill — you are chot-ready.'; }
      else sum.note = 'Missed the pill.';
    } else if (ev.firstContact) {
      const hit = m.marbles.find((x) => x.id === ev.firstContact);
      if (hit && hit.owner !== null && hit.owner !== p.id) {
        const victim = m.players[hit.owner];
        const take = 1 + Math.min(CHOT_BONUS, Math.max(0, victim.stash));
        victim.stash -= take - 1; p.stash += take; p.won += take;
        hit.captured = true;
        m.marbles = m.marbles.filter((x) => x.id !== hit.id);
        sum.gained = take; sum.chot = victim.id; sum.continues = true;
        sum.note = `Chot on ${victim.name} — ${take} marbles.`;
      } else sum.note = 'Hit your own. Turn passes.';
    } else sum.note = 'No chot.';
  }

  if (!sum.continues) { respot(m, p.id); m.turn = (m.turn + 1) % m.players.length; m.chances = CHANCES; }
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
  if (m.players.some((p) => p.stash <= 0)) return finish(m);   // cleaned out: pockets empty
  if (m.mode === 'chakri') {
    if (m.pot <= 0 || potMarbles(m).length === 0) finish(m);
  } else {
    const broke = m.players.some((p) => fieldMarblesOf(m, p.id).length === 0);
    if (broke) finish(m);
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
