import { useCallback } from 'react';
import { currencies } from '@/data/mock/currencies';
import { formatCurrency } from '@/features/currencies/constants';
import { cardToPlayer } from '@/features/draft/pool';
import { useItems } from '@/features/items/ItemsContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { itemArt } from '@/components/items/itemArt';
import { ratingWithPlus } from '@/features/rankup/plus';
import type { ShopReward } from '@/features/shop/types';

export interface RewardView {
  /** Currency icon, or the card's portrait. */
  icon: string;
  label: string;
  /** "5,000" for a currency, "x2" or "+5 x2" for card copies. */
  count: string;
  /** "เจม x2,000" / "Somchai +5 (OVR 93) x1" — for toasts and lists. */
  text: string;
  isCard: boolean;
}

/**
 * How a shop reward is shown. Card rewards are looked up in the live catalogue; one
 * the admin has since deleted still renders, labelled as missing, so the item does not
 * silently look like it gives nothing.
 */
export default function useRewardView(): (reward: ShopReward) => RewardView {
  const { byId } = usePlayers();
  const { byId: itemById } = useItems();

  return useCallback(
    (reward: ShopReward): RewardView => {
      if (reward.kind === 'card') {
        const card = byId(reward.cardId);
        const plus = reward.plus > 0 ? ` +${reward.plus}` : '';
        const label = card
          ? `${card.name}${plus} (OVR ${ratingWithPlus({ rating: card.rating, plus: reward.plus })})`
          : 'การ์ดที่ถูกลบแล้ว';
        return {
          icon: card ? cardToPlayer(card).portrait : currencies.ticket.icon,
          label,
          count: `${plus.trim()} x${formatCurrency(reward.amount)}`.trim(),
          text: `${label} x${formatCurrency(reward.amount)}`,
          isCard: true,
        };
      }
      if (reward.kind === 'item') {
        const def = itemById(reward.itemId);
        const label = def ? def.name : 'ไอเท็มที่ถูกลบแล้ว';
        return {
          icon: itemArt(def),
          label,
          count: formatCurrency(reward.amount),
          text: `${label} x${formatCurrency(reward.amount)}`,
          isCard: false,
        };
      }
      const currency = currencies[reward.kind];
      return {
        icon: currency.icon,
        label: currency.label,
        count: formatCurrency(reward.amount),
        text: `${currency.label} x${formatCurrency(reward.amount)}`,
        isCard: false,
      };
    },
    [byId, itemById],
  );
}
