# Kanche — gully marbles

The street marble games — **Chakri**, **Pill Chot** and **Kali Jota** — played with a thumb on a
phone. No engine, no build step, no binary assets. Open `index.html` and it runs.

```
npm run dev     # http://localhost:8790
npm test        # physics, rules and the bot ladder
npm run deploy  # wrangler deploy -- uploads public/ as a static-assets Worker
```

`public/` **is** the site. There is no build step, no bundler and no dependencies -- Cloudflare
Pages (or any static host, or a USB stick) serves it as-is.

Two Cloudflare projects, deliberately separate: **`kanche-game`** is the static page (a
static-assets Worker -- free and unmetered, no build step, no server code), **`kanche-rooms`**
is the Worker for online play (needs the paid plan, deployed from `worker/`). The page works
completely without the Worker -- the bot runs entirely in the browser.

In the dashboard, leave **Build command empty** and **Deploy command `npx wrangler deploy`**.
There is nothing to build; a non-empty build command is the usual way this deploy fails.

---

## The shot

Two control schemes. **Buttons are the default**, because the first build shipped with the drag
gesture alone and the first person to try it on a phone could not take a single shot -- nothing
appears on screen until you have already guessed the right gesture, which is not a control
scheme, it is a riddle.

### Buttons (default)

`◀` `▶` aim -- tap to nudge, hold to sweep. A yellow arrow and the predicted path are on screen
the whole time, so there is never a moment where the game is not telling you what it will do.

`SHOOT` runs the three-tap meter, the golf/Stick Cricket pattern that is decades old because it
works:

| tap | what it sets |
|---|---|
| 1 — SHOOT | the marker starts sweeping the bar |
| 2 — POWER | locks how hard you hit; the marker turns and runs back, faster |
| 3 — RELEASE | tap inside the green band for a true line; miss it and the shot pulls, up to 7° |

Two decisions, one button, every piece of state visible. Nothing is hidden and nothing depends
on knowing a gesture.

### Drag (optional)

One gesture carries all three things a real flick carries: line, power, and a clean release.

**Press anywhere in the lower half and drag back.** Not on the marble — on a phone your thumb
covers whatever it touches, and the marble is the one thing you need to see. Aim is measured from
wherever you landed, so the board stays visible.

The skill layer is the **steadiness ring**:

| Hold time | Ring | What a release does |
|---|---|---|
| 0–340ms | wide, shrinking | sprays — up to ~6° off line |
| 340–960ms | tight, green | goes exactly where the line says |
| 960ms+ | widening, wobbling | sprays again, your hand is tired |

Rush it and you spray. Dither and you spray. One input, two skills, no second button, and it
reads at a glance — which is the Stick Cricket lesson without the desktop-era UI.

Drag past 92% power and the **thumb lifts**: a foul, and you pay a marble into the ring.

## The Dhampar

Striker choice is a real decision, not a skin. A finger flick delivers roughly fixed *energy*, so
a heavier marble leaves slower by `√m`; rolling deceleration falls with radius, so once it is
moving it keeps going.

| | Goli | Dhampar |
|---|---|---|
| radius / mass | 14mm / 1.0× | 19mm / 2.48× (volume cubed) |
| top speed | 5.6 m/s | 3.55 m/s |
| full-power range | 3.0 m | 1.64 m |
| deflection on a cut | knocked well off line | ploughs through — measured at 5× less |

So the Dhampar bulldozes a cluster and never gets pushed around, but it barely reaches the far
rim and, being fat and slow, it parks inside the ring — which under the foul rule costs you the
striker. Ustaad Pappu shoots one.

## Rules as implemented

**Chakri.** Marbles are placed *on* the ring with one in the middle, and you shoot from the line.
Knock one fully outside and you keep it *and shoot again*.

The rule that makes it a game: **a shot may disturb exactly one marble.** Knock one into its
neighbour, or carom your striker on through the pack, and the turn is over however much went out.
That turns it from a power game into a precision one, and it is where the skill lives — measured
bot against bot, the beginner scatters on 20% of shots and the ustaad on 3%, which alone widens
the head-to-head gap from 73% to 90%.

A turn is bounded twice over, and it needs both. Every shot spends a chance and a score refunds
the one it spent, capped at the set — so a run continues only while it keeps scoring. On top of
that a turn is at most **four shots** whatever happens. The first cut had neither: any score
refilled the whole set, so scoring once every three shots held the board indefinitely. Measured
bot against bot, the stronger player took 95% of all shots and the opponent *never took a single
turn* in 13 games out of 15. With both limits in place it is 58%, and nobody is ever shut out. Your striker stays where it lies, which is usually inside
the ring, where the next shot is easy but a miss is fatal. So you may instead **take the line**
and walk back: the single best decision in the game.

