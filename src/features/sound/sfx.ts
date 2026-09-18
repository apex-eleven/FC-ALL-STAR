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
 * The CSS timing function the gachapon strip is animated with, solved for y.
 *
 * The ticking has to be the strip's own motion, not a guess at it: a tick when a card
 * crosses the frame. So the curve in `GachaScreen.module.css` is evaluated here, and
 * the two have to stay the same four numbers — a reel whose sound runs on a different
 * curve is worse than a silent one, because it sounds like it stopped before it did.
 *
 * Newton's method on x, because a cubic bezier gives x and y separately in terms of a
 * parameter, and what is known here is the time.
 */
function easing(p1x: number, p1y: number, p2x: number, p2y: number): (x: number) => number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const atX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const atY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slope = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = atX(t) - x;
      if (Math.abs(error) < 1e-5) break;
      const d = slope(t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    return atY(Math.min(1, Math.max(0, t)));
  };
}

const REEL_EASE = easing(0.2, 0.5, 0.3, 1);

/**
 * Ticks closer together than this are dropped.
 *
 * The strip's first tenth of a second passes a dozen cards. Every one of them ticking
 * is not a reel, it is a buzz — and no real wheel is heard card by card at full
 * speed either. Twenty-odd a second is as fast as a tick still reads as a tick.
 */
const REEL_MIN_GAP = 0.042;

/** A ceiling on one run, so a long reel cannot schedule hundreds of nodes. */
const REEL_MAX_TICKS = 120;

/** Everything scheduled for the run in progress, so it can be cut short. */
let reelNodes: AudioScheduledSourceNode[] = [];

/** One tick at an absolute time on the context clock. */
function tickAt(
  ctx: AudioContext,
  target: AudioNode,
  at: number,
  frequency: number,
  gain: number,
): void {
  if (!noise) return;

  const source = ctx.createBufferSource();
  source.buffer = noise;

  const band = ctx.createBiquadFilter();
  // Wide enough to have some body. At Q 5 the tick was technically there and nobody
  // could hear it over the music: a narrow band passes very little of the noise.
  band.type = 'bandpass';
  band.frequency.value = frequency;
  band.Q.value = 2.6;

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);

  source.connect(band).connect(env).connect(target);
  source.start(at, Math.random() * 0.5, 0.03);
  source.stop(at + 0.03);
  reelNodes.push(source);

  // Noise alone does not carry. Measured against the UI click, a tick built only
  // from filtered noise peaked at 0.39 of it however far its gain was pushed — a
  // bandpass throws most of the signal away. The click gets its level from a tone
  // under the transient, and so does this: twenty milliseconds of pitched body is
  // the difference between a tick you can hear over the music and one you cannot.
  const osc = ctx.createOscillator();
  const oscEnv = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency * 0.55, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, frequency * 0.34), at + 0.02);
  oscEnv.gain.setValueAtTime(0.0001, at);
  oscEnv.gain.exponentialRampToValueAtTime(gain * 0.7, at + 0.004);
  oscEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
  osc.connect(oscEnv).connect(target);
  osc.start(at);
  osc.stop(at + 0.04);
  reelNodes.push(osc);
}

/**
 * Cuts a reel short. Called when a run ends or the screen closes: the whole tick
 * track is scheduled up front, so without this a reel would keep ticking over a
 * screen that is no longer there.
 */
export function stopReel(): void {
  for (const node of reelNodes) {
    try {
      node.stop();
    } catch {
      // Already finished. Stopping a node twice throws, and there is nothing to do
      // about a tick that has already been heard.
    }
  }
  reelNodes = [];
}

/**
 * The tick track of a spinning reel: one tick per card crossing the frame.
 *
 * Scheduled in one go on the audio clock rather than fired frame by frame. A tick
 * driven from `requestAnimationFrame` drifts with every dropped frame, and the whole
 * point of this sound is that it lines up with what the eye sees — on a phone, where
 * frames are dropped, a timer-driven version would go out of step exactly when the
 * animation is at its most expensive.
 *
 * The ticks slow as the strip does, and the last few drop in pitch and rise in level:
 * that decelerating rattle is the part a player actually listens to.
 */
export function playReel(durationMs: number, cards: number): void {
  const ctx = ensureContext();
  if (!ctx || !master) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

  stopReel();
  if (durationMs <= 0 || cards <= 0) return;

  const duration = durationMs / 1000;
  const start = ctx.currentTime + 0.02;
  const step = 1 / 240;

  let passed = -1;
  let previous = -Infinity;
  let ticks = 0;

  for (let t = 0; t <= duration && ticks < REEL_MAX_TICKS; t += step) {
    const reached = Math.floor(REEL_EASE(t / duration) * cards);
    if (reached === passed) continue;
    passed = reached;
    if (t - previous < REEL_MIN_GAP) continue;
    previous = t;
    ticks += 1;

    // Toward the end: lower, louder, further apart. The reel is not just slowing
    // down, it is arriving.
    //
    // The level sits near the UI click's own 0.22 rather than under it. These ticks
    // play under a full screen of animation and, usually, the background music; the
    // first pass at half this was inaudible on anything but headphones.
    const left = 1 - t / duration;
    tickAt(ctx, master, start + t, 1500 + 1100 * left, 0.26 + 0.16 * (1 - left));
  }
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

    // The gachapon reel stopping. A hard tick for the card dropping into the frame,
    // then a short rising pair under it so a win reads as an arrival rather than as
    // one more tick of the reel that just ended.
    case 'land':
      transient(ctx, master, 1900, 0.3);
      tone(ctx, master, { type: 'triangle', from: 520, to: 780, duration: 0.12, gain: 0.2 });
      tone(ctx, master, {
        type: 'sine',
        from: 780,
        to: 1170,
        duration: 0.16,
        gain: 0.16,
        delay: 0.07,
      });
      break;
  }
}
