import type { Account } from '@/features/auth/types';
import { checkUsername } from '@/features/auth/constants';
import { addPlayers } from '@/features/club/club';
import { CLUB_CAPACITY } from '@/features/club/constants';
import type { OwnedPlayer } from '@/features/club/types';
import { appendEntry, credit } from '@/features/currencies/wallet';
import type { CurrencyKind } from '@/features/currencies/types';
import { cardToPlayer } from '@/features/draft/pool';
import type { PlayerCard } from '@/features/players/types';
import { MAX_PLUS } from '@/features/rankup/constants';
import { currentPass } from '@/features/starpass/starpass';
import { itemAvatarId } from '@/features/avatars/extraAvatars';
import { ITEM_EVENT_ID } from './constants';
import { adjust, countOf, inventoryOf } from './inventory';
import type { ItemDef, ItemEffect, ItemUseError, ItemsConfig } from './types';

/**
 * Pure item rules. Randomness is passed in as rolls in [0, 1), fixed by the caller
 * before `updateAccount` — the mutator may run twice and both runs must agree.
 */

export interface CardStamp {
  seed: string;
  at: string;
}

export interface ItemUseOutcome {
  ok: boolean;
  error: ItemUseError | null;
  account: Account;
  /** A card an item produced (pack, pick). */
  card: OwnedPlayer | null;
  /** Currency a box paid out. */
  paid: { kind: CurrencyKind; amount: number } | null;
}

function failed(account: Account, error: ItemUseError): ItemUseOutcome {
  return { ok: false, error, account, card: null, paid: null };
}

function done(account: Account, extra: Partial<ItemUseOutcome> = {}): ItemUseOutcome {
  return { ok: true, error: null, account, card: null, paid: null, ...extra };
}

/** Finds a usable item of the expected type the account holds at least `count` of. */
function ready<T extends ItemEffect['type']>(
  account: Account,
  config: ItemsConfig,
  itemId: string,
  type: T,
  count = 1,
): { def: ItemDef & { effect: Extract<ItemEffect, { type: T }> } } | { error: ItemUseError } {
  const def = config.items.find((entry) => entry.id === itemId);
  if (!def) return { error: 'unknown' };
  if (!def.enabled) return { error: 'disabled' };
  if (def.effect.type !== type) return { error: 'wrong-type' };
  if (countOf(account.inventory, itemId) < count) return { error: 'none-left' };
  return { def: def as ItemDef & { effect: Extract<ItemEffect, { type: T }> } };
}

function spend(account: Account, itemId: string, count = 1): Account {
  return { ...account, inventory: adjust(account.inventory, itemId, -count) };
}

/** Whole number in min..max from a roll. */
export function rollBetween(roll: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const r = Math.min(0.999999, Math.max(0, roll));
  return low + Math.floor(r * (high - low + 1));
}