If your striker stops inside the ring *with nothing knocked out*, it is forfeit. Both halves
matter — succeed and parking inside is fine, which is what makes a good break worth the risk.

**Pill Chot (simple).** A count, not a stake. Nothing on the patch but the players and the hole.
A chot on an opponent's marble is ten — and then you owe the hole a visit before the next one
counts. Reach the target and you still have to *sink it in the hole* to finish, so the last shot
of a game is a touch shot after ten of hunting.

The trip through the hole is the rule that makes it work. Without it, after a hit your marble is
sitting right beside theirs and the next hit is free: two bots shoved each other across the patch
at a 95% hit rate, and whoever shot first won every single game. With it the game has a two-beat
rhythm — hunt, then return — and the hole earns its place as the central, unkockable staging post
the street rule describes.

The count scales with the company (`50 × (players − 1)`): the street runs to a hundred, which
assumes a crowd of marbles to hunt. Head-to-head that measured at nearly sixty shots a game.

Your marble stays on the patch between turns. It is a target, and that exposure is the game.

**Kali Jota.** The sideline bet. A fist of marbles, you call kali (odd) or jota (even). Right, you
take the handful; wrong, you pay the same number across.

## The bot

Its brain **is the physics engine**. Three stages:

1. **Ghost-ball aiming**, exact for these collisions and closed-form — no search:
   ```
   e = normalize(T − C)                  shortest way out of the ring
   G = T − e·(r_target + r_striker)      the contact point to aim at
   θ = angle between e and (G − S)       the cut

   d   = (R + r) − |T − C|               how far the target must roll to clear the line
   v_t = √(2·a·d)                        speed it needs
   v_i = v_t / (K·cos θ)                 impact speed, K = (1+e)·m₁/(m₁+m₂)
   v_0 = √(v_i² + 2·a·L)                 launch speed, adding friction back over distance L
   ```
2. **Score and filter** — swept-circle blocking test, cut angle past ~72° rejected, striker
   safety after the collision, and where the striker rests for the *next* shot (without that
   term, a bot knocks one out and leaves itself dead, scoring 1 instead of running the ring).
3. **Roll it out** — take the best few candidates and play each one dozens of times in the real
   simulator **with this bot's own hand shake**, then pick the best *expected* result rather than
   the best perfect-world one.

Stage 3 is the trick. A shaky bot avoids thin cuts entirely on its own, because in its rollouts
the thin cut fails — which is exactly why a beginner plays safe. Nobody programmed that.

Difficulty is therefore never a cheat. Every tier runs identical code and differs in three
honest numbers:

| | angular σ | power σ | rollouts | thinks about position? |
|---|---|---|---|---|
| **Chotu** (Gully kid) | 6.0° | 24% | 8 | no — grabs a shot off the top of the pile |
| **Bunty** (Mohalla champ) | 2.0° | 10% | 36 | yes |
| **Ustaad Pappu** | 0.5° | 3.5% | 56 | yes, plus take-the-line |

Measured over 24 matches per pairing: Ustaad beats Chotu 20/24, Bunty beats Chotu 20/24, Ustaad
beats Bunty 14/24. Every match terminates.

It also has nerves — σ widens ~30% on a big pot or when down to its last marbles — and goes for
the hero shot when losing badly. It never shoots instantly: 0.9–2.6s of visible deliberation,
with the aim line wandering around the shot it actually chose. Instant shots read as a machine.

## Known: the opener has a real edge

Who shoots first is a fair toss, and the opener wins about 70–78% of matches between identical
bots, in both modes. That is a lot for a coin flip to decide. Docking the victim ten points to
create catch-up was tried and measured: it doubled game length and did nothing for the edge, so
it was dropped rather than kept on the theory that it ought to help.

The right fix is **lagging** — the pre-game throw at the hole that decides turn order in the
street game. That makes the advantage *earned* rather than arbitrary, which is the difference
between a flaw and a feature. `newMatch` already takes a `first` argument for it.

## The patch is the camera

`FIELD` in `physics.js` is both the playable area and the camera window -- `render.js` imports it
rather than keeping its own copy. They were once separate rectangles that drifted 26cm apart,
exactly in the direction knocked-out marbles fly: two marbles a shot came to rest off the top of
the screen, and a striker that landed there was impossible to aim at all. A test asserts that
nothing ever rests outside it, so the two cannot diverge again.

Widening it is safe in both axes because the camera fits by `min(W/width, H/height)`, so the
visible extent is always at least the field.

