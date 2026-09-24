import type { SoundCueKind } from './players/PlayerVisualAdapter';

/**
 * The match's sound: the crowd, the ball being struck, the referee's whistle.
 *
 * Everything is SYNTHESISED with Web Audio — there are no sound files, so there is
 * nothing to license and nothing to download. It is presentation only: it is told
 * what to play (cues from PlayerVisualAdapter, already timed to the drawn foot meeting
 * the ball) and how excited the crowd should be, and never reads the engine.
 *
 * Browsers only let audio start after the viewer has touched the page, so the context
 * is resumed on the first pointer or key press. With no Web Audio at all it stays
 * silent and every call is a no-op.
 */

/** Overall level, and each layer's share of it. */
const MASTER = 0.75;
const CROWD_BED = 0.34;
const CROWD_QUIET = 0.1;
const CROWD_EXCITED = 0.55;
const WHISTLE = 0.2;
/** Seconds the crowd takes to follow the play; the roar is quicker. */
const CROWD_FOLLOW = 0.8;
/** Length of the looped crowd bed, seconds; its swells repeat no sooner than this. */
const BED_SECONDS = 9;
const BED_CROSSFADE = 0.35;

/** Whistle blasts: [seconds on, seconds off] in turn. */
const WHISTLES: Record<'whistle' | 'whistle_kickoff' | 'whistle_half' | 'whistle_full', readonly number[]> = {
  whistle: [0.24],
  whistle_kickoff: [0.55],
  whistle_half: [0.4, 0.2, 0.95],
  whistle_full: [0.3, 0.2, 0.3, 0.2, 1.25],
};

/** Muting is kept for the session, across matches (nothing is written to storage). */
let sessionMuted = false;
/** Every sound system that is playing, so a mute from the HUD reaches it. */
const live = new Set<MatchAudio>();

/** Whether match sound is muted for this session. */
export function isMatchSoundMuted(): boolean {
  return sessionMuted;
}

/** Mutes or unmutes match sound, now and for the rest of the session. */
export function setMatchSoundMuted(muted: boolean): void {
  sessionMuted = muted;
  for (const audio of live) audio.applyMute();
}

type AudioContextCtor = typeof AudioContext;

