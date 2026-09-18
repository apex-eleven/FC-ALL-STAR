import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { ASSETS } from '@/assets/assetMap';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { avatarSource } from '@/features/avatars/extraAvatars';
import type { GachaFeedRow } from '@/features/cloud/cloudGachaFeed';
import { formatCurrency } from '@/features/currencies/constants';
import { RARITY_COLOR, RARITY_LABEL, SPIN_COUNTS } from '@/features/gacha/constants';
import { livePrizes, percentOf } from '@/features/gacha/gacha';
import { animates } from '@/features/motion/motion';
import { useGacha } from '@/features/gacha/GachaContext';
import { GACHA_RARITIES, type GachaPrize, type GachaWin } from '@/features/gacha/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useSound } from '@/features/sound/SoundContext';
import useRewardView from '@/components/shop/useRewardView';
import styles from './GachaScreen.module.css';

/**
 * Reel geometry in design pixels, measured off the reference (882 px wide capture,
 * ×2.322 to the 2048 stage): cards 232 wide on a 239 pitch, the frame at the centre.
 */
const CARD_W = 232;
const PITCH = 239;
const CENTER = 1024;
/** Left edge of the centre frame, which the winning card has to land on. */
const FRAME_LEFT = CENTER - CARD_W / 2;
/** Where the strip sits while nothing is spinning: a card squarely in the frame. */
const REST_OFFSET = FRAME_LEFT - 3 * PITCH;
/** Cards in the strip, and where the winner sits — long enough to look like a spin. */
const REEL_LENGTH = 56;
const WINNER_INDEX = 48;
/**
 * Shorter strips when several rows run at once: ten rows of fifty-six cards is five
 * hundred cards of DOM, and twenty-four is still 5,700 px of travel.
 */
const MULTI_LENGTH = 30;
const MULTI_WINNER = 24;
/** The band the rows share when there are several: under the title, above the button. */
const ROWS_TOP = 206;
const ROWS_BOTTOM = 782;
/** One row keeps the reference's own geometry. */
const SINGLE_TOP = 506;
const SINGLE_HEIGHT = 260;

interface Rows {
  top: number;
  height: number;
  gap: number;
}

/** Where `count` rows sit, spread over the band and centred in it. */
function rowLayout(count: number): Rows {
  if (count <= 1) return { top: SINGLE_TOP, height: SINGLE_HEIGHT, gap: 0 };
  const gap = count > 5 ? 4 : 8;
  const height = Math.floor((ROWS_BOTTOM - ROWS_TOP - (count - 1) * gap) / count);
  const used = height * count + (count - 1) * gap;
  return {
    top: ROWS_TOP + Math.floor((ROWS_BOTTOM - ROWS_TOP - used) / 2),
    height,
    gap,
  };
}
/** Matches the CSS transition on the strip. */
const SPIN_MS = 5200;
/**
 * A multi-spin: every row leaves at once and they land one after another, so the
 * prizes arrive one at a time instead of all at the same instant. The first row runs
 * for MULTI_SPIN_MS and each row after it runs STAGGER_MS longer — ten rows take
 * 3.8s + 9 × 0.36s ≈ 7s from the press to the last card.
 */
const MULTI_SPIN_MS = 3800;
const STAGGER_MS = 360;
/**
 * The wait when animations are switched off (settings menu, or the device's own
 * reduce-motion setting). The strip cannot travel, so waiting five seconds would be
 * five seconds of a still screen; long enough to read as "opening", no longer.
 */
const STILL_MS = 600;

interface Toast {
  id: number;
  text: string;
  bad: boolean;
  /** Rarity colour of the win, for the bar's edge. */
  color: string;
}

/** "17/9 19:53" — short enough for the history row, still says which day. */
function stamped(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return '';
  return `${when.getDate()}/${when.getMonth() + 1} ${String(when.getHours()).padStart(2, '0')}:${String(
    when.getMinutes(),
  ).padStart(2, '0')}`;
}

