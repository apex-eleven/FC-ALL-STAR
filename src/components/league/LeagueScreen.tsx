import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, Clock, Crown, Home, Star } from 'lucide-react';
import { avatarCatalogue } from '@/data/mock/avatars';
import { currencies } from '@/data/mock/currencies';
import BrandGlyph from '@/components/ui/BrandGlyph';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import { useLeague } from '@/features/league/LeagueContext';
import { PLAYER_TEAM_ID } from '@/features/league/constants';
import {
  buildRoster,
  nextReset,
  playMatch,
  roundRobin,
  scoreFor,
  seasonStart,
  slotTime,
  slotsElapsed,
  type RealOpponent,
} from '@/features/league/season';
import { rewardEntries, rewardFor } from '@/features/league/standings';
import { emptyRecord, type LeagueRecord, type LeagueRival } from '@/features/league/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import styles from './LeagueScreen.module.css';

/**
 * Avatar art by id, falling back to the first in the catalogue.
 *
 * Clubs in this game have no crests, so every row wears a manager's face — the
 * player's own avatar on their row, a seeded one on each rival.
 */
function avatarSrc(avatarId: string): string {
  const found = avatarCatalogue.find((entry) => entry.id === avatarId);
  return (found ?? avatarCatalogue[0])?.source ?? '';
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** hh:mm down to zero. Never negative — a passed deadline reads as 00:00. */
function countdown(target: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

interface Row {
  id: string;
  name: string;
  rating: number;
  stars: number;
  avatarId: string;
  record: LeagueRecord;
  isPlayer: boolean;
}

function toRow(rival: LeagueRival): Row {
  return {
    id: rival.id,
    name: rival.name,
    rating: rival.rating,
    stars: rival.stars,
    avatarId: rival.avatarId,
    record: rival.record ?? emptyRecord(),
    isPlayer: false,
  };
}

export default function LeagueScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, state, entries, rank, rating } = useLeague();
  const [now, setNow] = useState(() => new Date());
  const [hourFilter, setHourFilter] = useState<number | 'all'>('all');

  // One tick a second, only while this screen is open. The simulation runs off the
  // clock, not off this — the countdown is the only thing that needs it.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Bots only — the seats this account owns and can mutate. Used to tell a real
  // opponent's seat apart from one of this account's own generated fictions.
  const botsById = useMemo(
    () => new Map(state.rivals.map((rival) => [rival.id, rival])),
    [state.rivals],
  );

  const otherEntries = useMemo(
    () => entries.filter((entry) => entry.uid !== account.id),
    [entries, account.id],
  );

  /** Shaped for `season.buildRoster` — the same real seats `standings.advance` plays. */
  const realOpponents = useMemo<RealOpponent[]>(
    () =>
      otherEntries.map((entry) => ({
        id: entry.uid,
        name: entry.username,
        rating: entry.rating,
        avatarId: entry.avatarId,
      })),
    [otherEntries],
  );

  const rows = useMemo<Row[]>(() => {
    const me: Row = {
      id: 'you',
      name: account.username,
      rating,
      stars: state.stars,
      avatarId: account.avatarId,
      record: state.record ?? emptyRecord(),
      isPlayer: true,
    };

    /*
      Real players first, generated rivals only to fill the rest of the table.

      A ladder of twenty bots is a placeholder; a ladder of three friends and
      seventeen bots is a real table that has not filled up yet. As more people play,
      the generated ones are pushed out from the bottom rather than the list suddenly
      changing character.
    */
    const real: Row[] = otherEntries.map((entry) => ({
      id: entry.uid,
      name: entry.username,
      rating: entry.rating,
      stars: entry.stars,
      avatarId: entry.avatarId,
      record: entry.record ?? emptyRecord(),
      isPlayer: false,
    }));

    const padding = Math.max(0, config.teamCount - 1 - real.length);
    const all: Row[] = [...real, ...state.rivals.slice(0, padding).map(toRow), me];

    // Stars first, then goal difference, then goals scored — the tie-breaks a real
    // table uses. An outright tie still goes to the player, matching rankOf.
    return all.sort((a, b) => {
      if (b.stars !== a.stars) return b.stars - a.stars;
      const diff =
        b.record.goalsFor - b.record.goalsAgainst - (a.record.goalsFor - a.record.goalsAgainst);
      if (diff !== 0) return diff;
      if (b.record.goalsFor !== a.record.goalsFor) return b.record.goalsFor - a.record.goalsFor;
      return a.isPlayer ? -1 : b.isPlayer ? 1 : 0;
    });
  }, [
    state.rivals,
    state.stars,
    state.record,
    otherEntries,
    config.teamCount,
    account.username,
    account.avatarId,
    rating,
  ]);

  const playedSlots = slotsElapsed(now, config);
  const totalSlots = Math.max(1, Math.floor((24 * 60) / config.matchIntervalMinutes));

  /** Every seat's display row, real players and bots alike — keyed by id for lookups. */
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  /**
   * The day's fixture board — every slot, every team, played or not.
   *
   * Built from the same round-robin (`season.roundRobin`) that `standings.advance`
   * uses to resolve the day, over the same seats (`season.buildRoster`: real
   * players first, bots padding the rest) — so a pairing shown here is never
   * separate from the one that actually moved someone's stars, and the player is
   * scheduled against real opponents exactly as often as the simulation plays them.
   *
   * The player's own result comes out of `state.history`. A bot's fixture that has
   * already passed is recomputed with the exact same seed `standings.advance` used
   * for it (`accountId:seasonId:slot:homeId-awayId`, against each side's fixed
   * rating) — pure and deterministic, so it reproduces the actual result rather
   * than a second, different-looking guess. A pairing between two other real
   * players has no result this device can know (each resolves their own matches
   * locally, same as this account does), so it stays scoreless even once the slot
   * has passed — only a pairing this account's own bot took part in can be shown.
   */
  const fixtures = useMemo(() => {
    const playerRow = rows.find((row) => row.isPlayer) ?? null;
    const roster = buildRoster(realOpponents, state.rivals, config.teamCount);
    const teamIds = [PLAYER_TEAM_ID, ...roster.map((seat) => seat.id)];
    const rounds = roundRobin(teamIds);
    const cycleLength = Math.max(1, rounds.length);

    const list: {
      key: string;
      slot: number;
      at: Date;
      home: Row | null;
      away: Row | null;
      isPlayer: boolean;
      delta: number | null;
      score: string | null;
    }[] = [];

    for (let slot = 0; slot < totalSlots; slot += 1) {
      const at = slotTime(now, config, slot);
      const round = rounds[slot % cycleLength] ?? [];
      const played = slot < playedSlots;

      for (const [homeId, awayId] of round) {
        if (homeId === PLAYER_TEAM_ID || awayId === PLAYER_TEAM_ID) {
          const opponentId = homeId === PLAYER_TEAM_ID ? awayId : homeId;
          const opponent = rowsById.get(opponentId) ?? null;
          const match = state.history.find((entry) => entry.slot === slot);

          list.push({
            key: `you-${slot}`,
            slot,
            at,
            home: playerRow,
            away: opponent,
            isPlayer: true,
            delta: match ? match.delta : null,
            score: match ? `${match.goalsFor} - ${match.goalsAgainst}` : null,
          });
          continue;
        }

        const home = rowsById.get(homeId);
        const away = rowsById.get(awayId);
        if (!home || !away) continue;

        const homeIsBot = botsById.has(homeId);
        const awayIsBot = botsById.has(awayId);

        let score: string | null = null;
        if (played && (homeIsBot || awayIsBot)) {
          const pairSeed = `${account.id}:${state.seasonId}:${slot}:${homeId}-${awayId}`;
          const outcome = playMatch(pairSeed, home.rating, away.rating);
          const [homeGoals, awayGoals] = scoreFor(pairSeed, outcome);
          score = `${homeGoals} - ${awayGoals}`;
        }

        list.push({
          key: `${slot}-${home.id}-${away.id}`,
          slot,
          at,
          home,
          away,
          isPlayer: false,
          delta: null,
          score,
        });
      }
      // A round with an odd team count leaves exactly one seat on a bye each cycle;
      // when it lands on the player, this slot simply adds no player row rather than
      // inventing a fixture that was never played.
    }

    return list;
  }, [
    rows,
    rowsById,
    realOpponents,
    state.rivals,
    state.history,
    state.seasonId,
    botsById,
    config,
    now,
    totalSlots,
    playedSlots,
    account.id,
  ]);

  // Every hour that actually has a fixture, in order — the tab strip used to stop
  // at the first six, which left most of the day's schedule unreachable.
  const hours = useMemo(() => {
    const seen: number[] = [];
    for (const fixture of fixtures) {
      const hour = fixture.at.getHours();
      if (!seen.includes(hour)) seen.push(hour);
    }
    return seen;
  }, [fixtures]);

  const shownFixtures = useMemo(() => {
    // "ทั้งหมด" is the player's own match history for the day — every slot their
    // team played or will play — not the whole day's schedule for every team mixed
    // together; browsing another team's games is what the hour tabs are for.
    if (hourFilter === 'all') return fixtures.filter((fixture) => fixture.isPlayer);
    return fixtures.filter((fixture) => fixture.at.getHours() === hourFilter);
  }, [fixtures, hourFilter]);

  const topReward = rewardFor(1, config);
  const seasonDate = seasonStart(now, config.resetHour);
  const division = rank <= 3 ? 1 : rank <= 10 ? 2 : 3;

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />
      <div className={styles.photo} />
      <div className={styles.photoScrim} />

      <button type="button" className={styles.back} onClick={back} aria-label="กลับ">
        <ChevronLeft size={26} strokeWidth={3} />
      </button>
      <button type="button" className={styles.home} onClick={() => navigate('home')} aria-label="หน้าแรก">
        <Home size={22} strokeWidth={2.4} />
      </button>

      {/* ================= left column ================= */}
      <div className={styles.left}>
        <section className={styles.banner}>
          {/*
            The title art carries its own text — "DAILY LEAGUE / ลีกประจำวัน" never
            changes, so baking it into the image costs nothing and matches the
            reference exactly. Only the line below it is rendered, because it quotes
            the live match interval.
          */}
          <BrandGlyph className={styles.bannerArt} file="league_banner.png">
            <span className={styles.bannerFallback}>
              <Crown size={34} strokeWidth={2} />
              <span>
                <span className={styles.bannerTitle}>DAILY LEAGUE</span>
                <span className={styles.bannerThai}>ลีกประจำวัน</span>
              </span>
            </span>
          </BrandGlyph>

          <p className={styles.bannerNote}>
            แข่งทุก {config.matchIntervalMinutes} นาที เก็บดาวขึ้นอันดับ
            เพื่อรับรางวัลและเลื่อนลีก
          </p>

          <div className={styles.division}>
            {/*
              The division number is painted into the badge, so each division needs its
              own file: league_division_1.png, _2, _3. Missing one falls back to the
              plain league_division.png, and missing that falls back to the drawn badge.
            */}
            <BrandGlyph className={styles.divisionArt} file={`league_division_${division}.png`}>
              <BrandGlyph className={styles.divisionArt} file="league_division.png">
                <span className={styles.divisionFallback}>
                  <Crown size={18} strokeWidth={2.6} />
                  <span className={styles.divisionWord}>DIVISION</span>
                  <span className={styles.divisionNumber}>{division}</span>
                </span>
              </BrandGlyph>
            </BrandGlyph>
            <span className={styles.divisionLabel}>ดิวิชั่น {division}</span>
          </div>
        </section>

        <section className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statHead}>
              <BrandGlyph className={styles.statIcon} file="league_star.png">
                <Star size={15} strokeWidth={2.6} />
              </BrandGlyph>
              อันดับปัจจุบัน
            </span>
            <span className={styles.statValue}>{rank}</span>
            <span className={styles.statSub}>จาก {config.teamCount} ทีม</span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statHead}>
              <BrandGlyph className={styles.statIcon} file="league_clock.png">
                <Clock size={15} strokeWidth={2.6} />
              </BrandGlyph>
              เวลาจบลีกวันนี้
            </span>
            <span className={styles.statValue}>{countdown(nextReset(now, config.resetHour), now)}</span>
            <span className={styles.statSub}>แข่งไปแล้ว {state.played} นัด</span>
            <span className={styles.progress}>
              <span
                className={styles.progressFill}
                style={{ width: `${Math.min(100, (playedSlots / totalSlots) * 100)}%` }}
              />
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statHead}>รางวัลอันดับ 1</span>
            <span className={styles.rewardRow}>
              {topReward &&
                rewardEntries(topReward).map((entry) => (
                  <span key={entry.kind} className={styles.rewardItem}>
                    <img src={currencies[entry.kind].icon} alt="" />
                    <span className={styles.rewardAmount}>{formatCurrency(entry.amount)}</span>
                  </span>
                ))}
            </span>
          </div>
        </section>

        <section className={styles.board}>
          <header className={styles.boardHead}>
            <h2 className={styles.boardTitle}>
              <CalendarDays size={18} strokeWidth={2.6} /> ตารางการแข่งขันประจำวัน
            </h2>
            <span className={styles.boardDate}>
              <CalendarDays size={14} strokeWidth={2.4} />
              {seasonDate.toLocaleDateString('th-TH', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </header>

          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${hourFilter === 'all' ? styles.tabOn : ''}`}
              onClick={() => setHourFilter('all')}
            >
              ทีมเรา
            </button>
            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                className={`${styles.tab} ${hourFilter === hour ? styles.tabOn : ''}`}
                onClick={() => setHourFilter(hour)}
              >
                {String(hour).padStart(2, '0')}:00
              </button>
            ))}
          </div>

          <div className={styles.fixtures}>
            {shownFixtures.map((fixture) => (
              <div
                key={fixture.key}
                className={`${styles.fixture} ${fixture.isPlayer ? styles.fixtureYou : ''}`}
              >
                <span className={styles.fixtureTime}>{hhmm(fixture.at)}</span>

                <span className={styles.side}>
                  <img className={styles.sideBadge} src={avatarSrc(fixture.home?.avatarId ?? '')} alt="" />
                  <span className={styles.sideText}>
                    <span className={styles.sideName}>{fixture.home?.name ?? '—'}</span>
                    <span className={styles.sideRating}>OVR {fixture.home?.rating ?? 0}</span>
                  </span>
                </span>

                <span className={styles.vs}>{fixture.score ?? 'VS'}</span>

                <span className={styles.side}>
                  <img className={styles.sideBadge} src={avatarSrc(fixture.away?.avatarId ?? '')} alt="" />
                  <span className={styles.sideText}>
                    <span className={styles.sideName}>{fixture.away?.name ?? '—'}</span>
                    <span className={styles.sideRating}>OVR {fixture.away?.rating ?? 0}</span>
                  </span>
                </span>

                <span className={styles.fixtureReward}>
                  <span className={styles.fixtureLeague}>ลีกประจำวัน</span>
                  <span
                    className={`${styles.fixtureDelta} ${
                      fixture.score === null
                        ? styles.deltaIdle
                        : fixture.delta === null
                          ? styles.deltaFlat
                          : fixture.delta > 0
                            ? styles.deltaUp
                            : fixture.delta < 0
                              ? styles.deltaDown
                              : styles.deltaFlat
                    }`}
                  >
                    {fixture.score === null
                      ? 'ยังไม่แข่ง'
                      : fixture.delta === null
                        ? 'แข่งจบแล้ว'
                        : `${fixture.delta > 0 ? '+' : ''}${fixture.delta} ดาว`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ================= right column ================= */}
      <div className={styles.right}>
        <section className={styles.tablePanel}>
          {/* Static text again, so the plate art carries it. */}
          <h2 className={styles.tableTitle}>
            <BrandGlyph className={styles.tableTitleArt} file="league_title.png">
              <span className={styles.tableTitleFallback}>
                <Crown size={20} strokeWidth={2.4} className={styles.tableCrown} />
                ตารางคะแนนลีกประจำวัน
              </span>
            </BrandGlyph>
          </h2>

          <div className={styles.tableHead}>
            <span>#</span>
            <span />
            <span className={styles.colTeam}>ทีม</span>
            <span>OVR</span>
            <span>แข่ง</span>
            <span>ชนะ</span>
            <span>เสมอ</span>
            <span>แพ้</span>
            <span>ได้</span>
            <span>เสีย</span>
            <span>ต่าง</span>
            <span className={styles.colPoints}>ดาว</span>
          </div>

          <div className={styles.tableBody}>
            {rows.map((row, index) => {
              const diff = row.record.goalsFor - row.record.goalsAgainst;
              return (
                <div
                  key={row.id}
                  className={`${styles.tableRow} ${row.isPlayer ? styles.tableRowYou : ''} ${
                    index === 0 ? styles.tableRowTop : ''
                  }`}
                >
                  <span className={styles.pos}>{index + 1}</span>
                  <img className={styles.rowBadge} src={avatarSrc(row.avatarId)} alt="" />
                  <span className={`${styles.colTeam} ${styles.rowName}`}>{row.name}</span>
                  <span className={styles.rowRating}>OVR {row.rating}</span>
                  <span>{row.record.played}</span>
                  <span>{row.record.won}</span>
                  <span>{row.record.drawn}</span>
                  <span>{row.record.lost}</span>
                  <span>{row.record.goalsFor}</span>
                  <span>{row.record.goalsAgainst}</span>
                  <span>{diff > 0 ? `+${diff}` : diff}</span>
                  <span className={styles.colPoints}>{row.stars}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.footerStrip}>
          <span className={styles.footerText}>ทุกวันคือโอกาสใหม่ สู่การเป็นตำนาน</span>
          <span className={styles.footerBrand}>
            <Star size={20} strokeWidth={2.6} />
            FC ALL-STAR
          </span>
        </section>
      </div>

      <LeagueResultDialog />
    </div>
  );
}

/** The 06:00 summary. Split out so the screen above stays about layout. */
function LeagueResultDialog() {
  const { state, dismissResult } = useLeague();
  const pending = state.pending;
  if (!pending) return null;

  return (
    <div className={styles.resultScreen} role="dialog" aria-modal="true">
      <div className={styles.resultBackdrop} onClick={dismissResult} />
      <div className={styles.result}>
        <BrandGlyph className={styles.trophyArt} file="league_trophy.png">
          <Crown size={44} strokeWidth={2.2} className={styles.trophy} />
        </BrandGlyph>
        <h2 className={styles.resultTitle}>สรุปผลวันที่ {pending.seasonId}</h2>
        <p className={styles.resultRank}>
          อันดับ {pending.rank} · {pending.stars} ดาว · {pending.played} นัด
        </p>

        <div className={styles.resultRewards}>
          {pending.rewards.map((entry) => (
            <span key={entry.kind} className={styles.resultReward}>
              <img src={currencies[entry.kind].icon} alt="" />
              {formatCurrency(entry.amount)}
            </span>
          ))}
          {pending.rewards.length === 0 && <span className={styles.resultReward}>ไม่ได้รับรางวัล</span>}
        </div>

        <p className={styles.resultNote}>รางวัลถูกโอนเข้ากระเป๋าให้แล้ว</p>
        <button type="button" className={styles.resultClose} onClick={dismissResult}>
          รับทราบ
        </button>
      </div>
    </div>
  );
}
