import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock3, Home, Info, ShoppingCart, Star, Volleyball } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import { cardToPlayer } from '@/features/draft/pool';
import { timeLeft } from '@/features/manager/manager';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { SHOP_PAY_KINDS } from '@/features/shop/types';
import {
  cellStatus,
  currentPass,
  levelOf,
  levelProgress,
  pendingCells,
  premiumPrice,
  skipCost,
  type PremiumPayKind,
} from '@/features/starpass/starpass';
import { useStarPass, type StarPassResult } from '@/features/starpass/StarPassContext';
import type { StarPassLevel, StarPassReward, StarPassTrack } from '@/features/starpass/types';
import CurrencyItem from '@/components/currency/CurrencyItem';
import useRewardView from '@/components/shop/useRewardView';
import IconButton from '@/components/ui/IconButton';
import styles from './StarPassScreen.module.css';

const ERROR: Record<string, string> = {
  closed: 'Star Pass ปิดอยู่',
  unknown: 'ไม่พบขั้นนี้แล้ว',
  locked: 'ยังไม่ถึงขั้นนี้',
  'no-premium': 'ต้องซื้อ Star Pass ก่อนจึงจะรับรางวัลแถวบนได้',
  claimed: 'รับรางวัลไปแล้ว',
  nothing: 'ไม่มีรางวัลให้รับตอนนี้',
  owned: 'ซื้อ Star Pass แล้ว',
  'not-sold': 'ไม่ได้เปิดขาย',
  maxed: 'ครบทุกขั้นแล้ว',
  'insufficient-funds': 'ยอดเงินไม่พอ',
  'at-cap': 'ยอดเงินเต็มแล้ว รับของเพิ่มไม่ได้',
  'club-full': 'คลังนักเตะเต็ม รับการ์ดเพิ่มไม่ได้',
  'card-missing': 'การ์ดในรางวัลนี้ไม่มีแล้ว ติดต่อแอดมิน',
};

/**
 * Track geometry, in design pixels, measured off the reference: columns 200 wide on
 * a 218 pitch, the first 13 in from the lane's edge; the pinned big-reward column
 * covers the last 200 of the 1320-wide lane.
 */
const PITCH = 218;
const COLUMN_W = 200;
const LANE_PAD = 13;
const LANE_W = 1320;
const PINNED_W = 200;
const VIEW_W = LANE_W - PINNED_W;
/** A pointer that moves this far is a drag, not a tap. */
const DRAG_SLOP = 6;

type Buying = { kind: 'premium' } | { kind: 'level'; cost: number };

/** The XP mark: a purple pentagon with a star. */
function XpMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="sp-xp" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c59bff" />
          <stop offset="1" stopColor="#4b1c9c" />
        </linearGradient>
      </defs>
      <path d="M20 2 L37 14 L31 35 L9 35 L3 14 Z" fill="url(#sp-xp)" stroke="#e6d4ff" strokeWidth="1.6" />
      <path
        d="M20 9 L23 17 L31 17 L25 22 L27 30 L20 25 L13 30 L15 22 L9 17 L17 17 Z"
        fill="#2b0e5c"
        stroke="#d9c2ff"
        strokeWidth="1"
      />
    </svg>
  );
}

