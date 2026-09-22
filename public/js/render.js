// Canvas drawing. Knows nothing about rules -- it is handed positions and draws them.
import { RING_R, SHOOT_LINE, PILL_R, FIELD } from './physics.js';
import { rng } from './rng.js';

// The camera window IS the playfield -- see FIELD in physics.js. Keeping a second copy here is
// what let a marble roll somewhere the player could not see it.
const VIEW = FIELD;

const SKINS = {
  doodh:   { core: '#fdfbf4', rim: '#cfc6ae', swirl: null },
  kanch:   { core: '#dff3fb', rim: '#6fa8bd', swirl: ['#e0453c', '#2f8f4e'] },
  neeli:   { core: '#dbe8ff', rim: '#3f5f9f', swirl: ['#2b4a9c', '#7fa5f0'] },
  lakhoti: { core: '#ffe9c9', rim: '#b8813a', swirl: ['#d2701c', '#f4b860'] },
  steel:   { core: '#eef1f4', rim: '#7d8790', swirl: null },
};
export const PLAYER_COLORS = ['#f0b429', '#4fb3d9', '#e06c5a', '#8ed081'];

let cv, ctx, scale = 1, ox = 0, oy = 0, ground = null, groundFor = null, W = 0, H = 0;

export function setup(canvas) { cv = canvas; ctx = canvas.getContext('2d'); resize(); }

export function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // DPR 3 on a big iPhone is wasted pixels
  const r = cv.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fw = VIEW.x1 - VIEW.x0, fh = VIEW.y1 - VIEW.y0;
  scale = Math.min(W / fw, H / fh);
  ox = (W - fw * scale) / 2 - VIEW.x0 * scale;
  oy = (H - fh * scale) / 2 - VIEW.y0 * scale;
  ground = null; groundFor = null;
}

export const sx = (wx) => wx * scale + ox;
export const sy = (wy) => wy * scale + oy;
export const toWorld = (px, py) => ({ x: (px - ox) / scale, y: (py - oy) / scale });
export const pxPerM = () => scale;

function buildGround(surf) {
  const g = document.createElement('canvas');
  g.width = W; g.height = H;
  const c = g.getContext('2d');
  const col = surf?.ground || ['#6b4a2f', '#7d5836', '#5d3f28'];
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, col[0]); grad.addColorStop(0.55, col[1]); grad.addColorStop(1, col[2]);
  c.fillStyle = grad; c.fillRect(0, 0, W, H);
  // Grit, sparse on concrete and thick on dirt. Seeded so the ground does not crawl.
  const r = rng(20260919);
  for (let i = 0; i < Math.round(W * H / (surf?.grit || 700)); i++) {
    const x = r.range(0, W), y = r.range(0, H), s = r.range(0.5, 2.1);
    c.fillStyle = `rgba(${r.next() < 0.5 ? '40,26,16' : '190,160,120'},${r.range(0.05, 0.22)})`;
    c.beginPath(); c.arc(x, y, s, 0, 7); c.fill();
  }
  for (let i = 0; i < 18; i++) {   // a few scuffs and pebbles
    const x = r.range(0, W), y = r.range(0, H);
    c.strokeStyle = `rgba(60,40,25,${r.range(0.05, 0.14)})`; c.lineWidth = r.range(1, 3.5);
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + r.range(-40, 40), y + r.range(-20, 20), x + r.range(-70, 70), y + r.range(-30, 30)); c.stroke();
  }
  return g;
}

