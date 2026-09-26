import { useEffect, useMemo, useState } from 'react';
import { goldNameProps, goldPlusProps } from '@/features/rankup/constants';
import { Check, ChevronLeft, Home, Search } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { USERNAME_MAX_LENGTH, displayNameOf } from '@/features/auth/constants';
import { formatCurrency } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import { cardToPlayer } from '@/features/draft/pool';
import { avatarOfItem, cardsInRange, plusTargets } from '@/features/items/items';
import { useItems, type ItemUseResult } from '@/features/items/ItemsContext';
import type { ItemDef } from '@/features/items/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { usePlayers } from '@/features/players/PlayerContext';
import CurrencyItem from '@/components/currency/CurrencyItem';
import IconButton from '@/components/ui/IconButton';
import { itemArt } from './itemArt';
import styles from './BagScreen.module.css';

const HEADER_CURRENCIES: readonly CurrencyKind[] = ['special', 'gem', 'fcpoint'];

const ERROR: Record<string, string> = {
  unknown: 'ไอเท็มนี้ใช้ไม่ได้แล้ว',
  disabled: 'ไอเท็มนี้ถูกปิดใช้งานชั่วคราว',
  'none-left': 'ไอเท็มไม่พอ',
  'wrong-type': 'ใช้ไอเท็มนี้แบบนี้ไม่ได้',
  owned: 'มีอยู่แล้ว ไม่ต้องใช้ไอเท็มนี้',
  'bad-name': `ชื่อต้องยาว 3–${USERNAME_MAX_LENGTH} ตัว ใช้ตัวอักษร ตัวเลข . _ - ได้ ไม่มีเว้นวรรค`,
  'no-card': 'ไม่มีการ์ดในช่วง OVR นี้ในคลัง ติดต่อแอดมิน',
  'not-eligible': 'ใช้กับการ์ดใบนี้ไม่ได้',
  'club-full': 'คลังนักเตะเต็ม',
  'at-cap': 'ยอดเงินเต็มแล้ว',
  closed: 'ยังไม่ได้เข้าสู่ระบบ',
};

/** A card shown after an item hands one over. */
interface Reveal {
  title: string;
  portrait: string;
  name: string;
  plus: number;
}