/** Star Pass — premium rewards along the top, free along the bottom, levels between. */
export default function StarPassScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { byId } = usePlayers();
  const { config, season, endsAt, refresh, claim, claimEverything, buy, buyNextLevel } = useStarPass();
  const view = useRewardView();
  const [now, setNow] = useState(() => new Date());
  const [buying, setBuying] = useState<Buying | null>(null);
  const [info, setInfo] = useState(false);
  const [scroll, setScroll] = useState({ left: 0, max: 0 });
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null);
  const lane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pass = useMemo(() => currentPass(account.starpass, season), [account.starpass, season]);
  const reached = levelOf(pass.xp, config);
  const step = levelProgress(pass.xp, config);
  const pending = pendingCells(pass, config);
  const cost = skipCost(pass, config);
  const offers = SHOP_PAY_KINDS.map((kind) => ({ kind, price: premiumPrice(config, kind) })).filter(
    (offer): offer is { kind: PremiumPayKind; price: number } => offer.price !== null,
  );
  // The top bar shows what the pass is sold in; FC points when it is not sold at all.
  const shownCurrencies: PremiumPayKind[] = offers.length > 0 ? offers.map((offer) => offer.kind) : ['fcpoint'];

  /** Uploaded art first, then the chosen catalogue card, then the first card on the premium line. */
  const showcase = useMemo(() => {
    if (config.showcaseImage) return config.showcaseImage;
    const chosen = config.showcaseCardId ? byId(config.showcaseCardId) : undefined;
    if (chosen) return cardToPlayer(chosen).portrait;
    for (const level of config.levels) {
      for (const reward of level.premium) {
        if (reward.kind !== 'card') continue;
        const card = byId(reward.cardId);
        if (card) return cardToPlayer(card).portrait;
      }
    }
    return '';
  }, [config, byId]);

  // The column the track opens on and the back button returns to: the first reward
  // waiting, or else the level being worked on.
  const target = pending[0] ? config.levels.indexOf(pending[0].level) : Math.min(reached, config.levels.length - 1);

  const measure = useCallback(() => {
    const element = lane.current;
    if (!element) return;
    setScroll({ left: element.scrollLeft, max: element.scrollWidth - element.clientWidth });
  }, []);

  const scrollTo = useCallback(
    (index: number, smooth: boolean) => {
      const element = lane.current;
      if (!element) return;
      // The target sits fifth from the left, as the reference opens (level 5 of 1-5).
      element.scrollTo({ left: Math.max(0, (index - 4) * PITCH), behavior: smooth ? 'smooth' : 'auto' });
      measure();
    },
    [measure],
  );

  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !lane.current) return;
    opened.current = true;
    scrollTo(target, false);
  }, [target, scrollTo]);

  // Mouse wheel scrolls the track sideways.
  useEffect(() => {
    const element = lane.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [config.enabled]);

  // Drag to scroll, as on a phone. A drag swallows the click that ends it.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !lane.current) return;
    drag.current = { x: event.clientX, left: lane.current.scrollLeft, moved: false };
    dragged.current = false;
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || !lane.current) return;
    const scale = lane.current.getBoundingClientRect().width / LANE_W || 1;
    const dx = (event.clientX - state.x) / scale;
    if (!state.moved && Math.abs(dx) > DRAG_SLOP) state.moved = true;
    if (state.moved) lane.current.scrollLeft = state.left - dx;
  }
  function onPointerUp() {
    dragged.current = drag.current?.moved ?? false;
    drag.current = null;
  }

  /** The next big-reward level not yet scrolled into view, pinned at the right edge. */
  const pinned = useMemo(() => {
    if (scroll.left >= scroll.max - 2) return null;
    const index = config.levels.findIndex(
      (level, i) => level.featured && LANE_PAD + i * PITCH + COLUMN_W > scroll.left + VIEW_W,
    );
    return index >= 0 ? index : null;
  }, [config.levels, scroll]);

  const targetLeft = LANE_PAD + target * PITCH;
  const targetHidden = targetLeft < scroll.left || targetLeft + COLUMN_W > scroll.left + VIEW_W;

  function report(result: StarPassResult, done: string) {
    setToast({
      id: Date.now(),
      bad: !result.ok,
      text: result.ok
        ? result.rewards.length > 0
          ? `ได้รับ ${result.rewards.map((reward) => view(reward).text).join(', ')}`
          : done
        : (ERROR[result.error ?? ''] ?? 'ทำรายการไม่สำเร็จ'),
    });
  }

  function rewardArt(reward: StarPassReward, big: boolean) {
    const shown = view(reward);
    return (
      <span className={`${styles.art} ${big ? styles.artBig : ''}`}>
        <img
          className={shown.isCard ? styles.cardArt : styles.coinArt}
          src={shown.icon}
          alt=""
          title={shown.text}
          draggable={false}
        />
        {reward.kind === 'card' && reward.plus > 0 && <span className={styles.plus}>+{reward.plus}</span>}
      </span>
    );
  }

  function cell(level: StarPassLevel, index: number, track: StarPassTrack, pinnedCell = false) {
    const rewards = level[track];
    if (rewards.length === 0) return <span className={`${styles.cell} ${styles[track]} ${styles.none}`} />;
    const status = cellStatus(pass, config, index, track);
    const first = rewards[0]!;
    return (
      <button
        type="button"
        className={`${styles.cell} ${styles[track]} ${styles[status]} ${pinnedCell ? styles.pinnedCell : ''}`}
        aria-label={`ขั้น ${index + 1} ${track === 'free' ? 'ฟรี' : 'พิเศษ'}`}
        title={rewards.map((reward) => view(reward).text).join(', ')}
        onClick={() => {
          if (dragged.current) return;
          if (status === 'ready') report(claim(level.id, track), 'รับแล้ว');
          else if (status === 'locked' && track === 'premium' && !pass.premium && index < reached) {
            report({ ok: false, error: 'no-premium', rewards: [] }, '');
          }
        }}
      >
        <span className={styles.icons}>
          {rewardArt(first, pinnedCell)}
          {rewards.length > 1 && <span className={styles.more}>+{rewards.length - 1}</span>}
        </span>
        {!pinnedCell && <span className={styles.count}>x{formatCurrency(first.amount)}</span>}
        {status === 'claimed' && (
          <span className={styles.done}>
            <Check size={22} strokeWidth={3.4} />
          </span>
        )}
      </button>
    );
  }

  function diamond(index: number) {
    const n = index + 1;
    const tone = n <= reached ? styles.gemReached : n === reached + 1 ? styles.gemNext : styles.gemFuture;
    return (
      <span className={`${styles.gem} ${tone}`}>
        <span className={styles.gemText}>{n}</span>
      </span>
    );
  }

  const closed = !config.enabled || config.levels.length === 0;

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />

      <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
        <ChevronLeft size={40} strokeWidth={3.2} />
      </button>
      <h1 className={styles.title}>{config.title || 'STAR PASS'}</h1>

      <div className={styles.topRight}>
        {shownCurrencies.map((kind) => (
          <CurrencyItem key={kind} currency={currencies[kind]} balance={account.wallet[kind]} />
        ))}
        <IconButton label="กิจกรรม" size={46}>
          <Volleyball size={40} strokeWidth={2} />
        </IconButton>
        <IconButton label="ร้านค้า" size={46} onClick={() => navigate('shop')}>
          <ShoppingCart size={40} strokeWidth={2} />
        </IconButton>
        <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
          <Home size={40} strokeWidth={2} />
        </IconButton>
      </div>

      {closed ? (
        <p className={styles.closed}>Star Pass ปิดอยู่ในตอนนี้</p>
      ) : (
        <>
          {/* ---- showcase ---- */}
          <section className={styles.showcase}>
            {showcase ? (
              <img className={styles.showcaseArt} src={showcase} alt="" draggable={false} />
            ) : (
              <Star className={styles.showcaseStar} size={220} strokeWidth={1.2} />
            )}
            {pass.premium ? (
              <span className={`${styles.buy} ${styles.bought}`}>ซื้อแล้ว</span>
            ) : (
              <button
                type="button"
                className={styles.buy}
                onClick={() =>
                  offers.length > 0
                    ? setBuying({ kind: 'premium' })
                    : report({ ok: false, error: 'not-sold', rewards: [] }, '')
                }
              >
                ซื้อ
              </button>
            )}
          </section>

          {/* ---- season and level ---- */}
          <section className={styles.season}>
            <header className={styles.seasonHead}>
              <Clock3 size={26} strokeWidth={2.6} />
              <span>สิ้นสุดซีซั่นใน: {timeLeft(endsAt, now).replace(' ', '')}</span>
              <button
                type="button"
                className={styles.info}
                aria-label="วิธีได้ XP"
                aria-expanded={info}
                onClick={() => setInfo((open) => !open)}
              >
                <Info size={30} strokeWidth={2.4} />
              </button>
            </header>
            <div className={styles.seasonBody}>
              <span className={`${styles.gem} ${styles.gemReached} ${styles.gemLarge}`}>
                <span className={styles.gemText}>{reached}</span>
              </span>
              <span className={styles.xp}>
                {step.maxed
                  ? 'MAX'
                  : `${formatCurrency(step.into)}/${formatCurrency(step.need)}`}
                <XpMark className={styles.xpMark} />
              </span>
            </div>
            {info && (
              <div className={styles.infoPanel} role="note">
                <p>รับรางวัลภารกิจ: ได้ XP {config.missionRate === 100 ? 'เท่าแต้มภารกิจ' : `${config.missionRate}% ของแต้มภารกิจ`}</p>
                <p>
                  แข่งเมเนเจอร์จบนัด: ชนะ +{config.matchWin} · เสมอ +{config.matchDraw} · แพ้ +{config.matchLoss}
                </p>
                <p>ทุก {formatCurrency(config.xpPerLevel)} XP ขึ้น 1 ขั้น · ซื้อ Star Pass เพื่อรับรางวัลแถวบน</p>
              </div>
            )}
          </section>

          {/* ---- track ---- */}
          <div
            className={styles.lane}
            ref={lane}
            onScroll={measure}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div className={styles.rail} style={{ width: LANE_PAD * 2 + config.levels.length * PITCH - (PITCH - COLUMN_W) }}>
              {config.levels.map((level, index) => (
                <div key={level.id} className={styles.column} style={{ left: LANE_PAD + index * PITCH }}>
                  {cell(level, index, 'premium')}
                  <div className={styles.node}>
                    {index < config.levels.length - 1 && (
                      <span className={`${styles.link} ${index + 1 <= reached ? styles.linkOn : ''}`} />
                    )}
                    {index === reached && cost !== null && (
                      <button
                        type="button"
                        className={styles.skip}
                        onClick={() => !dragged.current && setBuying({ kind: 'level', cost })}
                        aria-label={`ซื้อขั้น ${index + 1}`}
                      >
                        <span>{formatCurrency(cost)}</span>
                        <img src={currencies.fcpoint.icon} alt="" />
                      </button>
                    )}
                    {diamond(index)}
                  </div>
                  {cell(level, index, 'free')}
                </div>
              ))}
            </div>
          </div>

          {pinned !== null && (
            <aside className={styles.pinned} aria-label={`รางวัลใหญ่ขั้น ${pinned + 1}`}>
              <div className={styles.pinnedTop}>{cell(config.levels[pinned]!, pinned, 'premium', true)}</div>
              <div className={styles.pinnedNode}>
                <span className={styles.pinnedLine} />
                {diamond(pinned)}
              </div>
              <div className={styles.pinnedBottom}>{cell(config.levels[pinned]!, pinned, 'free', true)}</div>
            </aside>
          )}

          {targetHidden && (
            <button
              type="button"
              className={styles.jump}
              onClick={() => scrollTo(target, true)}
              aria-label="กลับไปขั้นปัจจุบัน"
            >
              {targetLeft < scroll.left ? (
                <ChevronLeft size={44} strokeWidth={3.4} />
              ) : (
                <ChevronRight size={44} strokeWidth={3.4} />
              )}
            </button>
          )}

          <button
            type="button"
            className={styles.claimAll}
            disabled={pending.length === 0}
            onClick={() => report(claimEverything(), 'รับแล้ว')}
          >
            รับทั้งหมด
          </button>
        </>
      )}

      {buying && (
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="ยืนยันการซื้อ">
          <div className={styles.dialogBackdrop} onClick={() => setBuying(null)} />
          <div className={styles.dialogPanel}>
            <h2 className={styles.dialogTitle}>
              {buying.kind === 'premium' ? `ซื้อ ${config.title || 'STAR PASS'}` : `ซื้อขั้น ${reached + 1}`}
            </h2>
            <p className={styles.dialogText}>
              {buying.kind === 'premium'
                ? 'ปลดล็อกรางวัลแถวบนทุกขั้นของซีซั่นนี้ รวมขั้นที่ผ่านมาแล้ว'
                : `ข้ามไปขั้น ${reached + 1} ทันที`}
            </p>
            <div className={styles.dialogActions}>
              {buying.kind === 'premium' ? (
                offers.map((offer) => (
                  <button
                    type="button"
                    key={offer.kind}
                    className={styles.confirm}
                    onClick={() => {
                      report(buy(offer.kind), 'ซื้อสำเร็จ');
                      setBuying(null);
                    }}
                  >
                    <img src={currencies[offer.kind].icon} alt="" />
                    {formatCurrency(offer.price)}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className={styles.confirm}
                  onClick={() => {
                    report(buyNextLevel(), `ขึ้นขั้น ${reached + 1} แล้ว`);
                    setBuying(null);
                  }}
                >
                  <img src={currencies.fcpoint.icon} alt="" />
                  {formatCurrency(buying.cost)}
                </button>
              )}
              <button type="button" className={styles.cancel} onClick={() => setBuying(null)}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
