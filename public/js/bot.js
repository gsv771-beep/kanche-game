// The opponent. Its brain is the game's own physics engine: it aims with closed-form ghost-ball
// geometry, then plays each candidate shot a few dozen times in its head WITH ITS OWN HAND SHAKE
// and picks the one that works most often.
//
// That last part is the whole trick. Difficulty is never a cheat -- every tier runs this same
// code and differs only in how steady its hands are. A shaky bot avoids thin cuts all by itself,
// because in its own rollouts the thin cut fails, which is exactly why a beginner plays safe.
import { simulate, STRIKERS, POT_MARBLE, SHOOT_LINE, dist } from './physics.js';
import { strikerId, potMarbles } from './rules.js';

const RESTITUTION = 0.93;
const D2R = Math.PI / 180;

export const LEVELS = {
  chotu:  { id: 'chotu',  name: 'Chotu',        tier: 'Gully kid',     sd: 6.0 * D2R, psd: 0.24, rollouts: 8,  top: 1, sloppy: true,  position: false, think: [900, 1700] },
  bunty:  { id: 'bunty',  name: 'Bunty',        tier: 'Mohalla champ', sd: 2.0 * D2R, psd: 0.10, rollouts: 36, top: 3, sloppy: false, position: true,  think: [1200, 2200] },
  ustaad: { id: 'ustaad', name: 'Ustaad Pappu', tier: 'Ustaad',        sd: 0.5 * D2R, psd: 0.035, rollouts: 56, top: 4, sloppy: false, position: true,  think: [1500, 2600] },
};

/** Ghost-ball: to send `target` along `ex,ey`, the striker must arrive at this contact point. */
function ghostPoint(t, ex, ey, rs) { return { x: t.x - ex * (t.r + rs), y: t.y - ey * (t.r + rs) }; }

/** Perpendicular distance from a circle centre to the swept path S -> G. */
function blocked(m, sx, sy, gx, gy, rs, skipIds) {
  const dx = gx - sx, dy = gy - sy, len = Math.hypot(dx, dy) || 1e-9;
  const ux = dx / len, uy = dy / len;
  for (const o of m) {
    if (skipIds.includes(o.id) || o.out || o.inPill) continue;
    const t = (o.x - sx) * ux + (o.y - sy) * uy;
    if (t <= 0 || t >= len) continue;
    if (Math.hypot(sx + ux * t - o.x, sy + uy * t - o.y) < rs + o.r + 0.0015) return true;
  }
  return false;
}

/** Every shot worth considering, with the arithmetic already done. */
function candidates(match, pid) {
  const me = match.marbles.find((x) => x.id === strikerId(pid));
  const spec = STRIKERS[me.striker];
  const out = [];

  if (match.mode === 'pill') {
    const p = match.players[pid];
    // The pill is always an option: at a hundred it is the finishing shot, and before that it is
    // a staging post that shortens everything and cannot be knocked off.
    const L0 = Math.hypot(me.x, me.y);
    if (L0 > 0.02) {
      const v0 = Math.sqrt(0.85 * 0.85 + 2 * me.decel * L0);
      out.push({ target: null, angle: Math.atan2(-me.y, -me.x), power: Math.min(0.99, v0 / spec.maxSpeed), cut: 0, kind: 'pill' });
    }
    // At a hundred, or owing the hole a visit, the hole is the only shot worth taking.
    if (p.points >= match.target || p.needsHole) return out;

    for (const t of match.marbles) {
      if (!t.striker || t.id === me.id || t.inPill) continue;   // a marble in the hole is safe
      const L = dist(me.x, me.y, t.x, t.y);
      const v0 = Math.sqrt(1.1 * 1.1 + 2 * me.decel * L);
      const power = v0 / spec.maxSpeed;
      if (power > 0.99) continue;
      if (blocked(match.marbles, me.x, me.y, t.x, t.y, me.r, [me.id, t.id])) continue;
      out.push({ target: t.id, angle: Math.atan2(t.y - me.y, t.x - me.x), power, cut: 0, kind: 'chot' });
    }
    return out;
  }

  for (const t of potMarbles(match)) {
    const dc = Math.hypot(t.x, t.y) || 1e-9;
    const ex = t.x / dc, ey = t.y / dc;                    // shortest way out of the ring
    const g = ghostPoint(t, ex, ey, me.r);
    const L = dist(me.x, me.y, g.x, g.y);
    if (L < 0.01) continue;
    const ax = (g.x - me.x) / L, ay = (g.y - me.y) / L;
    const cos = ax * ex + ay * ey;                          // cut angle
    if (cos < 0.30) continue;                               // thinner than ~72 deg: not a shot
    if (blocked(match.marbles, me.x, me.y, g.x, g.y, me.r, [me.id, t.id])) continue;

    const travel = match.ringR + t.r - dc + 0.02;           // how far it must roll to clear
    const vT = Math.sqrt(2 * t.decel * Math.max(travel, 0.01));
    const K = ((1 + RESTITUTION) * me.mass) / (me.mass + t.mass);   // share of speed handed over
    const vImpact = vT / Math.max(K * cos, 0.05);
    const v0 = Math.sqrt(vImpact * vImpact + 2 * me.decel * L);
    const power = v0 / spec.maxSpeed;
    if (power > 0.96) continue;                             // past this the thumb lifts: foul
    out.push({ target: t.id, angle: Math.atan2(ay, ax), power, cut: Math.acos(Math.min(1, cos)), kind: 'chakri' });
  }
  return out;
}