function chalkCircle(cx, cy, rad, alpha = 0.85) {
  const r = rng(77);
  ctx.save(); ctx.strokeStyle = `rgba(243,238,226,${alpha})`; ctx.lineWidth = Math.max(2, scale * 0.006);
  ctx.beginPath();
  for (let a = 0; a <= 64; a++) {
    const th = (a / 64) * Math.PI * 2, j = 1 + (r.next() - 0.5) * 0.012;
    const x = cx + Math.cos(th) * rad * j, y = cy + Math.sin(th) * rad * j;
    a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.stroke(); ctx.restore();
}

function drawMarble(x, y, rm, skin, opts = {}) {
  const s = SKINS[skin] || SKINS.kanch;
  const px = sx(x), py = sy(y), pr = rm * scale;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  // contact shadow
  ctx.fillStyle = 'rgba(30,18,10,0.35)';
  ctx.beginPath(); ctx.ellipse(px + pr * 0.18, py + pr * 0.42, pr * 1.02, pr * 0.52, 0, 0, 7); ctx.fill();

  const g = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.4, pr * 0.1, px, py, pr);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, s.core); g.addColorStop(1, s.rim);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();

  if (s.swirl) {   // the cat's-eye ribbon
    ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr * 0.96, 0, 7); ctx.clip();
    ctx.strokeStyle = s.swirl[0]; ctx.lineWidth = pr * 0.44; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px - pr * 0.7, py + pr * 0.2); ctx.quadraticCurveTo(px, py - pr * 0.55, px + pr * 0.7, py + pr * 0.18); ctx.stroke();
    ctx.strokeStyle = s.swirl[1]; ctx.lineWidth = pr * 0.2;
    ctx.beginPath(); ctx.moveTo(px - pr * 0.6, py + pr * 0.42); ctx.quadraticCurveTo(px, py - pr * 0.1, px + pr * 0.62, py + pr * 0.4); ctx.stroke();
    ctx.restore();
  }
  if (skin === 'steel') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = pr * 0.12;
    ctx.beginPath(); ctx.arc(px, py, pr * 0.72, 2.4, 4.2); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.ellipse(px - pr * 0.33, py - pr * 0.36, pr * 0.26, pr * 0.19, -0.6, 0, 7); ctx.fill();

  if (opts.wear > 0.12) {
    // Cracks, drawn from the wear number itself. The whole point of wear being a counter rather
    // than a dice roll is that you can see it coming, so it has to be on the marble.
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, pr * 0.97, 0, 7); ctx.clip();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + opts.wear * 0.5})`;
    ctx.lineWidth = Math.max(0.8, pr * 0.07);
    const n = Math.min(5, 1 + Math.floor(opts.wear * 5));
    for (let i = 0; i < n; i++) {
      const a = (i * 2.399) % (Math.PI * 2), len = pr * (0.5 + 0.5 * opts.wear);
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * pr * 0.1, py + Math.sin(a) * pr * 0.1);
      ctx.lineTo(px + Math.cos(a + 0.35) * len, py + Math.sin(a + 0.35) * len);
      ctx.lineTo(px + Math.cos(a - 0.1) * pr, py + Math.sin(a - 0.1) * pr);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (opts.ring) {   // whose striker this is
    ctx.strokeStyle = opts.ring; ctx.lineWidth = Math.max(1.6, pr * 0.16);
    ctx.beginPath(); ctx.arc(px, py, pr + ctx.lineWidth, 0, 7); ctx.stroke();
  }
  if (opts.mark) {   // the nominated / target marble
    ctx.strokeStyle = '#ffd452'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(px, py, pr * 2.1, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * The hand, seen from above, the way the board is. Knuckles behind the marble, the thumb pressed
 * flat on the ground to one side -- which is the actual rule, the thumb must stay down -- and the
 * forefinger drawn back and snapped forward. `t` runs 0..1 through a flick; null is the hand
 * resting in position while you aim.
 */
function drawHand(hx, hy, angle, t) {
  const px = sx(hx), py = sy(hy), r = 0.014 * scale;
  // A real hand dwarfs a marble -- roughly thirteen to one. Drawn to that ratio it would swallow
  // the board, so the hand is built on `u` while the fingertip stays anchored in marble radii,
  // which keeps the contact point honest whatever size the rest of it is.
  const u = r * 1.45;
  const fx = Math.cos(angle), fy = Math.sin(angle);
  const ux = -fy, uy = fx;                       // across the hand
  // the forefinger: back on the first half of the flick, then through the marble on the second
  const pull = t === null ? r * 0.30
    : t < 0.45 ? r * (0.30 + 1.5 * (t / 0.45))
    : r * (1.8 - 2.6 * ((t - 0.45) / 0.55));
  const at = (f, u) => [px + fx * f + ux * u, py + fy * f + uy * u];
  const blob = (f, u, rf, ru, rot, fill) => {
    const [x, y] = at(f, u);
    ctx.fillStyle = fill; ctx.beginPath();
    ctx.ellipse(x, y, rf, ru, angle + rot, 0, 7); ctx.fill();
  };

  ctx.save();
  // the shadow it casts on the dirt, offset the way everything else here is lit
  ctx.globalAlpha = 0.30; ctx.fillStyle = '#140c06';
  blob(-u * 4.0 + u * 0.3, u * 0.5, u * 3.0, u * 2.3, 0, '#140c06');
  ctx.globalAlpha = 1;

  // two folded fingers tucked beside the palm
  blob(-u * 3.2, -u * 1.9, u * 2.0, u * 0.75, 0, '#c1844f');
  blob(-u * 3.4, -u * 0.7, u * 2.2, u * 0.75, 0, '#cf9159');
  // the palm
  blob(-u * 4.3, u * 0.1, u * 2.9, u * 2.1, 0, '#d99a68');
  // the thumb, flat on the ground and anchored -- it does not move with the flick
  ctx.fillStyle = '#c98b5e';
  ctx.beginPath();
  const [tx0, ty0] = at(-u * 4.6, u * 1.2), [tx1, ty1] = at(-u * 0.6, u * 3.0);
  ctx.moveTo(tx0, ty0);
  ctx.quadraticCurveTo(...at(-u * 2.2, u * 3.2), tx1, ty1);
  ctx.quadraticCurveTo(...at(-u * 2.6, u * 1.4), tx0, ty0);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,55,25,0.35)';
  ctx.beginPath(); ctx.ellipse(tx1, ty1, u * 0.55, u * 0.4, angle, 0, 7); ctx.fill();

  // the forefinger
  const tipF = -r * 1.05 - pull;
  ctx.strokeStyle = '#e0a86f'; ctx.lineCap = 'round';
  ctx.lineWidth = u * 1.35;
  ctx.beginPath();
  ctx.moveTo(...at(-u * 4.0, -u * 0.5)); ctx.lineTo(...at(tipF, -r * 0.15)); ctx.stroke();
  ctx.lineWidth = u * 0.9; ctx.strokeStyle = '#eab27d';
  ctx.beginPath();
  ctx.moveTo(...at(-u * 2.6, -u * 0.4)); ctx.lineTo(...at(tipF, -r * 0.15)); ctx.stroke();
  // nail
  blob(tipF - u * 0.15, -u * 0.15, u * 0.4, u * 0.3, 0, '#f6d3ab');
  ctx.restore();
}

/** @param view { match, positions, aim, hand } */
export function draw(view) {
  const sid = view.match.surface?.id || 'maidan';
  if (!ground || groundFor !== sid) { ground = buildGround(view.match.surface); groundFor = sid; }
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(ground, 0, 0);

  // Mud, drawn before anything else touches the board. It has to be unmissable: a hazard you
  // cannot see is the game cheating, and the whole reason this is patches rather than hidden
  // variation in the ground.
  for (const p of view.match.mud || []) {
    const px = sx(p.x), py = sy(p.y), pr = p.r * scale;
    const g2 = ctx.createRadialGradient(px, py, pr * 0.2, px, py, pr);
    g2.addColorStop(0, 'rgba(30,20,10,0.72)'); g2.addColorStop(0.75, 'rgba(38,26,14,0.55)');
    g2.addColorStop(1, 'rgba(38,26,14,0)');
    ctx.save();
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.82, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,5,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, py, pr * 0.92, pr * 0.75, 0, 0, 7); ctx.stroke();
    // a couple of wet glints so it reads as mud rather than a shadow
    ctx.fillStyle = 'rgba(160,140,110,0.18)';
    ctx.beginPath(); ctx.ellipse(px - pr * 0.3, py - pr * 0.22, pr * 0.22, pr * 0.1, -0.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + pr * 0.28, py + pr * 0.2, pr * 0.15, pr * 0.07, 0.4, 0, 7); ctx.fill();
    ctx.restore();
  }

  const m = view.match;
  // Beyond the patch there is nothing to play on. On a wide screen the canvas shows more than
  // the field, so shade the surround -- otherwise a marble stopping dead at the boundary looks
  // like a glitch rather than the edge of the dirt.
  {
    const l = sx(VIEW.x0), r = sx(VIEW.x1), t = sy(VIEW.y0), bt = sy(VIEW.y1);
    ctx.save(); ctx.fillStyle = 'rgba(18,10,5,0.55)';
    if (l > 0) ctx.fillRect(0, 0, l, H);
    if (r < W) ctx.fillRect(r, 0, W - r, H);
    if (t > 0) ctx.fillRect(l, 0, r - l, t);
    if (bt < H) ctx.fillRect(l, bt, r - l, H - bt);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(l, t, r - l, bt - t);
    ctx.restore();
  }

  if (m.mode === 'pill') {
    const px = sx(0), py = sy(0), pr = PILL_R * scale;
    ctx.fillStyle = 'rgba(25,14,8,0.92)';
    ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.78, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(160,125,85,0.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(px, py, pr * 1.12, pr * 0.9, 0, 0, 7); ctx.stroke();
  } else {
    chalkCircle(sx(0), sy(0), m.ringR * scale);
  }

  // the shooting line
  ctx.save(); ctx.strokeStyle = 'rgba(243,238,226,0.6)'; ctx.lineWidth = Math.max(2, scale * 0.005);
  ctx.setLineDash([scale * 0.03, scale * 0.02]);
  ctx.beginPath(); ctx.moveTo(sx(VIEW.x0), sy(SHOOT_LINE)); ctx.lineTo(sx(VIEW.x1), sy(SHOOT_LINE)); ctx.stroke();
  ctx.restore();

  // predicted path, drawn under the marbles
  if (view.aim && view.aim.path) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 7]);
    ctx.beginPath();
    view.aim.path.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }

  for (const p of view.positions) {
    if (p.hidden) continue;
    drawMarble(p.x, p.y, p.r, p.skin, {
      alpha: p.alpha, mark: p.mark, wear: p.wear || 0,
      ring: p.striker ? PLAYER_COLORS[p.owner % PLAYER_COLORS.length] : null,
    });
  }

  if (view.hand) drawHand(view.hand.x, view.hand.y, view.hand.angle, view.hand.t);
  if (view.aim && !view.aim.preview) drawAim(view.aim);
}

function drawAim(a) {
  const px = sx(a.x), py = sy(a.y);

  // The arrow is drawn in BOTH schemes and whenever it is your shot -- not only mid-drag.
  // A board that shows nothing until you guess the right gesture is a board nobody can play.
  const L = Math.max(scale * 0.10, scale * 0.10 + a.power * scale * 0.22);
  const ax = px + Math.cos(a.angle) * L, ay = py + Math.sin(a.angle) * L;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,212,82,0.95)'; ctx.lineWidth = Math.max(2.5, scale * 0.007); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px + Math.cos(a.angle) * scale * 0.035, py + Math.sin(a.angle) * scale * 0.035);
  ctx.lineTo(ax, ay); ctx.stroke();
  const h = Math.max(7, scale * 0.022);
  ctx.fillStyle = 'rgba(255,212,82,0.95)';
  ctx.beginPath();
  ctx.moveTo(ax + Math.cos(a.angle) * h, ay + Math.sin(a.angle) * h);
  ctx.lineTo(ax + Math.cos(a.angle + 2.5) * h, ay + Math.sin(a.angle + 2.5) * h);
  ctx.lineTo(ax + Math.cos(a.angle - 2.5) * h, ay + Math.sin(a.angle - 2.5) * h);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  if (a.kind === 'buttons') return;   // power and release live on the DOM meter instead
  // Steadiness ring: wide on touch, tight at the settle, shaking again if you dither.
  const rr = a.steady * scale;
  ctx.save();
  ctx.strokeStyle = a.inWindow ? 'rgba(140,255,170,0.95)' : 'rgba(255,255,255,0.45)';
  ctx.lineWidth = a.inWindow ? 3 : 2;
  ctx.beginPath(); ctx.arc(px, py, Math.max(6, rr), 0, 7); ctx.stroke();

  // power, as an arc growing behind the striker -- red past the thumb-lift line
  const foul = a.power > a.foulAt;
  ctx.strokeStyle = foul ? '#ff5a4d' : '#ffd452';
  ctx.lineWidth = Math.max(4, scale * 0.012);
  ctx.beginPath(); ctx.arc(px, py, Math.max(10, rr) + ctx.lineWidth * 2, -Math.PI / 2, -Math.PI / 2 + a.power * Math.PI * 2 * 0.999); ctx.stroke();
  if (foul) {
    ctx.fillStyle = '#ff5a4d'; ctx.font = `600 ${Math.round(scale * 0.035)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.fillText('THUMB LIFT', px, py - rr - 22);
  }
  ctx.restore();
}
