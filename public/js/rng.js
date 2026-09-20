// Seeded random. Every source of chance in a match comes from here, so a match is fully
// reproducible from (seed + the list of shots). That is what makes replays, ghosts and
// server-side verification cost almost nothing later.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    // Box-Muller. The bot's hand shake is gaussian, not uniform: a human misses by a hair
    // far more often than by a mile, and uniform noise feels wrong immediately.
    normal(mean = 0, sd = 1) {
      const u = Math.max(next(), 1e-9), v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    range: (lo, hi) => lo + (hi - lo) * next(),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    int: (n) => Math.floor(next() * n) % n,
    state: () => a,
    seedTo: (s) => { a = s >>> 0; },
  };
}
