import type { Account } from '@/features/auth/types';
import { displayNameOf } from '@/features/auth/constants';
import { availableBadges, statusOf as badgeStatus, type MemberLookup } from '@/features/badges/badges';
import type { BadgeConfig } from '@/features/badges/types';
import { addPlayers } from '@/features/club/club';
import { syncOwned } from '@/features/club/sync';
import type { OwnedPlayer } from '@/features/club/types';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { appendEntry, canAfford, credit, debit } from '@/features/currencies/wallet';
import type { CurrencyKind } from '@/features/currencies/types';
import { cupId } from '@/features/cup/constants';
import { currentCup, entriesLeft, windowOpen } from '@/features/cup/cup';
import { claimCupReward, enterCup, playCupRound } from '@/features/cup/play';
import { CUP_KINDS, type CupConfig, type CupKind } from '@/features/cup/types';
import { canClaim as canClaimLogin, claimToday, currentProgress as loginProgress, todayKey } from '@/features/dailylogin/dailylogin';
import type { DailyLoginConfig } from '@/features/dailylogin/types';
import { normalizeCounters, pull } from '@/features/draft/pull';
import type { DraftEvent, DraftPack } from '@/features/draft/types';
import { managerId } from '@/features/manager/constants';
import { pickOpponent, playManagerMatch } from '@/features/manager/manager';
import type { ManagerConfig } from '@/features/manager/types';
import {
  chestStatus,
  chestsOf,
  claimChest,
  claimMission,
  currentProgress as missionProgress,
  statusOf as missionStatus,
} from '@/features/missions/missions';
import { MISSION_PERIODS, type MissionConfig, type MissionMetric } from '@/features/missions/types';
import { MAX_PLUS } from '@/features/rankup/constants';
import { isOneOfOneLevel, oneOfOneRecordFor, type OneOfOneRecord } from '@/features/rankup/oneOfOne';
import { clampPlus, ratingWithPlus } from '@/features/rankup/plus';
import { attempt, checkReady, isMaterial, nextRule } from '@/features/rankup/rankup';
import type { RankUpConfig } from '@/features/rankup/types';
import { shopStamp, type CardLookup } from '@/features/shop/shop';
import type { MatchOutcome } from '@/features/sim/types';
import { BADGE_SLOTS, FORMATION_IDS } from '@/features/squad/constants';
import { autoBuild, indexOwned, isInSquad, removeFromSquad } from '@/features/squad/squad';
import type { FormationId, OwnedIndex, Squad } from '@/features/squad/types';
import { claimAll, pendingCells, currentPass } from '@/features/starpass/starpass';
import type { StarPassConfig } from '@/features/starpass/types';
import { PERSONAS, type PersonaSpec } from './constants';
import { currentDay } from './schedule';
import type { BotAction, BotDayCounters, BotProfile, BotSettings, BotStats } from './types';

/**
 * The bot's brain: one step of play, decided and applied to an account.
 *
 * Every move goes through the same pure rules the screens call — `pull` and the
 * pity counters, `attempt` for rank-ups, `playManagerMatch`, `enterCup` /
 * `playCupRound`, `claimMission` — and writes the same fields in the same shape. A bot
 * cannot do anything a player's own buttons could not, and pays for everything the
 * same way. Nothing here touches React, storage or the network: the runner hands in
 * the world and writes back what comes out.
 */

