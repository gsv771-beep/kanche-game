// Wiring. Owns the screens, the turn loop and the playback of a settled shot.
import { newMatch, applyShot, current, strikerId, strikerOf, kaliJota, CHANCES } from './rules.js';
import { chooseShot, thinkTime, LEVELS } from './bot.js';
import * as R from './render.js';
import { attachInput, predictPath, firstOnLine } from './input.js';
import * as C from './controls.js';
import * as A from './audio.js';
import { mountAvatar, setAvatarState, AVATARS } from './avatars.js';
import { say, summaryLine } from './strings.js';
import { rng } from './rng.js';
import { SHOOT_LINE, dist, powerToClear } from './physics.js';

const $ = (s) => document.querySelector(s);
const show = (id) => document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-on', s.id === id));

const store = {
  get(k, d) { try { const v = localStorage.getItem('kanche.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kanche.' + k, JSON.stringify(v)); } catch {} },
};

const START_STASH = 20;   // what both players bring to the field, every match
let pocketBase = 0;       // marbles won across all previous matches, before this one
let pick = { mode: 'chakri', bot: 'bunty', striker: 'goli' };
let match = null, r = null, phase = 'idle', fromLine = false, used = new Set();
const ctl = C.createControls();
const FOUL_AT = 0.97;   // was 0.92, which made the top of the bar a trap rather than a choice
let needPower = 0;      // power the shot on this line actually requires, shown on the meter
let held = 0;        // an aim arrow being held down
let dragging = false;
let play = null;          // { before, frames, events, summary, i, dinged:Set }
let botPreview = null;    // the opponent's wandering aim line while it thinks
const canvas = $('#board');

/* ---------------- setup screen ---------------- */
document.querySelectorAll('#pick-mode .card').forEach((b) => b.onclick = () => sel('#pick-mode', b, () => pick.mode = b.dataset.mode));
document.querySelectorAll('#pick-bot .card').forEach((b) => b.onclick = () => sel('#pick-bot', b, () => pick.bot = b.dataset.bot));
document.querySelectorAll('#pick-striker .card').forEach((b) => b.onclick = () => sel('#pick-striker', b, () => pick.striker = b.dataset.striker));
function sel(group, btn, fn) {
  document.querySelectorAll(`${group} .card`).forEach((c) => c.classList.toggle('is-sel', c === btn));
  fn(); A.unlock();
}
document.querySelectorAll('#pick-bot .card').forEach((b) => { b.querySelector('.ava-box').innerHTML = AVATARS[b.dataset.bot]; });
$('#btn-play').onclick = () => { A.unlock(); start(); };
$('#btn-again').onclick = () => start();
$('#btn-menu').onclick = () => show('screen-setup');
$('#btn-mute').onclick = () => { A.setMuted(!A.isMuted()); $('#btn-mute').textContent = A.isMuted() ? '🔇' : '🔊'; };
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


/* ---------------- match ---------------- */
function start() {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  r = rng(seed);
  used = new Set();
  // Both players start every match level. The stash used to carry over for the human only,
  // while the bot reset to 20 -- so after a few games the counts read 27 against 20 and never
  // went back. What you keep across matches is the pocket below, which is a separate number and
  // does not touch the count either player plays with.
  match = newMatch({
    seed, mode: pick.mode, ante: pick.mode === 'pill' ? 3 : 4,
    players: [
      { name: 'You', kind: 'human', striker: pick.striker, skin: 'kanch', stash: START_STASH },
      { name: LEVELS[pick.bot].name, kind: 'bot', level: pick.bot, avatar: pick.bot,
        striker: pick.bot === 'ustaad' ? 'dhampar' : 'goli', skin: 'lakhoti', stash: START_STASH },
    ],
  });
  phase = 'aim'; fromLine = false; play = null; botPreview = null; window.__match = match;
  C.cancel(ctl);
  $('#bot-name').textContent = match.players[1].name;
  $('#pot-lbl').textContent = match.mode === 'pill' ? 'ON FIELD' : 'POT';
  mountAvatar($('#ava-wrap'), pick.bot, 'idle');
  bubble(say(pick.bot, 'start', r, used));
  $('#a2hs').hidden = true;      // never let the hint sit over the board
  show('screen-game');
  R.resize(); hud(); defaultAim();
  msg(match.mode === 'pill' ? 'Land your striker in the pill first.'
    : 'Touch the board to aim, then SHOOT.');
  if (current(match).kind === 'bot') botTurn();
}

const assist = () => (store.get('wins', 0) >= 3 ? 0.55 : 1);

