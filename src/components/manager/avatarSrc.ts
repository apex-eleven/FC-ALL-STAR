import { avatarCatalogue } from '@/data/mock/avatars';

/** Avatar art by id, falling back to the first in the catalogue. */
export function avatarSrc(avatarId: string): string {
  const found = avatarCatalogue.find((entry) => entry.id === avatarId);
  return (found ?? avatarCatalogue[0])?.source ?? '';
}
