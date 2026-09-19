import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { appendEntry, debit } from '@/features/currencies/wallet';
import type { MatchOutcome } from '@/features/sim/types';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import { MAX_TOTAL_XP, STARPASS_EVENT_ID } from './constants';
import type {
  StarPassCellStatus,
  StarPassConfig,
  StarPassError,
  StarPassLevel,
  StarPassProgress,
  StarPassReward,
  StarPassTrack,
} from './types';

/**
 * Pure Star Pass rules. The season number comes from manager mode and is passed in;
 * nothing here touches React or storage.
 */

export function emptyPass(season: number): StarPassProgress {
  return { season, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
}

/** Saved progress for this season, or a fresh pass if it belongs to another. */
export function currentPass(saved: StarPassProgress | undefined, season: number): StarPassProgress {
  return saved && saved.season === season ? saved : emptyPass(season);
}

/** Levels reached: level n (1-based) is reached at n × xpPerLevel XP. */
export function levelOf(xp: number, config: Pick<StarPassConfig, 'xpPerLevel' | 'levels'>): number {
  return Math.min(config.levels.length, Math.floor(xp / Math.max(1, config.xpPerLevel)));
}

/** XP into the level being worked on, and what that level needs. */
export function levelProgress(
  xp: number,
  config: Pick<StarPassConfig, 'xpPerLevel' | 'levels'>,
): { into: number; need: number; maxed: boolean } {
  const need = Math.max(1, config.xpPerLevel);
  const maxed = levelOf(xp, config) >= config.levels.length;
  return { into: maxed ? need : xp % need, need, maxed };
}

export function missionXp(points: number, config: Pick<StarPassConfig, 'missionRate'>): number {
  return Math.floor((Math.max(0, points) * config.missionRate) / 100);
}

export function matchXp(outcome: MatchOutcome, config: StarPassConfig): number {
  if (outcome === 'win') return config.matchWin;
  if (outcome === 'draw') return config.matchDraw;
  return config.matchLoss;
}

/** Adds XP for this season. Returns the same account when there is nothing to add. */
export function addXp(account: Account, amount: number, season: number, config: StarPassConfig): Account {
  const step = Math.floor(amount);
  if (!config.enabled || !Number.isFinite(step) || step <= 0) return account;
  const pass = currentPass(account.starpass, season);
  return { ...account, starpass: { ...pass, xp: Math.min(MAX_TOTAL_XP, pass.xp + step) } };
}

function claimedOf(pass: StarPassProgress, track: StarPassTrack): string[] {
  return track === 'free' ? pass.claimedFree : pass.claimedPremium;
}

export function cellStatus(
  pass: StarPassProgress,
  config: StarPassConfig,
  index: number,
  track: StarPassTrack,
): StarPassCellStatus {
  const level = config.levels[index];
  if (!level) return 'locked';
  if (claimedOf(pass, track).includes(level.id)) return 'claimed';
  if (index >= levelOf(pass.xp, config)) return 'locked';
  if (track === 'premium' && !pass.premium) return 'locked';
  return 'ready';
}

/** Every reward waiting to be claimed right now, level order, free before premium. */
export function pendingCells(
  pass: StarPassProgress,
  config: StarPassConfig,
): { level: StarPassLevel; track: StarPassTrack }[] {
  const cells: { level: StarPassLevel; track: StarPassTrack }[] = [];
  config.levels.forEach((level, index) => {
    for (const track of ['free', 'premium'] as const) {
      const rewards = level[track];
      if (rewards.length > 0 && cellStatus(pass, config, index, track) === 'ready') cells.push({ level, track });
    }
  });
  return cells;
}

export interface StarPassOutcome {
  ok: boolean;
  error: StarPassError | null;
  account: Account;
  rewards: StarPassReward[];
  cards: OwnedPlayer[];
}

function failed(account: Account, error: StarPassError): StarPassOutcome {
  return { ok: false, error, account, rewards: [], cards: [] };
}

/** Pays a set of cells in one save: every card checked before anything is credited. */
function payCells(
  account: Account,
  pass: StarPassProgress,
  cells: readonly { level: StarPassLevel; track: StarPassTrack }[],
  lookup: CardLookup,
  stamp: ShopStamp,
): StarPassOutcome {
  const rewards = cells.flatMap((cell) => cell.level[cell.track]);
  const paid = deliverRewards(account, rewards, lookup, stamp, 'starpass', STARPASS_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error);

  const free = cells.filter((cell) => cell.track === 'free').map((cell) => cell.level.id);
  const premium = cells.filter((cell) => cell.track === 'premium').map((cell) => cell.level.id);
  return {
    ok: true,
    error: null,
    rewards,
    cards: paid.cards,
    account: {
      ...paid.account,
      starpass: {
        ...pass,
        claimedFree: [...pass.claimedFree, ...free],
        claimedPremium: [...pass.claimedPremium, ...premium],
      },
    },
  };
}

export function claimLevel(
  account: Account,
  levelId: string,
  track: StarPassTrack,
  season: number,
  config: StarPassConfig,
  lookup: CardLookup,
  stamp: ShopStamp,
): StarPassOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const index = config.levels.findIndex((level) => level.id === levelId);
  const level = config.levels[index];
  if (!level) return failed(account, 'unknown');

  const pass = currentPass(account.starpass, season);
  const status = cellStatus(pass, config, index, track);
  if (status === 'claimed') return failed(account, 'claimed');
  if (status === 'locked') {
    return failed(account, index < levelOf(pass.xp, config) && track === 'premium' ? 'no-premium' : 'locked');
  }
  return payCells(account, pass, [{ level, track }], lookup, stamp);
}