/** กระเป๋า — every item the account holds, and what each one does. */
export default function BagScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { players, byId: cardById } = usePlayers();
  const items = useItems();
  const { config, inventory, shields } = items;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [cardChoice, setCardChoice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Held items in admin order, then anything held whose definition is gone. */
  const held = useMemo(
    () => config.items.filter((def) => (inventory.counts[def.id] ?? 0) > 0),
    [config.items, inventory.counts],
  );
  const selected: ItemDef | undefined = held.find((def) => def.id === selectedId) ?? held[0];
  const count = selected ? (inventory.counts[selected.id] ?? 0) : 0;

  useEffect(() => {
    setCardChoice(null);
    setQuery('');
    setName('');
  }, [selected?.id]);

  function fail(result: ItemUseResult) {
    setToast({ id: Date.now(), bad: true, text: ERROR[result.error ?? ''] ?? 'ใช้ไอเท็มไม่สำเร็จ' });
  }

  function ok(text: string) {
    setToast({ id: Date.now(), bad: false, text });
  }

  function showCard(title: string, result: ItemUseResult) {
    if (!result.card) return;
    setReveal({ title, portrait: result.card.portrait, name: result.card.name, plus: result.card.plus ?? 0 });
  }

  function actions(def: ItemDef) {
    const effect = def.effect;
    switch (effect.type) {
      case 'avatar': {
        const avatarId = avatarOfItem(def) ?? '';
        const avatar = items.avatars.find((entry) => entry.id === avatarId);
        const owned = inventory.avatars.includes(avatarId);
        return (
          <div className={styles.action}>
            {avatar ? (
              <div className={styles.avatarRow}>
                <img className={styles.avatarPreview} src={avatar.source} alt="" />
                <span>{avatar.name}</span>
              </div>
            ) : (
              <p className={styles.hint}>ยังไม่ได้ตั้งรูปโปรไฟล์ให้ไอเท็มนี้ ติดต่อแอดมิน</p>
            )}
            <button
              type="button"
              className={styles.use}
              disabled={!avatar || owned}
              onClick={() => {
                const result = items.applyAvatar(def.id);
                if (result.ok) ok(`ปลดล็อกและใช้รูปโปรไฟล์ ${avatar?.name ?? ''} แล้ว`);
                else fail(result);
              }}
            >
              {owned ? 'ปลดล็อกแล้ว' : 'ใช้ปลดล็อก'}
            </button>
          </div>
        );
      }
      case 'shield':
        return (
          <div className={styles.action}>
            <p className={styles.hint}>
              เปิดสวิตช์ &quot;โล่กันดาวลด&quot; ที่หน้าเมเนเจอร์โหมดก่อนเริ่มแมตช์จัดอันดับ · ตอนนี้
              {inventory.shieldArmed ? ' เปิดอยู่' : ' ปิดอยู่'} · มีโล่ทั้งหมด {shields} อัน
            </p>
            <button type="button" className={styles.use} onClick={() => navigate('manager')}>
              ไปหน้าเมเนเจอร์
            </button>
          </div>
        );
      case 'pack':
        return (
          <div className={styles.action}>
            <p className={styles.hint}>
              OVR {effect.ovrMin}–{effect.ovrMax} · ระดับบวก +{effect.plusMin} ถึง +{effect.plusMax}
            </p>
            <button
              type="button"
              className={styles.use}
              onClick={() => {
                const result = items.openPack(def.id);
                if (result.ok) showCard('ได้รับการ์ด', result);
                else fail(result);
              }}
            >
              เปิดซอง
            </button>
          </div>
        );
      case 'rename':
        return (
          <div className={styles.action}>
            <p className={styles.hint}>ชื่อตอนนี้: {displayNameOf(account)} · ไอดีล็อกอิน: {account.username}</p>
            <input
              className={styles.input}
              placeholder="ชื่อใหม่"
              maxLength={USERNAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="button"
              className={styles.use}
              disabled={name.trim() === ''}
              onClick={() => {
                const result = items.rename(def.id, name);
                if (result.ok) {
                  ok(`เปลี่ยนชื่อเป็น ${name.trim()} แล้ว`);
                  setName('');
                } else fail(result);
              }}
            >
              เปลี่ยนชื่อ
            </button>
          </div>
        );
      case 'plus': {
        const targets = plusTargets(account, effect.plus).sort(
          (a, b) => b.rating - a.rating || (b.plus ?? 0) - (a.plus ?? 0),
        );
        return (
          <div className={styles.action}>
            <p className={styles.hint}>เลือกการ์ดที่จะให้เป็น +{effect.plus} (การ์ดที่บวกถึงแล้วเลือกไม่ได้)</p>
            <div className={styles.cards}>
              {targets.length === 0 && <p className={styles.hint}>ไม่มีการ์ดที่ใช้ได้</p>}
              {targets.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className={`${styles.card} ${cardChoice === card.id ? styles.cardOn : ''}`}
                  onClick={() => setCardChoice(card.id)}
                  title={`${card.name} OVR ${card.rating}`}
                >
                  <img src={card.portrait} alt="" />
                  {(card.plus ?? 0) > 0 && (
                    <span className={styles.plus} {...goldPlusProps(card.plus ?? 0)}>
                      +{card.plus}
                    </span>
                  )}
                  <span className={styles.cardName} {...goldNameProps(card.plus)}>
                    {card.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.use}
              disabled={!cardChoice}
              onClick={() => {
                if (!cardChoice) return;
                const result = items.plusCard(def.id, cardChoice);
                if (result.ok) {
                  showCard(`อัปเป็น +${effect.plus} แล้ว`, result);
                  setCardChoice(null);
                } else fail(result);
              }}
            >
              ใช้กับการ์ดนี้
            </button>
          </div>
        );
      }
      case 'box':
        return (
          <div className={styles.action}>
            <p className={styles.hint}>
              สุ่มได้ {currencies[effect.currency].label} {formatCurrency(effect.min)}–{formatCurrency(effect.max)}
            </p>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.use}
                onClick={() => {
                  const result = items.openBoxes(def.id, 1);
                  if (result.ok && result.paid) {
                    ok(`ได้รับ ${currencies[result.paid.kind].label} x${formatCurrency(result.paid.amount)}`);
                  } else fail(result);
                }}
              >
                เปิด 1 กล่อง
              </button>
              {count > 1 && (
                <button
                  type="button"
                  className={styles.useAlt}
                  onClick={() => {
                    const result = items.openBoxes(def.id, count);
                    if (result.ok && result.paid) {
                      ok(
                        `เปิด ${count} กล่อง ได้รับ ${currencies[result.paid.kind].label} x${formatCurrency(result.paid.amount)}`,
                      );
                    } else fail(result);
                  }}
                >
                  เปิดทั้งหมด ({count})
                </button>
              )}
            </div>
          </div>
        );
      case 'pick': {
        const search = query.trim().toLowerCase();
        const pool = cardsInRange(players, effect.ovrMin, effect.ovrMax).filter(
          (card) =>
            search === '' ||
            [card.name, card.position, card.club, card.nation, String(card.rating)].some((field) =>
              field.toLowerCase().includes(search),
            ),
        );
        return (
          <div className={styles.action}>
            <p className={styles.hint}>เลือกการ์ด OVR {effect.ovrMin}–{effect.ovrMax} ได้ 1 ใบ</p>
            <label className={styles.search}>
              <Search size={20} strokeWidth={2.4} />
              <input
                placeholder="ค้นหา ชื่อ / ตำแหน่ง / สโมสร / OVR"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className={styles.cards}>
              {pool.length === 0 && <p className={styles.hint}>ไม่พบการ์ด</p>}
              {pool.slice(0, 120).map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className={`${styles.card} ${cardChoice === card.id ? styles.cardOn : ''}`}
                  onClick={() => setCardChoice(card.id)}
                  title={`${card.name} OVR ${card.rating}`}
                >
                  <img src={cardToPlayer(card).portrait} alt="" />
                  <span className={styles.cardName}>{card.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.use}
              disabled={!cardChoice}
              onClick={() => {
                if (!cardChoice) return;
                const result = items.pickCard(def.id, cardChoice);
                if (result.ok) {
                  showCard('ได้รับการ์ด', result);
                  setCardChoice(null);
                } else fail(result);
              }}
            >
              รับการ์ดนี้{cardChoice && cardById(cardChoice) ? ` (${cardById(cardChoice)!.name})` : ''}
            </button>
          </div>
        );
      }
      case 'premium':
        return (
          <div className={styles.action}>
            <p className={styles.hint}>เปิดสายพิเศษของ Star Pass ซีซั่นนี้</p>
            <button
              type="button"
              className={styles.use}
              onClick={() => {
                const result = items.openPremium(def.id);
                if (result.ok) ok('เปิดสายพิเศษ Star Pass แล้ว');
                else fail(result);
              }}
            >
              ใช้เปิดพรีเมียมพาส
            </button>
          </div>
        );
      default:
        return null;
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
          <h1 className={styles.title}>กระเป๋า</h1>
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

      <section className={styles.grid} aria-label="ไอเท็ม">
        {held.length === 0 && <p className={styles.empty}>ยังไม่มีไอเท็มในกระเป๋า</p>}
        {held.map((def) => (
          <button
            type="button"
            key={def.id}
            className={`${styles.tile} ${selected?.id === def.id ? styles.tileOn : ''}`}
            onClick={() => setSelectedId(def.id)}
          >
            <img className={styles.tileArt} src={itemArt(def)} alt="" draggable={false} />
            <span className={styles.tileName}>{def.name}</span>
            <span className={styles.tileCount}>x{formatCurrency(inventory.counts[def.id] ?? 0)}</span>
          </button>
        ))}
      </section>

      <aside className={styles.detail}>
        {selected ? (
          <>
            <div className={styles.head}>
              <img className={styles.art} src={itemArt(selected)} alt="" draggable={false} />
              <div className={styles.headText}>
                <h2 className={styles.name}>{selected.name}</h2>
                <span className={styles.have}>มีอยู่ x{formatCurrency(count)}</span>
                {selected.description && <p className={styles.description}>{selected.description}</p>}
              </div>
            </div>
            {!selected.enabled ? (
              <p className={styles.hint}>ไอเท็มนี้ถูกปิดใช้งานชั่วคราว</p>
            ) : (
              actions(selected)
            )}
          </>
        ) : (
          <p className={styles.empty}>รับไอเท็มได้จากภารกิจ Star Pass ร้านค้า และกาชาปอง</p>
        )}
      </aside>

      {reveal && (
        <div className={styles.reveal} role="dialog" aria-modal="true" aria-label={reveal.title}>
          <div className={styles.revealBackdrop} onClick={() => setReveal(null)} />
          <div className={styles.revealPanel}>
            <h2 className={styles.revealTitle}>{reveal.title}</h2>
            <div className={styles.revealCard}>
              <img src={reveal.portrait} alt="" />
              {reveal.plus > 0 && (
                <span className={styles.revealPlus} {...goldPlusProps(reveal.plus)}>
                  +{reveal.plus}
                </span>
              )}
            </div>
            <span className={styles.revealName}>{reveal.name}</span>
            <button type="button" className={styles.use} onClick={() => setReveal(null)}>
              <Check size={26} strokeWidth={3} /> ตกลง
            </button>
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
