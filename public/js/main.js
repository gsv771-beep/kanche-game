// Wiring. Owns the screens, the turn loop and the playback of a settled shot.
import { newMatch, applyShot, current, strikerId, strikerOf, kaliJota, CHANCES, TURN_SHOTS, shotsLeft, lagWinner, lineUp, buyStriker, NEW_STRIKER } from './rules.js';
import { chooseShot, thinkTime, LEVELS } from './bot.js';
import * as R from './render.js';
import { attachInput, predictPath, firstOnLine } from './input.js';
import * as C from './controls.js';
import * as A from './audio.js';
import { mountAvatar, setAvatarState, AVATARS, CHOTU_CRYING, FIST, palm } from './avatars.js';
import { say, summaryLine, eventFor } from './strings.js';
import { rng } from './rng.js';
import { SHOOT_LINE, dist, powerToClear, simulate } from './physics.js';

const $ = (s) => document.querySelector(s);
const show = (id) => document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-on', s.id === id));

const store = {
  get(k, d) { try { const v = localStorage.getItem('kanche.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kanche.' + k, JSON.stringify(v)); } catch {} },
};

const START_STASH = 20;   // what both players bring to the field, every match
let pocketBase = 0;       // marbles won across all previous matches, before this one
let pick = { mode: 'chakri', bot: 'bunty', striker: 'goli', surface: 'maidan' };
let match = null, r = null, phase = 'idle', fromLine = false, used = new Set();
const ctl = C.createControls();
const FOUL_AT = 0.97;   // was 0.92, which made the top of the bar a trap rather than a choice
let needPower = 0;      // power the shot on this line actually requires, shown on the meter
let held = 0;        // an aim arrow being held down
let dragging = false;
let lagging = false; // the pre-game throw for turn order
let lagDist = [];
let botStreak = 0;   // consecutive scoring shots inside the opponent's current turn
let wager = 1;       // 2 once a double-or-nothing has been taken
let wagerDone = false;
let play = null;          // { before, frames, events, summary, i, dinged:Set }
let botPreview = null;    // the opponent's wandering aim line while it thinks
const canvas = $('#board');

/* ---------------- setup screen ---------------- */
document.querySelectorAll('#pick-mode .card').forEach((b) => b.onclick = () => sel('#pick-mode', b, () => pick.mode = b.dataset.mode));
document.querySelectorAll('#pick-bot .card').forEach((b) => b.onclick = () => sel('#pick-bot', b, () => pick.bot = b.dataset.bot));
document.querySelectorAll('#pick-striker .card').forEach((b) => b.onclick = () => sel('#pick-striker', b, () => pick.striker = b.dataset.striker));
document.querySelectorAll('#pick-surface .card').forEach((b) => b.onclick = () => sel('#pick-surface', b, () => pick.surface = b.dataset.surface));
function sel(group, btn, fn) {
  document.querySelectorAll(`${group} .card`).forEach((c) => c.classList.toggle('is-sel', c === btn));
  fn(); A.unlock();
}
document.querySelectorAll('#pick-bot .card').forEach((b) => { b.querySelector('.ava-box').innerHTML = AVATARS[b.dataset.bot]; });