export interface BotWorld {
  now: Date;
  rng: () => number;
  profile: BotProfile;
  settings: BotSettings;
  /** Draft events a player can buy from right now (`useDraft().liveEvents`). */
  draftEvents: readonly DraftEvent[];
  rankup: RankUpConfig;
  manager: ManagerConfig;
  cup: CupConfig;
  missions: MissionConfig;
  login: DailyLoginConfig;
  starpass: StarPassConfig;
  /** Manager season the pass runs on. */
  season: number;
  badges: BadgeConfig;
  memberOf: MemberLookup;
  byId: CardLookup;
  ratingOf(squad: Squad, owned: OwnedIndex): number;
  /** Published elevens — the opponents real players are drawn against too. */
  entries: readonly LeaderboardEntry[];
  /** Whether a chat line would respect the global gap between bot lines. */
  chatOpen: boolean;
  note(account: Account, metric: MissionMetric, amount: number): Account;
  awardMatch(account: Account, outcome: MatchOutcome): Account;
  awardMission(account: Account, points: number): Account;
}

export type BotEffect =
  | { kind: 'chat'; text: string }
  /** The manager rank moved: publish it to the ladder. */
  | { kind: 'rank' }
  | { kind: 'oneOfOne'; record: OneOfOneRecord };

export interface BotStepResult {
  account: Account;
  action: BotAction;
  /** One line for the admin log. */
  log: string;
  day: BotDayCounters;
  stats: BotStats;
  formation: FormationId;
  effects: BotEffect[];
  /** Seconds the action "took" — a match is not played in no time. */
  busySeconds: number;
}

type Choice = Exclude<BotAction, 'login' | 'claim' | 'squad' | 'idle'>;

function pickOne<T>(list: readonly T[], rng: () => number): T | undefined {
  return list.length === 0 ? undefined : list[Math.floor(rng() * list.length) % list.length];
}

function weighted<T>(items: readonly { item: T; weight: number }[], rng: () => number): T | undefined {
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return undefined;
  let roll = rng() * total;
  for (const entry of items) {
    roll -= Math.max(0, entry.weight);
    if (roll < 0) return entry.item;
  }
  return items[items.length - 1]?.item;
}

function newCardId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/** Synced cards and their index — what every screen decides on. */
function cardsOf(account: Account, world: BotWorld): { players: OwnedPlayer[]; owned: OwnedIndex } {
  const players = syncOwned(account.club.players, world.byId);
  return { players, owned: indexOwned(players) };
}

export function teamRatingOf(account: Account, world: Pick<BotWorld, 'byId' | 'ratingOf'>): number {
  const players = syncOwned(account.club.players, world.byId);
  return world.ratingOf(account.squad, indexOwned(players));
}

// ---------------------------------------------------------------------------
// login: the first thing each day — income, the login calendar, the mission count
// ---------------------------------------------------------------------------

function payIncome(account: Account, world: BotWorld): { account: Account; lines: string[] } {
  const income = world.settings.income[world.profile.persona] ?? {};
  let wallet = account.wallet;
  let ledger = account.ledger;
  const lines: string[] = [];
  for (const [kind, amount] of Object.entries(income) as [CurrencyKind, number][]) {
    if (!amount || amount <= 0) continue;
    const result = credit(wallet, kind, Math.floor(amount), { reason: 'reward' });
    if (!result.entry) continue;
    wallet = result.wallet;
    ledger = appendEntry(ledger, result.entry);
    lines.push(`${kind} +${result.entry.delta}`);
  }
  return { account: { ...account, wallet, ledger }, lines };
}

function doLogin(account: Account, world: BotWorld, day: BotDayCounters): { account: Account; log: string } {
  const { now } = world;
  let next = payIncome(account, world).account;
  next = { ...next, lastSignInAt: now.toISOString() };
  next = world.note(next, 'login', 1);

  let calendar = '';
  const today = todayKey(now, world.login);
  const progress = loginProgress(next.login, world.login, today);
  if (canClaimLogin(world.login, progress, today)) {
    const claimed = claimToday(next, world.login, now, world.byId, shopStamp());
    if (claimed.ok) {
      next = claimed.account;
      calendar = ` · รับรางวัลเข้าเกมวันที่ ${claimed.day}`;
    }
  }
  day.paid = true;
  return { account: next, log: `เข้าเกม${calendar}` };
}

