// Every sound is synthesised. The click of glass on glass is half the feel of this game and it
// costs zero bytes to make: a short noise burst for the contact plus a tuned ping for the ring,
// pitched by impact speed so a hard chot really cracks.
let ac = null, ready = false, muted = false;

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  ac = new C();
  // iOS silences WebAudio behind the ringer switch unless the page declares a playback session.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (ac.state === 'suspended') ac.resume();
  ready = true;
}
export const setMuted = (v) => { muted = v; };
export const isMuted = () => muted;

function noise(dur) {
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = ac.createBufferSource(); s.buffer = buf; return s;
}

/** Marble on marble. speed is the impact speed in m/s. */
export function click(speed = 2) {
  if (!ready || muted || !ac) return;
  const v = Math.max(0.08, Math.min(1, speed / 4));
  const t = ac.currentTime;
  const g = ac.createGain(); g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
  const n = noise(0.05); n.connect(hp); hp.connect(g);
  const o = ac.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(1500 + v * 2400, t);
  o.frequency.exponentialRampToValueAtTime(700 + v * 500, t + 0.08);
  const og = ac.createGain(); og.gain.setValueAtTime(v * 0.28, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(og); og.connect(ac.destination); g.connect(ac.destination);
  n.start(t); o.start(t); o.stop(t + 0.12);
}

/** A marble crossing the line: a small bright coin ding. */
export function ding() {
  if (!ready || muted || !ac) return;
  const t = ac.currentTime;
  [1320, 1980].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 / (i + 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.4);
  });
}

/** Losing a marble. */
export function thud() {
  if (!ready || muted || !ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.22);
  g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.32);
}

/** The flick itself -- a tiny air tick, pitched by power. */
export function flick(power = 0.5) {
  if (!ready || muted || !ac) return;
  const t = ac.currentTime, g = ac.createGain();
  g.gain.setValueAtTime(0.12 + power * 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + power * 2600; bp.Q.value = 2;
  const n = noise(0.05); n.connect(bp); bp.connect(g); g.connect(ac.destination); n.start(t);
}