// The ladder. You start against the gully kid and each one you beat opens the next -- so the
// first thing a new player meets is someone they can actually beat, and Guddi is something you
// arrive at rather than something you pick off a menu.
const LADDER = ['chotu', 'bunty', 'ustaad', 'guddi'];
const beaten = () => store.get('beaten', []);
const unlocked = (id) => { const i = LADDER.indexOf(id); return i <= 0 || beaten().includes(LADDER[i - 1]); };
function drawLadder() {
  document.querySelectorAll('#pick-bot .card').forEach((b) => {
    const ok = unlocked(b.dataset.bot);
    b.classList.toggle('locked', !ok);
    b.disabled = !ok;
  });
  if (!unlocked(pick.bot)) { pick.bot = LADDER.find((id) => unlocked(id) && !beaten().includes(id)) || 'chotu'; }
  document.querySelectorAll('#pick-bot .card').forEach((c) => c.classList.toggle('is-sel', c.dataset.bot === pick.bot));
  const next = LADDER.find((id) => !unlocked(id));
  $('#ladder-note').textContent = next
    ? `Beat ${LEVELS[LADDER[LADDER.indexOf(next) - 1]].name} to face ${LEVELS[next].name}.`
    : 'You have faced everyone on this gully.';
}
drawLadder();
$('#btn-play').onclick = () => { A.unlock(); startLag(); };
$('#btn-again').onclick = () => startLag();
let quitArmed = null;
$('#btn-quit').onclick = () => {
  const b = $('#btn-quit');
  if (quitArmed) { clearTimeout(quitArmed); quitArmed = null; b.classList.remove('armed'); b.textContent = '✕'; return toMenu(); }
  b.classList.add('armed'); b.textContent = 'Leave?';
  quitArmed = setTimeout(() => { quitArmed = null; b.classList.remove('armed'); b.textContent = '✕'; }, 3000);
};
function toMenu() {
  drawLadder();
  phase = 'idle'; play = null; botPreview = null; lagging = false; match = null;
  window.__match = null; bubble(null);
  show('screen-setup');
}
$('#btn-menu').onclick = () => toMenu();
$('#btn-mute').onclick = () => { A.setMuted(!A.isMuted()); $('#btn-mute').textContent = A.isMuted() ? '🔇' : '🔊'; };
$('#btn-newstriker').onclick = () => {
  if (!match || !buyStriker(match, 0)) return;
  $('#btn-newstriker').hidden = true;
  msg(`Fresh striker. That cost you ${NEW_STRIKER}.`);
  defaultAim(); hud();
};
$('#btn-line').onclick = () => { fromLine = true; $('#btn-line').hidden = true; msg('From the line. Your shot.'); };

/* ---------------- button controls ---------------- */
const myTurn = () => phase === 'aim' && match && current(match).kind === 'human';
function holdPad(id, dir) {
  const el = $(id);
  const down = (e) => { if (!myTurn()) return; e.preventDefault(); A.unlock(); held = dir; C.nudge(ctl, dir); };
  const up = () => { held = 0; C.releaseHold(ctl); };
  el.addEventListener('pointerdown', down);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, up));
}
holdPad('#pad-l', -1); holdPad('#pad-r', 1);
$('#pad-go').addEventListener('pointerdown', (e) => {
  e.preventDefault(); A.unlock();
  if (!myTurn()) return;
  const shot = C.press(ctl, performance.now());
  if (!shot) return;
  // The release error is drawn from the match RNG so the shot record still replays exactly.
  const err = r.normal(0, shot.missed * C.MAX_PULL);
  A.flick(shot.power);
  fire({ angle: ctl.angle + err, power: shot.power, foul: shot.power > FOUL_AT, fromLine });
  fromLine = false;
});


/* ---------------- lagging ---------------- */
/**
 * Before the game, everyone throws at the hole from the line and the closest opens. It is how
 * the street settles turn order, and it matters: between identical bots the opener wins 70-78%
 * of matches, which is far too much for a coin to decide. A throw makes the advantage earned.
 * It doubles as the tutorial -- your first shot of a session is a soft one at a big target.
 */
function startLag() {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  r = rng(seed); used = new Set(); lagging = true; lagDist = [];
  match = newMatch({ seed, mode: 'pill', first: 0, surface: pick.surface, players: playerSpecs() });
  lineUp(match);
  // Both "owe the hole", which is exactly the shot a lag is -- and it makes the bot aim there.
  match.players.forEach((p) => { p.needsHole = true; });
  phase = 'aim'; fromLine = false; play = null; botPreview = null; window.__match = match;
  C.cancel(ctl);
  $('#bot-name').textContent = match.players[1].name;
  mountAvatar($('#ava-wrap'), pick.bot, 'idle');
  $('#a2hs').hidden = true;
  show('screen-game');
  R.resize(); hud(); defaultAim();
  msg('Lag for first shot — get closest to the hole.');
  if (current(match).kind === 'bot') botTurn();
}

