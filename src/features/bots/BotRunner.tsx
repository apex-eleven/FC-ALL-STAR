import { useEffect, useRef } from 'react';
import type { Account } from '@/features/auth/types';
import { useAuth } from '@/features/auth/AuthContext';
import { displayNameOf } from '@/features/auth/constants';
import { useBadges } from '@/features/badges/BadgeContext';
import { claimLease, patchBotProfile, releaseLease, watchBotSettings, watchBots } from '@/features/cloud/cloudBots';
import { sendChatMessage } from '@/features/cloud/cloudChat';
import { fetchLeaderboard, publishLeaderboardEntry } from '@/features/cloud/cloudLeaderboard';
import { publishManagerRank } from '@/features/cloud/cloudManagerLadder';
import { isCloudEnabled } from '@/features/cloud/firebase';
import { useCup } from '@/features/cup/CupContext';
import { useDailyLogin } from '@/features/dailylogin/DailyLoginContext';
import { useDraft } from '@/features/draft/DraftContext';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { useManager } from '@/features/manager/ManagerContext';
import { currentState } from '@/features/manager/manager';
import type { ManagerConfig } from '@/features/manager/types';
import { useMissions } from '@/features/missions/MissionContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { claimOneOfOne } from '@/features/rankup/claimOneOfOne';
import { withOneOfOne } from '@/features/rankup/oneOfOne';
import { useRankUp } from '@/features/rankup/RankUpContext';
import { useStarPass } from '@/features/starpass/StarPassContext';
import { botStep, teamRatingOf, type BotStepResult, type BotWorld } from './brain';
import { BOT_LOG_LIMIT, ENTRIES_TTL_MS, LEASE_MS, LEASE_RENEW_MS, PERSONAS, RUNNER_TICK_MS } from './constants';
import { leaderboardEntryOf } from './publish';
import {
  isOnline,
  isStale,
  nextInSession,
  nextSession,
  nextWindowOpen,
  randBetween,
  randInt,
  restartSoon,
} from './schedule';
import type { BotProfile, BotSettings } from './types';

function rankLabel(account: Account, manager: ManagerConfig, now: Date): string {
  if (!account.manager) return '';
  const state = currentState(account.manager, manager, now);
  const tier = manager.tiers[state.tier];
  return tier ? `${tier.name} ★${state.stars}` : '';
}

/**
 * Plays the bots, from an admin's browser.
 *
 * There is no server to run them on (no Cloud Functions on this project), so the
 * bots live wherever an admin has the game open. One browser at a time holds the
 * lease (`botConfig/lease`); that one finds the bot that is due, plays one step with
 * `botStep`, writes the account through the same `updateOther` the admin panel uses,
 * publishes whatever a player's own screens would have published, and schedules the
 * bot's next move. Everyone else's browser does nothing.
 *
 * Renders nothing. Mounted once in main.tsx, inside every provider it reads
 * settings from, so a bot always plays under the live admin config.
 */
