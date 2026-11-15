// Seeded RNG (mulberry32). One job: deterministic randomness for the sim,
// so a run with the same seed plays out the same way every time.

export function makeRng(seed) {
  let a = seed >>> 0;
  return {
    // Next float in [0, 1).
    next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // Integer in [min, max).
    int(min, max) {
      return min + Math.floor(this.next() * (max - min));
    },
    // Float in [min, max).
    range(min, max) {
      return min + this.next() * (max - min);
    },
    // Pick one element of an array.
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
    // Angle in radians, uniform over the circle.
    angle() {
      return this.next() * Math.PI * 2;
    },
  };
}

// A seed from the page URL (?seed=42) or a fresh random one.
export function seedFromUrl() {
  const q = new URLSearchParams(location.search);
  const s = parseInt(q.get('seed') ?? '', 10);
  return Number.isFinite(s) ? s : (Math.random() * 1e9) | 0;
}