/** The best prize of a batch: the one the reel stops on. */
function headline(prizes: readonly GachaPrize[]): GachaPrize | null {
  return prizes.reduce<GachaPrize | null>(
    (best, prize) =>
      best === null || GACHA_RARITIES.indexOf(prize.rarity) > GACHA_RARITIES.indexOf(best.rarity)
        ? prize
        : best,
    null,
  );
}

const ERROR: Record<string, string> = {
  closed: 'กาชาปองปิดอยู่',
  empty: 'ยังไม่ได้ตั้งรางวัล ติดต่อแอดมิน',
  'no-keys': 'กุญแจไม่พอ',
  'at-cap': 'ยอดเงินเต็มแล้ว รับรางวัลเพิ่มไม่ได้',
  'club-full': 'คลังนักเตะเต็ม รับการ์ดเพิ่มไม่ได้',
  'card-missing': 'การ์ดของรางวัลนี้ไม่มีแล้ว ติดต่อแอดมิน',
};

/** กาชาปอง — a roulette of prizes opened with keys. */
export default function GachaScreen() {
  const account = useAccount();
  const { back } = useNavigation();
  const { config, state, feed, refreshFeed, spin } = useGacha();
  const { play, reel, hushReel } = useSound();
  const view = useRewardView();
  /** One strip per row — five rows for x5, ten for x10, all running together. */
  const [lanes, setLanes] = useState<GachaPrize[][]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [spinning, setSpinning] = useState(false);
  /** How long the first row runs, and how much longer each row after it. */
  const [runMs, setRunMs] = useState(SPIN_MS);
  const [stagger, setStagger] = useState(0);
  /** How many rows have stopped: a row's prize lights up as that row lands. */
  const [landed, setLanded] = useState(0);
  /** How many spins one press buys, and the prizes of the last multi-spin. */
  const [count, setCount] = useState(SPIN_COUNTS[0] ?? 1);
  const [results, setResults] = useState<{
    prizes: GachaPrize[];
    asked: number;
    error: string;
  } | null>(null);
  /** The rows on screen now — the chosen count, or what a stopped-short batch paid. */
  const [shown, setShown] = useState(1);
  const [toast, setToast] = useState<Toast | null>(null);
  /**
   * The two lists as they looked when the spin started, held until the reel stops.
   *
   * The prize is paid, filed and announced the moment the button is pressed — five
   * seconds before the strip stops. Left live, both lists would name the prize while
   * it is still travelling, and nobody would watch the reel again.
   */
  const [frozen, setFrozen] = useState<{
    history: GachaWin[];
    feed: GachaFeedRow[] | null;
  } | null>(null);
  // One timer per row, plus the one that ends the run.
  const timers = useRef<number[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);
  // Read by the refill effect, which must not fire while the reel is running.
  const spinningRef = useRef(false);
  spinningRef.current = spinning;

  const prizes = useMemo(() => livePrizes(config), [config]);
  const history = frozen ? frozen.history : state.history;
  const winners = frozen ? frozen.feed : feed;
  const keys = account.wallet.key;
  const cost = config.keyCost * count;
  const rows = rowLayout(shown);
  const laneWinner = shown > 1 ? MULTI_WINNER : WINNER_INDEX;

  useEffect(() => {
    refreshFeed();
  }, [refreshFeed]);

  function clearTimers() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    // The reel's ticking is scheduled for the whole run in one go, so it outlives its
    // timers: a run cut short has to be silenced, not just left to finish.
    hushReel();
  }

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

  /**
   * The cards the reel is filled with: the prize list shuffled and repeated, not rolled
   * against the odds. A weighted strip clumps — five commons in a row — and the reel is
   * decoration; the prize was already decided by `spin`.
   */
  const filler = useCallback(
    (length: number): GachaPrize[] => {
      if (prizes.length === 0) return [];
      const strip: GachaPrize[] = [];
      while (strip.length < length) {
        strip.push(...[...prizes].sort(() => Math.random() - 0.5));
      }
      return strip.slice(0, length);
    },
    [prizes],
  );

  /**
   * The resting rows: one strip each, rebuilt when the player changes how many spins
   * to buy or the admin changes the prize list. Deliberately not rebuilt when a run
   * ends — the strips are left exactly where they stopped, so the cards under the
   * frames stay the ones that were won.
   */
  useEffect(() => {
    if (spinningRef.current || prizes.length === 0) return;
    const length = count > 1 ? MULTI_LENGTH : REEL_LENGTH;
    setShown(count);
    setLanded(0);
    setLanes(Array.from({ length: count }, () => filler(length)));
    setOffsets(Array.from({ length: count }, () => REST_OFFSET));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, config.prizes.length]);

  function tell(text: string, bad: boolean, color = '#ffffff') {
    setToast({ id: Date.now(), text, bad, color });
  }

  function start() {
    if (spinning) return;
    // The names live in the catalogues this screen reads, so the feature is handed a
    // namer rather than reaching for them itself.
    const result = spin(count, (reward) => view(reward).label);
    const top = headline(result.prizes);
    if (!result.ok || !top) {
      tell(ERROR[result.error ?? ''] ?? 'หมุนไม่สำเร็จ', true);
      return;
    }

    // The prize is already paid and filed; the reel only shows what happened. Both
    // lists are pinned to what they were a moment ago, so neither gives it away.
    setFrozen({ history: state.history, feed });

    // One row per spin, each with its own strip and its own prize, all running at
    // once — five rows for x5, ten for x10. A row per spin taken in turn would be
    // nearly a minute of watching for ten.
    const many = result.prizes.length > 1;
    const length = many ? MULTI_LENGTH : REEL_LENGTH;
    const winner = many ? MULTI_WINNER : WINNER_INDEX;
    const strips = result.prizes.map((prize) => {
      const strip = filler(length);
      strip[winner] = prize;
      return strip;
    });

    // Park the strip back at the rest position with the transition off, and make the
    // browser actually lay it out there before the run starts.
    //
    // A transition runs between two styles the browser has computed. The second spin
    // ends where the first one did, so without this flush the browser never sees the
    // rest position: it compares the old stopping point with the new one, finds the
    // same transform, and animates nothing — the reel stands still for five seconds
    // and then the prize appears. flushSync commits the rest position; reading a
    // layout property forces it to be computed; only then does the run begin.
    clearTimers();
    flushSync(() => {
      setShown(result.prizes.length);
      setLanes(strips);
      setLanded(0);
      setSpinning(false);
      setOffsets(strips.map(() => REST_OFFSET));
    });
    void stripRef.current?.getBoundingClientRect().left;

    // A device with reduce-motion on (battery saver, "animation effects off") stills
    // every transition in the app, so the strips would jump and the screen would then
    // sit there. The wait follows what the page can actually show, and there is
    // nothing to draw out when nothing moves — no stagger either.
    const moving = animates();
    const travel = moving ? (many ? MULTI_SPIN_MS : SPIN_MS) : STILL_MS;
    const step = moving && many ? STAGGER_MS : 0;
    setRunMs(travel);
    setStagger(step);
    setSpinning(true);
    setOffsets(strips.map(() => FRAME_LEFT - winner * PITCH));

    // One tick track for the whole screen, not one per row: ten rows ticking over
    // each other is noise, and they all leave together anyway.
    //
    // It follows the first row. The rows share an easing but not a duration, so a
    // track stretched over the last row to stop would match none of them — and the
    // rows that land after it have their own sound as they arrive.
    if (moving) reel(travel, winner);

    // Each row lights its own prize as it lands, so a x10 arrives row by row.
    strips.forEach((_, row) => {
      timers.current.push(
        window.setTimeout(
          () => {
            setLanded((done) => Math.max(done, row + 1));
            play('land');
          },
          travel + row * step,
        ),
      );
    });

    const last = travel + step * (strips.length - 1);
    timers.current.push(
      window.setTimeout(() => {
        setSpinning(false);
        setFrozen(null);
        const best = view(top.reward);
        const name = top.name.trim() || best.label;
        tell(
          many
            ? `ได้รับ ${result.prizes.length} ชิ้น · ดีสุด ${name}`
            : `ได้รับ ${name} · ${best.count}`,
          false,
          RARITY_COLOR[top.rarity],
        );
        // The rows show every prize, so the panel is only for a batch that stopped
        // short: what it managed to pay, and why it stopped.
        if (result.error) {
          setResults({
            prizes: result.prizes,
            asked: count,
            error: ERROR[result.error] ?? '',
          });
        }
        refreshFeed();
      }, last),
    );
  }

  /**
   * One card on a strip. Rows get shorter as they get more numerous, so the card has
   * three shapes: the full one, a shorter one, and a single line for ten rows.
   */
  function card(prize: GachaPrize, index: number, row: number) {
    const seen = view(prize.reward);
    // This row's prize lights up when this row has landed, not when the last has.
    const middle = index === laneWinner && row < landed;
    const size = rows.height >= 200 ? '' : rows.height >= 92 ? styles.cardMid : styles.cardSmall;
    const name = prize.name.trim() || seen.label;
    return (
      <div
        key={`${prize.id}-${index}`}
        className={`${styles.card} ${size} ${middle ? styles.cardWon : ''}`}
        style={{ left: index * PITCH }}
        title={`${name} · ${percentOf(config, prize).toFixed(2)}%`}
      >
        <span className={styles.art}>
          <img
            className={seen.isCard ? styles.cardArt : styles.coinArt}
            src={seen.icon}
            alt=""
            draggable={false}
          />
        </span>
        <span className={styles.cardName}>{name}</span>
        <span className={styles.cardKind}>
          {size === styles.cardSmall ? seen.count : `${RARITY_LABEL[prize.rarity]} · ${seen.count}`}
        </span>
        <span className={styles.band} style={{ background: RARITY_COLOR[prize.rarity] }} />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />
      <div className={styles.stars} />

      <button type="button" className={styles.close} onClick={back} aria-label="ปิด">
        <X size={38} strokeWidth={2.6} />
      </button>

      <header className={styles.head}>
        <span className={styles.brand}>FC ALL-STAR</span>
        {config.caseName && <span className={styles.event}>{config.caseName}</span>}
        <h1 className={styles.title}>{config.title || 'GACHAPON'}</h1>
        {config.subtitle && <span className={styles.subtitle}>{config.subtitle}</span>}
      </header>

      <div className={styles.counters}>
        <div className={styles.counter}>
          <span className={styles.counterLabel}>SPIN</span>
          <span className={styles.counterValue}>{formatCurrency(state.spins)}</span>
        </div>
        <div className={styles.counter}>
          <span className={styles.counterLabel}>KEY</span>
          <span className={styles.counterValue}>
            <img src={currencies.key.icon} alt="" />
            {formatCurrency(keys)}
          </span>
        </div>
      </div>

      {/* The rows of a multi-spin take the whole stage, so the case steps aside. */}
      {shown <= 1 && (
        <div className={styles.case}>
          <img
            className={styles.caseArt}
            src={config.caseImage || ASSETS.brand.gachaCase}
            alt=""
            draggable={false}
          />
          <span className={styles.caseTag}>FC 2.0</span>
          <span className={styles.caseName}>{config.caseName || 'ALL-STAR CASE'}</span>
        </div>
      )}

      {prizes.length === 0 ? (
        <p className={styles.closed}>ยังไม่ได้ตั้งรางวัลกาชาปอง</p>
      ) : (
        <>
          {lanes.map((strip, row) => (
            <div
              key={row}
              className={styles.reel}
              style={{
                top: rows.top + row * (rows.height + rows.gap),
                height: rows.height,
              }}
            >
              <div
                ref={row === 0 ? stripRef : undefined}
                className={styles.strip}
                style={{
                  transform: `translateX(${offsets[row] ?? REST_OFFSET}px)`,
                  // Rows leave together and land one after another.
                  transitionDuration: spinning ? `${runMs + row * stagger}ms` : '0ms',
                }}
              >
                {strip.map((prize, index) => card(prize, index, row))}
              </div>
              <div className={styles.frame} aria-hidden="true" />
              <div className={styles.fadeLeft} aria-hidden="true" />
              <div className={styles.fadeRight} aria-hidden="true" />
            </div>
          ))}

          <div className={styles.actions}>
            {spinning ? (
              <span className={styles.opening}>
                <Loader2 className={styles.spinner} size={28} strokeWidth={2.6} />
                OPENING CASE…
              </span>
            ) : (
              <>
                {SPIN_COUNTS.length > 1 && (
                  <div className={styles.counts} role="group" aria-label="จำนวนครั้งที่หมุน">
                    {SPIN_COUNTS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={count === option}
                        className={`${styles.countPick} ${count === option ? styles.countOn : ''}`}
                        onClick={() => setCount(option)}
                      >
                        x{option}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className={styles.spin}
                  disabled={!config.enabled || keys < cost}
                  onClick={start}
                >
                  <img src={currencies.key.icon} alt="" />
                  หมุน {count} ครั้ง · กุญแจ {formatCurrency(cost)}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* The side panels step aside for the rows of a multi-spin, same as the case. */}
      {shown <= 1 && (
        <>
          <aside className={styles.history} aria-label="ประวัติของที่เคยได้รับ">
            <span className={styles.feedTitle}>ของที่เคยได้ ({history.length})</span>
            {history.length === 0 ? (
              <span className={styles.feedEmpty}>ยังไม่เคยหมุน</span>
            ) : (
              <div className={styles.historyList}>
                {history.map((win) => (
                  <div key={win.id} className={styles.historyRow} title={RARITY_LABEL[win.rarity]}>
                    <span
                      className={styles.feedBand}
                      style={{ background: RARITY_COLOR[win.rarity] }}
                    />
                    <span className={styles.historyName}>{win.name}</span>
                    <span className={styles.historyWhen}>{stamped(win.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <aside className={styles.feed} aria-label="ประกาศรายชื่อคนที่ได้ไอเท็ม">
            <span className={styles.feedTitle}>รายชื่อคนที่ได้รางวัล</span>
            {winners === null && <span className={styles.feedEmpty}>กำลังโหลด…</span>}
            {winners !== null && winners.length === 0 && (
              <span className={styles.feedEmpty}>ยังไม่มีใครได้รางวัลใหญ่</span>
            )}
            {(winners ?? []).slice(0, 3).map((row, index) => (
              <div key={`${row.uid}-${row.at}-${index}`} className={styles.feedRow}>
                <span
                  className={styles.feedBand}
                  style={{ background: RARITY_COLOR[row.rarity] }}
                />
                <img className={styles.feedAvatar} src={avatarSource(row.avatarId)} alt="" />
                <span className={styles.feedText}>
                  <b>{row.username}</b>
                  <small>{row.prize}</small>
                </span>
              </div>
            ))}
          </aside>
        </>
      )}

      {results && (
        <div className={styles.resultsBack} onClick={() => setResults(null)}>
          <div
            className={styles.results}
            role="dialog"
            aria-label="ผลการหมุน"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={styles.resultsTitle}>
              ได้รับทั้งหมด {results.prizes.length} ชิ้น
              {results.prizes.length < results.asked ? ` จาก ${results.asked} ครั้ง` : ''}
            </span>
            {results.error && (
              <span className={styles.resultsWarn}>หยุดก่อนครบ — {results.error}</span>
            )}
            <div className={styles.resultsGrid}>
              {results.prizes.map((prize, index) => {
                const shown = view(prize.reward);
                return (
                  <div key={`${prize.id}-${index}`} className={styles.result}>
                    <img
                      className={shown.isCard ? styles.resultCardArt : styles.resultArt}
                      src={shown.icon}
                      alt=""
                      draggable={false}
                    />
                    <span className={styles.resultName}>{prize.name.trim() || shown.label}</span>
                    <span className={styles.resultKind}>{shown.count}</span>
                    <span
                      className={styles.band}
                      style={{ background: RARITY_COLOR[prize.rarity] }}
                    />
                  </div>
                );
              })}
            </div>
            <button type="button" className={styles.resultsClose} onClick={() => setResults(null)}>
              ตกลง
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.id}
          className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`}
          style={toast.bad ? undefined : { borderColor: toast.color }}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