// ---------------------------------------------------------------------------
// claim: missions, mission chests, Star Pass
// ---------------------------------------------------------------------------

function claimables(account: Account, world: BotWorld): boolean {
  const { missions, now } = world;
  if (missions.enabled) {
    const progress = missionProgress(account.missions, now, missions);
    if (missions.missions.some((mission) => mission.enabled && missionStatus(progress, mission) === 'ready')) {
      return true;
    }
    for (const period of MISSION_PERIODS) {
      if (chestsOf(missions, period).some((chest) => chestStatus(progress, period, chest) === 'ready')) return true;
    }
  }
  if (world.starpass.enabled) {
    const pass = currentPass(account.starpass, world.season);
    if (pendingCells(pass, world.starpass).length > 0) return true;
  }
  return false;
}

function doClaim(account: Account, world: BotWorld): { account: Account; log: string; count: number } {
  const { missions, now } = world;
  let next = account;
  let count = 0;

  if (missions.enabled) {
    for (const mission of missions.missions) {
      if (!mission.enabled) continue;
      if (missionStatus(missionProgress(next.missions, now, missions), mission) !== 'ready') continue;
      const outcome = claimMission(next, mission.id, now, missions, world.byId, shopStamp());
      if (!outcome.ok) continue;
      next = world.awardMission(outcome.account, mission.points);
      count += 1;
    }
    for (const period of MISSION_PERIODS) {
      for (const chest of chestsOf(missions, period)) {
        if (chestStatus(missionProgress(next.missions, now, missions), period, chest) !== 'ready') continue;
        const outcome = claimChest(next, period, chest.id, now, missions, world.byId, shopStamp());
        if (!outcome.ok) continue;
        next = outcome.account;
        count += 1;
      }
    }
  }

  const pass = claimAll(next, world.season, world.starpass, world.byId, shopStamp());
  if (pass.ok) {
    next = pass.account;
    count += 1;
  }

  return { account: next, count, log: `รับรางวัลภารกิจ/Star Pass ${count} รายการ` };
}

// ---------------------------------------------------------------------------
// squad: best eleven, best shape, best crests
// ---------------------------------------------------------------------------

function withBestCrests(squad: Squad, owned: OwnedIndex, world: BotWorld): Squad {
  const active = availableBadges(world.badges)
    .map((badge) => badgeStatus(badge, squad, owned, world.memberOf))
    .filter((status) => status.active)
    .sort((a, b) => b.badge.bonus - a.badge.bonus)
    .slice(0, BADGE_SLOTS)
    .map((status) => status.badge.id);
  const badges = Array.from({ length: BADGE_SLOTS }, (_, index) => active[index] ?? null);
  return { ...squad, badges };
}

/** The strongest squad this bot would pick, or null when it would keep the current one. */
export function betterSquad(
  account: Account,
  world: BotWorld,
  spec: PersonaSpec,
): { squad: Squad; rating: number; before: number } | null {
  const { players, owned } = cardsOf(account, world);
  if (players.length === 0) return null;

  const before = world.ratingOf(account.squad, owned);
  const shapes: FormationId[] = spec.optimiser ? [...FORMATION_IDS] : [world.profile.formation];
  // A casual player may still drift to another shape now and then.
  if (!spec.optimiser && world.rng() < 0.05) {
    const other = pickOne(FORMATION_IDS, world.rng);
    if (other) shapes.push(other);
  }

  let best: { squad: Squad; rating: number } | null = null;
  for (const formation of shapes) {
    const built = autoBuild({ ...account.squad, formation }, players);
    const squad = withBestCrests(built, owned, world);
    const rating = world.ratingOf(squad, owned);
    if (!best || rating > best.rating) best = { squad, rating };
  }

  if (!best || best.rating <= before) {
    // Same number, but empty slots or a stale crest are still worth fixing.
    const filled = Object.values(account.squad.starters).filter(Boolean).length;
    const want = best ? Object.values(best.squad.starters).filter(Boolean).length : 0;
    if (!best || want <= filled) return null;
  }
  return { ...best, before };
}