function lagFire(shot) {
  phase = 'anim'; botPreview = null;
  const id = strikerId(match.turn);
  const before = match.marbles.map((x) => ({ ...x }));
  const res = simulate(match.marbles, { ...shot, id }, { ringR: match.ringR, pill: true, mud: match.mud });
  match.marbles = res.marbles;
  const me = match.marbles.find((x) => x.id === id);
  lagDist[match.turn] = Math.hypot(me.x, me.y);
  play = { frames: res.frames, events: res.events, before, i: 0, t: 0, dinged: new Set(),
           summary: { by: match.turn, lag: true } };
}

function lagSettle() {
  const who = play.summary.by;
  const cm = (lagDist[who] * 100).toFixed(0);
  play = null;
  msg(`${match.players[who].name}: ${cm}cm from the hole.`);
  hud();
  if (lagDist.filter((d) => d !== undefined).length < match.players.length) {
    match.turn = (who + 1) % match.players.length;
    if (current(match).kind === 'bot') return setTimeout(botTurn, 700);
    phase = 'aim'; defaultAim();
    return;
  }
  const first = lagWinner(lagDist);
  setTimeout(() => {
    msg(`${match.players[first].name} lagged closest — ${match.players[first].name} opens.`);
    bubble(say(match.players[1].level, first === 1 ? 'lagWin' : 'lagLose', r, used));
    setAvatarState($('#ava-wrap'), first === 1 ? 'happy' : 'idle');
    setTimeout(() => start(first), 1600);
  }, 700);
}

/* ---------------- match ---------------- */
const playerSpecs = () => [
  { name: 'You', kind: 'human', striker: pick.striker, skin: 'kanch', stash: START_STASH },
  { name: LEVELS[pick.bot].name, kind: 'bot', level: pick.bot, avatar: pick.bot,
    striker: pick.bot === 'ustaad' ? 'dhampar' : 'goli', skin: 'lakhoti', stash: START_STASH },
];

function start(first = null) {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  r = rng(seed);
  used = new Set();
  // Both players start every match level. The stash used to carry over for the human only,
  // while the bot reset to 20 -- so after a few games the counts read 27 against 20 and never
  // went back. What you keep across matches is the pocket below, which is a separate number and
  // does not touch the count either player plays with.
  match = newMatch({ seed, mode: pick.mode, ante: 4, first, surface: pick.surface, players: playerSpecs() });
  lagging = false;
  phase = 'aim'; fromLine = false; play = null; botPreview = null; window.__match = match;
  C.cancel(ctl);
  $('#bot-name').textContent = match.players[1].name;
  mountAvatar($('#ava-wrap'), pick.bot, 'idle');
  if (pick.bot === 'chotu' && store.get('lent', false)) {
    store.set('lent', false);
    store.set('pocket', store.get('pocket', 0) + 4);     // three back, and one for the wait
    bubble(say('chotu', 'payback', r, used));
  } else bubble(say(pick.bot, 'start', r, used));
  $('#a2hs').hidden = true;      // never let the hint sit over the board
  show('screen-game');
  R.resize(); hud(); defaultAim();
  msg(match.mode === 'pill'
    ? `Chot their marble for 10, then back through the hole. First to ${match.target} sinks it to win.`
    : 'Touch the board to aim, then SHOOT.');
  if (current(match).kind === 'bot') botTurn();
}

// The predicted path is a teaching aid, not a permanent crutch: it shortens as you win, so
// judging the line becomes your job rather than the game's.
const assist = () => { const w = store.get('wins', 0); return w >= 8 ? 0.28 : w >= 4 ? 0.5 : w >= 2 ? 0.75 : 1; };