/** Catalogue cards an OVR range allows, best first. */
export function cardsInRange(catalogue: readonly PlayerCard[], min: number, max: number): PlayerCard[] {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return catalogue
    .filter((card) => card.rating >= low && card.rating <= high)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

function owned(card: PlayerCard, plus: number, stamp: CardStamp): OwnedPlayer {
  const resolved = cardToPlayer(card);
  return {
    id: `${stamp.seed}-1`,
    playerId: card.id,
    eventId: ITEM_EVENT_ID,
    name: resolved.name,
    rating: resolved.rating,
    position: resolved.position,
    set: resolved.set,
    nation: resolved.nation,
    club: resolved.club,
    portrait: resolved.portrait,
    acquiredAt: stamp.at,
    ...(plus > 0 ? { plus } : {}),
  };
}

function giveCard(account: Account, card: OwnedPlayer): Account {
  return { ...account, club: addPlayers(account.club, [card]) };
}

export function applyAvatarItem(
  account: Account,
  config: ItemsConfig,
  itemId: string,
  validAvatar: (id: string) => boolean,
): ItemUseOutcome {
  const found = ready(account, config, itemId, 'avatar');
  if ('error' in found) return failed(account, found.error);
  // No catalogue avatar chosen: the item's own picture is the avatar.
  const avatarId = found.def.effect.avatarId || itemAvatarId(found.def.id);
  if (found.def.effect.avatarId && !validAvatar(avatarId)) return failed(account, 'unknown');
  const inventory = inventoryOf(account.inventory);
  if (inventory.avatars.includes(avatarId)) return failed(account, 'owned');
  const spent = spend(account, itemId);
  return done({
    ...spent,
    avatarId,
    inventory: { ...inventoryOf(spent.inventory), avatars: [...inventory.avatars, avatarId] },
  });
}

export function applyRenameItem(account: Account, config: ItemsConfig, itemId: string, name: string): ItemUseOutcome {
  const found = ready(account, config, itemId, 'rename');
  if ('error' in found) return failed(account, found.error);
  const clean = name.trim();
  if (checkUsername(clean) !== null) return failed(account, 'bad-name');
  return done({ ...spend(account, itemId), displayName: clean });
}

export function applyPackItem(
  account: Account,
  config: ItemsConfig,
  itemId: string,
  catalogue: readonly PlayerCard[],
  rolls: readonly [number, number],
  stamp: CardStamp,
): ItemUseOutcome {
  const found = ready(account, config, itemId, 'pack');
  if ('error' in found) return failed(account, found.error);
  const { ovrMin, ovrMax, plusMin, plusMax } = found.def.effect;
  const pool = cardsInRange(catalogue, ovrMin, ovrMax);
  if (pool.length === 0) return failed(account, 'no-card');
  if (account.club.players.length >= CLUB_CAPACITY) return failed(account, 'club-full');
  const picked = pool[rollBetween(rolls[0], 0, pool.length - 1)]!;
  const plus = Math.min(MAX_PLUS, rollBetween(rolls[1], plusMin, plusMax));
  const card = owned(picked, plus, stamp);
  return done(giveCard(spend(account, itemId), card), { card });
}

export function applyPickItem(
  account: Account,
  config: ItemsConfig,
  itemId: string,
  catalogue: readonly PlayerCard[],
  cardId: string,
  stamp: CardStamp,
): ItemUseOutcome {
  const found = ready(account, config, itemId, 'pick');
  if ('error' in found) return failed(account, found.error);
  const { ovrMin, ovrMax } = found.def.effect;
  const picked = cardsInRange(catalogue, ovrMin, ovrMax).find((card) => card.id === cardId);
  if (!picked) return failed(account, 'not-eligible');
  if (account.club.players.length >= CLUB_CAPACITY) return failed(account, 'club-full');
  const card = owned(picked, 0, stamp);
  return done(giveCard(spend(account, itemId), card), { card });
}

/** Cards a plus item can raise: any owned card below its level. */
export function plusTargets(account: Account, plus: number): OwnedPlayer[] {
  return account.club.players.filter((card) => (card.plus ?? 0) < plus);
}

export function applyPlusItem(account: Account, config: ItemsConfig, itemId: string, ownedId: string): ItemUseOutcome {
  const found = ready(account, config, itemId, 'plus');
  if ('error' in found) return failed(account, found.error);
  const plus = Math.min(MAX_PLUS, found.def.effect.plus);
  const target = account.club.players.find((card) => card.id === ownedId);
  if (!target || (target.plus ?? 0) >= plus) return failed(account, 'not-eligible');
  const spent = spend(account, itemId);
  const players = spent.club.players.map((card) => (card.id === ownedId ? { ...card, plus } : card));
  return done({ ...spent, club: { ...spent.club, players } }, { card: { ...target, plus } });
}

/** Opens `rolls.length` boxes at once and credits the total. */
export function applyBoxItem(
  account: Account,
  config: ItemsConfig,
  itemId: string,
  rolls: readonly number[],
): ItemUseOutcome {
  const count = rolls.length;
  if (count <= 0) return failed(account, 'none-left');
  const found = ready(account, config, itemId, 'box', count);
  if ('error' in found) return failed(account, found.error);
  const { currency, min, max } = found.def.effect;
  const total = rolls.reduce((sum, roll) => sum + rollBetween(roll, min, max), 0);
  const spent = spend(account, itemId, count);
  if (total <= 0) return done(spent, { paid: { kind: currency, amount: 0 } });
  const result = credit(spent.wallet, currency, total, { reason: 'item' });
  if (!result.ok || !result.entry) return failed(account, 'at-cap');
  return done(
    { ...spent, wallet: result.wallet, ledger: appendEntry(spent.ledger, result.entry) },
    { paid: { kind: currency, amount: total } },
  );
}

export function applyPremiumItem(account: Account, config: ItemsConfig, itemId: string, season: number): ItemUseOutcome {
  const found = ready(account, config, itemId, 'premium');
  if ('error' in found) return failed(account, found.error);
  const pass = currentPass(account.starpass, season);
  if (pass.premium) return failed(account, 'owned');
  return done({ ...spend(account, itemId), starpass: { ...pass, premium: true } });
}

/** The shield item a ranked match would spend: the first enabled shield the account holds. */
export function heldShield(account: Account, config: ItemsConfig): ItemDef | null {
  return (
    config.items.find(
      (def) => def.enabled && def.effect.type === 'shield' && countOf(account.inventory, def.id) > 0,
    ) ?? null
  );
}

/** The avatar an avatar item gives, as an id. */
export function avatarOfItem(def: ItemDef): string | null {
  if (def.effect.type !== 'avatar') return null;
  return def.effect.avatarId || itemAvatarId(def.id);
}

export function shieldCount(account: Account, config: ItemsConfig): number {
  return config.items
    .filter((def) => def.enabled && def.effect.type === 'shield')
    .reduce((sum, def) => sum + countOf(account.inventory, def.id), 0);
}

export function setShieldArmed(account: Account, armed: boolean): Account {
  return { ...account, inventory: { ...inventoryOf(account.inventory), shieldArmed: armed } };
}

/** Admin: hands over (or, negative, takes back) copies of an item. */
export function grantItem(account: Account, itemId: string, amount: number): Account {
  return { ...account, inventory: adjust(account.inventory, itemId, amount) };
}