export default class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private roarGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowd: AudioBuffer | null = null;
  private loops: AudioBufferSourceNode[] = [];
  private lastLevel = -1;
  private readonly unlock = () => {
    void this.ctx?.resume();
    if (this.ctx?.state === 'running') this.removeUnlock();
  };

  start(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;
    live.add(this);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 6;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = sessionMuted ? 0 : MASTER;
    this.master.connect(limiter);

    this.noise = makeNoise(ctx, 2);
    this.crowd = makeCrowd(ctx);

    // The crowd: a low murmur that is always there, and a brighter, higher layer of
    // the same voices that comes up for a chance and roars for a goal.
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    const bedTone = ctx.createBiquadFilter();
    bedTone.type = 'lowpass';
    bedTone.frequency.value = 1500;
    bedTone.connect(this.bedGain);
    this.bedGain.connect(this.master);
    this.loops.push(this.loop(this.crowd, bedTone, 1, 0));

    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    const roarTone = ctx.createBiquadFilter();
    roarTone.type = 'bandpass';
    roarTone.frequency.value = 1150;
    roarTone.Q.value = 0.5;
    roarTone.connect(this.roarGain);
    this.roarGain.connect(this.master);
    this.loops.push(this.loop(this.crowd, roarTone, 1.22, BED_SECONDS * 0.43));

    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    window.addEventListener('touchstart', this.unlock, true);
    this.unlock();
  }

  dispose(): void {
    live.delete(this);
    this.removeUnlock();
    for (const source of this.loops) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.loops = [];
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  /** Brings this system in line with the session's mute. */
  applyMute(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(sessionMuted ? 0 : MASTER, ctx.currentTime, 0.05);
    if (!sessionMuted) void ctx.resume();
  }

  /**
   * Once a frame. `excitement` 0..1 is how close the play is to a goal; `running` is
   * false while the match stands still (paused, half-time, full time), when the crowd
   * settles to a murmur.
   */
  frame(excitement: number, running: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.bedGain) return;
    const level = running ? CROWD_BED + (CROWD_EXCITED - CROWD_BED) * clamp01(excitement) : CROWD_QUIET;
    // Only re-aimed when it has moved, so the automation list stays short.
    if (Math.abs(level - this.lastLevel) < 0.01) return;
    this.lastLevel = level;
    this.bedGain.gain.setTargetAtTime(level, ctx.currentTime, CROWD_FOLLOW);
  }

  /** Plays one cue now. `pan` −1..1 is where on screen it happened. */
  play(kind: SoundCueKind, pan: number, power: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || sessionMuted) return;
    const t = ctx.currentTime + 0.005;
    switch (kind) {
      case 'pass':
        this.kick(t, pan, 0.35 + 0.35 * power, 150 + 40 * power, 0.1);
        return;
      case 'shot':
        this.kick(t, pan, 0.95, 125, 0.16);
        this.swell(t + 0.05, 0.22, 0.35, 1.6);
        return;
      case 'touch':
        this.kick(t, pan, 0.16, 210, 0.05);
        return;
      case 'tackle':
        this.thud(t, pan, 0.4, 900, 0.14);
        return;
      case 'catch':
        this.thud(t, pan, 0.55, 520, 0.09);
        return;
      case 'goal':
        this.swell(t, 0.95, 0.25, 5.5);
        return;
      case 'save':
        this.ooh(t, 0.5);
        return;
      case 'miss':
        this.ooh(t, 0.42);
        return;
      default:
        this.whistle(t, WHISTLES[kind], kind === 'whistle' ? 3250 : 2950);
        if (kind === 'whistle_full') this.swell(t + 0.6, 0.45, 0.8, 4.5);
    }
  }

  /* ── Voices ─────────────────────────────────────────────────────────────── */

  private loop(buffer: AudioBuffer, into: AudioNode, rate: number, offset: number): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.connect(into);
    source.start(0, offset);
    return source;
  }

  private panned(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return this.master!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.8, Math.min(0.8, pan * 0.8));
    panner.connect(this.master!);
    return panner;
  }

  /** Leather on a boot: a falling low thump and a short bright slap. */
  private kick(t: number, pan: number, level: number, pitch: number, length: number): void {
    const ctx = this.ctx!;
    const out = this.panned(pan);

    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(pitch, t);
    body.frequency.exponentialRampToValueAtTime(pitch * 0.36, t + length);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(level, t + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + length * 1.4);
    body.connect(bodyGain).connect(out);
    body.start(t);
    body.stop(t + length * 1.5);

    const slap = this.noiseSource(t, 0.05);
    const tone = ctx.createBiquadFilter();
    tone.type = 'bandpass';
    tone.frequency.value = 1800 + 900 * level;
    tone.Q.value = 1.1;
    const slapGain = ctx.createGain();
    slapGain.gain.setValueAtTime(level * 0.5, t);
    slapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    slap.connect(tone).connect(slapGain).connect(out);
  }

  /** A body or hands on the ball: muffled, no ring to it. */
  private thud(t: number, pan: number, level: number, cutoff: number, length: number): void {
    const ctx = this.ctx!;
    const out = this.panned(pan);
    const source = this.noiseSource(t, length + 0.05);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    source.connect(tone).connect(gain).connect(out);

    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(130, t);
    body.frequency.exponentialRampToValueAtTime(70, t + length);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(level * 0.6, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    body.connect(bodyGain).connect(out);
    body.start(t);
    body.stop(t + length + 0.02);
  }

  /** A pea whistle: a high tone with the pea's fast trill through it, blown in blasts. */
  private whistle(t: number, blasts: readonly number[], pitch: number): void {
    const ctx = this.ctx!;
    const total = blasts.reduce((sum, value) => sum + value, 0);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, t);
    let at = t;
    blasts.forEach((length, index) => {
      if (index % 2 === 0) {
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(WHISTLE, at + 0.018);
        envelope.gain.setValueAtTime(WHISTLE, at + length - 0.04);
        envelope.gain.linearRampToValueAtTime(0, at + length);
      }
      at += length;
    });
    envelope.connect(this.master!);

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = pitch;
    const trill = ctx.createOscillator();
    trill.frequency.value = 31;
    const trillDepth = ctx.createGain();
    trillDepth.gain.value = pitch * 0.045;
    trill.connect(trillDepth).connect(tone.frequency);
    // The trill also flutters the loudness.
    const flutter = ctx.createGain();
    flutter.gain.value = 0.75;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.25;
    trill.connect(flutterDepth).connect(flutter.gain);
    tone.connect(flutter).connect(envelope);
    // An octave-ish overtone and a little breath make it a whistle, not a beep.
    const over = ctx.createOscillator();
    over.frequency.value = pitch * 2.02;
    const overGain = ctx.createGain();
    overGain.gain.value = 0.12;
    over.connect(overGain).connect(flutter);
    const breath = this.noiseSource(t, total + 0.05);
    const breathTone = ctx.createBiquadFilter();
    breathTone.type = 'bandpass';
    breathTone.frequency.value = pitch;
    breathTone.Q.value = 4;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.35;
    breath.connect(breathTone).connect(breathGain).connect(envelope);

    for (const osc of [tone, trill, over]) {
      osc.start(t);
      osc.stop(t + total + 0.05);
    }
  }

  /** The crowd rising: the bright layer comes up over `rise` s and dies away over `fall` s. */
  private swell(t: number, level: number, rise: number, fall: number): void {
    const ctx = this.ctx!;
    const gain = this.roarGain!.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(level, t + rise);
    gain.setTargetAtTime(0, t + rise + 0.3, fall / 3);
    void ctx;
  }

  /** "Ooh": the crowd's breath drawn in and let go, darkening as it falls. */
  private ooh(t: number, level: number): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.crowd;
    source.playbackRate.value = 0.9;
    const vowel = ctx.createBiquadFilter();
    vowel.type = 'bandpass';
    vowel.Q.value = 1.6;
    vowel.frequency.setValueAtTime(620, t);
    vowel.frequency.exponentialRampToValueAtTime(330, t + 1.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.28);
    gain.gain.setTargetAtTime(0.0001, t + 0.5, 0.45);
    source.connect(vowel).connect(gain).connect(this.master!);
    source.start(t, Math.random() * (BED_SECONDS - 3));
    source.stop(t + 2.6);
  }

  private noiseSource(t: number, length: number): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = this.noise;
    source.start(t, Math.random() * 1.5);
    source.stop(t + length);
    return source;
  }

  private removeUnlock(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.unlock, true);
    window.removeEventListener('keydown', this.unlock, true);
    window.removeEventListener('touchstart', this.unlock, true);
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Thousands of voices at once, as a seamless stereo loop: pink noise (the spread of
 * many voices) shaped by slow swells and a faster, uneven chatter. Every modulation
 * repeats a whole number of times in the loop, and the noise is cross-faded across the
 * seam, so it never clicks or audibly restarts.
 */