/** What a settled board is worth to the shooter. */
function value(match, pid, res, lvl) {
  const ev = res.events;
  if (match.mode === 'pill') return pillValue(match, pid, res);
  let v = ev.knockedOut.length * 10;
  // Under the clean-hit rule a scatter ends the turn, so disturbing a second marble wipes out
  // whatever the shot scored. The rollouts then teach the bot to pick isolated targets by
  // itself, which is exactly the skill the rule is asking of a human.
  if (match.mode === 'chakri' && ev.touched.length > 1) v = -12;
  // Being left in the ring only costs the striker if the TURN ends there, so it is a disaster
  // on the last chance and merely untidy when there are shots in hand.
  if (ev.strikerInRing && !ev.knockedOut.length) v -= (match.chances <= 1 ? 13 : 3.5);
  if (!ev.firstContact && !ev.pilled.length) v -= 1.5;
  if (lvl.position && ev.knockedOut.length) {
    // Position play: the continuation rule means a run only survives if the striker lands useful.
    const s = res.marbles.find((x) => x.id === strikerId(pid));
    const left = res.marbles.filter((x) => !x.striker && !x.out && !ev.knockedOut.includes(x.id));
    if (left.length && s) v += Math.max(0, 3 - Math.min(...left.map((t) => dist(s.x, s.y, t.x, t.y))) * 5);
  }
  return v;
}

/** Simple Pill Chot: hunt the opponent, or finish in the hole at a hundred. */
function pillValue(match, pid, res) {
  const ev = res.events;
  const me = res.marbles.find((x) => x.id === strikerId(pid));
  const p = match.players[pid];
  if (p.points >= match.target) return me.inPill ? 40 : -dist(me.x, me.y, 0, 0) * 6;
  if (p.needsHole) return me.inPill ? 20 : -dist(me.x, me.y, 0, 0) * 6;

  const hit = ev.firstContact && res.marbles.find((x) => x.id === ev.firstContact);
  let v = hit && hit.striker && hit.owner !== pid ? 14 : 0;
  if (me.inPill) v += 5;                                   // safe, central, and shortens the next shot
  // Otherwise, ending nearer a target is worth something -- that is the "reduce the distance"
  // part of the rule, and it is why going via the hole is often better than a long chase.
  const foes = res.marbles.filter((x) => x.striker && x.id !== me.id);
  if (foes.length) v += Math.max(0, 2.5 - Math.min(...foes.map((f) => dist(me.x, me.y, f.x, f.y))) * 3);
  return v;
}

/**
 * Choose a shot.
 * @returns { angle, power, foul, meta } -- angle is the INTENT; hand shake is added at fire time
 *          so the same record replays identically.
 */