/** Point the striker at something. The opening aim used to be straight up while the striker
 *  starts off-centre, so tapping SHOOT without aiming missed the pile entirely. */
function defaultAim() {
  const o = originFor(0);
  const near = (list) => list.length
    ? list.reduce((a, b) => (dist(o.x, o.y, a.x, a.y) <= dist(o.x, o.y, b.x, b.y) ? a : b))
    : { x: 0, y: 0 };
  // In Pill Chot what you should be pointing at changes shot to shot: the hole when you owe it
  // a visit or you are on the target, an opponent otherwise.
  const p0 = match.players[0];
  const t = match.mode === 'pill'
    ? ((p0.needsHole || p0.points >= match.target) ? { x: 0, y: 0 }
       : near(match.marbles.filter((x) => x.striker && x.owner !== 0 && !x.inPill)))
    : near(match.marbles.filter((x) => !x.striker && !x.out));
  ctl.angle = Math.atan2(t.y - o.y, t.x - o.x);
}

/* ---------------- input ---------------- */
const originFor = (pid) => {
  if (fromLine || pid !== 0) {
    const s = strikerOf(match, pid);
    if (fromLine && pid === 0) return { x: (pid - (match.players.length - 1) / 2) * 0.11, y: SHOOT_LINE };
    return { x: s.x, y: s.y };
  }
  const s = strikerOf(match, pid);
  return { x: s.x, y: s.y };
};

attachInput(canvas, {
  isActive: myTurn,
  origin: () => originFor(0),
  onAngle: (rad) => { ctl.angle = rad; },
  onDragging: (v) => { dragging = v; },
});

function fire(shot) {
  if (lagging) return lagFire(shot);
  phase = 'anim';
  botPreview = null;
  $('#btn-line').hidden = true;
  const out = applyShot(match, shot);
  play = { ...out, i: 0, t: 0, dinged: new Set() };
}

/* ---------------- bot ---------------- */
function botTurn() {
  phase = 'bot';
  setAvatarState($('#ava-wrap'), 'thinking');
  msg(`${match.players[1].name} is lining it up…`);
  // Decide now, reveal later: the pause is theatre, but the wandering aim line is honest --
  // it is drawn around the shot the bot actually chose.
  const shot = chooseShot(match, 1, r);
  const wait = thinkTime(match.players[1].level, r);
  botPreview = { angle: shot.angle, power: shot.power, t0: performance.now() };
  setTimeout(() => { if (phase === 'bot') { A.flick(shot.power); fire(shot); } }, wait);
}

/**
 * Double or nothing, offered mid-match by the two who would actually dare. Once, and only when
 * the game is half gone and still close -- an offer made when it is already decided is not a
 * gamble, it is a formality.
 */
function maybeWager() {
  if (wagerDone || wager > 1 || !match || match.phase === 'over') return;
  const bot = match.players[1];
  if (bot.level !== 'ustaad' && bot.level !== 'guddi') return;
  const half = match.mode === 'pill'
    ? Math.max(...match.players.map((p) => p.points)) >= match.target * 0.4
    : match.pot <= match.ante * match.players.length * 0.6;
  if (!half || Math.abs(standing()) > 1) return;
  wagerDone = true;
  $('#wager-txt').textContent = `${bot.name}: ${say(bot.level, 'wagerOffer', r, used)}`;
  $('#wager').hidden = false;
}
$('#wager-yes').onclick = () => {
  $('#wager').hidden = true; wager = 2;
  bubble(say(match.players[1].level, 'wagerYes', r, used));
  msg('Double or nothing. Everything counts twice now.');
};
$('#wager-no').onclick = () => {
  $('#wager').hidden = true;
  bubble(say(match.players[1].level, 'wagerNo', r, used));
};