/** Point the striker at something. The opening aim used to be straight up while the striker
 *  starts off-centre, so tapping SHOOT without aiming missed the pile entirely. */
function defaultAim() {
  const o = originFor(0);
  const near = (list) => list.length
    ? list.reduce((a, b) => (dist(o.x, o.y, a.x, a.y) <= dist(o.x, o.y, b.x, b.y) ? a : b))
    : { x: 0, y: 0 };
  const t = match.mode === 'pill'
    ? (match.players[0].armed ? near(match.marbles.filter((x) => !x.striker && x.owner !== 0)) : { x: 0, y: 0 })
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

/* ---------------- settle ---------------- */
function settle() {
  const { summary: sum } = play;
  const turnChanged = !sum.continues;
  const bot = match.players[1];
  const mine = sum.by === 0;
  if (sum.gained > 0) A.ding();
  if (sum.foul) A.thud();

  if (!mine) {
    setAvatarState($('#ava-wrap'), sum.gained > 0 ? 'happy' : sum.foul ? 'sad' : 'idle');
    bubble(say(bot.level, sum.gained > 1 ? 'big' : sum.gained ? 'win' : sum.foul ? 'foul' : 'miss', r, used));
  } else {
    setAvatarState($('#ava-wrap'), 'idle');
    if (sum.gained > 0 || sum.foul) bubble(say(bot.level, sum.gained > 0 ? 'oppWin' : 'oppMiss', r, used));
  }
  msg(summaryLine(sum, match.players));
  play = null; hud();

  if (match.phase === 'over') return setTimeout(over, 900);
  const cur = current(match);
  if (cur.kind === 'bot') return setTimeout(botTurn, 650);
  phase = 'aim';
  if (turnChanged) defaultAim();
  // Offer the walk back to the line whenever the striker is lying inside the ring.
  const s = strikerOf(match, 0);
  $('#btn-line').hidden = !(match.mode === 'chakri' && dist(s.x, s.y, 0, 0) <= match.ringR + s.r);
}

function over() {
  const you = match.players[0], bot = match.players[1];
  const won = you.won > bot.won;
  $('#over-title').textContent = won ? 'Jeet gaye!' : you.won === bot.won ? 'Barabar' : 'Haar gaye';
  $('#over-line').textContent = won ? `You walk home with ${you.won} extra goli.`
    : you.won === bot.won ? 'Nobody is richer. Again?' : `${bot.name} pockets ${bot.won}.`;
  pocketBase = store.get('pocket', 0);
  if (won) store.set('wins', store.get('wins', 0) + 1);
  tally();
  show('screen-over');
}

/** This match's net for each side, plus the running pocket -- the only number that carries. */
function tally() {
  const you = match.players[0], bot = match.players[1];
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  const pocket = pocketBase + you.won;
  store.set('pocket', pocket);
  $('#tally').innerHTML =
    `<div><b>${sign(you.won)}</b>you, this match</div>` +
    `<div><b>${sign(bot.won)}</b>${bot.name}</div>` +
    `<div><b>${pocket}</b>your pocket, all games</div>`;
}

/* ---------------- kali jota ---------------- */
$('#btn-jota').onclick = () => { $('#jota').hidden = false; $('#jota-out').textContent = ''; };
$('#jota-close').onclick = () => { $('#jota').hidden = true; tally(); };
document.querySelectorAll('.jota-btns button').forEach((b) => b.onclick = () => {
  const handful = 1 + r.int(5);
  const res = kaliJota(match, 0, 1, b.dataset.call, handful);
  $('#fist').classList.add('shake');
  setTimeout(() => { $('#fist').classList.remove('shake'); $('#fist').textContent = '🖐'; }, 400);
  $('#jota-out').textContent = `${res.n} in the fist — ${res.isOdd ? 'kali' : 'jota'}. ` +
    (res.right ? `You take ${res.moved}.` : `You pay ${res.moved}.`);
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
  $('#you-stash').textContent = match.players[0].stash;
  $('#bot-stash').textContent = match.players[1].stash;
  $('#pot').textContent = match.mode === 'pill'
    ? match.marbles.filter((m) => !m.striker).length : match.pot;
  const ch = $('#chances');
  ch.innerHTML = match.mode === 'chakri'
    ? Array.from({ length: CHANCES }, (_, i) => `<i class="${i < match.chances ? '' : 'spent'}"></i>`).join('')
    : '';
  ch.title = `${match.chances} of ${CHANCES} chances left this turn`;
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
