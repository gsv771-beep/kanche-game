// Kanche: physics, rules and the bot ladder. Run: node tests/kanche.test.mjs
import { simulate, marble, STRIKERS, RING_R, SHOOT_LINE, FIELD, dist, powerToClear } from '../public/js/physics.js';
import { newMatch, applyShot, pileSlot, kaliJota, strikerOf, potMarbles, CHANCES, TURN_SHOTS, shotsLeft, targetFor, CHOT_POINTS, lagWinner, lineUp } from '../public/js/rules.js';
import { chooseShot, LEVELS } from '../public/js/bot.js';
import { predictPath, firstOnLine } from '../public/js/input.js';
import * as C from '../public/js/controls.js';
import { rng } from '../public/js/rng.js';
import { say, eventFor, allLines } from '../public/js/strings.js';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' (' + detail + ')' : ''}`); if (!cond) failures++; };
const near = (name, a, e, tol = 1e-6) => ok(name, Math.abs(a - e) <= tol, `got ${a}, expected ${e}`);
const hash = (frames) => frames.reduce((h, f) => f.reduce((g, v) => (Math.imul(g ^ Math.round(v * 1e6), 16777619) >>> 0), h), 2166136261);

/** A match with one target only, so a test can exercise a rule without the clean-hit rule
 *  firing on marbles it did not mean to involve. */
const solo = (seed, at) => {
  const m = newMatch({ seed, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  m.marbles = m.marbles.filter((x) => x.striker || x.id === 'p0');
  const t = m.marbles.find((x) => x.id === 'p0');
  if (at) { t.x = at.x; t.y = at.y; }
  return { m, t, s: strikerOf(m, 0) };
};

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
  const m = newMatch({ seed: 5, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  ok('both players ante up', m.players.every((p) => p.stash === 16));
  ok('the staked marbles are on the ring, plus one in the middle', m.pot === 9 && potMarbles(m).length === 9);
  const edge = potMarbles(m).filter((x) => Math.hypot(x.x, x.y) > 0.2);
  ok('eight sit on the boundary', edge.length === 8);
  ok('one sits at the centre', potMarbles(m).some((x) => Math.hypot(x.x, x.y) < 1e-9));
  ok('the ring is evenly spaced, so neither seat gets the better line', (() => {
    const gaps = edge.map((a) => Math.min(...edge.filter((b) => b !== a).map((b) => dist(a.x, a.y, b.x, b.y))));
    return Math.max(...gaps) - Math.min(...gaps) < 1e-6;
  })());
  ok('and no two are close enough to be hit together by accident',
    Math.min(...edge.map((a) => Math.min(...edge.filter((b) => b !== a).map((b) => dist(a.x, a.y, b.x, b.y))))) > 6 * 0.014);

  const { m: g, s: gs } = solo(5, { x: 0, y: -(m.ringR - 0.02) });
  gs.x = 0; gs.y = SHOOT_LINE;
  const potWas = g.pot, stashWas = g.players[0].stash;
  const out = applyShot(g, { angle: -Math.PI / 2, power: 0.95 });
  ok('knocking one out pays the shooter and empties it from the pot',
    out.summary.gained >= 1 && g.players[0].stash > stashWas && g.pot < potWas);
  ok('and the shooter keeps the turn', out.summary.continues && g.turn === 0);
  ok('the pre-shot snapshot is returned for playback', out.before.length >= g.marbles.length);
}
{
  // The striker-in-ring forfeit is judged at the END of a turn, not on every miss -- otherwise
  // it contradicts the chances rule and takes the striker before you have had your other shots.
  const m = newMatch({ seed: 9, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  const s = strikerOf(m, 0); s.x = 0.0; s.y = 0.12;
  const before = m.players[0].stash;
  const first = applyShot(m, { angle: Math.PI / 2, power: 0.02 });
  ok('a miss inside the ring with chances in hand costs nothing', !first.summary.foul && m.players[0].stash === before);
  let last = null;
  for (let i = 0; i < CHANCES - 1; i++) { strikerOf(m, 0).x = 0; strikerOf(m, 0).y = 0.12; last = applyShot(m, { angle: Math.PI / 2, power: 0.02 }); }
  ok('but the last one forfeits the striker', last.summary.foul && m.players[0].stash === before - 1);
  ok('and the turn passes', m.turn === 1);
  ok('the forfeit goes back into the ring', m.pot === 10);
}
{
  const m = newMatch({ seed: 11, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  const s = strikerOf(m, 0); s.x = 0.05; s.y = 0.05;
  applyShot(m, { angle: 0, power: 0.02, fromLine: true });
  ok('taking the line puts the striker back behind it', Math.abs(strikerOf(m, 0).y - SHOOT_LINE) < 0.35);
}
{
  const m = newMatch({ seed: 13, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  const before = m.players[0].stash;
  applyShot(m, { angle: -Math.PI / 2, power: 0.99, foul: true });
  ok('an overdrawn flick is a thumb-lift foul', m.players[0].stash === before - 1 && m.turn === 1);
}

// ---------- kali jota ----------
{
  const m = newMatch({ seed: 21, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
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
  const m = newMatch({ seed: 31, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
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
  // A score refunds the chance it spent -- it does not hand back the whole set. The first cut
  // did, and a player scoring once every three shots then held the board for the entire game:
  // measured, the opponent never took a single turn in 13 games out of 15.
  const { m } = solo(37, { x: 0, y: -(0.26 - 0.02) });
  applyShot(m, { angle: Math.PI / 2, power: 0.05 });          // a deliberate dud
  ok('down to fewer chances after a miss', m.chances === CHANCES - 1);
  const before = m.chances;
  // applyShot swaps in a fresh marble array, so a reference taken before the shot is stale.
  const st = strikerOf(m, 0); st.x = 0; st.y = SHOOT_LINE;
  const out = applyShot(m, { angle: -Math.PI / 2, power: 0.95 });
  ok('a score costs nothing but does not refill the set', out.summary.gained >= 1 && m.chances === before,
    `${before} -> ${m.chances}`);
  ok('so a miss can never be bought back by a later score', m.chances < CHANCES);
}
{
  // The hard ceiling: no run, however hot, keeps the board forever.
  const m = newMatch({ seed: 41, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  ok('a turn is capped at a few shots', TURN_SHOTS >= 2 && TURN_SHOTS <= 6);
  let shots = 0;
  while (m.turn === 0 && shots < 30) {
    // one marble on the board, teed up on the rim, so every shot is a clean score
    m.marbles = m.marbles.filter((x) => x.striker || !x.striker === false || x.id === potMarbles(m)[0]?.id);
    const keep = potMarbles(m)[0];
    if (!keep) break;
    m.marbles = m.marbles.filter((x) => x.striker || x.id === keep.id);
    keep.x = 0; keep.y = -(m.ringR - 0.02);
    const st = strikerOf(m, 0); st.x = 0; st.y = SHOOT_LINE;
    applyShot(m, { angle: -Math.PI / 2, power: 0.95 });
    shots++;
  }
  ok('even scoring every single shot, the turn ends', shots <= TURN_SHOTS, `${shots} shots taken`);
  ok('and the pips count shots left in the turn, not raw chances',
    shotsLeft(m) <= TURN_SHOTS && shotsLeft(m) <= CHANCES);
}

// ---------- the bot ----------
{
  const played = (a, b, n) => {
    let wins = 0, finished = 0;
    for (let i = 0; i < n; i++) {
      const seed = 4000 + i * 37, r = rng(seed);
      const m = newMatch({ seed, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A', kind: 'bot', level: a }, { name: 'B', kind: 'bot', level: b }] });
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
  // powerToClear describes a SQUARE hit -- the marble leaving along the line of centres,
  // straight out of the ring. So aim at the ghost point, or the test is measuring a thin cut
  // against a formula that never claimed to cover one.
  const { m, t: tgt, s } = solo(5, { x: 0, y: -(0.26 - 0.03) });
  const ex = tgt.x / Math.hypot(tgt.x, tgt.y), ey = tgt.y / Math.hypot(tgt.x, tgt.y);
  const gx = tgt.x - ex * (tgt.r + s.r), gy = tgt.y - ey * (tgt.r + s.r);
  const aim = Math.atan2(gy - s.y, gx - s.x);
  ok('the aim line finds the marble it will actually hit',
    !!firstOnLine(m.marbles, { x: s.x, y: s.y }, aim, 's0'));
  const need = powerToClear(s, tgt, m.ringR, s.x, s.y);
  ok('the required power is a sane fraction of the bar', need > 0.2 && need < 1, need.toFixed(2));

  // Sweep the bar rather than poking at magic offsets: find the power at which the striker
  // first arrives, and the power at which something first clears the line.
  const at = (pw) => simulate(m.marbles, { id: 's0', angle: aim, power: pw }, { ringR: m.ringR }).events;
  let pReach = null, pOut = null;
  for (let pw = 0.05; pw <= 1.0001; pw += 0.01) {
    const ev = at(pw);
    if (pReach === null && ev.firstContact) pReach = pw;
    if (pOut === null && ev.knockedOut.length) { pOut = pw; break; }
  }
  ok('there is a power at which the striker arrives', pReach !== null, `${(pReach || 0).toFixed(2)}`);
  ok('and a higher one at which the marble clears the line', pOut !== null && pOut > pReach,
    `reaches ${pReach?.toFixed(2)}, clears ${pOut?.toFixed(2)}`);
  ok('between them the shot connects and scores nothing -- the band that read as a broken game',
    at((pReach + pOut) / 2).firstContact && at((pReach + pOut) / 2).knockedOut.length === 0);
  ok('the mark drawn on the meter agrees with where it actually clears',
    Math.abs(need - pOut) < 0.12, `meter says ${need.toFixed(2)}, reality ${pOut.toFixed(2)}`);
  ok('below the arrival power nothing is touched at all', !at(Math.max(0.05, pReach - 0.1)).firstContact);
}

// ---------- chances in the hole mode ----------
{
  const m = newMatch({ seed: 17, mode: 'pill', first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  ok('the hole mode opens with a full set of chances too', m.chances === CHANCES);
  const away = { angle: 0.3, power: 0.04 };
  const a = applyShot(m, away);
  ok('a wasted shot costs a chance, not the turn', m.turn === 0 && a.summary.continues && m.chances === CHANCES - 1);
  for (let i = 0; i < CHANCES - 1; i++) applyShot(m, away);
  ok('the turn passes once they are used up', m.turn === 1 && m.chances === CHANCES);
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
    const m = newMatch({ seed: g * 7 + 1, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
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

// ---------- the clean-hit rule ----------
{
  // A shot may disturb exactly one marble. Knock one into its neighbour, or carom the striker
  // through the pack, and the turn is over however much went out. This is what separates a
  // precision game from a power one, and in bot-vs-bot it is the whole skill gap: the beginner
  // scatters on 20% of shots, the ustaad on 3%.
  const m = newMatch({ seed: 5, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  const edge = potMarbles(m).filter((x) => Math.hypot(x.x, x.y) > 0.2);

  // set two marbles side by side so one must shove the other, and aim at the pair
  const a = edge[0], b2 = edge[1];
  b2.x = a.x + 0.02; b2.y = a.y + 0.015;
  const st = strikerOf(m, 0);
  const shot = { angle: Math.atan2(a.y - st.y, a.x - st.x), power: 0.85 };
  const res = applyShot(m, shot);
  ok('a shot that disturbs two marbles is reported as touching both', res.events.touched.length >= 2,
    `touched ${res.events.touched.length}`);
  ok('and it ends the turn regardless of what went out', res.summary.dirty === true && !res.summary.continues);
  ok('the turn passes to the opponent', m.turn === 1);
}
{
  // The counterpart: a lone marble, cleanly struck, scores and keeps the turn.
  const m = newMatch({ seed: 9, mode: 'chakri', ante: 4, first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  m.marbles = m.marbles.filter((x) => x.striker || x.id === 'p0');
  const t = m.marbles.find((x) => x.id === 'p0');
  const st = strikerOf(m, 0);
  const res = applyShot(m, { angle: Math.atan2(t.y - st.y, t.x - st.x), power: 0.8 });
  ok('one marble touched is a clean shot', res.events.touched.length === 1 && !res.summary.dirty);
  ok('it scores and the turn continues', res.summary.gained === 1 && res.summary.continues);
}

// ---------- lagging for turn order ----------
{
  ok('the closest throw opens', lagWinner([0.30, 0.12, 0.45]) === 1);
  ok('a tie goes to the earlier thrower, so there is no re-throw loop', lagWinner([0.2, 0.2]) === 0);
  ok('one player lags against nobody', lagWinner([0.3]) === 0);

  const m = newMatch({ seed: 3, mode: 'pill', first: 0, players: [{ name: 'A' }, { name: 'B' }] });
  strikerOf(m, 0).x = 0.4; strikerOf(m, 0).y = -0.2;
  lineUp(m);
  const a = strikerOf(m, 0), b = strikerOf(m, 1);
  ok('lining up puts everyone back behind the line', a.y === SHOOT_LINE && b.y === SHOOT_LINE);
  ok('and mirrored, so the throw is the same shot for both', Math.abs(a.x + b.x) < 1e-9);

  // The point of lagging is that a better player wins the opening more often than a coin would.
  // Throwing at the hole is the bot's `needsHole` shot, so this measures the real thing.
  const lagOnce = (lvl, seed) => {
    const r = rng(seed);
    const q = newMatch({ seed, mode: 'pill', first: 0, players: [{ name: 'X', kind: 'bot', level: lvl }, { name: 'Y', kind: 'bot', level: lvl }] });
    lineUp(q); q.players.forEach((p) => { p.needsHole = true; });
    const me = strikerOf(q, 0);
    const shot = chooseShot(q, 0, r);
    const res = simulate(q.marbles, { ...shot, id: 's0' }, { ringR: q.ringR, pill: true });
    const rest = res.marbles.find((x) => x.id === 's0');
    return Math.hypot(rest.x, rest.y);
  };
  const avg = (lvl) => { let t = 0; for (let i = 0; i < 25; i++) t += lagOnce(lvl, 600 + i * 31); return t / 25; };
  const ust = avg('ustaad'), cho = avg('chotu');
  ok('a better player lands the lag closer to the hole', ust < cho,
    `ustaad ${(ust * 100).toFixed(0)}cm vs chotu ${(cho * 100).toFixed(0)}cm`);
  ok('and close enough for it to be a real contest', ust < 0.12, `${(ust * 100).toFixed(0)}cm`);
}

// ---------- the opponent's mouth ----------
{
  const chars = allLines();
  ok('all three characters have their own lines', chars.length === 3 && chars.every(([, l]) => l.length > 30),
    chars.map(([k, l]) => `${k}:${l.length}`).join(' '));
  ok('nobody shares a line with anybody else', (() => {
    const all = chars.flatMap(([, l]) => l);
    return new Set(all).size === all.length;
  })());

  // Every event the router can produce must have something to say, in every voice. A missing
  // pool means the opponent silently says nothing at the exact moment he should be talking.
  const events = ['start', 'lagWin', 'lagLose', 'botScore', 'botBig', 'botMiss', 'botFoul',
                  'botDirty', 'botRun', 'youScore', 'youBig', 'youMiss', 'youNear', 'youFoul',
                  'youDirty', 'youOut', 'ahead', 'behind', 'matchPoint', 'win', 'lose'];
  const r2 = rng(5);
  const gaps = [];
  for (const lvl of ['chotu', 'bunty', 'ustaad']) for (const e of events) {
    if (!say(lvl, e, r2, new Set())) gaps.push(`${lvl}.${e}`);
  }
  ok('every event has a line in every voice', gaps.length === 0, gaps.join(', '));

  ok('the router picks the most specific thing that happened',
    eventFor({ by: 0, dirty: true, foul: true, gained: 3 }, {}) === 'youDirty' &&
    eventFor({ by: 0, foul: true, gained: 3 }, {}) === 'youFoul' &&
    eventFor({ by: 1, gained: 10 }, { botStreak: 3 }) === 'botRun' &&
    eventFor({ by: 0, gained: 0, continues: true }, { touched: true }) === 'youNear' &&
    eventFor({ by: 0, gained: 0, continues: false }, {}) === 'youOut');

  // It never says the same thing twice running, which is the repeat anyone notices.
  const r3 = rng(9), u = new Set();
  let backToBack = 0, prev = '';
  for (let i = 0; i < 200; i++) {
    const line = say('bunty', events[i % events.length], r3, u);
    if (line && line === prev) backToBack++;
    prev = line;
  }
  ok('and never repeats itself back to back, even once its pools run dry', backToBack === 0);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll Kanche tests passed');
process.exit(failures ? 1 : 0);