/** Positive when the opponent is in front. */
function standing() {
  const [you, bot] = match.players;
  return match.mode === 'pill' ? Math.sign(bot.points - you.points) : Math.sign(bot.won - you.won);
}
/** One more score and that player takes the game. */
function onMatchPoint(pid) {
  const p = match.players[pid];
  return match.mode === 'pill' ? p.points >= match.target : match.pot <= 1;
}

/* ---------------- settle ---------------- */
function settle() {
  if (play.summary.lag) return lagSettle();
  const { summary: sum } = play;
  const turnChanged = !sum.continues;
  const bot = match.players[1];
  const mine = sum.by === 0;
  if (sum.gained > 0) A.ding();
  if (sum.foul || sum.shattered) A.thud();

  botStreak = mine ? 0 : (sum.gained > 0 ? botStreak + 1 : 0);
  // He comments on every shot now, yours included. A silent opponent is a scoreboard.
  const ev = eventFor(sum, { touched: !!play.events.firstContact, botStreak });
  setAvatarState($('#ava-wrap'),
    mine ? (sum.gained > 0 ? 'sad' : sum.foul || sum.dirty ? 'happy' : 'idle')
         : (sum.gained > 0 ? 'happy' : sum.foul || sum.dirty ? 'sad' : 'idle'));
  // One more score and he takes it: worth saying out loud, and it beats any other line.
  bubble(say(bot.level, sum.shattered ? (mine ? 'shatter' : 'botShatter')
    : onMatchPoint(1) ? 'matchPoint' : ev, r, used));
  msg(summaryLine(sum, match.players));
  play = null; hud();

  if (match.phase === 'over') return setTimeout(over, 900);
  const cur = current(match);
  if (turnChanged) botStreak = 0;
  if (cur.kind === 'bot') return setTimeout(botTurn, 650);
  if (turnChanged) setTimeout(maybeWager, 900);
  // A word on the standings when the board changes hands, now and then.
  if (turnChanged && r.next() < 0.35) {
    const lead = standing();
    if (lead !== 0) setTimeout(() => bubble(say(bot.level, lead > 0 ? 'ahead' : 'behind', r, used)), 1400);
  }
  phase = 'aim';
  if (turnChanged) defaultAim();
  // Offer the walk back to the line whenever the striker is lying inside the ring.
  const s = strikerOf(match, 0);
  $('#btn-line').hidden = !(match.mode === 'chakri' && dist(s.x, s.y, 0, 0) <= match.ringR + s.r);
}

function over() {
  const you = match.players[0], bot = match.players[1];
  const pill = match.mode === 'pill';
  const won = pill ? match.winner === 0 : you.won > bot.won;
  const tie = !pill && you.won === bot.won;
  $('#over-title').textContent = won ? 'Jeet gaye!' : tie ? 'Barabar' : 'Haar gaye';
  // He gets the last word either way -- that is most of what makes losing to him sting and
  // beating him satisfying.
  $('#over-quote').textContent = say(bot.level, won ? 'lose' : 'win', r, used);
  $('#over-line').textContent = pill
    ? (won ? `${you.points} and sunk. ${bot.name} left on ${bot.points}.`
           : `${bot.name} got there first — ${bot.points} to your ${you.points}.`)
    : won ? `You walk home with ${you.won} extra goli.`
    : tie ? 'Nobody is richer. Again?' : `${bot.name} pockets ${bot.won}.`;
  pocketBase = store.get('pocket', 0);
  if (won) {
    store.set('wins', store.get('wins', 0) + 1);
    const b = beaten(); if (!b.includes(pick.bot)) store.set('beaten', b.concat(pick.bot));
  }
  if (wager > 1) $('#over-quote').textContent = say(bot.level, won ? 'wagerLose' : 'wagerWin', r, used);
  tally();
  cryPanel(won, you, bot);
  show('screen-over');
}

/**
 * Chotu is nine and has just lost the lot. He does not take it well, and the marbles were not
 * really his to lose. Lending is a straight cost to you -- he pays back four next time, which is
 * the point: the only character who can owe you anything is the one who would.
 */