// ---------------------------------------------------------------------------
// pack: buy a draft pack exactly as useDraftRun does
// ---------------------------------------------------------------------------

interface PackChoice {
  event: DraftEvent;
  pack: DraftPack;
}

function packOptions(account: Account, world: BotWorld): PackChoice[] {
  return world.draftEvents.flatMap((event) => {
    if (!event.live || event.pool.length === 0) return [];
    return event.packs
      .filter((pack) => pack.visible !== false && pack.cost > 0 && pack.pulls > 0)
      .filter((pack) => {
        const limit = pack.limitPerAccount ?? 0;
        const bought = account.draftProgress?.[event.id]?.purchases?.[pack.id] ?? 0;
        return limit <= 0 || bought < limit;
      })
      .filter((pack) => canAfford(account.wallet, pack.currency, pack.cost))
      .map((pack) => ({ event, pack }));
  });
}

function doPack(
  account: Account,
  world: BotWorld,
  options: PackChoice[],
): { account: Account; log: string; cards: OwnedPlayer[]; best: OwnedPlayer | null } | null {
  // Bigger packs are better value, so they win more often — but not always.
  const choice = weighted(
    options.map((option) => ({ item: option, weight: 1 + option.pack.pulls * 0.6 })),
    world.rng,
  );
  if (!choice) return null;
  const { event, pack } = choice;

  const paid = debit(account.wallet, pack.currency, pack.cost, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) return null;

  const counters = normalizeCounters(account.draftProgress?.[event.id]?.counters, event.pity);
  const result = pull(event, counters, pack.pulls, world.rng);
  if (!result.ok) return null;

  const acquiredAt = world.now.toISOString();
  const cards: OwnedPlayer[] = result.outcomes.map((outcome) => ({
    id: newCardId(),
    playerId: outcome.player.id,
    eventId: event.id,
    name: outcome.player.name,
    rating: outcome.player.rating,
    position: outcome.player.position,
    set: outcome.player.set,
    nation: outcome.player.nation,
    club: outcome.player.club,
    portrait: outcome.player.portrait,
    ...(outcome.player.code ? { code: outcome.player.code } : {}),
    acquiredAt,
  }));

  const limit = pack.limitPerAccount ?? 0;
  const previous = account.draftProgress?.[event.id];
  const bought = previous?.purchases?.[pack.id] ?? 0;
  let next: Account = {
    ...account,
    wallet: paid.wallet,
    ledger: appendEntry(account.ledger, paid.entry),
    draftProgress: {
      ...account.draftProgress,
      [event.id]: {
        pulls: (previous?.pulls ?? 0) + result.outcomes.length,
        counters: result.counters,
        ...(limit > 0
          ? { purchases: { ...previous?.purchases, [pack.id]: bought + 1 } }
          : previous?.purchases
            ? { purchases: previous.purchases }
            : {}),
      },
    },
    club: addPlayers(account.club, cards),
  };
  next = world.note(next, 'draft-pull', result.outcomes.length);

  const best = [...cards].sort((a, b) => b.rating - a.rating)[0] ?? null;
  return {
    account: next,
    cards,
    best,
    log: `เปิด ${event.railName} · ${pack.label} (${cards.length} ใบ) ดีสุด ${best?.name ?? '-'} ${best?.rating ?? ''}`,
  };
}

// ---------------------------------------------------------------------------
// rankup: the same try the rank-up screen makes, target and materials picked sensibly
// ---------------------------------------------------------------------------

interface RankUpPlan {
  target: OwnedPlayer;
  materials: OwnedPlayer[];
}

