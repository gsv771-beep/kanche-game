// Kanche: physics, rules and the bot ladder. Run: node tests/kanche.test.mjs
import { simulate, marble, STRIKERS, RING_R, SHOOT_LINE, dist } from '../public/js/physics.js';
import { newMatch, applyShot, pileSlot, kaliJota, strikerOf, potMarbles } from '../public/js/rules.js';
import { chooseShot, LEVELS } from '../public/js/bot.js';
import { steadiness, spreadFor, inWindow, predictPath, FOUL_AT } from '../public/js/input.js';
import { rng } from '../public/js/rng.js';

let failures = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' (' + detail + ')' : ''}`); if (!cond) failures++; };
const near = (name, a, e, tol = 1e-6) => ok(name, Math.abs(a - e) <= tol, `got ${a}, expected ${e}`);
const hash = (frames) => frames.reduce((h, f) => f.reduce((g, v) => (Math.imul(g ^ Math.round(v * 1e6), 16777619) >>> 0), h), 2166136261);

const board = () => [
  marble('s0', 0, SHOOT_LINE, { striker: 'goli', owner: 0 }),
  ...Array.from({ length: 8 }, (_, i) => { const p = pileSlot(i); return marble(`p${i}`, p.x, p.y, {}); }),
];

// ---------- determinism: the property the whole online design rests on ----------
{
  const shot = { id: 's0', angle: -Math.PI / 2 + 0.03, power: 0.78 };
  const a = simulate(board(), shot, {}), b = simulate(board(), shot, {});
  ok('same board + same shot gives byte-identical frames', hash(a.frames) === hash(b.frames));
  ok('and identical events', JSON.stringify(a.events.knockedOut) === JSON.stringify(b.events.knockedOut));
  const c = simulate(board(), { ...shot, angle: shot.angle + 1e-4 }, {});
  ok('a different shot gives a different result', hash(c.frames) !== hash(a.frames));
  ok('every marble is at rest when a shot settles',
    a.marbles.every((m) => Math.hypot(m.vx, m.vy) === 0));
  ok('the sim terminates well inside the cap', a.events.settledAt < 9 && a.frames.length > 2, `${a.events.settledAt.toFixed(2)}s`);
}

// ---------- physics ----------
{
  // Equal masses, dead centre: the striker stops and the target leaves with almost all of it.
  const ms = [marble('s0', 0, 0.3, { striker: 'goli', owner: 0 }), marble('t', 0, 0, {})];
  const r = simulate(ms, { id: 's0', angle: -Math.PI / 2, power: 0.6 }, {});
  const s = r.marbles.find((m) => m.id === 's0'), t = r.marbles.find((m) => m.id === 't');
  ok('a square hit sends the target on and leaves the striker behind', t.y < -0.05 && s.y > t.y, `striker ${s.y.toFixed(3)} target ${t.y.toFixed(3)}`);

  // The Dhampar is the whole risk/reward: heavier, so it barely deflects, but it cannot reach.
  const cut = (striker) => {
    const mm = [marble('s0', 0, 0.3, { striker, owner: 0 }), marble('t', 0.012, 0, {})];
    const rr = simulate(mm, { id: 's0', angle: -Math.PI / 2, power: 0.75 }, {});
    return Math.abs(rr.marbles.find((m) => m.id === 's0').x);
  };
  ok('a Dhampar is deflected less than a goli on the same cut', cut('dhampar') < cut('goli'),
    `dhampar ${cut('dhampar').toFixed(4)} vs goli ${cut('goli').toFixed(4)}`);
  const range = (k) => (STRIKERS[k].maxSpeed ** 2) / (2 * STRIKERS[k].decel);
  ok('but it travels far less at full power', range('dhampar') < range('goli') * 0.6,
    `${range('dhampar').toFixed(2)}m vs ${range('goli').toFixed(2)}m`);
  ok('a Dhampar still reaches the far side of the ring from the line', range('dhampar') > SHOOT_LINE + RING_R);
  near('mass scales as radius cubed', STRIKERS.dhampar.mass, (STRIKERS.dhampar.r / STRIKERS.goli.r) ** 3, 0.05);
}

// ---------- pile layout ----------
{
  for (const n of [4, 6, 8, 12, 16, 24]) {
    const pts = Array.from({ length: n }, (_, i) => pileSlot(i));
    const overlaps = pts.some((a, i) => pts.some((b, j) => j > i && dist(a.x, a.y, b.x, b.y) < 2 * 0.014 - 1e-9));
    const mirrored = pts.every((a) => pts.some((b) => Math.abs(b.x + a.x) < 1e-9 && Math.abs(b.y - a.y) < 1e-9));
    ok(`pile of ${n}: nothing overlaps and it is symmetric about the shooting axis`, !overlaps && mirrored);
    ok(`pile of ${n} fits inside the ring`, Math.max(...pts.map((p) => Math.hypot(p.x, p.y))) < RING_R - 0.014);
  }
}

// ---------- chakri rules ----------
{
  const m = newMatch({ seed: 5, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  ok('both players ante up and the pot holds the lot', m.pot === 8 && m.players.every((p) => p.stash === 16));
  ok('the pot marbles are on the board', potMarbles(m).length === 8);

  // Force a knockout by teeing one up on the rim.
  const t = potMarbles(m)[0];
  t.x = 0; t.y = -(m.ringR - 0.02);
  strikerOf(m, 0).x = 0; strikerOf(m, 0).y = SHOOT_LINE;
  const before = m.players[0].stash;
  const out = applyShot(m, { angle: -Math.PI / 2, power: 0.95 });
  ok('knocking one out pays the shooter and empties it from the pot',
    out.summary.gained >= 1 && m.players[0].stash > before && m.pot < 8);
  ok('and the shooter keeps the turn', out.summary.continues && m.turn === 0);
  ok('the pre-shot snapshot is returned for playback', out.before.length >= m.marbles.length);
}
{
  // A striker that stops inside the ring with nothing out is forfeit.
  const m = newMatch({ seed: 9, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  const s = strikerOf(m, 0); s.x = 0.0; s.y = 0.12;
  const before = m.players[0].stash;
  const out = applyShot(m, { angle: Math.PI / 2, power: 0.06 });
  ok('stuck in the ring with nothing out forfeits the striker', out.summary.foul && m.players[0].stash === before - 1);
  ok('and the turn passes', m.turn === 1);
  ok('the forfeit goes back into the ring', m.pot === 9);
}
{
  const m = newMatch({ seed: 11, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  const s = strikerOf(m, 0); s.x = 0.05; s.y = 0.05;
  applyShot(m, { angle: 0, power: 0.02, fromLine: true });
  ok('taking the line puts the striker back behind it', Math.abs(strikerOf(m, 0).y - SHOOT_LINE) < 0.35);
}
{
  const m = newMatch({ seed: 13, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  const before = m.players[0].stash;
  applyShot(m, { angle: -Math.PI / 2, power: 0.99, foul: true });
  ok('an overdrawn flick is a thumb-lift foul', m.players[0].stash === before - 1 && m.turn === 1);
}

// ---------- pill chot ----------
{
  const m = newMatch({ seed: 17, mode: 'pill', ante: 3, players: [{ name: 'A' }, { name: 'B' }] });
  ok('everyone scatters their stake on the field', m.marbles.filter((x) => !x.striker).length === 6);
  ok('nobody starts armed', m.players.every((p) => !p.armed));
  const s = strikerOf(m, 0); s.x = 0; s.y = 0.16;
  applyShot(m, { angle: -Math.PI / 2, power: 0.30 });   // the pill is at the origin, up the board
  ok('landing in the pill arms you for a chot', m.players[0].armed === true);
}

// ---------- kali jota ----------
{
  const m = newMatch({ seed: 21, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  const a0 = m.players[0].stash, b0 = m.players[1].stash;
  const r1 = kaliJota(m, 0, 1, 'kali', 3);
  ok('calling kali on an odd fistful wins it', r1.right && m.players[0].stash === a0 + 3 && m.players[1].stash === b0 - 3);
  const a1 = m.players[0].stash;
  const r2 = kaliJota(m, 0, 1, 'kali', 4);
  ok('calling kali on an even fistful pays the same across', !r2.right && m.players[0].stash === a1 - 4);
  ok('the books balance', m.players[0].stash + m.players[1].stash === a0 + b0);
}

// ---------- the shot gesture ----------
{
  ok('the steadiness ring tightens as you settle', steadiness(0) > steadiness(200) && steadiness(200) > steadiness(339));
  ok('it holds steady through the release window', steadiness(400) === steadiness(900));
  ok('then it shakes wider again', steadiness(1600) > steadiness(900));
  ok('a release in the window has no spread at all', spreadFor(steadiness(500)) === 0);
  ok('a snatched release sprays', spreadFor(steadiness(0)) > 0.08, `${spreadFor(steadiness(0)).toFixed(3)} rad`);
  ok('the window is flagged for the player', inWindow(steadiness(500)) && !inWindow(steadiness(0)));
  ok('full power is past the thumb-lift line', 1 > FOUL_AT && FOUL_AT > 0.8);
  const path = predictPath(board(), { x: 0, y: SHOOT_LINE }, -Math.PI / 2, 0.8, 's0', 1);
  ok('the aim line stops at the first marble in the way', path.length > 2 && path[path.length - 1].y > -RING_R);
}

// ---------- the bot ----------
{
  const played = (a, b, n) => {
    let wins = 0, finished = 0;
    for (let i = 0; i < n; i++) {
      const seed = 4000 + i * 37, r = rng(seed);
      const m = newMatch({ seed, mode: 'chakri', ante: 4, players: [{ name: 'A', kind: 'bot', level: a }, { name: 'B', kind: 'bot', level: b }] });
      let g = 0;
      while (m.phase !== 'over' && g++ < 250) applyShot(m, chooseShot(m, m.turn, r));
      if (m.phase === 'over') finished++;
      if (m.players[0].won > m.players[1].won) wins++;
    }
    return { wins, finished };
  };
  ok('every difficulty is defined with an error spread, not a cheat',
    Object.values(LEVELS).every((l) => l.sd > 0 && l.psd > 0 && l.rollouts > 0));
  ok('the tiers are ordered by how steady their hands are',
    LEVELS.chotu.sd > LEVELS.bunty.sd && LEVELS.bunty.sd > LEVELS.ustaad.sd);
  const u = played('ustaad', 'chotu', 12);
  ok('the Ustaad beats the gully kid clearly', u.wins >= 8, `${u.wins}/12`);
  ok('and every match reaches an end', u.finished === 12);
  const b = played('bunty', 'chotu', 12);
  ok('the mohalla champ beats the gully kid', b.wins >= 7, `${b.wins}/12`);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll Kanche tests passed');
process.exit(failures ? 1 : 0);