function cryPanel(won, you, bot) {
  const box = $('#cry');
  const badly = won && (you.won - bot.won >= 4 || bot.stash <= 2);
  if (!(pick.bot === 'chotu' && badly && !store.get('lent', false))) { box.hidden = true; return; }
  box.hidden = false;
  $('#cry-ava').innerHTML = CHOTU_CRYING;
  $('#cry-txt').textContent = say('chotu', 'cry', r, used);
}
$('#cry-lend').onclick = () => {
  store.set('lent', true);
  store.set('pocket', store.get('pocket', 0) - 3);
  $('#cry-txt').textContent = say('chotu', 'lendYes', r, used);
  $('#cry-lend').disabled = true; $('#cry-no').disabled = true;
  tally();
};
$('#cry-no').onclick = () => {
  $('#cry-txt').textContent = say('chotu', 'lendNo', r, used);
  $('#cry-lend').disabled = true; $('#cry-no').disabled = true;
};

/** This match's net for each side, plus the running pocket -- the only number that carries. */
function tally() {
  const you = match.players[0], bot = match.players[1];
  if (match.mode === 'pill') {
    $('#tally').innerHTML = `<div><b>${you.points}</b>you</div><div><b>${bot.points}</b>${bot.name}</div>`;
    return;
  }
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  const pocket = pocketBase + you.won * wager;
  store.set('pocket', pocket);
  $('#tally').innerHTML =
    `<div><b>${sign(you.won)}</b>you, this match</div>` +
    `<div><b>${sign(bot.won)}</b>${bot.name}</div>` +
    `<div><b>${pocket}</b>your pocket, all games</div>`;
}

/* ---------------- kali jota ---------------- */
// He stands there, hand going round and round behind his back, and then holds out the fist.
// The mixing is the whole ritual -- guessing at a static emoji is not the game.
let jotaHand = null;
const jotaBtns = () => Array.from(document.querySelectorAll('.jota-btns button'));

function jotaRound() {
  const bot = match.players[1];
  const hand = $('#jota-hand');
  jotaHand = 1 + r.int(5);                       // hidden until he opens it
  $('#jota-fist').innerHTML = FIST;
  $('#jota-palm').innerHTML = palm(jotaHand);
  hand.className = 'hand is-mix';
  $('#jota-out').textContent = '';
  $('#jota-again').hidden = true;
  jotaBtns().forEach((b) => { b.disabled = true; });
  $('#jota-sub').textContent = `${bot.name} is mixing them behind his back…`;
  bubble(null);
  setTimeout(() => {
    if ($('#jota').hidden) return;
    hand.className = 'hand is-offer';
    $('#jota-sub').textContent = say(bot.level, 'jotaMix', r, used) || 'Kali ya Jota?';
    jotaBtns().forEach((b) => { b.disabled = false; });
  }, 1900);
}

$('#btn-jota').onclick = () => { $('#jota').hidden = false; mountAvatar($('#jota-ava'), pick.bot, 'idle'); jotaRound(); };
$('#jota-again').onclick = () => jotaRound();
$('#jota-close').onclick = () => { $('#jota').hidden = true; tally(); };
jotaBtns().forEach((b) => b.onclick = () => {
  if (b.disabled) return;
  const res = kaliJota(match, 0, 1, b.dataset.call, jotaHand);
  $('#jota-hand').className = 'hand is-open';
  jotaBtns().forEach((x) => { x.disabled = true; });
  A[res.right ? 'ding' : 'thud']();
  $('#jota-sub').textContent = `${res.n} in the fist — ${res.isOdd ? 'kali' : 'jota'}.`;
  $('#jota-out').textContent = res.right ? `Right. You take ${res.moved}.` : `Wrong. You pay ${res.moved}.`;
  setTimeout(() => {
    $('#jota-sub').textContent = say(match.players[1].level, res.right ? 'jotaRight' : 'jotaWrong', r, used);
    $('#jota-again').hidden = false;
  }, 900);
  tally();   // the side bet moves the same net the match did, so the pocket follows
});