function rankUpPlan(account: Account, world: BotWorld, spec: PersonaSpec): RankUpPlan | null {
  const config = world.rankup;
  if (!config.enabled) return null;
  const { players, owned } = cardsOf(account, world);
  const cap = Math.min(MAX_PLUS, spec.maxPlus);

  const starters = Object.values(account.squad.starters)
    .filter((id): id is string => Boolean(id))
    .map((id) => owned.get(id))
    .filter((card): card is OwnedPlayer => Boolean(card))
    .filter((card) => clampPlus(card.plus) < cap)
    // Best first, with a little randomness so it is not always the same striker.
    .sort((a, b) => ratingWithPlus(b) - ratingWithPlus(a) + (world.rng() - 0.5) * 6);

  for (const target of starters) {
    const rule = nextRule(config, clampPlus(target.plus));
    if (!rule) continue;
    // Nobody sensible bets a card on a rule that can delete it unless they are rich.
    if (rule.onFail === 'destroy' && world.profile.persona !== 'whale') continue;
    if (account.wallet[rule.currency] < rule.cost) continue;

    const materials = players
      .filter(
        (card) =>
          card.id !== target.id &&
          !isInSquad(account.squad, card.id) &&
          clampPlus(card.plus) === 0 &&
          !(card.oneOfOne?.length) &&
          isMaterial(config, rule, card, target.id),
      )
      .sort((a, b) => a.rating - b.rating)
      .slice(0, rule.materials);
    if (materials.length < rule.materials) continue;

    const ready = checkReady({ config, target, materials, balance: account.wallet[rule.currency] });
    if (ready.ok) return { target, materials };
  }
  return null;
}

function doRankUp(
  account: Account,
  world: BotWorld,
  plan: RankUpPlan,
): { account: Account; log: string; success: boolean; to: number; effects: BotEffect[] } | null {
  const config = world.rankup;
  const rule = nextRule(config, clampPlus(plan.target.plus));
  if (!rule) return null;

  const outcome = attempt(config, plan.target, plan.materials, world.rng);
  const paid = debit(account.wallet, rule.currency, rule.cost, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) return null;

  const gone = new Set(outcome.consumed);
  if (outcome.destroyed) gone.add(plan.target.id);
  let squad = account.squad;
  for (const id of gone) squad = removeFromSquad(squad, id);
  const players = account.club.players
    .filter((card) => !gone.has(card.id))
    .map((card) => (card.id === plan.target.id ? { ...card, plus: outcome.to } : card));

  let next: Account = {
    ...account,
    wallet: paid.wallet,
    ledger: appendEntry(account.ledger, paid.entry),
    squad,
    club: { players },
  };
  next = world.note(world.note(next, 'rankup-try', 1), 'rankup-success', outcome.success ? 1 : 0);

  const effects: BotEffect[] = [];
  if (outcome.success && isOneOfOneLevel(outcome.to) && world.settings.oneOfOne) {
    effects.push({
      kind: 'oneOfOne',
      record: oneOfOneRecordFor(
        { id: account.id, username: displayNameOf(account) },
        plan.target,
        outcome.to,
        world.now.toISOString(),
      ),
    });
  }

  const verdict = outcome.success
    ? `ติด +${outcome.to}`
    : outcome.destroyed
      ? 'แตก การ์ดหาย'
      : outcome.to < outcome.from
        ? `ไม่ติด ลงเหลือ +${outcome.to}`
        : 'ไม่ติด';
  return {
    account: next,
    success: outcome.success,
    to: outcome.to,
    effects,
    log: `ตีบวก ${plan.target.name} +${outcome.from}→+${outcome.from + 1} ${verdict}`,
  };
}

// ---------------------------------------------------------------------------
// ranked: one manager-mode ranked match, quick-simulated like an unwatched game
// ---------------------------------------------------------------------------

