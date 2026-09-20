import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Layers,
  Lock,
  LockOpen,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import type { OwnedPlayer } from '@/features/club/types';
import { RARITY_COLOR, RARITY_LABEL } from '@/features/fusion/constants';
import { useFusion } from '@/features/fusion/FusionContext';
import { livePrizes, materialBlock, type MaterialBlock } from '@/features/fusion/fusion';
import { FUSION_RARITIES, type FusionError, type FusionPick } from '@/features/fusion/types';
import { animates } from '@/features/motion/motion';
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

/** The left rail's filters. Each one answers a question a player actually asks. */
type BenchTab = 'all' | 'usable' | 'locked';

const TAB_LABEL: Record<BenchTab, string> = {
  all: 'การ์ดทั้งหมด',
  usable: 'ใช้ได้',
  locked: 'ล็อคไว้',
};

type BenchSort = 'ovr' | 'plus' | 'new';

const SORT_LABEL: Record<BenchSort, string> = {
  ovr: 'ค่า OVR สูงสุด',
  plus: 'ค่าบวกสูงสุด',
  new: 'เพิ่งได้มา',
};

/** How long the chosen card's flip runs. Mirrored in the stylesheet. */
const FLIP_MS = 520;

/** "เมื่อสักครู่", "12 นาทีที่แล้ว", "3 ชม.ที่แล้ว", then the date. */
function since(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  return new Date(at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function FusionScreen() {
  const { navigate } = useNavigation();
  const account = useAccount();
  const { config, state, fuse, take, feed, refreshFeed } = useFusion();
  const { toggleLock } = useTransfer();
  const view = useRewardView();
  const { play } = useSound();

  const [chosen, setChosen] = useState<string[]>([]);
  const [tab, setTab] = useState<BenchTab>('all');
  const [sort, setSort] = useState<BenchSort>('ovr');
  const [error, setError] = useState<FusionError | null>(null);
  /** Which card of the hand was turned over. null = all still face down. */
  const [turned, setTurned] = useState<number | null>(null);
  const [kept, setKept] = useState<FusionPick | null>(null);
  /**
   * The hand as it was dealt.
   *
   * Claiming clears `state.pending`, so the account stops being able to describe the
   * cards the moment one is taken. They are held here too, which is what lets the
   * other four turn over afterwards — the player paid for the whole hand and gets to
   * see what was in it.
   */
  const [shown, setShown] = useState<FusionPick[]>([]);
  /** True while the flip is mid-air, so the result line waits for the card to land. */
  const [flipping, setFlipping] = useState(false);

  const hand = state.pending;
  const need = Math.max(1, Math.floor(config.materials));
  const locked = useMemo(() => new Set(account.transfer?.locked ?? []), [account.transfer?.locked]);

  useEffect(() => {
    refreshFeed();
  }, [refreshFeed]);

  /** A hand arriving — including one found on load — becomes the cards on screen. */
  useEffect(() => {
    if (!hand) return;
    setShown(hand.picks);
    setTurned(null);
    setKept(null);
  }, [hand]);

  /**
   * Every owned card with the reason it cannot be used, sorted so the usable ones
   * come first — a bench that opens on a wall of greyed-out cards reads as broken.
   */
  const bench = useMemo<{ card: OwnedPlayer; block: MaterialBlock }[]>(() => {
    const rows = account.club.players
      .map((card) => ({ card, block: materialBlock(card, account, config) }))
      .filter((row) => {
        if (tab === 'usable') return row.block === null;
        if (tab === 'locked') return row.block === 'locked';
        return true;
      });

    const order = (row: { card: OwnedPlayer }) => {
      if (sort === 'plus') return row.card.plus ?? 0;
      if (sort === 'new') return Date.parse(row.card.acquiredAt) || 0;
      return ratingWithPlus(row.card);
    };

    return rows.sort((a, b) => {
      // Usable cards first whatever the sort — a bench that opens on a wall of
      // greyed-out cards reads as broken.
      if ((a.block === null) !== (b.block === null)) return a.block === null ? -1 : 1;
      return order(b) - order(a);
    });
  }, [account, config, tab, sort]);

  const poolEmpty = livePrizes(config).length === 0;

  /**
   * รางวัลใหญ่สุดสามอันดับ เรียงไว้บนแท่นเป็น 2 – 1 – 3
   *
   * จัดอันดับจากความหายากก่อน เท่ากันแล้วค่อยดูว่าใบไหนออกยากกว่า — ไม่ได้ใช้มูลค่า
   * เพราะรางวัลมีทั้งเงิน ไอเท็ม และการ์ด ซึ่งเทียบมูลค่ากันตรง ๆ ไม่ได้
   */
  const showcase = useMemo(() => {
    const live = livePrizes(config);
    // แอดมินปักหมุดไว้ = ใช้ตามนั้น เรียงตามลำดับในตาราง
    const pinned = live.filter((prize) => prize.showcase).slice(0, 3);
    const rank = (rarity: (typeof FUSION_RARITIES)[number]) => FUSION_RARITIES.indexOf(rarity);
    const top =
      pinned.length > 0
        ? pinned
        : [...live].sort((a, b) => rank(b.rarity) - rank(a.rarity) || a.chance - b.chance).slice(0, 3);
    // ที่ 2 ซ้าย ที่ 1 กลาง ที่ 3 ขวา — แท่นรับรางวัลอ่านจากกลางออกข้าง
    return [1, 0, 2].flatMap((index) =>
      top[index] ? [{ prize: top[index]!, place: index + 1 }] : [],
    );
  }, [config]);

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
    setShown(result.picks);
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
    if (!animates()) {
      setKept(result.pick);
      return;
    }
    // With motion on, the reward line waits for the card to land — a number read off
    // a face that is still edge-on is the thing that makes a flip feel broken.
    setFlipping(true);
    window.setTimeout(() => {
      setFlipping(false);
      setKept(result.pick);
    }, FLIP_MS);
  };

  const backToBench = () => {
    setShown([]);
    setTurned(null);
    setKept(null);
  };

  /* ── the hand on the table ────────────────────────────── */

  if (shown.length > 0) {
    const decided = turned !== null;
    return (
      <div className={styles.screen}>
        <header className={styles.head}>
          <h1 className={styles.title}>{config.title}</h1>
          <p className={styles.subtitle}>
            {decided ? 'เก็บใบที่เลือกเรียบร้อย' : `เลือกได้ใบเดียวจาก ${shown.length} ใบ`}
          </p>
        </header>

        {kept ? (
          <button type="button" className={styles.close} onClick={backToBench}>
            <X size={26} strokeWidth={2.4} />
          </button>
        ) : null}

        {error ? <p className={styles.error}>{ERROR_TEXT[error]}</p> : null}

        <div className={styles.hand}>
          {shown.map((pick, index) => {
            const mine = turned === index;
            const detail = view(pick.reward);
            return (
              <button
                type="button"
                key={`${pick.prizeId}-${index}`}
                className={`${styles.slot} ${decided ? styles.slotFlipped : ''} ${
                  decided && !mine ? styles.slotMissed : ''
                }`}
                style={
                  {
                    '--tone': RARITY_COLOR[pick.rarity],
                    // The ones that were not taken turn a beat later, so the chosen
                    // card lands first and the eye knows which one is the answer.
                    '--delay': decided && !mine ? `${160 + index * 70}ms` : '0ms',
                  } as React.CSSProperties
                }
                onClick={() => turnOver(index)}
                disabled={decided}
              >
                <span className={styles.inner}>
                  <span className={`${styles.face} ${styles.faceBack}`}>
                    <span className={styles.mark}>?</span>
                  </span>
                  <span className={`${styles.face} ${styles.faceFront}`}>
                    <img className={styles.slotArt} src={detail.icon} alt="" />
                    <span className={styles.slotName}>{pick.name}</span>
                    <span className={styles.slotCount}>{detail.count}</span>
                    <span className={styles.slotRarity}>{RARITY_LABEL[pick.rarity]}</span>
                    {mine ? <span className={styles.mineTag}>เก็บใบนี้</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {kept && !flipping ? (
          <div className={styles.result}>
            <p className={styles.resultLine}>ได้รับ {view(kept.reward).text}</p>
            <button type="button" className={styles.again} onClick={backToBench}>
              ผสมอีกครั้ง
            </button>
          </div>
        ) : (
          <p className={styles.hint}>
            {decided ? 'กำลังเปิดใบที่เหลือ…' : 'แตะการ์ดที่ต้องการ — ใบที่เหลือจะหายไป'}
          </p>
        )}
      </div>
    );
  }

  /* ── the bench ────────────────────────────────────────── */

  return (
    <div className={styles.screen}>
      <button type="button" className={styles.back} onClick={() => navigate('home')}>
        <ArrowLeft size={30} strokeWidth={2.6} />
      </button>

      <header className={styles.head}>
        <span className={styles.crest} aria-hidden="true">
          <Trophy size={34} strokeWidth={2.2} />
        </span>
        <div>
          <h1 className={styles.title}>{config.title}</h1>
          <p className={styles.subtitle}>{config.subtitle}</p>
        </div>
      </header>

      <button type="button" className={styles.close} onClick={() => navigate('home')}>
        <X size={28} strokeWidth={2.4} />
      </button>

      <div className={styles.status}>
        <span className={styles.statusIcon} aria-hidden="true">
          <Layers size={26} strokeWidth={2.2} />
        </span>
        <span className={styles.counter}>
          เลือกแล้ว <b className={styles.counterNow}>{chosen.length}</b> / {need}
        </span>
      </div>

      <button
        type="button"
        className={styles.fuse}
        onClick={startFusion}
        disabled={chosen.length < need || poolEmpty || !config.enabled}
      >
        ผสมการ์ด
        <Sparkles size={24} strokeWidth={2.4} />
      </button>

      {poolEmpty ? <p className={styles.error}>{ERROR_TEXT.empty}</p> : null}
      {error ? <p className={styles.error}>{ERROR_TEXT[error]}</p> : null}

      {showcase.length > 0 ? (
        <div className={styles.showcase}>
          <div className={styles.showcaseHead}>
            <span className={styles.showcaseIcon} aria-hidden="true">
              <ShieldCheck size={30} strokeWidth={2.2} />
            </span>
            <div>
              <span className={styles.showcaseTitle}>รางวัลใหญ่ที่สุด</span>
              <span className={styles.showcaseNote}>โอกาสได้รับการ์ดระดับสูง</span>
            </div>
          </div>
          <div className={styles.podium}>
            {showcase.map(({ prize, place }) => {
              const detail = view(prize.reward);
              return (
                <div
                  key={prize.id}
                  className={`${styles.step} ${place === 1 ? styles.stepFirst : ''}`}
                  style={{ '--tone': RARITY_COLOR[prize.rarity] } as React.CSSProperties}
                >
                  <img className={styles.stepArt} src={detail.icon} alt="" />
                  <span className={styles.stepName}>{prize.name.trim() || detail.label}</span>
                  <span className={styles.stepRarity}>{RARITY_LABEL[prize.rarity]}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={`${styles.body} ${showcase.length > 0 ? styles.bodyBelow : ''}`}>
        <section className={styles.bench}>
          <nav className={styles.tabs} aria-label="ตัวกรองการ์ด">
            {(['all', 'usable', 'locked'] as const).map((id) => (
              <button
                type="button"
                key={id}
                className={`${styles.tab} ${tab === id ? styles.tabOn : ''}`}
                onClick={() => setTab(id)}
              >
                {id === 'all' ? (
                  <Layers size={24} strokeWidth={2.2} />
                ) : id === 'usable' ? (
                  <Users size={24} strokeWidth={2.2} />
                ) : (
                  <Lock size={24} strokeWidth={2.2} />
                )}
                <span>{TAB_LABEL[id]}</span>
              </button>
            ))}
          </nav>

          <div className={styles.benchMain}>
            <div className={styles.benchHead}>
              <span className={styles.benchIcon} aria-hidden="true">
                <Layers size={24} strokeWidth={2.2} />
              </span>
              <h2 className={styles.benchTitle}>{TAB_LABEL[tab]}</h2>
              <label className={styles.sort}>
                <ArrowUpDown size={18} strokeWidth={2.2} />
                <span>เรียงตาม:</span>
                <select
                  className={styles.sortSelect}
                  value={sort}
                  onChange={(event) => setSort(event.target.value as BenchSort)}
                >
                  {(['ovr', 'plus', 'new'] as const).map((id) => (
                    <option key={id} value={id}>
                      {SORT_LABEL[id]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
                  <SquadCard player={card} scale={0.88} interactive={false} />
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
                  {isLocked ? (
                    <Lock size={14} strokeWidth={2.6} />
                  ) : (
                    <LockOpen size={14} strokeWidth={2.2} />
                  )}
                </button>
              </div>
            );
          })}

              {bench.length === 0 ? <p className={styles.empty}>ไม่มีการ์ดในหมวดนี้</p> : null}
            </div>
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>ประวัติการผสม</h2>
            {state.history.length === 0 ? (
              <p className={styles.panelEmpty}>ยังไม่เคยผสม</p>
            ) : (
              <ul className={styles.list}>
                {state.history.map((win) => (
                  <li key={win.id} className={styles.row}>
                    <span
                      className={styles.dot}
                      style={{ background: RARITY_COLOR[win.rarity] }}
                      aria-hidden="true"
                    />
                    <span className={styles.rowName}>{win.name}</span>
                    <span className={styles.rowTime}>{since(win.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {state.fusions > 0 ? (
              <p className={styles.panelFoot}>ผสมไปแล้ว {state.fusions} ครั้ง</p>
            ) : null}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>ผู้โชคดีล่าสุด</h2>
            {feed === null ? (
              <p className={styles.panelEmpty}>กำลังโหลด…</p>
            ) : feed.length === 0 ? (
              <p className={styles.panelEmpty}>ยังไม่มีใครได้รางวัลใหญ่</p>
            ) : (
              <ul className={styles.list}>
                {feed.map((row) => (
                  <li key={`${row.uid}-${row.at}`} className={styles.row}>
                    <span
                      className={styles.dot}
                      style={{ background: RARITY_COLOR[row.rarity] }}
                      aria-hidden="true"
                    />
                    <span className={styles.rowWho}>{row.username}</span>
                    <span className={styles.rowName}>{row.prize}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
