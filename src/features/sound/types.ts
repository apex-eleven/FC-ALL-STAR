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
  /** The looping background track. */
  musicEnabled: boolean;
  /** 0..1. Lower than the others by default — this one plays under everything. */
  musicVolume: number;
  /**
   * Which track, by id rather than by path.
   *
   * A stored URL would break the moment a file is renamed or its extension changes,
   * and the one thing this config has to survive is the artwork being replaced.
   */
  musicTrackId: string;
}

/** A background track, as declared in `tracks.ts`. */
export interface MusicTrack {
  /** Permanent. Changing one orphans the selection of every player who had it. */
  id: string;
  title: string;
  artist?: string;
  /** Served from `public/`, e.g. `/music/time-bomb.mp3`. */
  src: string;
  /**
   * Per-track trim, 0..1, multiplied into the player's volume.
   *
   * Tracks are not mastered to the same level, so one song at the volume the player
   * chose for another is either inaudible or startling. This is where that gets
   * evened out, rather than by asking the player to re-set the slider per song.
   */
  gain?: number;
}