function doRanked(
  account: Account,
  world: BotWorld,
  rating: number,
): { account: Account; log: string; won: boolean; promoted: string | null } | null {
  const config = world.manager;
  const matchId = managerId('m');
  const opponent = pickOpponent(`${account.id}:${matchId}`, account.id, rating, world.entries, config);
  const outcome = playManagerMatch(account, {
    ranked: true,
    opponent,
    rating,
    config,
    now: world.now,
    matchId,
    shield: false,
  });
  if (!outcome.ok || !outcome.match) return null;

  const match = outcome.match;
  let next = world.note(outcome.account, 'manager-play', 1);
  next = world.note(next, 'manager-win', match.outcome === 'win' ? 1 : 0);
  next = world.note(next, 'manager-goal', match.score[0]);
  next = world.awardMatch(next, match.outcome);

  const verdict = match.outcome === 'win' ? 'ชนะ' : match.outcome === 'loss' ? 'แพ้' : 'เสมอ';
  const tier = config.tiers[match.tierAfter]?.name ?? '';
  return {
    account: next,
    won: match.outcome === 'win',
    promoted: match.tierAfter > match.tierBefore ? tier : null,
    log: `ลงแรงค์ vs ${opponent.name} ${verdict} ${match.score[0]}-${match.score[1]} · ${tier} ★${match.starsAfter}`,
  };
}

// ---------------------------------------------------------------------------
// cup: enter, play a round, or lift the trophy — whichever the run is waiting on
// ---------------------------------------------------------------------------

type CupMove =
  | { kind: CupKind; move: 'claim'; runId: string }
  | { kind: CupKind; move: 'play'; runId: string; round: number }
  | { kind: CupKind; move: 'enter' };

function cupMove(account: Account, world: BotWorld, day: BotDayCounters, spec: PersonaSpec, rating: number): CupMove | null {
  const config = world.cup;
  if (!config.enabled) return null;
  const state = currentCup(account.cup, config, world.now);

  // Unfinished business first, weekend cup before the daily one.
  for (const kind of [...CUP_KINDS].reverse()) {
    const run = state.runs[kind];
    if (run?.status === 'champion') return { kind, move: 'claim', runId: run.id };
    if (run?.status === 'running') return { kind, move: 'play', runId: run.id, round: run.round };
  }

  if (day.cups >= spec.maxCups || rating <= 0) return null;
  for (const kind of [...CUP_KINDS].reverse()) {
    const competition = config[kind];
    if (!competition.enabled || !windowOpen(world.now, config, competition)) continue;
    if (entriesLeft(state, kind, competition) <= 0) continue;
    if (competition.entryCost > 0 && !canAfford(account.wallet, competition.entryCurrency, competition.entryCost)) {
      continue;
    }
    return { kind, move: 'enter' };
  }
  return null;
}

function doCup(
  account: Account,
  world: BotWorld,
  move: CupMove,
  rating: number,
): { account: Account; log: string; entered: boolean; played: boolean; won: boolean; champion: boolean } | null {
  const config = world.cup;
  const name = config[move.kind].name;
  const base = { entered: false, played: false, won: false, champion: false };

  if (move.move === 'enter') {
    const outcome = enterCup(account, {
      kind: move.kind,
      config,
      self: { name: displayNameOf(account), rating, avatarId: account.avatarId },
      entries: world.entries,
      now: world.now,
      runId: cupId('cup'),
    });
    if (!outcome.ok) return null;
    return { ...base, account: outcome.account, entered: true, log: `สมัคร${name}` };
  }

  if (move.move === 'claim') {
    const outcome = claimCupReward(account, {
      kind: move.kind,
      runId: move.runId,
      config,
      now: world.now,
      lookup: world.byId,
      stamp: shopStamp(),
    });
    if (!outcome.ok) return null;
    return { ...base, account: outcome.account, log: `รับรางวัลแชมป์${name}` };
  }

  const applied = playCupRound(account, {
    kind: move.kind,
    runId: move.runId,
    round: move.round,
    config,
    now: world.now,
    mode: { kind: 'simulate' },
    lookup: world.byId,
    stamp: shopStamp(),
  });
  if (!applied.ok || !applied.tie || !applied.run) return null;

  const seat = applied.run.teams.findIndex((team) => team.you);
  const mine = applied.tie.a === seat ? applied.tie.score[0] : applied.tie.score[1];
  const theirs = applied.tie.a === seat ? applied.tie.score[1] : applied.tie.score[0];
  let next = world.note(applied.account, 'cup-play', 1);
  next = world.note(next, 'cup-win', applied.through ? 1 : 0);
  next = world.note(next, 'cup-goal', mine);
  next = world.awardMatch(next, applied.through ? 'win' : 'loss');

  const champion = applied.run.status === 'champion';
  return {
    ...base,
    account: next,
    played: true,
    won: applied.through,
    champion,
    log: `${name} รอบ ${move.round + 1} ${applied.through ? 'ผ่าน' : 'ตกรอบ'} ${mine}-${theirs}${champion ? ' · แชมป์!' : ''}`,
  };
}