/* ---------------- loop ---------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (match) {
    let positions, a = null;

    if (play) {
      // Replay the settled shot at 60fps regardless of the display's refresh rate. A 120Hz
      // ProMotion phone and a 30Hz Low Power Mode phone must show the same shot.
      play.t += dt * 60;
      play.i = Math.min(play.frames.length - 1, Math.floor(play.t));
      const f = play.frames[play.i];
      positions = play.before.map((m, k) => ({ ...m, x: f[k * 2], y: f[k * 2 + 1] }));
      for (const im of play.events.impacts) {
        if (!play.dinged.has('i' + im.frame) && play.i >= im.frame) { play.dinged.add('i' + im.frame); A.click(im.speed); }
      }
      for (const p of positions) {
        if (p.striker || play.dinged.has('o' + p.id)) continue;
        if (dist(p.x, p.y, 0, 0) > match.ringR + p.r) { play.dinged.add('o' + p.id); A.ding(); }
      }
      if (play.i >= play.frames.length - 1) settle();
    } else {
      positions = match.marbles.map((m) => ({ ...m }));
      if (myTurn()) {
        // Always show where the marble is pointing. Nothing on screen until you guess the right
        // gesture is what made the first build unplayable.
        const o = originFor(0);
        const pw = ctl.stage === 'power' ? ctl.marker : (ctl.power || 0.45);
        const tgt = firstOnLine(match.marbles, o, ctl.angle, strikerId(0));
        needPower = (tgt && match.mode === 'chakri')
          ? Math.min(1, powerToClear(strikerOf(match, 0), tgt, match.ringR, o.x, o.y)) : 0;
        a = { kind: 'buttons', x: o.x, y: o.y, angle: ctl.angle, power: pw, dragging,
              path: predictPath(match.marbles, o, ctl.angle, pw, strikerId(0), assist()) };
      }
      if (phase === 'bot' && botPreview) {
        const s = strikerOf(match, 1);
        const wob = Math.sin((now - botPreview.t0) / 220) * 0.13;
        a = { preview: true, path: pathFrom(s, botPreview.angle + wob, botPreview.power) };
      }
    }
    if (held && myTurn()) C.sweep(ctl, held, dt);
    C.tick(ctl, now);
    meter();
    R.draw({ match, positions, aim: a });
  }
  requestAnimationFrame(frame);
}
function pathFrom(s, angle, power) {
  const pts = []; const range = power * 0.9;
  for (let d = 0; d <= range; d += 0.02) pts.push({ x: s.x + Math.cos(angle) * d, y: s.y + Math.sin(angle) * d });
  return pts;
}
requestAnimationFrame(frame);

/* ---------------- chrome ---------------- */
function hud() {
  const pill = match.mode === 'pill';
  const cm = (d) => (d === undefined ? '—' : `${(d * 100).toFixed(0)}`);
  $('#you-stash').textContent = lagging ? cm(lagDist[0]) : pill ? match.players[0].points : match.players[0].stash;
  $('#bot-stash').textContent = lagging ? cm(lagDist[1]) : pill ? match.players[1].points : match.players[1].stash;
  $('#pot-lbl').textContent = lagging ? 'LAG' : pill ? `TO ${match.target}` : 'POT';
  document.querySelectorAll('.stash small').forEach((e) => { e.textContent = lagging ? 'cm' : pill ? 'pts' : 'goli'; });
  $('#pot').textContent = lagging ? '·'
    : pill ? (match.players[0].needsHole ? 'HOLE' : match.players[0].points >= match.target ? 'SINK' : '—')
    : match.pot;
  // How chipped your striker is, and the chance to swap before it gives out.
  const me = strikerOf(match, 0);
  const w = $('#wear');
  if (!lagging && me && me.fragile > 0 && me.wear > 0.08) {
    w.hidden = false; w.classList.toggle('hot', me.wear > 0.7);
    w.firstElementChild.style.width = `${Math.min(100, me.wear * 100).toFixed(0)}%`;
  } else w.hidden = true;
  $('#btn-newstriker').hidden = !(!lagging && me && me.wear > 0.55 && myTurn()
    && match.players[0].stash > NEW_STRIKER);

  const ch = $('#chances');
  if (lagging) { ch.innerHTML = ''; return; }
  const left = shotsLeft(match);
  ch.innerHTML = Array.from({ length: CHANCES }, (_, i) => `<i class="${i < left ? '' : 'spent'}"></i>`).join('');
  ch.title = `${left} shot${left === 1 ? '' : 's'} left this turn`;
}
let bubbleTimer = null;
function bubble(text) {
  const el = $('#bubble');
  if (!text) { el.hidden = true; return; }
  el.textContent = text; el.hidden = false;
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
const msg = (t) => { $('#msg').textContent = t; };

function meter() {
  const m = $('#meter'), live = ctl.stage !== 'idle';
  m.classList.toggle('is-live', live);
  m.classList.toggle('is-acc', ctl.stage === 'accuracy' || ctl.stage === 'late');
  $('#meter-mark').style.left = `calc(${(Math.max(0, Math.min(1, ctl.marker)) * 100).toFixed(1)}% - 2px)`;
  $('#meter-fill').style.width = `${((ctl.stage === 'power' ? ctl.marker : ctl.power) * 100).toFixed(1)}%`;
  $('#meter-band').style.width = `${(C.bandWidth * 100).toFixed(1)}%`;
  $('#meter-weak').style.width = `${(needPower * 100).toFixed(1)}%`;
  $('#meter-foul').style.width = `${((1 - FOUL_AT) * 100).toFixed(1)}%`;
  $('#pad-go').classList.toggle('is-arm', C.inBand(ctl));
  $('#meter-lbl').textContent = !myTurn() ? '—'
    : ctl.stage === 'idle' ? 'TAP SHOOT'
    : ctl.stage === 'power'
        ? (ctl.marker > FOUL_AT ? 'TOO HARD — FOUL' : ctl.marker < needPower ? 'TOO SOFT TO CLEAR' : 'TAP TO SET POWER')
    : 'TAP IN THE GREEN';
  $('#pad-go').textContent = ctl.stage === 'idle' ? 'SHOOT' : ctl.stage === 'power' ? 'POWER' : 'RELEASE';
  [$('#pad-l'), $('#pad-r')].forEach((b) => { b.disabled = !myTurn() || ctl.stage !== 'idle'; });
}

// Proof of life for the inline diagnostic in index.html.
window.KANCHE_BOOTED = true;
window.__ctl = ctl; window.__match = null;   // read by the browser tests to assert which way the aim actually points
const buildEl = $('#build'); if (buildEl) buildEl.textContent = 'build ' + (window.KANCHE_BUILD || '?');

R.setup(canvas);
addEventListener('resize', () => R.resize());
addEventListener('orientationchange', () => setTimeout(() => R.resize(), 250));
['touchstart', 'pointerdown'].forEach((e) => addEventListener(e, () => A.unlock(), { once: true }));

// iOS never offers to install a web app, so we ask once -- it is the only way to lose the URL bar.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !navigator.standalone && !store.get('a2hs', false)) {
  // Only on the setup screen, and never over the board: it is a nice-to-have, and a nice-to-have
  // must never be in front of the controls. It also gives up on its own.
  setTimeout(() => {
    if ($('#screen-setup').classList.contains('is-on')) $('#a2hs').hidden = false;
    setTimeout(() => { $('#a2hs').hidden = true; }, 12000);
  }, 3500);
  $('#a2hs-x').onclick = () => { $('#a2hs').hidden = true; store.set('a2hs', true); };
}
