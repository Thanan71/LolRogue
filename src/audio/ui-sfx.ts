/**
 * UI + Ambience SFX — clicks, hover, victory, defeat.
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function makeGain(volume: number): GainNode {
  const ctx = getCtx();
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  gain.connect(ctx.destination);
  return gain;
}

// ─── UI SFX ─────────────────────────────────────────────────────────────────

export function playClick(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume * 0.7),
    now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc.connect(g);
  g.connect(gain);
  osc.start(now);
  osc.stop(now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
}

export function playHover(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume * 0.3),
    now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  osc.connect(g);
  g.connect(gain);
  osc.start(now);
  osc.stop(now + 0.025);
}

// ─── Victory / Defeat ───────────────────────────────────────────────────────

export function playVictory(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume),
    now = ctx.currentTime;
  const notes = [
    { freq: 523.25, s: 0, d: 0.15 },
    { freq: 659.25, s: 0.12, d: 0.15 },
    { freq: 783.99, s: 0.24, d: 0.35 },
  ];
  for (const n of notes) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = n.freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now + n.s);
    g.gain.linearRampToValueAtTime(0.4, now + n.s + 0.02);
    g.gain.setValueAtTime(0.4, now + n.s + n.d * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, now + n.s + n.d);
    o.connect(g);
    g.connect(gain);
    o.start(now + n.s);
    o.stop(now + n.s + n.d);
  }
  for (const freq of [523.25, 659.25, 783.99]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now + 0.55);
    g.gain.linearRampToValueAtTime(0.15, now + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    o.connect(g);
    g.connect(gain);
    o.start(now + 0.55);
    o.stop(now + 1.0);
  }
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
}

export function playDefeat(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume * 0.8),
    now = ctx.currentTime;
  const notes = [
    { freq: 440, s: 0, d: 0.4 },
    { freq: 415.3, s: 0.08, d: 0.35 },
    { freq: 349.23, s: 0.2, d: 0.5 },
  ];
  for (const n of notes) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(n.freq, now + n.s);
    o.frequency.exponentialRampToValueAtTime(n.freq * 0.85, now + n.s + n.d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now + n.s);
    g.gain.linearRampToValueAtTime(0.3, now + n.s + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + n.s + n.d);
    o.connect(g);
    g.connect(gain);
    o.start(now + n.s);
    o.stop(now + n.s + n.d);
  }
  const rumble = ctx.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.value = 80;
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.2, now);
  rg.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  rumble.connect(rg);
  rg.connect(gain);
  rumble.start(now);
  rumble.stop(now + 0.8);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
}
