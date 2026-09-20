import { useMemo, useState } from 'react';
import { Lock, LockOpen, X } from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import type { OwnedPlayer } from '@/features/club/types';
import { RARITY_COLOR, RARITY_LABEL } from '@/features/fusion/constants';
import { useFusion } from '@/features/fusion/FusionContext';
import { livePrizes, materialBlock, type MaterialBlock } from '@/features/fusion/fusion';
import type { FusionError, FusionPick } from '@/features/fusion/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { ratingWithPlus } from '@/features/rankup/plus';
import { useSound } from '@/features/sound/SoundContext';
import { useTransfer } from '@/features/transfers/TransferContext';
import SquadCard from '@/components/club/SquadCard';
import useRewardView from '@/components/shop/useRewardView';
import styles from './FusionScreen.module.css';

/**
 * ผสมการ์ด — the fusion bench.
 *
 * Two states, never both: the bench, where cards are chosen and burned, and the hand,
 * where one of the dealt cards is turned over. The hand wins whenever there is one,
 * including on a fresh load — the cards are already spent by then, so the choice has
 * to be honoured before anything else can be started.
 */

const ERROR_TEXT: Record<FusionError, string> = {
  closed: 'ตอนนี้ปิดปรับปรุงอยู่',
  empty: 'ยังไม่มีรางวัลในระบบ',
  pending: 'ยังมีการ์ดค้างอยู่บนโต๊ะ เลือกให้เสร็จก่อน',
  'need-materials': 'เลือกการ์ดให้ครบก่อน',
  'bad-material': 'มีการ์ดที่ใช้เป็นวัตถุดิบไม่ได้',
  'locked-material': 'มีการ์ดที่ล็อคไว้อยู่ ปลดล็อคก่อนถึงจะใช้ได้',
  'no-offer': 'ไม่มีการ์ดบนโต๊ะแล้ว',
  'bad-pick': 'เลือกไม่ได้',
  'club-full': 'สโมสรเต็ม ต้องมีที่ว่างก่อน',
  'card-missing': 'รางวัลนี้หาไม่เจอแล้ว ลองใบอื่น',
  'at-cap': 'กระเป๋าเงินเต็มแล้ว',
};

const BLOCK_TEXT: Record<Exclude<MaterialBlock, null>, string> = {
  lineup: 'อยู่ในทีม',
  locked: 'ล็อคอยู่',
  'not-accepted': 'ใช้ไม่ได้',
};