export function chooseShot(match, pid, r) {
  const p = match.players[pid];
  const lvl = LEVELS[p.level] || LEVELS.bunty;

  // Should it walk back to the line? Only a player who thinks ahead even asks. Chotu never does,
  // which is why Chotu keeps losing his striker -- and that reads as a kid, not as a bad bot.
  if (lvl.position && match.mode === 'chakri') {
    const here = best(match, pid, lvl, r, false);
    const line = best(lineVariant(match, pid), pid, lvl, r, false);
    if (line && (!here || line.ev > here.ev + 0.8)) return fire(line, match, pid, lvl, r, true);
    if (here) return fire(here, match, pid, lvl, r, false);
  }
  const only = best(match, pid, lvl, r, lvl.sloppy);
  if (only) return fire(only, match, pid, lvl, r, false);

  let cands = candidates(match, pid);
  const me = match.marbles.find((x) => x.id === strikerId(pid));
  if (!cands.length) {
    // Nothing on: shove at the pile and hope. Humans do this too.
    const t = potMarbles(match)[0] || { x: 0, y: 0 };
    return { angle: Math.atan2(t.y - me.y, t.x - me.x), power: 0.7, foul: false,
             meta: { level: lvl, target: null, confidence: 0, desperate: true } };
  }

  // Nerves. Big pot or down to the last few marbles and the hand tightens up.
  const potPressure = match.mode === 'chakri' ? Math.min(1, match.pot / 8) : 0.4;
  const broke = p.stash <= 2 ? 1 : 0;
  const sd = lvl.sd * (1 + 0.3 * potPressure + 0.25 * broke);
  const psd = lvl.psd * (1 + 0.2 * potPressure);

  // Losing badly? Start going for the hero shot -- the thin cut that clears three at once.
  const behind = Math.max(...match.players.map((q) => q.won)) - p.won;
  const heroic = behind >= 3 && r.next() < 0.35;

  return { angle: Math.atan2(-me.y, -me.x), power: 0.7, foul: false, meta: { level: lvl, target: null, confidence: 0 } };
}

/** A copy of the match with this player's striker walked back to the shooting line. */
function lineVariant(match, pid) {
  const spread = (pid - (match.players.length - 1) / 2) * 0.11;
  return { ...match, marbles: match.marbles.map((x) => x.id === strikerId(pid)
    ? { ...x, x: spread, y: SHOOT_LINE, vx: 0, vy: 0, out: false, inPill: false } : x) };
}

/** Rank the candidates by playing each one repeatedly with this bot's own hand shake. */
function best(match, pid, lvl, r, sloppy) {
  let cands = candidates(match, pid);
  if (!cands.length) return null;
  const p = match.players[pid];
  const potPressure = match.mode === 'chakri' ? Math.min(1, match.pot / 8) : 0.4;
  const sd = lvl.sd * (1 + 0.3 * potPressure + (p.stash <= 2 ? 0.25 : 0));
  const psd = lvl.psd * (1 + 0.2 * potPressure);
  const behind = Math.max(...match.players.map((q) => q.won)) - p.won;
  const heroic = behind >= 3 && r.next() < 0.35;   // losing badly: go for the hero shot

  cands.sort((a, b) => a.cut - b.cut || a.power - b.power);
  if (heroic) cands.reverse();
  // A kid does not survey the table. He grabs a shot off the top of the pile and takes it --
  // and half the time it is not one of the good ones.
  if (sloppy) cands = [cands[r.int(Math.min(cands.length, 6))]];
  const pool = cands.slice(0, Math.max(1, lvl.top));
  const me = match.marbles.find((x) => x.id === strikerId(pid));

  let win = null;
  for (const c of pool) {
    const n = Math.max(6, Math.round(lvl.rollouts / pool.length));
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const shot = { id: me.id, angle: c.angle + r.normal(0, sd), power: clamp(c.power * (1 + r.normal(0, psd))) };
      sum += value(match, pid, simulate(match.marbles, shot, { ringR: match.ringR, pill: match.mode === 'pill', mud: match.mud }), lvl);
    }
    const ev = sum / n;
    if (!win || ev > win.ev) win = { ...c, ev, sd, psd, heroic };
  }
  return win;
}

const clamp = (v) => Math.max(0.05, Math.min(0.99, v));

function fire(c, match, pid, lvl, r, fromLine) {
  return {
    angle: c.angle + r.normal(0, c.sd),
    power: clamp(c.power * (1 + r.normal(0, c.psd))),
    foul: false, fromLine,
    meta: { level: lvl, target: c.target, cut: c.cut, heroic: c.heroic, fromLine,
            confidence: Math.max(0, Math.min(1, c.ev / 10)) },
  };
}

/** How long it pretends to think. Instant shots read as a machine; hesitation reads as a person. */
export function thinkTime(level, r) {
  const l = LEVELS[level] || LEVELS.bunty;
  return Math.round(r.range(l.think[0], l.think[1]));
}
