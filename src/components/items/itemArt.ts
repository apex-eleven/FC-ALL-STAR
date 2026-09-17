import { ASSETS } from '@/assets/assetMap';
import type { ItemDef } from '@/features/items/types';

/** The item's uploaded art, else the default for its type. */
export function itemArt(def: ItemDef | undefined): string {
  if (!def) return ASSETS.items.pack;
  if (def.image) return def.image;
  const effect = def.effect;
  switch (effect.type) {
    case 'avatar':
      return ASSETS.items.avatar;
    case 'shield':
      return ASSETS.items.shield;
    case 'pack':
      return ASSETS.items.pack;
    case 'rename':
      return ASSETS.items.rename;
    case 'plus':
      return effect.plus >= 8
        ? ASSETS.items.plus8
        : effect.plus === 7
          ? ASSETS.items.plus7
          : effect.plus === 6
            ? ASSETS.items.plus6
            : ASSETS.items.plus5;
    case 'box':
      return effect.currency === 'ticket'
        ? ASSETS.items.boxTicket
        : effect.currency === 'exchange'
          ? ASSETS.items.boxExchange
          : ASSETS.items.boxFcpoint;
    case 'pick':
      return ASSETS.items.pick;
    case 'premium':
      return ASSETS.items.premium;
    default:
      return ASSETS.items.pack;
  }
}
