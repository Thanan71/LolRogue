/**
 * AudioManager — Procedural SFX via Web Audio API.
 * Part 1: Core infrastructure + combat SFX.
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

// ─── Combat SFX ─────────────────────────────────────────────────────────────

function playAttack(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume),
    now = ctx.currentTime;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++)
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.15));
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 3000;
  f.Q.value = 2;
  noise.connect(f);
  f.connect(gain);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.3, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(og);
  og.connect(gain);
  noise.start(now);
  noise.stop(now + 0.08);
  osc.start(now);
  osc.stop(now + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
}

function playSpell(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume),
    now = ctx.currentTime;
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(400, now);
  o1.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.4, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  o1.connect(g1);
  g1.connect(gain);
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(800, now + 0.05);
  o2.frequency.exponentialRampToValueAtTime(2000, now + 0.2);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, now);
  g2.gain.linearRampToValueAtTime(0.2, now + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  o2.connect(g2);
  g2.connect(gain);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++)
    nd[i] = (Math.random() * 2 - 1) * Math.sin((i / nd.length) * Math.PI) * 0.3;
  const ns = ctx.createBufferSource();
  ns.buffer = nb;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  ns.connect(hp);
  hp.connect(gain);
  o1.start(now);
  o1.stop(now + 0.2);
  o2.start(now);
  o2.stop(now + 0.25);
  ns.start(now);
  ns.stop(now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
}

function playCrit(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume * 1.1),
    now = ctx.currentTime;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++)
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.08));
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2500;
  bp.Q.value = 1;
  noise.connect(bp);
  bp.connect(gain);
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(200, now);
  thump.frequency.exponentialRampToValueAtTime(60, now + 0.1);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.6, now);
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  thump.connect(tg);
  tg.connect(gain);
  noise.start(now);
  noise.stop(now + 0.12);
  thump.start(now);
  thump.stop(now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
}

function playEnemyDefeat(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume * 0.6),
    now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
  const eg = ctx.createGain();
  eg.gain.setValueAtTime(0.3, now);
  eg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  osc.connect(lp);
  lp.connect(eg);
  eg.connect(gain);
  osc.start(now);
  osc.stop(now + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
}

function playRoundStart(volume: number): void {
  const ctx = getCtx(),
    gain = makeGain(volume * 0.5),
    now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.setValueAtTime(880, now + 0.08);
  const eg = ctx.createGain();
  eg.gain.setValueAtTime(0.3, now);
  eg.gain.setValueAtTime(0.3, now + 0.08);
  eg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(eg);
  eg.connect(gain);
  osc.start(now);
  osc.stop(now + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
}

export { playAttack, playCrit, playEnemyDefeat, playRoundStart, playSpell };
