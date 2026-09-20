// Canvas drawing. Knows nothing about rules -- it is handed positions and draws them.
import { RING_R, SHOOT_LINE, PILL_R } from './physics.js';
import { rng } from './rng.js';

// The camera window, in metres. Narrower than the physics field so the ring fills a portrait
// phone: fit by width, and the vertical slack becomes room for the HUD and the thumb.
const VIEW = { x0: -0.37, x1: 0.37, y0: -0.36, y1: 0.82 };

const SKINS = {
  doodh:   { core: '#fdfbf4', rim: '#cfc6ae', swirl: null },
  kanch:   { core: '#dff3fb', rim: '#6fa8bd', swirl: ['#e0453c', '#2f8f4e'] },
  neeli:   { core: '#dbe8ff', rim: '#3f5f9f', swirl: ['#2b4a9c', '#7fa5f0'] },
  lakhoti: { core: '#ffe9c9', rim: '#b8813a', swirl: ['#d2701c', '#f4b860'] },
  steel:   { core: '#eef1f4', rim: '#7d8790', swirl: null },
};
export const PLAYER_COLORS = ['#f0b429', '#4fb3d9', '#e06c5a', '#8ed081'];

let cv, ctx, scale = 1, ox = 0, oy = 0, ground = null, W = 0, H = 0;

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
  ground = null;
}

export const sx = (wx) => wx * scale + ox;
export const sy = (wy) => wy * scale + oy;
export const toWorld = (px, py) => ({ x: (px - ox) / scale, y: (py - oy) / scale });
export const pxPerM = () => scale;

function buildGround() {
  const g = document.createElement('canvas');
  g.width = W; g.height = H;
  const c = g.getContext('2d');
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#6b4a2f'); grad.addColorStop(0.55, '#7d5836'); grad.addColorStop(1, '#5d3f28');
  c.fillStyle = grad; c.fillRect(0, 0, W, H);
  // Grit. Seeded so the patch does not crawl between frames.
  const r = rng(20260919);
  for (let i = 0; i < Math.round(W * H / 700); i++) {
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

/** @param view { match, positions, aim, ghosts } */
export function draw(view) {
  if (!ground) ground = buildGround();
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(ground, 0, 0);

  const m = view.match;
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
      alpha: p.alpha, mark: p.mark,
      ring: p.striker ? PLAYER_COLORS[p.owner % PLAYER_COLORS.length] : null,
    });
  }

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