function makeCrowd(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * BED_SECONDS);
  const fade = Math.floor(rate * BED_CROSSFADE);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const out = buffer.getChannelData(channel);
    const raw = new Float32Array(length + fade);
    // Pink noise (Paul Kellet's economy filter).
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    for (let i = 0; i < fade; i += 1) {
      const w = i / fade;
      raw[i] = raw[i]! * w + raw[length + i]! * (1 - w);
    }
    // Swells (a few per loop) and chatter (2–6 per second), whole cycles only.
    const waves: [number, number, number][] = [];
    for (let k = 0; k < 4; k += 1) waves.push([(1 + k + Math.floor(Math.random() * 2)) / BED_SECONDS, Math.random() * 6.283, 0.12]);
    for (let k = 0; k < 7; k += 1) waves.push([Math.round((2 + Math.random() * 4) * BED_SECONDS) / BED_SECONDS, Math.random() * 6.283, 0.05]);
    const step = 64;
    let shape = 1;
    for (let i = 0; i < length; i += 1) {
      if (i % step === 0) {
        const time = i / rate;
        shape = 1;
        for (const [freq, phase, depth] of waves) shape += Math.sin(6.283185 * freq * time + phase) * depth;
      }
      out[i] = raw[i]! * shape;
    }
  }
  return buffer;
}
