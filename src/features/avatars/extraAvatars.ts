import { avatarCatalogue } from '@/data/mock/avatars';
import type { Avatar } from './types';

/**
 * Avatars that come from bag items rather than the shipped catalogue.
 *
 * An avatar item without a catalogue avatar adds its own picture as a new avatar,
 * stored on the account as `item:<itemId>`. The items feature publishes the current
 * list here, so plain lookups (other players' faces on leaderboards) resolve them
 * too without every screen reaching into the item settings.
 */

export const ITEM_AVATAR_PREFIX = 'item:';

export function itemAvatarId(itemId: string): string {
  return `${ITEM_AVATAR_PREFIX}${itemId}`;
}

export function isItemAvatarId(id: string): boolean {
  return id.startsWith(ITEM_AVATAR_PREFIX) && id.length > ITEM_AVATAR_PREFIX.length;
}

/** Never unlocked by level — only by using the item. */
export const ITEM_AVATAR_LEVEL = 9999;

let extra: readonly Avatar[] = [];

export function setExtraAvatars(list: readonly Avatar[]): void {
  extra = list;
}

export function extraAvatars(): readonly Avatar[] {
  return extra;
}

/** Picture for any avatar id: catalogue, then item avatars, then the default. */
export function avatarSource(avatarId: string): string {
  const found =
    avatarCatalogue.find((entry) => entry.id === avatarId) ?? extra.find((entry) => entry.id === avatarId);
  return (found ?? avatarCatalogue[0])?.source ?? '';
}
