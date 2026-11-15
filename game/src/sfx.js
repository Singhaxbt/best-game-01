// Sound: synthesized WebAudio effects. No audio files, no network.
// One job: make a blip. Every effect is an oscillator + gain envelope.

export function makeSfx() {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // A tone that slides from f0 to f1 over `dur` seconds.
  function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.12, vol = 0.12, at = 0 }) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  return {
    unlock() { ac(); }, // call from a user gesture so later sounds play
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    shoot()  { tone({ type: 'square', f0: 880, f1: 320, dur: 0.07, vol: 0.05 }); },
    hit()    { tone({ type: 'triangle', f0: 220, f1: 90, dur: 0.08, vol: 0.09 }); },
    boom()   { tone({ type: 'sine', f0: 160, f1: 40, dur: 0.35, vol: 0.22 }); tone({ type: 'square', f0: 90, f1: 30, dur: 0.25, vol: 0.1 }); },
    gem()    { tone({ type: 'sine', f0: 990, f1: 1480, dur: 0.09, vol: 0.07 }); },
    level()  { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.14, vol: 0.1, at: i * 0.07 })); },
    hurt()   { tone({ type: 'sawtooth', f0: 200, f1: 60, dur: 0.22, vol: 0.16 }); },
    dash()   { tone({ type: 'sine', f0: 300, f1: 900, dur: 0.14, vol: 0.08 }); },
    boss()   { tone({ type: 'sawtooth', f0: 70, f1: 45, dur: 0.7, vol: 0.16 }); tone({ type: 'sine', f0: 140, f1: 90, dur: 0.5, vol: 0.12, at: 0.1 }); },
    wave()   { tone({ type: 'sine', f0: 660, dur: 0.1, vol: 0.09 }); tone({ type: 'sine', f0: 880, dur: 0.14, vol: 0.09, at: 0.09 }); },
    over()   { [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.12, at: i * 0.16 })); },
  };
}
