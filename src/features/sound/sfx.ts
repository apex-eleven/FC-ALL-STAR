import { SOUND_THROTTLE_MS } from './constants';
import type { SoundId } from './types';

/**
 * UI sounds, synthesised rather than sampled.
 *
 * Nothing here loads a file. A click is 60ms of envelope on an oscillator plus a
 * noise transient — a few hundred bytes of code instead of a .wav per sound, and no
 * asset to lose when the artwork is replaced. It also means a click can fire on the
 * very first gesture of a session, with no decode to wait for.
 *
 * Pure module state, no React. The context is created lazily on the first gesture
 * because a context built before one exists starts suspended and stays that way.
 */

type Ctor = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let volume = 0.55;
let lastPlayedAt = 0;

function resolveCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const legacy = (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

function ensureContext(): AudioContext | null {
  if (context) return context;

  const Ctor = resolveCtor();
  if (!Ctor) return null;

  try {
    context = new Ctor();
  } catch {
    // Some embedded browsers refuse a context outright. Silence is acceptable;
    // a crash on a button press is not.
    return null;
  }

  master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);

  // One second of white noise, reused for every transient.
  const frames = Math.floor(context.sampleRate);
  noise = context.createBuffer(1, frames, context.sampleRate);
  const channel = noise.getChannelData(0);
  for (let i = 0; i < frames; i += 1) channel[i] = Math.random() * 2 - 1;

  return context;
}

export function setSfxVolume(next: number) {
  volume = Math.max(0, Math.min(1, next));
  if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, 0.01);
}

/**
 * Brings the context out of suspend. Safe to call on every gesture — resuming an
 * already-running context is a no-op.
 */
export function unlockSfx() {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

interface ToneOptions {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  delay?: number;
}

function tone(ctx: AudioContext, target: AudioNode, options: ToneOptions) {
  const start = ctx.currentTime + (options.delay ?? 0);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = options.type;
  osc.frequency.setValueAtTime(options.from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), start + options.duration);

  // Ramping from an audible level rather than to it would click at the attack, which
  // is why every envelope starts at near-zero and rises over 6ms.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(options.gain, start + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

  osc.connect(env).connect(target);
  osc.start(start);
  osc.stop(start + options.duration + 0.02);
}

function transient(ctx: AudioContext, target: AudioNode, frequency: number, gain: number) {
  if (!noise) return;
  const start = ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = noise;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = frequency;
  band.Q.value = 1.4;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);

  source.connect(band).connect(env).connect(target);
  source.start(start);
  source.stop(start + 0.06);
}

interface SweepOptions {
  from: number;
  to: number;
  duration: number;
  gain: number;
  q?: number;
}

/**
 * Noise through a bandpass that slides. A rip is a broadband tear whose centre
 * climbs as the foil gives way, which no oscillator shape gets close to.
 */
function sweep(ctx: AudioContext, target: AudioNode, options: SweepOptions) {
  if (!noise) return;
  const start = ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = options.q ?? 0.9;
  band.frequency.setValueAtTime(options.from, start);
  band.frequency.exponentialRampToValueAtTime(
    Math.max(1, options.to),
    start + options.duration,
  );

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(options.gain, start + options.duration * 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);

  source.connect(band).connect(env).connect(target);
  source.start(start);
  source.stop(start + options.duration + 0.05);
}

/**
 * Plays a UI sound. Silently does nothing when Web Audio is unavailable or the
 * throttle window is still open.
 */
export function playSfx(id: SoundId) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPlayedAt < SOUND_THROTTLE_MS) return;

  const ctx = ensureContext();
  if (!ctx || !master) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  lastPlayedAt = now;

  switch (id) {
    case 'click':
      transient(ctx, master, 2600, 0.18);
      tone(ctx, master, { type: 'triangle', from: 1180, to: 620, duration: 0.07, gain: 0.22 });
      break;

    case 'back':
      transient(ctx, master, 1500, 0.12);
      tone(ctx, master, { type: 'triangle', from: 620, to: 280, duration: 0.1, gain: 0.2 });
      break;

    case 'toggle':
      tone(ctx, master, { type: 'sine', from: 700, to: 700, duration: 0.05, gain: 0.16 });
      tone(ctx, master, {
        type: 'sine',
        from: 1050,
        to: 1050,
        duration: 0.06,
        gain: 0.16,
        delay: 0.05,
      });
      break;

    case 'error':
      tone(ctx, master, { type: 'square', from: 220, to: 150, duration: 0.16, gain: 0.12 });
      break;

    // Pack opening. Longer and lower than a UI tick on purpose — these sit under an
    // animation rather than confirming a press.
    case 'shake':
      sweep(ctx, master, { from: 180, to: 620, duration: 0.6, gain: 0.1, q: 0.6 });
      tone(ctx, master, { type: 'sine', from: 60, to: 110, duration: 0.6, gain: 0.1 });
      break;

    case 'tear':
      sweep(ctx, master, { from: 900, to: 5200, duration: 0.42, gain: 0.2, q: 0.7 });
      tone(ctx, master, {
        type: 'triangle',
        from: 320,
        to: 1400,
        duration: 0.3,
        gain: 0.14,
        delay: 0.16,
      });
      break;
  }
}
