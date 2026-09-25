import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Home, Lock, Sparkles } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { syncOwned } from '@/features/club/sync';
import type { CurrencyKind } from '@/features/currencies/types';
import { formatCurrency } from '@/features/currencies/constants';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { playerArtUrl } from '@/features/players/artManifest';
import { usePlayers } from '@/features/players/PlayerContext';
import { plusTone } from '@/features/rankup/constants';
import { REQUIRED_CARDS } from '@/features/special/constants';
import { filledCount, isBought, isComplete, refuse, slotsOf } from '@/features/special/special';
import { useSpecial, type SpecialBuyResult } from '@/features/special/SpecialContext';
import type { SpecialError } from '@/features/special/types';
import CurrencyItem from '@/components/currency/CurrencyItem';
import IconButton from '@/components/ui/IconButton';
import styles from './SpecialCardScreen.module.css';

const HEADER_CURRENCIES: readonly CurrencyKind[] = ['special', 'gem', 'fcpoint'];

const ERROR: Record<SpecialError, string> = {
  closed: 'ระบบการ์ดพิเศษปิดอยู่ตอนนี้',
  disabled: 'รายการนี้ปิดอยู่',
  unset: 'รายการนี้ยังตั้งค่าไม่ครบ ติดต่อแอดมิน',
  locked: `ต้องมีการ์ดครบ ${REQUIRED_CARDS} ใบก่อนถึงจะซื้อได้`,
  bought: 'ไอดีนี้ซื้อรายการนี้ไปแล้ว',
  'insufficient-funds': 'Special Point ไม่พอ',
  'club-full': 'คลังนักเตะเต็ม เคลียร์ที่ว่างก่อนแล้วค่อยซื้อ',
  'card-missing': 'การ์ดของรายการนี้ถูกลบไปแล้ว ติดต่อแอดมิน',
};

/**
 * Card art, or — when there is none, or the file fails to load — the card drawn from
 * its own tier letter, so a slot never shows a broken image.
 */
function Art({ src, fallback, className }: { src: string | null | undefined; fallback: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) return <span className={`${styles.noArt} ${className ?? ''}`}>{fallback}</span>;
  return <img className={className} src={src} alt="" onError={() => setBroken(true)} />;
}

/**
 * การ์ดพิเศษ — own the eleven cards an admin picked, then buy the special card with
 * Special Point. The eleven slots fill themselves from the club; nothing is spent but
 * the points.
 */