export default function FusionScreen() {
  const { navigate } = useNavigation();
  const account = useAccount();
  const { config, state, fuse, take } = useFusion();
  const { toggleLock } = useTransfer();
  const view = useRewardView();
  const { play } = useSound();

  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<FusionError | null>(null);
  /** Which card of the hand was turned over. null = all still face down. */
  const [turned, setTurned] = useState<number | null>(null);
  const [kept, setKept] = useState<FusionPick | null>(null);

  const need = Math.max(1, Math.floor(config.materials));
  const hand = state.pending;
  const locked = useMemo(() => new Set(account.transfer?.locked ?? []), [account.transfer?.locked]);

  /**
   * Every owned card with the reason it cannot be used, sorted so the usable ones
   * come first — a bench that opens on a wall of greyed-out cards reads as broken.
   */
  const bench = useMemo<{ card: OwnedPlayer; block: MaterialBlock }[]>(() => {
    const rows = account.club.players.map((card) => ({
      card,
      block: materialBlock(card, account, config),
    }));
    return rows.sort((a, b) => {
      if ((a.block === null) !== (b.block === null)) return a.block === null ? -1 : 1;
      return ratingWithPlus(b.card) - ratingWithPlus(a.card);
    });
  }, [account, config]);

  const poolEmpty = livePrizes(config).length === 0;

  const toggle = (card: OwnedPlayer, block: MaterialBlock) => {
    if (block !== null) return;
    setError(null);
    setChosen((current) => {
      if (current.includes(card.id)) return current.filter((id) => id !== card.id);
      if (current.length >= need) return current;
      return [...current, card.id];
    });
  };

  const startFusion = () => {
    const result = fuse(chosen, (reward) => view(reward).label);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    play('click');
    setChosen([]);
    setError(null);
    setTurned(null);
    setKept(null);
  };

  const turnOver = (index: number) => {
    if (turned !== null) return;
    const result = take(index);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    play('land');
    setTurned(index);
    setKept(result.pick);
  };

  /* ── the hand on the table ────────────────────────────── */

  if (hand || kept) {
    const picks = hand?.picks ?? [];
    return (
      <div className={styles.screen}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{config.title}</h1>
            <p className={styles.subtitle}>
              {kept ? 'เก็บใบนี้เรียบร้อย' : `เลือกได้ใบเดียวจาก ${picks.length} ใบ`}
            </p>
          </div>
          {kept ? (
            <button type="button" className={styles.close} onClick={() => setKept(null)}>
              <X size={22} strokeWidth={2.4} />
            </button>
          ) : null}
        </header>

        {error ? <p className={styles.error}>{ERROR_TEXT[error]}</p> : null}

        <div className={styles.hand}>
          {picks.map((pick, index) => {
            const open = turned === index;
            const detail = view(pick.reward);
            return (
              <button
                type="button"
                key={`${pick.prizeId}-${index}`}
                className={`${styles.slot} ${open ? styles.slotOpen : ''} ${
                  turned !== null && !open ? styles.slotFaded : ''
                }`}
                style={{ '--tone': RARITY_COLOR[pick.rarity] } as React.CSSProperties}
                onClick={() => turnOver(index)}
                disabled={turned !== null}
              >
                {open ? (
                  <>
                    <img className={styles.slotArt} src={detail.icon} alt="" />
                    <span className={styles.slotName}>{pick.name}</span>
                    <span className={styles.slotCount}>{detail.count}</span>
                    <span className={styles.slotRarity}>{RARITY_LABEL[pick.rarity]}</span>
                  </>
                ) : (
                  <span className={styles.slotBack}>?</span>
                )}
              </button>
            );
          })}
        </div>

        {kept ? (
          <div className={styles.result}>
            <p className={styles.resultLine}>ได้รับ {view(kept.reward).text}</p>
            <button type="button" className={styles.again} onClick={() => setKept(null)}>
              ผสมอีกครั้ง
            </button>
          </div>
        ) : (
          <p className={styles.hint}>แตะการ์ดที่ต้องการ — ใบที่เหลือจะหายไป</p>
        )}
      </div>
    );
  }

  /* ── the bench ────────────────────────────────────────── */

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{config.title}</h1>
          <p className={styles.subtitle}>{config.subtitle}</p>
        </div>
        <button type="button" className={styles.close} onClick={() => navigate('home')}>
          <X size={22} strokeWidth={2.4} />
        </button>
      </header>

      <div className={styles.status}>
        <span className={styles.counter}>
          เลือกแล้ว {chosen.length} / {need}
        </span>
        <button
          type="button"
          className={styles.fuse}
          onClick={startFusion}
          disabled={chosen.length < need || poolEmpty || !config.enabled}
        >
          ผสมการ์ด
        </button>
      </div>

      {poolEmpty ? <p className={styles.error}>{ERROR_TEXT.empty}</p> : null}
      {error ? <p className={styles.error}>{ERROR_TEXT[error]}</p> : null}

      <div className={styles.grid}>
        {bench.map(({ card, block }) => {
          const picked = chosen.includes(card.id);
          const isLocked = locked.has(card.id);
          return (
            <div
              key={card.id}
              className={`${styles.cell} ${picked ? styles.cellPicked : ''} ${
                block !== null ? styles.cellBlocked : ''
              }`}
            >
              <button
                type="button"
                className={styles.cardButton}
                onClick={() => toggle(card, block)}
                disabled={block !== null}
              >
                <SquadCard player={card} scale={0.62} interactive={false} />
              </button>

              {block !== null ? <span className={styles.badge}>{BLOCK_TEXT[block]}</span> : null}

              {/*
                The same lock that stops a card being sold. Kept on the card here so a
                player can protect something the moment they notice it in the list,
                instead of leaving and coming back through the signing market.
              */}
              <button
                type="button"
                className={`${styles.lock} ${isLocked ? styles.lockOn : ''}`}
                onClick={() => toggleLock(card.id)}
                aria-label={isLocked ? 'ปลดล็อคการ์ด' : 'ล็อคการ์ด'}
                title={isLocked ? 'ปลดล็อคการ์ด' : 'ล็อคการ์ดไม่ให้ถูกใช้หรือขาย'}
              >
                {isLocked ? <Lock size={14} strokeWidth={2.6} /> : <LockOpen size={14} strokeWidth={2.2} />}
              </button>
            </div>
          );
        })}
      </div>

      {bench.length === 0 ? <p className={styles.empty}>ยังไม่มีการ์ดในสโมสร</p> : null}
    </div>
  );
}