/** Claims every reward currently waiting, both tracks. */
export function claimAll(
  account: Account,
  season: number,
  config: StarPassConfig,
  lookup: CardLookup,
  stamp: ShopStamp,
): StarPassOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const pass = currentPass(account.starpass, season);
  const cells = pendingCells(pass, config);
  if (cells.length === 0) return failed(account, 'nothing');
  return payCells(account, pass, cells, lookup, stamp);
}

export type PremiumPayKind = 'gem' | 'fcpoint';

export function premiumPrice(config: StarPassConfig, kind: PremiumPayKind): number | null {
  return kind === 'gem' ? config.priceGem : config.priceFcpoint;
}

/** Opens the premium track for this season, paid in an in-game currency. */
export function buyPremium(
  account: Account,
  kind: PremiumPayKind,
  season: number,
  config: StarPassConfig,
): StarPassOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const pass = currentPass(account.starpass, season);
  if (pass.premium) return failed(account, 'owned');
  const price = premiumPrice(config, kind);
  if (price === null) return failed(account, 'not-sold');

  const paid = debit(account.wallet, kind, price, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) return failed(account, 'insufficient-funds');
  return {
    ok: true,
    error: null,
    rewards: [],
    cards: [],
    account: {
      ...account,
      wallet: paid.wallet,
      ledger: appendEntry(account.ledger, paid.entry),
      starpass: { ...pass, premium: true },
    },
  };
}

/** FC points to buy the next level now: the XP still missing × `skipPrice`. null = not on offer. */
export function skipCost(pass: StarPassProgress, config: StarPassConfig): number | null {
  if (!config.enabled || config.skipPrice <= 0) return null;
  const step = levelProgress(pass.xp, config);
  if (step.maxed) return null;
  return (step.need - step.into) * config.skipPrice;
}

/** Buys the next level with FC points: XP is topped up to exactly that level. */
export function buyLevel(account: Account, season: number, config: StarPassConfig): StarPassOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const pass = currentPass(account.starpass, season);
  if (levelOf(pass.xp, config) >= config.levels.length) return failed(account, 'maxed');
  const cost = skipCost(pass, config);
  if (cost === null) return failed(account, 'not-sold');

  const paid = debit(account.wallet, 'fcpoint', cost, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) return failed(account, 'insufficient-funds');
  const next = (levelOf(pass.xp, config) + 1) * Math.max(1, config.xpPerLevel);
  return {
    ok: true,
    error: null,
    rewards: [],
    cards: [],
    account: {
      ...account,
      wallet: paid.wallet,
      ledger: appendEntry(account.ledger, paid.entry),
      starpass: { ...pass, xp: Math.min(MAX_TOTAL_XP, next) },
    },
  };
}

/** Admin: opens (or closes) the premium track for this season without charging. */
export function setPremium(account: Account, premium: boolean, season: number): Account {
  const pass = currentPass(account.starpass, season);
  return { ...account, starpass: { ...pass, premium } };
}