export default function BotRunner() {
  const { isAdmin, account, updateOther } = useAuth();
  const active = isAdmin && isCloudEnabled();

  // Everything the tick reads lives in one ref, refreshed every render, so the
  // interval never runs on the settings of the render it was created in.
  const { liveEvents } = useDraft();
  const { config: rankup } = useRankUp();
  const { config: manager } = useManager();
  const { config: cup } = useCup();
  const { config: missions, note } = useMissions();
  const { config: login } = useDailyLogin();
  const { config: starpass, season, awardMatch, awardMission } = useStarPass();
  const { config: badges, memberOf, ratingOf } = useBadges();
  const { byId } = usePlayers();

  const live = useRef({
    liveEvents, rankup, manager, cup, missions, note, login, starpass, season,
    awardMatch, awardMission, badges, memberOf, ratingOf, byId, updateOther,
  });
  live.current = {
    liveEvents, rankup, manager, cup, missions, note, login, starpass, season,
    awardMatch, awardMission, badges, memberOf, ratingOf, byId, updateOther,
  };

  const bots = useRef<BotProfile[]>([]);
  const settings = useRef<BotSettings | null>(null);
  const leased = useRef(false);
  const busy = useRef(false);
  const entries = useRef<{ at: number; rows: LeaderboardEntry[] }>({ at: 0, rows: [] });
  const lastChat = useRef(0);
  const holder = useRef(`run-${Math.random().toString(36).slice(2, 10)}`);
  const label = useRef('');
  label.current = `${account?.username ?? 'admin'} · ${new Date().toLocaleDateString('th-TH')}`;

  useEffect(() => {
    if (!active) return;
    const stopBots = watchBots((rows) => {
      bots.current = rows ?? [];
    });
    const stopSettings = watchBotSettings((next) => {
      settings.current = next;
    });

    const lease = async () => {
      if (!settings.current?.enabled) {
        if (leased.current) {
          leased.current = false;
          await releaseLease(holder.current);
        }
        return;
      }
      leased.current = await claimLease(holder.current, label.current, LEASE_MS);
    };

    const tick = async () => {
      if (busy.current || !leased.current || !settings.current?.enabled) return;
      busy.current = true;
      try {
        await playOne(settings.current);
      } catch (error) {
        console.error('[bots] รอบของบอทล้มเหลว', error);
      } finally {
        busy.current = false;
      }
    };

    // First lease try shortly after mount, once the snapshots have had a moment.
    const first = window.setTimeout(() => void lease(), 3_000);
    const leaseTimer = window.setInterval(() => void lease(), LEASE_RENEW_MS);
    // Settings switched on elsewhere should not wait two minutes for the next renewal.
    const quick = window.setInterval(() => {
      if (settings.current?.enabled && !leased.current) void lease();
      if (!settings.current?.enabled && leased.current) void lease();
    }, 15_000);
    const tickTimer = window.setInterval(() => void tick(), RUNNER_TICK_MS);

    const release = () => {
      if (leased.current) void releaseLease(holder.current);
    };
    window.addEventListener('pagehide', release);

    return () => {
      stopBots();
      stopSettings();
      window.clearTimeout(first);
      window.clearInterval(leaseTimer);
      window.clearInterval(quick);
      window.clearInterval(tickTimer);
      window.removeEventListener('pagehide', release);
      release();
      leased.current = false;
    };
    // playOne reads refs only, so the effect depends on nothing else.
  }, [active]);

  async function opponents(): Promise<LeaderboardEntry[]> {
    if (Date.now() - entries.current.at < ENTRIES_TTL_MS) return entries.current.rows;
    const rows = await fetchLeaderboard();
    entries.current = { at: Date.now(), rows };
    return rows;
  }

  /** One step for the most overdue bot, if any is due. */
  async function playOne(config: BotSettings): Promise<void> {
    const now = new Date();
    const due = bots.current
      .filter((bot) => bot.enabled && Date.parse(bot.nextActionAt) <= now.getTime())
      .sort((a, b) => Date.parse(a.nextActionAt) - Date.parse(b.nextActionAt));
    const profile = due[0];
    if (!profile) return;
    const rng = Math.random;

    // Nobody had the game open for a while: spread the backlog out instead of every
    // overdue bot logging on in the same minute.
    if (profile.sessionLeft === 0 && isStale(profile, now)) {
      await patchBotProfile(profile.uid, { nextActionAt: restartSoon(now, rng).toISOString() });
      return;
    }
    // Outside its hours, a bot waits for its window rather than playing at 4 a.m.
    if (profile.sessionLeft === 0 && !isOnline(profile, now)) {
      const open = nextWindowOpen(profile, now);
      await patchBotProfile(profile.uid, {
        nextActionAt: new Date(open.getTime() + randBetween(0, 75, rng) * 60_000).toISOString(),
      });
      return;
    }

    const spec = PERSONAS[profile.persona];
    const sessionLeft =
      profile.sessionLeft > 0 ? profile.sessionLeft : randInt(spec.actionsPerSession[0], spec.actionsPerSession[1], rng);

    const ctx = live.current;
    const rows = await opponents();
    const chatOpen = now.getTime() - lastChat.current >= config.chatGapMinutes * 60_000;
    const world: BotWorld = {
      now,
      rng,
      profile,
      settings: config,
      draftEvents: ctx.liveEvents.filter((event) => !event.endsAt || Date.parse(event.endsAt) >= now.getTime()),
      rankup: ctx.rankup,
      manager: ctx.manager,
      cup: ctx.cup,
      missions: ctx.missions,
      login: ctx.login,
      starpass: ctx.starpass,
      season: ctx.season,
      badges: ctx.badges,
      memberOf: ctx.memberOf,
      byId: ctx.byId,
      ratingOf: ctx.ratingOf,
      entries: rows,
      chatOpen,
      note: ctx.note,
      awardMatch: ctx.awardMatch,
      awardMission: ctx.awardMission,
    };

    let result: BotStepResult | null = null;
    const saved = await ctx.updateOther(profile.username, (current) => {
      result = botStep(current, world);
      return result.account;
    });
    const step = result as BotStepResult | null;

    if (!saved || !step) {
      await patchBotProfile(profile.uid, {
        nextActionAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
        sessionLeft: 0,
        log: [{ at: now.toISOString(), text: 'บันทึกเซฟไม่สำเร็จ จะลองใหม่ใน 10 นาที' }, ...profile.log].slice(0, BOT_LOG_LIMIT),
      });
      return;
    }

    let finalAccount: Account = step.account;
    const rating = teamRatingOf(finalAccount, world);

    for (const effect of step.effects) {
      if (effect.kind === 'chat') {
        lastChat.current = Date.now();
        void sendChatMessage({
          uid: finalAccount.id,
          username: displayNameOf(finalAccount),
          avatarId: finalAccount.avatarId,
          level: finalAccount.level,
          ovr: rating,
          text: effect.text,
        });
      } else if (effect.kind === 'rank') {
        const state = currentState(finalAccount.manager, ctx.manager, now);
        const lastPlayed = state.history.find((match) => match.ranked)?.at ?? now.toISOString();
        void publishManagerRank({
          uid: finalAccount.id,
          username: displayNameOf(finalAccount),
          avatarId: finalAccount.avatarId,
          tierId: ctx.manager.tiers[state.tier]?.id ?? '',
          tier: state.tier,
          stars: state.stars,
          season: state.season,
          updatedAt: lastPlayed,
        });
      } else if (effect.kind === 'oneOfOne') {
        const claimed = await claimOneOfOne(effect.record);
        if (claimed === 'won') {
          const cardId = effect.record.cardId;
          const level = effect.record.level;
          await ctx.updateOther(profile.username, (current) => {
            if (!current.club.players.some((card) => card.id === cardId)) return current;
            finalAccount = { ...current, club: { players: withOneOfOne(current.club.players, cardId, level) } };
            return finalAccount;
          });
        }
      }
    }

    // The leaderboard row, whenever the eleven on show changed — the same trigger
    // ClubScreen's publish effect uses for a real player.
    let boardSig = profile.boardSig;
    const board = leaderboardEntryOf(finalAccount, ctx.byId, ctx.ratingOf, now);
    if (board && board.signature !== profile.boardSig) {
      const published = await publishLeaderboardEntry(board.entry);
      if (published) {
        boardSig = board.signature;
        entries.current = {
          ...entries.current,
          rows: [...entries.current.rows.filter((row) => row.uid !== board.entry.uid), board.entry],
        };
      }
    }

    const left = step.action === 'idle' ? 0 : sessionLeft - 1;
    const next =
      left > 0
        ? new Date(nextInSession(profile, now, rng).getTime() + step.busySeconds * 1000)
        : nextSession(profile, now, rng);

    // Only the fields the runner owns: an admin pausing or editing the bot while this
    // step ran must not be overwritten, and a bot deleted meanwhile must stay deleted
    // (an update on a missing document fails instead of recreating it).
    await patchBotProfile(profile.uid, {
      today: step.day,
      stats: step.stats,
      formation: step.formation,
      sessionLeft: left,
      nextActionAt: next.toISOString(),
      lastActiveAt: now.toISOString(),
      boardSig,
      ovr: teamRatingOf(finalAccount, world),
      rank: rankLabel(finalAccount, ctx.manager, now),
      log: [{ at: now.toISOString(), text: step.log }, ...profile.log].slice(0, BOT_LOG_LIMIT),
    });
  }

  return null;
}
