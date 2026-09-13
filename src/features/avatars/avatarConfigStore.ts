import { AVATAR_CONFIG_KEY } from './constants';
import { clampRequiredLevel } from './unlocks';
import type { AvatarLevelOverrides } from './types';

/**
 * Admin-set level requirements.
 *
 * This is game configuration, not player data, so it is stored separately from
 * accounts: every account in the browser sees the same requirements. Reads are
 * synchronous because the payload is a handful of numbers; if this ever moves to a
 * server, swap the two functions below for async ones and give AvatarProvider a
 * loading state.
 */
export function loadOverrides(): AvatarLevelOverrides {
  try {
    const raw = window.localStorage.getItem(AVATAR_CONFIG_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const overrides: AvatarLevelOverrides = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        overrides[id] = clampRequiredLevel(value);
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

export function saveOverrides(overrides: AvatarLevelOverrides): void {
  try {
    window.localStorage.setItem(AVATAR_CONFIG_KEY, JSON.stringify(overrides));
  } catch {
    // Storage can be blocked. The session keeps working from memory.
  }
}
