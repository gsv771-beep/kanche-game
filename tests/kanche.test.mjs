// Kanche: physics, rules and the bot ladder. Run: node tests/kanche.test.mjs
import { simulate, marble, STRIKERS, RING_R, SHOOT_LINE, FIELD, dist, powerToClear } from '../public/js/physics.js';
import { newMatch, applyShot, pileSlot, kaliJota, strikerOf, potMarbles, CHANCES } from '../public/js/rules.js';
import { chooseShot, LEVELS } from '../public/js/bot.js';
import { predictPath, firstOnLine } from '../public/js/input.js';
import * as C from '../public/js/controls.js';
import { rng } from '../public/js/rng.js';
import { readFileSync } from 'node:fs';

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
  // The striker-in-ring forfeit is judged at the END of a turn, not on every miss -- otherwise
  // it contradicts the chances rule and takes the striker before you have had your other shots.
  const m = newMatch({ seed: 9, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  const s = strikerOf(m, 0); s.x = 0.0; s.y = 0.12;
  const before = m.players[0].stash;
  const first = applyShot(m, { angle: Math.PI / 2, power: 0.02 });
  ok('a miss inside the ring with chances in hand costs nothing', !first.summary.foul && m.players[0].stash === before);
  let last = null;
  for (let i = 0; i < CHANCES - 1; i++) { strikerOf(m, 0).x = 0; strikerOf(m, 0).y = 0.12; last = applyShot(m, { angle: Math.PI / 2, power: 0.02 }); }
  ok('but the last one forfeits the striker', last.summary.foul && m.players[0].stash === before - 1);
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

// ---------- the controls ----------
{
  const path = predictPath(board(), { x: 0, y: SHOOT_LINE }, -Math.PI / 2, 0.8, 's0', 1);
  ok('the aim line stops at the first marble in the way', path.length > 2 && path[path.length - 1].y > -RING_R);

  const c = C.createControls();
  ok('a tap of an arrow is a fine nudge, under two degrees', (() => {
    const a0 = c.angle; C.nudge(c, 1); return c.angle > a0 && c.angle - a0 < 2 * Math.PI / 180;
  })());
  ok('holding it ramps up: the second second sweeps further than the first', (() => {
    const q = C.createControls(); let first = 0;
    for (let i = 0; i < 60; i++) C.sweep(q, 1, 1 / 60); first = q.angle;
    for (let i = 0; i < 60; i++) C.sweep(q, 1, 1 / 60);
    return (q.angle - first) > first * 1.4;
  })());
  ok('arrows turn the right way: right increases the angle, which points right on screen', (() => {
    const q = C.createControls(); const up = q.angle; C.nudge(q, 1);
    return Math.cos(q.angle) > Math.cos(up);      // +x is screen-right
  })());

  // the three-tap meter
  const m = C.createControls();
  ok('it starts idle', m.stage === 'idle' && C.press(m, 0) === null);
  ok('the first tap starts the power sweep', m.stage === 'power');
  C.tick(m, 500);
  ok('the marker moves while sweeping', m.marker > 0 && m.marker <= 1);
  ok('the second tap locks power and starts the release run', C.press(m, 500) === null && m.stage === 'accuracy' && m.power > 0);
  C.tick(m, 500);
  const perfect = C.press(m, 500 + 719);   // marker has run all the way home
  ok('a release inside the green band is true', perfect && perfect.band && perfect.missed === 0, JSON.stringify(perfect));

  const n = C.createControls();
  C.press(n, 0); C.tick(n, 500); C.press(n, 500); C.tick(n, 505);
  const early = C.press(n, 505);
  ok('a release taken far from the band pulls the shot', early && !early.band && early.missed > 0, JSON.stringify(early));
  ok('the pull is capped at a few degrees', C.MAX_PULL > 0 && C.MAX_PULL < 10 * Math.PI / 180);
  ok('a run that is never released is treated as the worst case', (() => {
    const q = C.createControls(); C.press(q, 0); C.tick(q, 400); C.press(q, 400);
    C.tick(q, 400 + 900); return q.stage === 'late';
  })());
}

// ---------- chances ----------
{
  const m = newMatch({ seed: 31, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  ok('a turn opens with a full set of chances', m.chances === CHANCES && CHANCES >= 2);
  const away = { angle: Math.PI / 2, power: 0.05 };        // a deliberate dud, well clear of the pile
  const a = applyShot(m, away);
  ok('a miss costs a chance but keeps the turn', m.chances === CHANCES - 1 && m.turn === 0 && a.summary.continues);
  const sx = strikerOf(m, 0).x, sy = strikerOf(m, 0).y;
  ok('and the striker stays exactly where it stopped', Math.abs(strikerOf(m, 0).x - sx) < 1e-9 && Math.abs(strikerOf(m, 0).y - sy) < 1e-9);
  for (let i = 0; i < CHANCES - 1; i++) applyShot(m, away);
  ok('when the chances run out the turn passes', m.turn === 1);
  ok('and the next player starts with a full set', m.chances === CHANCES);
  ok('the striker is put back behind the line for next time', strikerOf(m, 0).y > 0.5);
}
{
  // A score buys the whole turn back.
  const m = newMatch({ seed: 37, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  applyShot(m, { angle: Math.PI / 2, power: 0.05 });
  ok('down to fewer chances after a miss', m.chances === CHANCES - 1);
  const t = potMarbles(m)[0]; t.x = 0; t.y = -(m.ringR - 0.02);
  const s = strikerOf(m, 0); s.x = 0; s.y = SHOOT_LINE;
  const out = applyShot(m, { angle: -Math.PI / 2, power: 0.95 });
  ok('knocking one out refills the chances', out.summary.gained >= 1 && m.chances === CHANCES);
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

// ---------- the power a shot actually needs ----------
{
  // The reported bug: a shot that visibly HITS still scores nothing, with nothing on screen
  // saying why. The guidance the meter draws has to agree with what the simulator does.
  const m = newMatch({ seed: 5, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
  const s = strikerOf(m, 0);
  const aim = Math.atan2(-s.y, -s.x);
  const tgt = firstOnLine(m.marbles, { x: s.x, y: s.y }, aim, 's0');
  ok('the aim line finds the marble it will actually hit', !!tgt && !tgt.striker);
  const need = powerToClear(s, tgt, m.ringR, s.x, s.y);
  ok('the required power is a sane fraction of the bar', need > 0.2 && need < 1, need.toFixed(2));

  const outs = (pw) => simulate(m.marbles, { id: 's0', angle: aim, power: pw }, { ringR: m.ringR }).events.knockedOut.length;
  ok('below the mark nothing clears the line', outs(Math.max(0.05, need - 0.18)) === 0);
  ok('at the mark, or just past it, something does', outs(Math.min(0.99, need + 0.1)) > 0,
    `need ${need.toFixed(2)}`);
  // There is a real band between "reaches the pile" and "clears the line": the shot connects,
  // nothing goes out, and that is exactly what read as the game being broken.
  ok('just under the mark the shot connects but scores nothing', (() => {
    const ev = simulate(m.marbles, { id: 's0', angle: aim, power: need - 0.06 }, { ringR: m.ringR }).events;
    return !!ev.firstContact && ev.knockedOut.length === 0;
  })(), `need ${need.toFixed(2)}`);
  ok('and well under it the striker does not even arrive', (() => {
    const ev = simulate(m.marbles, { id: 's0', angle: aim, power: Math.max(0.05, need - 0.25) }, { ringR: m.ringR }).events;
    return !ev.firstContact;
  })());
}

// ---------- chances in the hole mode ----------
{
  const m = newMatch({ seed: 17, mode: 'pill', ante: 3, players: [{ name: 'A' }, { name: 'B' }] });
  ok('the hole mode opens with a full set of chances too', m.chances === CHANCES);
  const away = { angle: 0.3, power: 0.05 };
  const a = applyShot(m, away);
  ok('missing the pill costs a chance, not the turn', m.turn === 0 && a.summary.continues && m.chances === CHANCES - 1);
  const sx = strikerOf(m, 0).x, sy = strikerOf(m, 0).y;
  ok('and the striker stays where it stopped', Math.abs(strikerOf(m, 0).x - sx) < 1e-9 && Math.abs(strikerOf(m, 0).y - sy) < 1e-9);
  for (let i = 0; i < CHANCES - 1; i++) applyShot(m, away);
  ok('the turn passes once they are used up', m.turn === 1 && m.chances === CHANCES);

  const n = newMatch({ seed: 17, mode: 'pill', ante: 3, players: [{ name: 'A' }, { name: 'B' }] });
  applyShot(n, away);
  const s = strikerOf(n, 0); s.x = 0; s.y = 0.16;
  applyShot(n, { angle: -Math.PI / 2, power: 0.30 });
  ok('landing in the pill arms you and refills the chances', n.players[0].armed && n.chances === CHANCES);
}

// ---------- nothing may come to rest where the player cannot see it ----------
{
  // The field and the camera were separate rectangles and drifted 26cm apart, exactly in the
  // direction knocked-out marbles fly: two marbles a shot settled off-screen, and a striker
  // that landed there could not be aimed. render.js now imports FIELD as its camera window,
  // so this test fails the moment they diverge again.
  ok('the ring and the shooting line both fit inside the patch',
    RING_R + 0.014 < Math.min(-FIELD.y0, FIELD.x1) && SHOOT_LINE < FIELD.y1);
  ok('there is still room outside the ring for a marble to be knocked clear',
    -FIELD.y0 > RING_R + 3 * 0.014, `${(-FIELD.y0 - RING_R).toFixed(3)}m of run-out`);

  let offscreen = 0, knocked = 0, shots = 0;
  for (let g = 0; g < 25; g++) {
    const m = newMatch({ seed: g * 7 + 1, mode: 'chakri', ante: 4, players: [{ name: 'A' }, { name: 'B' }] });
    const st = strikerOf(m, 0);
    for (const pw of [0.7, 0.85, 1.0]) {
      for (const off of [-0.25, 0, 0.25]) {
        const res = simulate(m.marbles, { id: 's0', angle: Math.atan2(-st.y, -st.x) + off, power: pw }, { ringR: m.ringR });
        shots++; knocked += res.events.knockedOut.length;
        for (const q of res.marbles) {
          if (q.x < FIELD.x0 - 1e-6 || q.x > FIELD.x1 + 1e-6 || q.y < FIELD.y0 - 1e-6 || q.y > FIELD.y1 + 1e-6) offscreen++;
        }
      }
    }
  }
  ok('no marble ever rests outside the patch', offscreen === 0, `${shots} shots, ${offscreen} escaped`);
  ok('and marbles are still being knocked clear of the ring', knocked > shots * 0.4, `${knocked} in ${shots} shots`);
}

// ---------- the build stamp must not drift ----------
{
  // The page compares the build baked into index.html against version.json to tell a stale
  // cached copy from a real bug. If those two ever disagree, every visitor is told to update
  // forever -- so this fails the build instead.
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const ver = JSON.parse(readFileSync(new URL('../public/version.json', import.meta.url), 'utf8'));
  const inPage = (html.match(/KANCHE_BUILD = '([^']+)'/) || [])[1];
  ok('index.html declares a build', !!inPage, inPage);
  ok('version.json matches it', inPage === ver.build, `page ${inPage} vs version.json ${ver.build}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll Kanche tests passed');
process.exit(failures ? 1 : 0);
