// The three opponents, drawn as inline SVG and animated with CSS classes.
//
// Deliberately not photos: no binary assets means the whole game is ~60KB over a gully 4G
// connection, there is no licensing question, and a reskin is a hex code. States are set by
// adding a class to the wrapper -- `is-idle | is-thinking | is-happy | is-sad`.
const S = (level, body) => `<svg viewBox="0 0 120 120" class="ava ava-${level}" aria-hidden="true">${body}</svg>`;

const face = (skin, shade) => `
  <ellipse class="ava-shadow" cx="60" cy="112" rx="30" ry="6"/>
  <path class="ava-neck" d="M50 78h20v14H50z" fill="${shade}"/>
  <circle class="ava-head" cx="60" cy="52" r="30" fill="${skin}"/>`;

const eyes = (y = 48, r = 4.2) => `
  <g class="ava-eyes">
    <circle cx="49" cy="${y}" r="${r}" fill="#20150f"/>
    <circle cx="71" cy="${y}" r="${r}" fill="#20150f"/>
    <circle cx="50.4" cy="${y - 1.4}" r="1.3" fill="#fff"/>
    <circle cx="72.4" cy="${y - 1.4}" r="1.3" fill="#fff"/>
  </g>
  <g class="ava-lids"><rect x="43" y="${y - 9}" width="34" height="8" rx="3" fill="#c98b5e"/></g>`;

export const AVATARS = {
  // Chotu: ears he has not grown into, a shirt two sizes too big, permanently delighted.
  chotu: S('chotu', `
    <circle class="ava-ear" cx="29" cy="54" r="9" fill="#e0a06d"/>
    <circle class="ava-ear" cx="91" cy="54" r="9" fill="#e0a06d"/>
    ${face('#e8ab77', '#d4915c')}
    <path class="ava-hair" d="M31 42c4-18 20-25 29-25s25 7 29 25c-8-7-17-4-29-9-12 5-21 2-29 9z" fill="#2a1a12"/>
    <path class="ava-tuft" d="M58 17c2-9 8-11 10-6s-3 6-3 11z" fill="#2a1a12"/>
    ${eyes(49, 5)}
    <path class="ava-mouth" d="M50 63q10 10 20 0" stroke="#7a3b25" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path class="ava-shirt" d="M26 120q0-26 34-28 34 2 34 28z" fill="#3f8f6f"/>
    <path d="M60 92v20" stroke="#2d6b52" stroke-width="2.5"/>`),

  // Bunty: cap backwards, chewing something, knows he is good.
  bunty: S('bunty', `
    ${face('#d99a68', '#c1844f')}
    <path class="ava-hair" d="M32 44c2-16 14-23 28-23s26 7 28 23z" fill="#1d120c"/>
    <path class="ava-cap" d="M29 43q1-24 31-24t31 24z" fill="#c8482f"/>
    <path class="ava-cap" d="M29 43q8 5 31 5t31-5v5q-8 5-31 5T29 48z" fill="#a83a25"/>
    <path class="ava-cap" d="M88 34q13 2 14 10-9-2-14 2z" fill="#a83a25"/>
    ${eyes(50, 4)}
    <path class="ava-brow" d="M43 41l12 3M77 41l-12 3" stroke="#1d120c" stroke-width="3" stroke-linecap="round"/>
    <path class="ava-mouth" d="M51 64q9 6 18 -2" stroke="#7a3b25" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="ava-shirt" d="M26 120q0-26 34-28 34 2 34 28z" fill="#2f5d8f"/>
    <circle cx="60" cy="100" r="3" fill="#24476d"/>`),

  // Ustaad Pappu: moustache, half-shut eyes, rolls a Dhampar in his palm while he thinks.
  ustaad: S('ustaad', `
    ${face('#c98b5e', '#ad7148')}
    <path class="ava-hair" d="M30 46c1-18 14-26 30-26s29 8 30 26c-6-10-14-11-30-11s-24 1-30 11z" fill="#4a4340"/>
    <path d="M30 46q6-4 14-3M90 46q-6-4-14-3" stroke="#6b6360" stroke-width="2.5" fill="none"/>
    ${eyes(51, 3.4)}
    <path class="ava-brow" d="M42 43q7-5 14-1M78 43q-7-5-14-1" stroke="#4a4340" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="ava-tache" d="M45 62q15-7 30 0-15 5-30 0z" fill="#4a4340"/>
    <path class="ava-mouth" d="M52 70q8 4 16 0" stroke="#6d3421" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path class="ava-shirt" d="M26 120q0-26 34-28 34 2 34 28z" fill="#7a5230"/>
    <g class="ava-dhampar"><circle cx="97" cy="104" r="9" fill="#cfe4ef"/><circle cx="94" cy="101" r="3" fill="#fff" opacity=".85"/></g>`),
};

/** A closed fist, knuckles toward you. Deliberately simple: it is going to be spinning. */
export const FIST = `<svg viewBox="0 0 120 120" class="hand-svg" aria-hidden="true">
  <ellipse cx="60" cy="108" rx="26" ry="5" fill="rgba(0,0,0,.35)"/>
  <path d="M34 56q0-22 26-22t26 22v24q0 16-26 16t-26-16z" fill="#d99a68"/>
  <path d="M34 62q26-8 52 0v8q-26-8-52 0z" fill="#c1844f" opacity=".55"/>
  <g fill="#e0a86f">
    <circle cx="43" cy="58" r="8"/><circle cx="55" cy="55" r="9"/>
    <circle cx="67" cy="55" r="9"/><circle cx="79" cy="58" r="8"/>
  </g>
  <path d="M32 72q-8 4-6 14t12 8z" fill="#c1844f"/>
  <path d="M34 92q26 10 52 0v6q-26 10-52 0z" fill="#8e6236"/>
</svg>`;

/** The same hand opened, with the marbles it was hiding sitting on the palm. */
export const palm = (n) => {
  const spots = [[60, 62], [47, 68], [73, 68], [53, 54], [67, 54]];
  const balls = spots.slice(0, Math.max(0, Math.min(5, n))).map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="8" fill="#dff3fb" stroke="#6fa8bd" stroke-width="1.5"/>
     <circle cx="${x - 2.6}" cy="${y - 2.8}" r="2.6" fill="#fff"/>`).join('');
  return `<svg viewBox="0 0 120 120" class="hand-svg" aria-hidden="true">
    <ellipse cx="60" cy="108" rx="28" ry="5" fill="rgba(0,0,0,.35)"/>
    <path d="M32 60q0-10 6-10t6 10v18h32V60q0-10 6-10t6 10v26q0 18-28 18t-28-18z" fill="#d99a68"/>
    <path d="M36 74q24-7 48 0v14q-24 8-48 0z" fill="#e8b47f"/>
    ${balls}
    <path d="M30 70q-9 3-8 13t13 9z" fill="#c1844f"/>
  </svg>`;
};

export function mountAvatar(el, level, state = 'idle') {
  el.innerHTML = AVATARS[level] || AVATARS.bunty;
  setAvatarState(el, state);
}
export function setAvatarState(el, state) {
  el.classList.remove('is-idle', 'is-thinking', 'is-happy', 'is-sad');
  el.classList.add(`is-${state}`);
}
