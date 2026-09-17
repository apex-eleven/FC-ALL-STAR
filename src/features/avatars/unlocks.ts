import { DEFAULT_AVATAR_ID, MAX_REQUIRED_LEVEL, MIN_REQUIRED_LEVEL } from './constants';
import { isItemAvatarId } from './extraAvatars';
import type { Avatar, AvatarCatalogue, AvatarLevelOverrides } from './types';

export function clampRequiredLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_REQUIRED_LEVEL;
  return Math.max(MIN_REQUIRED_LEVEL, Math.min(MAX_REQUIRED_LEVEL, Math.floor(level)));
}

/**
 * Merges the shipped catalogue with the admin's level overrides.
 *
 * Overrides are keyed by avatar id rather than index, so reordering or removing an
 * avatar cannot silently reassign somebody else's requirement. An override for an id
 * that no longer exists is ignored rather than treated as an error.
 */
export function resolveAvatars(
  catalogue: AvatarCatalogue,
  overrides: AvatarLevelOverrides,
): Avatar[] {
  return catalogue.map((definition) => {
    const override = overrides[definition.id];
    const requiredLevel =
      typeof override === 'number' ? clampRequiredLevel(override) : definition.defaultRequiredLevel;

    return {
      ...definition,
      requiredLevel,
      overridden: requiredLevel !== definition.defaultRequiredLevel,
    };
  });
}

/** Open by level, or by an avatar item the account has used (`extra`). */
export function isUnlocked(avatar: Avatar, level: number, extra: readonly string[] = []): boolean {
  return level >= avatar.requiredLevel || extra.includes(avatar.id);
}

export function findAvatar(avatars: readonly Avatar[], id: string): Avatar | undefined {
  return avatars.find((avatar) => avatar.id === id);
}

/**
 * Repairs an avatar id read from storage. An id that was removed from the catalogue,
 * or a value left over from when accounts stored a URL instead of an id, falls back
 * to the default rather than rendering a broken image.
 */
export function normalizeAvatarId(value: unknown, catalogue: AvatarCatalogue): string {
  if (typeof value === 'string' && catalogue.some((avatar) => avatar.id === value)) return value;
  // An item avatar is checked when it is shown: the item list may not be loaded yet.
  if (typeof value === 'string' && isItemAvatarId(value) && value.length <= 80) return value;
  return DEFAULT_AVATAR_ID;
}

/**
 * The avatar to show for an account. Falls back to the default if the selected one
 * has since been locked behind a higher level by the admin — the choice is kept in
 * storage, so lowering the requirement again restores it.
 */
export function resolveDisplayAvatar(
  avatars: readonly Avatar[],
  selectedId: string,
  level: number,
  extra: readonly string[] = [],
): Avatar | undefined {
  const selected = findAvatar(avatars, selectedId);
  if (selected && isUnlocked(selected, level, extra)) return selected;
  return findAvatar(avatars, DEFAULT_AVATAR_ID) ?? avatars[0];
}

export function unlockedCount(avatars: readonly Avatar[], level: number, extra: readonly string[] = []): number {
  return avatars.filter((avatar) => isUnlocked(avatar, level, extra)).length;
}
