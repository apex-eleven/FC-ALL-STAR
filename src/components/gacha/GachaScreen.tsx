import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { ASSETS } from '@/assets/assetMap';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { avatarSource } from '@/features/avatars/extraAvatars';
import { formatCurrency } from '@/features/currencies/constants';
import { RARITY_COLOR, RARITY_LABEL } from '@/features/gacha/constants';
import { livePrizes, percentOf } from '@/features/gacha/gacha';
import { useGacha } from '@/features/gacha/GachaContext';
import type { GachaPrize } from '@/features/gacha/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
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
/** Matches the CSS transition on the strip. */
const SPIN_MS = 5200;

interface Toast {
  id: number;
  text: string;
  bad: boolean;
  /** Rarity colour of the win, for the bar's edge. */
  color: string;
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
  const { config, state, feed, refreshFeed, spinOnce } = useGacha();
  const view = useRewardView();
  const [reel, setReel] = useState<GachaPrize[]>([]);
  const [offset, setOffset] = useState(REST_OFFSET);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<GachaPrize | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // Read by the refill effect, which must not fire while the reel is running.
  const spinningRef = useRef(false);
  spinningRef.current = spinning;

  const prizes = useMemo(() => livePrizes(config), [config]);
  const keys = account.wallet.key;
  const cost = config.keyCost;

  useEffect(() => {
    refreshFeed();
  }, [refreshFeed]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

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
   * The resting strip, built once and rebuilt only when the admin changes the prize
   * list. Deliberately not rebuilt when a spin ends: the strip is left exactly where
   * it stopped, so the card under the frame stays the one that was won.
   */
  useEffect(() => {
    if (spinningRef.current || prizes.length === 0) return;
    setReel(filler(REEL_LENGTH));
    setOffset(REST_OFFSET);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.prizes.length]);

  function tell(text: string, bad: boolean, color = '#ffffff') {
    setToast({ id: Date.now(), text, bad, color });
  }

  function start() {
    if (spinning) return;
    // The names live in the catalogues this screen reads, so the feature is handed a
    // namer rather than reaching for them itself.
    const result = spinOnce((reward) => view(reward).label);
    if (!result.ok || !result.prize) {
      tell(ERROR[result.error ?? ''] ?? 'หมุนไม่สำเร็จ', true);
      return;
    }

    // The prize is already paid and filed; the reel only shows what happened.
    const strip = filler(REEL_LENGTH);
    strip[WINNER_INDEX] = result.prize;

    // Park the strip back at the rest position with the transition off, and make the
    // browser actually lay it out there before the run starts.
    //
    // A transition runs between two styles the browser has computed. The second spin
    // ends where the first one did, so without this flush the browser never sees the
    // rest position: it compares the old stopping point with the new one, finds the
    // same transform, and animates nothing — the reel stands still for five seconds
    // and then the prize appears. flushSync commits the rest position; reading a
    // layout property forces it to be computed; only then does the run begin.
    flushSync(() => {
      setReel(strip);
      setWon(null);
      setSpinning(false);
      setOffset(REST_OFFSET);
    });
    void stripRef.current?.getBoundingClientRect().left;

    setSpinning(true);
    setOffset(FRAME_LEFT - WINNER_INDEX * PITCH);

    timer.current = window.setTimeout(() => {
      setSpinning(false);
      setWon(result.prize);
      const prize = result.prize!;
      const shown = view(prize.reward);
      tell(`ได้รับ ${prize.name.trim() || shown.label} · ${shown.count}`, false, RARITY_COLOR[prize.rarity]);
      refreshFeed();
    }, SPIN_MS);
  }

  function card(prize: GachaPrize, index: number) {
    const shown = view(prize.reward);
    const middle = spinning ? false : index === WINNER_INDEX && won !== null;
    return (
      <div
        key={`${prize.id}-${index}`}
        className={`${styles.card} ${middle ? styles.cardWon : ''}`}
        style={{ left: index * PITCH }}
        title={`${prize.name.trim() || shown.label} · ${percentOf(config, prize).toFixed(2)}%`}
      >
        <span className={styles.art}>
          <img
            className={shown.isCard ? styles.cardArt : styles.coinArt}
            src={shown.icon}
            alt=""
            draggable={false}
          />
        </span>
        <span className={styles.cardName}>{prize.name.trim() || shown.label}</span>
        <span className={styles.cardKind}>
          {RARITY_LABEL[prize.rarity]} · {shown.count}
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

      {prizes.length === 0 ? (
        <p className={styles.closed}>ยังไม่ได้ตั้งรางวัลกาชาปอง</p>
      ) : (
        <>
          <div className={styles.reel}>
            <div
              ref={stripRef}
              className={styles.strip}
              style={{
                transform: `translateX(${offset}px)`,
                transitionDuration: spinning ? `${SPIN_MS}ms` : '0ms',
              }}
            >
              {reel.map((prize, index) => card(prize, index))}
            </div>
            <div className={styles.frame} aria-hidden="true" />
            <div className={styles.fadeLeft} aria-hidden="true" />
            <div className={styles.fadeRight} aria-hidden="true" />
          </div>

          <div className={styles.actions}>
            {spinning ? (
              <span className={styles.opening}>
                <Loader2 className={styles.spinner} size={28} strokeWidth={2.6} />
                OPENING CASE…
              </span>
            ) : (
              <button
                type="button"
                className={styles.spin}
                disabled={!config.enabled || keys < cost}
                onClick={start}
              >
                <img src={currencies.key.icon} alt="" />
                หมุน 1 ครั้ง · กุญแจ {formatCurrency(cost)}
              </button>
            )}
          </div>
        </>
      )}

      <aside className={styles.feed} aria-label="ประกาศรายชื่อคนที่ได้ไอเท็ม">
        <span className={styles.feedTitle}>รายชื่อคนที่ได้รางวัล</span>
        {feed === null && <span className={styles.feedEmpty}>กำลังโหลด…</span>}
        {feed !== null && feed.length === 0 && (
          <span className={styles.feedEmpty}>ยังไม่มีใครได้รางวัลใหญ่</span>
        )}
        {(feed ?? []).slice(0, 3).map((row, index) => (
          <div key={`${row.uid}-${row.at}-${index}`} className={styles.feedRow}>
            <span className={styles.feedBand} style={{ background: RARITY_COLOR[row.rarity] }} />
            <img className={styles.feedAvatar} src={avatarSource(row.avatarId)} alt="" />
            <span className={styles.feedText}>
              <b>{row.username}</b>
              <small>{row.prize}</small>
            </span>
          </div>
        ))}
      </aside>

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
