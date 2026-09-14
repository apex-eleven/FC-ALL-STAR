import { DEFAULT_SOUND, SOUND_CONFIG_KEY } from './constants';
import { isKnownTrack } from './tracks';
import type { SoundConfig } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/** Repairs a config read from storage. A hand-edited volume of 40 would be deafening. */
export function normalizeConfig(value: unknown): SoundConfig {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SOUND };
  const source = value as Record<string, unknown>;

  return {
    uiEnabled: typeof source.uiEnabled === 'boolean' ? source.uiEnabled : DEFAULT_SOUND.uiEnabled,
    uiVolume: clamp(source.uiVolume, 0, 1, DEFAULT_SOUND.uiVolume),
    videoEnabled:
      typeof source.videoEnabled === 'boolean' ? source.videoEnabled : DEFAULT_SOUND.videoEnabled,
    videoVolume: clamp(source.videoVolume, 0, 1, DEFAULT_SOUND.videoVolume),
    musicEnabled:
      typeof source.musicEnabled === 'boolean' ? source.musicEnabled : DEFAULT_SOUND.musicEnabled,
    musicVolume: clamp(source.musicVolume, 0, 1, DEFAULT_SOUND.musicVolume),
    // A config saved when a since-removed song was selected would otherwise point at
    // a file that 404s, and the player would get silence with the switch reading on.
    musicTrackId: isKnownTrack(source.musicTrackId)
      ? source.musicTrackId
      : DEFAULT_SOUND.musicTrackId,
  };
}

export function loadConfig(): SoundConfig {
  try {
    const raw = window.localStorage.getItem(SOUND_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : { ...DEFAULT_SOUND };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function saveConfig(config: SoundConfig): SaveResult {
  try {
    window.localStorage.setItem(SOUND_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