// ---------------------------------------------------------------------------
// the step
// ---------------------------------------------------------------------------

function chatLine(world: BotWorld, lines: readonly string[], values: Record<string, string | number>): string | null {
  const line = pickOne(lines.filter((entry) => entry.trim().length > 0), world.rng);
  return line ? fill(line, values).slice(0, 120) : null;
}

/**
 * Decides and applies one action.
 *
 * Order of business mirrors a person opening the game: the first visit of the day
 * collects income and the login reward; finished missions get claimed; a better
 * eleven gets picked after new cards arrive. After that it is a weighted pick among
 * what is actually possible right now — packs, a rank-up try, a ranked match, the
 * cup, a chat line — each capped per day by the persona. Nothing possible means the
 * session is over.
 */
export function botStep(account: Account, world: BotWorld): BotStepResult {
  const spec = PERSONAS[world.profile.persona];
  const day = { ...currentDay(world.profile.today, world.now) };
  const stats = { ...world.profile.stats };
  const effects: BotEffect[] = [];
  const done = (
    action: BotAction,
    next: Account,
    log: string,
    busySeconds = 0,
    formation: FormationId = world.profile.formation,
  ): BotStepResult => ({ account: next, action, log, day, stats, formation, effects, busySeconds });

  if (!day.paid) {
    const login = doLogin(account, world, day);
    return done('login', login.account, login.log);
  }

  // People let a few finished missions pile up and collect them together.
  if (claimables(account, world) && world.rng() < 0.4) {
    const claimed = doClaim(account, world);
    // Nothing paid (a full club, a wallet at its cap) is not a reason to keep trying.
    if (claimed.count > 0) return done('claim', claimed.account, claimed.log);
  }

  const better = betterSquad(account, world, spec);
  if (better && world.rng() < 0.9) {
    return done(
      'squad',
      { ...account, squad: better.squad },
      `จัดทีม ${better.squad.formation} OVR ${better.before}→${better.rating}`,
      0,
      better.squad.formation,
    );
  }

  const rating = teamRatingOf(account, world);
  const packs = day.packs < spec.maxPacks ? packOptions(account, world) : [];
  const plan = day.rankups < spec.maxRankups ? rankUpPlan(account, world, spec) : null;
  const canRank = world.manager.enabled && rating > 0 && day.matches < spec.maxMatches;
  const cup = cupMove(account, world, day, spec, rating);
  const canChat = world.settings.chat && world.chatOpen && day.chats < spec.maxChats;

  const options: { item: Choice; weight: number }[] = [];
  if (packs.length > 0) options.push({ item: 'pack', weight: spec.weights.pack * (rating <= 0 ? 5 : 1) });
  if (plan) options.push({ item: 'rankup', weight: spec.weights.rankup });
  if (canRank) options.push({ item: 'ranked', weight: spec.weights.ranked });
  // A run already under way is finished before much else happens.
  if (cup) options.push({ item: 'cup', weight: spec.weights.cup * (cup.move === 'enter' ? 1 : 4) });
  if (canChat) options.push({ item: 'chat', weight: spec.weights.chat * (world.rng() < spec.chatChance ? 3 : 0.15) });

  const choice = weighted(options, world.rng);
  const values = { ovr: rating, name: displayNameOf(account), tier: world.manager.tiers[account.manager?.tier ?? 0]?.name ?? '' };

  switch (choice) {
    case 'pack': {
      const result = doPack(account, world, packs);
      if (!result) break;
      day.packs += 1;
      stats.packs += 1;
      stats.cards += result.cards.length;
      if (result.best?.set === 'A' && world.settings.chat && world.chatOpen && day.chats < spec.maxChats && world.rng() < 0.45) {
        const text = chatLine(world, world.settings.pullLines, { ...values, card: result.best.name });
        if (text) {
          effects.push({ kind: 'chat', text });
          day.chats += 1;
          stats.chats += 1;
        }
      }
      return done('pack', result.account, result.log, 8);
    }
    case 'rankup': {
      if (!plan) break;
      const result = doRankUp(account, world, plan);
      if (!result) break;
      day.rankups += 1;
      stats.rankups += 1;
      if (result.success) stats.rankupWins += 1;
      effects.push(...result.effects);
      if (result.success && result.to >= 5 && world.settings.chat && world.chatOpen && day.chats < spec.maxChats && world.rng() < 0.35) {
        const text = chatLine(world, world.settings.rankupLines, { ...values, card: plan.target.name, plus: result.to });
        if (text) {
          effects.push({ kind: 'chat', text });
          day.chats += 1;
          stats.chats += 1;
        }
      }
      return done('rankup', result.account, result.log, 4);
    }
    case 'ranked': {
      const result = doRanked(account, world, rating);
      if (!result) break;
      day.matches += 1;
      stats.matches += 1;
      if (result.won) stats.wins += 1;
      effects.push({ kind: 'rank' });
      if (result.promoted && world.settings.chat && world.chatOpen && day.chats < spec.maxChats && world.rng() < 0.4) {
        const text = chatLine(world, world.settings.promoteLines, { ...values, tier: result.promoted });
        if (text) {
          effects.push({ kind: 'chat', text });
          day.chats += 1;
          stats.chats += 1;
        }
      }
      // Watched or skipped to the end — somewhere between a sim and the full match.
      return done('ranked', result.account, result.log, world.manager.matchSeconds * (0.3 + world.rng() * 0.9));
    }
    case 'cup': {
      if (!cup) break;
      const result = doCup(account, world, cup, rating);
      if (!result) break;
      if (result.entered) {
        day.cups += 1;
        stats.cups += 1;
      }
      if (result.played) {
        stats.matches += 1;
        if (result.won) stats.wins += 1;
      }
      if (result.champion) {
        stats.trophies += 1;
        if (world.settings.chat && world.chatOpen && day.chats < spec.maxChats && world.rng() < 0.5) {
          const text = chatLine(world, world.settings.winLines, { ...values, cup: world.cup[cup.kind].name });
          if (text) {
            effects.push({ kind: 'chat', text });
            day.chats += 1;
            stats.chats += 1;
          }
        }
      }
      const busy = result.played ? world.manager.matchSeconds * (0.3 + world.rng() * 0.9) : 3;
      return done('cup', result.account, result.log, busy);
    }
    case 'chat': {
      const text = chatLine(world, world.settings.chatLines, values);
      if (!text) break;
      effects.push({ kind: 'chat', text });
      day.chats += 1;
      stats.chats += 1;
      return done('chat', account, `แชท: ${text}`, 10);
    }
    default:
      break;
  }

  return done('idle', account, 'ไม่มีอะไรทำ ออกจากเกม');
}
