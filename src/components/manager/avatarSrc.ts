import { avatarSource } from '@/features/avatars/extraAvatars';

/** Avatar art by id — catalogue or item avatar — falling back to the first in the catalogue. */
export function avatarSrc(avatarId: string): string {
  return avatarSource(avatarId);
}