export default function SpecialCardScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, progress, buy } = useSpecial();
  const { byId } = usePlayers();

  const players = useMemo(() => syncOwned(account.club.players, byId), [account.club.players, byId]);
  // Only offers the admin has finished setting up are shown.
  const offers = useMemo(() => config.offers.filter((offer) => offer.enabled && isComplete(offer)), [config.offers]);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const [result, setResult] = useState<SpecialBuyResult | null>(null);
  const [won, setWon] = useState<SpecialBuyResult | null>(null);
  const [showBroken, setShowBroken] = useState(false);
  const [revealBroken, setRevealBroken] = useState(false);

  const offer = offers.find((entry) => entry.id === chosenId) ?? offers[0] ?? null;
  useEffect(() => {
    setResult(null);
    setShowBroken(false);
  }, [offer?.id]);

  const artOf = (catalogueId: string): string | null => {
    const card = byId(catalogueId);
    return card ? playerArtUrl(card.artId) : null;
  };

  const special = offer ? byId(offer.cardId) : undefined;
  const slots = offer ? slotsOf(offer, players, byId) : [];
  const filled = offer ? filledCount(offer, players, byId) : 0;
  const bought = offer ? isBought(progress, offer) : false;
  const blocked = offer ? refuse(config, offer, account, byId) : 'closed';

  function purchase() {
    if (!offer) return;
    const outcome = buy(offer.id);
    setResult(outcome);
    if (outcome.ok) {
      setRevealBroken(false);
      setWon(outcome);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />

      <header className={styles.bar}>
        <div className={styles.left}>
          <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
            <ChevronLeft size={38} strokeWidth={3} />
          </button>
          <h1 className={styles.title}>{config.title}</h1>
        </div>
        <div className={styles.right}>
          {HEADER_CURRENCIES.map((kind) => (
            <CurrencyItem key={kind} currency={currencies[kind]} balance={account.wallet[kind]} />
          ))}
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </div>
      </header>

      {!config.enabled || offers.length === 0 ? (
        <section className={styles.empty}>
          <Sparkles size={72} strokeWidth={1.6} />
          <p>{config.enabled ? 'ยังไม่มีการ์ดพิเศษให้ซื้อตอนนี้' : ERROR.closed}</p>
        </section>
      ) : (
        <>
          {/* ---- the offers ---- */}
          <nav className={styles.offers} aria-label="รายการการ์ดพิเศษ">
            {offers.map((entry) => {
              const card = byId(entry.cardId);
              const art = artOf(entry.cardId);
              const done = isBought(progress, entry);
              const count = filledCount(entry, players, byId);
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={`${styles.offer} ${entry.id === offer?.id ? styles.offerOn : ''}`}
                  onClick={() => setChosenId(entry.id)}
                  aria-pressed={entry.id === offer?.id}
                >
                  <Art src={art} fallback={card?.set ?? '?'} />
                  <span className={styles.offerText}>
                    <b>{entry.name.trim() || card?.name || 'การ์ดพิเศษ'}</b>
                    <span className={done ? styles.offerDone : count >= REQUIRED_CARDS ? styles.offerReady : ''}>
                      {done ? 'ซื้อแล้ว' : `${count}/${REQUIRED_CARDS}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {offer && (
            <>
              {/* ---- the special card ---- */}
              <section className={styles.showcase} aria-label="การ์ดพิเศษ">
                <span className={styles.glow} />
                {special && artOf(offer.cardId) && !showBroken ? (
                  <img className={styles.showArt} src={artOf(offer.cardId)!} alt="" onError={() => setShowBroken(true)} />
                ) : (
                  <span className={styles.showFallback}>
                    <b>{special?.rating ?? '?'}</b>
                    <span>{special?.position ?? ''}</span>
                  </span>
                )}
                {offer.plus > 0 && (
                  <span className={styles.plus} style={{ background: plusTone(offer.plus) }}>
                    +{offer.plus}
                  </span>
                )}
                <h2 className={styles.showName}>{offer.name.trim() || special?.name || 'การ์ดพิเศษ'}</h2>
                {offer.name.trim() && special && <span className={styles.showSub}>{special.name}</span>}

                <span className={styles.price}>
                  <img src={currencies.special.icon} alt="" />
                  {formatCurrency(offer.price)}
                </span>

                <button
                  type="button"
                  className={styles.buy}
                  disabled={blocked !== null}
                  onClick={purchase}
                >
                  {bought ? (
                    <>
                      <Check size={26} strokeWidth={3} /> ซื้อแล้ว
                    </>
                  ) : blocked === 'locked' ? (
                    <>
                      <Lock size={24} strokeWidth={2.6} /> ต้องมีครบ {REQUIRED_CARDS} ใบ
                    </>
                  ) : (
                    'ซื้อการ์ดพิเศษ'
                  )}
                </button>

                {blocked && blocked !== 'locked' && blocked !== 'bought' && (
                  <p className={styles.bad}>{ERROR[blocked]}</p>
                )}
                {result && !result.ok && result.error && <p className={styles.bad}>{ERROR[result.error]}</p>}
              </section>

              {/* ---- the eleven ---- */}
              <section className={styles.required} aria-label={`การ์ดที่ต้องมี ${REQUIRED_CARDS} ใบ`}>
                <div className={styles.requiredHead}>
                  <h2>การ์ดที่ต้องมี</h2>
                  <span className={filled >= REQUIRED_CARDS ? styles.countFull : styles.count}>
                    {filled}/{REQUIRED_CARDS}
                  </span>
                </div>
                <div className={styles.meter}>
                  <span style={{ width: `${(filled / REQUIRED_CARDS) * 100}%` }} />
                </div>

                <div className={styles.slots}>
                  {slots.map(({ cardId, owned }) => {
                    const card = byId(cardId);
                    const art = owned?.portrait || artOf(cardId);
                    const plus = owned?.plus ?? 0;
                    return (
                      <div key={cardId} className={`${styles.slot} ${owned ? styles.slotIn : ''}`}>
                        <span className={styles.slotArt}>
                          <Art src={art} fallback={card ? String(card.rating) : '?'} />
                          {!owned && (
                            <span className={styles.slotLock}>
                              <Lock size={30} strokeWidth={2.4} />
                            </span>
                          )}
                          {owned && (
                            <span className={styles.slotCheck}>
                              <Check size={20} strokeWidth={3.4} />
                            </span>
                          )}
                          {owned && plus > 0 && (
                            <span className={styles.slotPlus} style={{ background: plusTone(plus) }}>
                              +{plus}
                            </span>
                          )}
                        </span>
                        <span className={styles.slotName}>{card?.name ?? 'การ์ดถูกลบ'}</span>
                        <span className={styles.slotState}>{owned ? 'ใส่แล้ว' : 'ยังไม่มี'}</span>
                      </div>
                    );
                  })}
                </div>

                {config.note && <p className={styles.note}>{config.note}</p>}
              </section>
            </>
          )}
        </>
      )}

      {won?.card && (
        <div className={styles.overlay} role="dialog" aria-label="ได้รับการ์ดพิเศษ">
          <div className={styles.reveal}>
            <span className={styles.revealHead}>
              <Sparkles size={30} strokeWidth={2.4} /> ได้รับการ์ดพิเศษ!
            </span>
            {won.card.portrait && !revealBroken ? (
              <img className={styles.revealArt} src={won.card.portrait} alt="" onError={() => setRevealBroken(true)} />
            ) : (
              <span className={styles.showFallback}>
                <b>{won.card.rating}</b>
                <span>{won.card.position}</span>
              </span>
            )}
            <b className={styles.revealName}>{won.card.name}</b>
            <span className={styles.revealMeta}>
              {won.card.rating} · {won.card.position}
              {(won.card.plus ?? 0) > 0 ? ` · +${won.card.plus}` : ''}
            </span>
            <button type="button" className={styles.buy} onClick={() => setWon(null)}>
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
