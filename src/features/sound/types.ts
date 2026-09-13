/**
 * Every sound the app can make.
 *
 * The first four are UI ticks — one per gesture. `shake` and `tear` belong to the
 * pack opening, which is the only place that asks for a sound by hand rather than
 * getting one from the click layer.
 */
export type SoundId = 'click' | 'back' | 'toggle' | 'error' | 'shake' | 'tear';

export interface SoundConfig {
  /** Clicks, taps, and keyboard activation of buttons. */
  uiEnabled: boolean;
  /** 0..1, applied to the synthesiser's master gain. */
  uiVolume: number;
  /** The walkout clips' own audio tracks. */
  videoEnabled: boolean;
  /** 0..1, written straight onto the <video> elements. */
  videoVolume: number;
}