## Why the board is not to scale

A real 17mm kancha inside a 2.2ft ring is a 39:1 ratio. Honest, and an unreadable dot on a phone.
Everything is tuned to ~19:1 — what the game looks like in memory rather than in a photograph.

The pile is packed in **mirror-symmetric rings**, not the golden-angle spiral that was there
first. That is not fussiness: bot-vs-bot testing showed a lopsided pile handing one seat a better
line on every break and swinging the win rate between 30% and 65%. Mirroring the pile flipped the
result; mirroring the symmetric one does nothing.

## iPhone notes

It is a web page, so distribution is a WhatsApp link — no App Store, no developer fee. Traps that
are handled here, each of which breaks the game outright if missed:

- `touch-action:none` + `overscroll-behavior:none` — otherwise dragging back to aim triggers
  pull-to-refresh or rubber-banding.
- `gesturestart`/`touchmove` swallowed — `user-scalable=no` is ignored on iOS, so double-tap
  zoom has to be killed in JS.
- `navigator.audioSession.type = 'playback'` — without it the ringer switch silences WebAudio,
  and the click of glass on glass is half the feel of this game.
- `[hidden]{display:none!important}` — several overlays set `display:flex`, which silently beats
  the `hidden` attribute and leaves an invisible panel eating every tap. This cost a debugging
  session; it is the first rule in the stylesheet now.
- DPR capped at 2 — a 6.7" screen at DPR 3 is a 1290×2796 buffer nobody can see.
- Physics on a **fixed timestep**, replayed at 60fps — a 120Hz ProMotion phone and a 30Hz Low
  Power Mode phone must show the same shot.
- `viewport-fit=cover` + `safe-area-inset-*` for the Dynamic Island and home indicator.
- iOS never offers to install a web app, so there is a one-time Add to Home Screen hint —
  standalone mode is the only way to lose the URL bar (there is no Fullscreen API on iPhone).

**Not** handled, because it cannot be: `navigator.vibrate` does not exist on iOS Safari. There is
no clean haptic from a web game. Compensated with audio.

One real limitation: iOS evicts `localStorage` after ~7 days of not opening the site, so a marble
stash kept only in the browser can evaporate. If progression is ever meant to matter, it has to
live server-side.

## Online

Not wired up — `server/` holds a working reference implementation to copy into its own Worker.

The design rests on one property: **the simulation is deterministic**. Same seed, same shot, same
result, every time — which the test suite asserts by hashing every frame. So a turn on the wire is
the *input*, never the board:

```json
{ "n": 7, "angle": -1.5382, "power": 0.71, "foul": false, "fromLine": true }
```

About 30 bytes. Three consequences fall out for free: a whole match is a replay, a recorded match
is a **ghost opponent** you can play against with no matchmaking and no waiting, and a server can
re-run the shot list to verify a score.

- **Tier 1 — async by room code.** Kanche is turn-based, so latency cannot matter. Poll every 2s;
  the invite is `?room=7KQ2` pasted into WhatsApp. Costs nothing, works on patchy mobile data.
  This is the right first online mode.
- **Tier 2 — realtime.** One Durable Object per room with WebSocket hibernation, so an idle room
  is free. Needed for spectators, live aim pointers and chat — which is half the pleasure of the
  real game. `cd worker && npx wrangler deploy` puts it up; it needs the Workers paid plan.

Two rules worth keeping when it ships: matches cap at 4 players (waiting on three other people
kills the pace), and **if an opponent does not move within 24 hours the bot plays their turn** —
abandonment is what kills every turn-based mobile game.

## Files

```
public/index.html     one screen, three states
public/css/game.css   mobile-first; the paranoid rules are load-bearing
public/js/physics.js  deterministic sim -- pure, no DOM, no Math.random
public/js/rules.js    match state, Chakri / Pill Chot / Kali Jota
public/js/bot.js      ghost-ball aiming + rollouts with its own hand shake
public/js/input.js    the drag gesture and the steadiness ring
public/js/render.js   canvas; knows nothing about rules
public/js/avatars.js  three opponents as inline SVG, animated by CSS class
public/js/strings.js  the Hinglish, tied to events
public/js/audio.js    every sound synthesised -- zero bytes of audio
public/js/rng.js      seeded; the only source of chance in a match
public/js/main.js     screens and the turn loop
tests/                determinism, rules, the gesture curve, the bot ladder
worker/               reference Worker for online play; deployed separately
tools/serve.mjs       dependency-free dev server
```

Nothing imports anything outside `public/js/`, and there are no runtime dependencies at all --
which is what makes the whole thing 164KB and portable to any host.
