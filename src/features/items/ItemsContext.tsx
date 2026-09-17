import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Account } from '@/features/auth/types';
import { useAuth } from '@/features/auth/AuthContext';
import { ASSETS } from '@/assets/assetMap';
import { useAvatars } from '@/features/avatars/AvatarContext';
import { ITEM_AVATAR_LEVEL, itemAvatarId, setExtraAvatars } from '@/features/avatars/extraAvatars';
import type { Avatar } from '@/features/avatars/types';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { usePlayers } from '@/features/players/PlayerContext';
import { useStarPass } from '@/features/starpass/StarPassContext';
import { defaultItems } from './constants';
import { inventoryOf } from './inventory';
import {
  applyAvatarItem,
  applyBoxItem,
  applyPackItem,
  applyPickItem,
  applyPlusItem,
  applyPremiumItem,
  applyRenameItem,
  grantItem,
  setShieldArmed,
  shieldCount,
  type CardStamp,
  type ItemUseOutcome,
} from './items';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './itemsConfigStore';
import type { Inventory, ItemDef, ItemsConfig } from './types';

export type ItemUseResult = Omit<ItemUseOutcome, 'account'>;

interface ItemsValue {
  config: ItemsConfig;
  replace(next: ItemsConfig): SaveResult;
  reset(): SaveResult;
  byId(itemId: string): ItemDef | undefined;
  /**
   * Every avatar: the catalogue, then the pictures avatar items add. Item avatars
   * can only be unlocked by using the item (see `inventory.avatars`).
   */
  avatars: Avatar[];
  /** The signed-in account's bag. */
  inventory: Inventory;
  applyAvatar(itemId: string): ItemUseResult;
  rename(itemId: string, name: string): ItemUseResult;
  openPack(itemId: string): ItemUseResult;
  pickCard(itemId: string, cardId: string): ItemUseResult;
  plusCard(itemId: string, ownedCardId: string): ItemUseResult;
  openBoxes(itemId: string, count: number): ItemUseResult;
  openPremium(itemId: string): ItemUseResult;
  /** Star shields held, over every shield item. */
  shields: number;
  /** Switches the manager-mode star shield on or off. */
  armShield(armed: boolean): void;
  /** Admin: give (or, negative, take) copies of an item to another account. */
  grant(username: string, itemId: string, amount: number): Promise<boolean>;
}

const ItemsContext = createContext<ItemsValue | null>(null);

function stampNow(): CardStamp {
  const seed =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { seed, at: new Date().toISOString() };
}

export function ItemsProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount, updateOther } = useAuth();
  const { players } = usePlayers();
  const { avatars } = useAvatars();
  const { season } = useStarPass();
  const [config, setConfig] = useState<ItemsConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: ItemsConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultItems()), [replace]);

  const byId = useCallback((itemId: string) => config.items.find((item) => item.id === itemId), [config]);

  const itemAvatars = useMemo<Avatar[]>(
    () =>
      config.items.flatMap((item) =>
        item.effect.type === 'avatar' && !item.effect.avatarId
          ? [
              {
                id: itemAvatarId(item.id),
                name: item.effect.avatarName || item.name,
                source: item.image || ASSETS.items.avatar,
                defaultRequiredLevel: ITEM_AVATAR_LEVEL,
                requiredLevel: ITEM_AVATAR_LEVEL,
                overridden: false,
              },
            ]
          : [],
      ),
    [config],
  );
  // Published before children render, so plain avatar lookups see the same list.
  setExtraAvatars(itemAvatars);
  const allAvatars = useMemo(() => [...avatars, ...itemAvatars], [avatars, itemAvatars]);

  /**
   * Checked on the account on screen, then applied to the latest save with the same
   * rolls and card ids — the mutator may run twice and both runs must agree.
   */
  const settle = useCallback(
    (run: (target: Account) => ItemUseOutcome): ItemUseResult => {
      if (!account) return { ok: false, error: 'closed', card: null, paid: null };
      const preview = run(account);
      if (!preview.ok) return { ok: false, error: preview.error, card: null, paid: null };
      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });
      const { account: _account, ...result } = preview;
      return result;
    },
    [account, updateAccount],
  );

  const validAvatar = useCallback((id: string) => allAvatars.some((avatar) => avatar.id === id), [allAvatars]);

  const applyAvatar = useCallback(
    (itemId: string) => settle((target) => applyAvatarItem(target, config, itemId, validAvatar)),
    [settle, config, validAvatar],
  );

  const rename = useCallback(
    (itemId: string, name: string) => settle((target) => applyRenameItem(target, config, itemId, name)),
    [settle, config],
  );

  const openPack = useCallback(
    (itemId: string) => {
      const rolls: [number, number] = [Math.random(), Math.random()];
      const stamp = stampNow();
      return settle((target) => applyPackItem(target, config, itemId, players, rolls, stamp));
    },
    [settle, config, players],
  );

  const pickCard = useCallback(
    (itemId: string, cardId: string) => {
      const stamp = stampNow();
      return settle((target) => applyPickItem(target, config, itemId, players, cardId, stamp));
    },
    [settle, config, players],
  );

  const plusCard = useCallback(
    (itemId: string, ownedCardId: string) => settle((target) => applyPlusItem(target, config, itemId, ownedCardId)),
    [settle, config],
  );

  const openBoxes = useCallback(
    (itemId: string, count: number) => {
      const rolls = Array.from({ length: Math.max(0, Math.floor(count)) }, () => Math.random());
      return settle((target) => applyBoxItem(target, config, itemId, rolls));
    },
    [settle, config],
  );

  const openPremium = useCallback(
    (itemId: string) => settle((target) => applyPremiumItem(target, config, itemId, season)),
    [settle, config, season],
  );

  const armShield = useCallback(
    (armed: boolean) => updateAccount((current) => setShieldArmed(current, armed)),
    [updateAccount],
  );

  const grant = useCallback(
    (username: string, itemId: string, amount: number) =>
      updateOther(username, (current) => grantItem(current, itemId, amount)),
    [updateOther],
  );

  const inventory = useMemo(() => inventoryOf(account?.inventory), [account?.inventory]);
  const shields = useMemo(() => (account ? shieldCount(account, config) : 0), [account, config]);

  const value = useMemo<ItemsValue>(
    () => ({
      config,
      replace,
      reset,
      byId,
      avatars: allAvatars,
      inventory,
      applyAvatar,
      rename,
      openPack,
      pickCard,
      plusCard,
      openBoxes,
      openPremium,
      shields,
      armShield,
      grant,
    }),
    [
      config,
      replace,
      reset,
      byId,
      allAvatars,
      inventory,
      applyAvatar,
      rename,
      openPack,
      pickCard,
      plusCard,
      openBoxes,
      openPremium,
      shields,
      armShield,
      grant,
    ],
  );

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItems(): ItemsValue {
  const value = useContext(ItemsContext);
  if (!value) throw new Error('useItems must be used inside an ItemsProvider');
  return value;
}
