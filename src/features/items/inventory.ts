import { MAX_ITEM_COUNT } from './constants';
import type { Inventory } from './types';

/**
 * Inventory arithmetic, kept apart from the item rules so that anything paying
 * rewards (the shop, missions, Star Pass) can add items without importing them.
 */

export function emptyInventory(): Inventory {
  return { counts: {}, avatars: [], shieldArmed: false };
}

export function inventoryOf(saved: Inventory | undefined): Inventory {
  return saved ?? emptyInventory();
}

export function countOf(saved: Inventory | undefined, itemId: string): number {
  return saved?.counts[itemId] ?? 0;
}

/** Adds (or, with a negative amount, removes) copies. Counts never go below zero. */
export function adjust(saved: Inventory | undefined, itemId: string, amount: number): Inventory {
  const inventory = inventoryOf(saved);
  const next = Math.max(0, Math.min(MAX_ITEM_COUNT, (inventory.counts[itemId] ?? 0) + Math.floor(amount)));
  const counts = { ...inventory.counts };
  if (next > 0) counts[itemId] = next;
  else delete counts[itemId];
  return { ...inventory, counts };
}

/** The item lines of a reward list, added to an inventory. Unchanged when there are none. */
export function withItems(
  saved: Inventory | undefined,
  rewards: readonly { kind: string; amount: number; itemId?: string }[],
): Inventory | undefined {
  let inventory = saved;
  for (const reward of rewards) {
    if (reward.kind !== 'item' || !reward.itemId || reward.amount <= 0) continue;
    inventory = adjust(inventory, reward.itemId, reward.amount);
  }
  return inventory;
}
