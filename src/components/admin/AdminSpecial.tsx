import { useRef, useState } from 'react';
import { MAX_PLUS } from '@/features/rankup/constants';
import { playerArtUrl } from '@/features/players/artManifest';
import { usePlayers } from '@/features/players/PlayerContext';
import {
  MAX_OFFERS,
  MAX_PRICE,
  NAME_MAX,
  NOTE_MAX,
  REQUIRED_CARDS,
  TITLE_MAX,
  specialId,
} from '@/features/special/constants';
import { isComplete } from '@/features/special/special';
import { useSpecial } from '@/features/special/SpecialContext';
import type { SpecialConfig, SpecialOffer } from '@/features/special/types';
import AdminCardPicker from './AdminCardPicker';
import styles from './AdminSpecial.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * การ์ดพิเศษ settings: each offer is eleven catalogue cards a player must own, one
 * special card for sale, its plus level and its price in Special Point. An offer that
 * is missing a card is kept here but not shown to players until it is finished.
 */
export default function AdminSpecial() {
  const { config, replace, reset, progress } = useSpecial();
  const { byId } = usePlayers();
  const [status, setStatus] = useState<Status>(null);
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  function commit(next: SpecialConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok ? { tone: 'ok', text } : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<SpecialConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchOffer(id: string, changes: Partial<SpecialOffer>) {
    patch({ offers: latest.current.offers.map((offer) => (offer.id === id ? { ...offer, ...changes } : offer)) });
  }

  function addOffer() {
    const offer: SpecialOffer = {
      id: specialId(),
      enabled: true,
      name: '',
      requiredIds: [],
      cardId: '',
      plus: 0,
      price: 1_000,
    };
    patch({ offers: [...latest.current.offers, offer] }, 'เพิ่มรายการแล้ว');
  }

  const live = config.offers.filter((offer) => offer.enabled && isComplete(offer)).length;

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        การ์ดพิเศษ (ปุ่ม การ์ดพิเศษ แถบล่างหน้าหลัก ถัดจากตีบวกการ์ด) · ผู้เล่นที่มีการ์ดครบ {REQUIRED_CARDS} ใบตามที่ตั้งไว้
        จะปลดล็อกการซื้อการ์ดพิเศษ 1 ใบด้วย Special Point · การ์ด {REQUIRED_CARDS} ใบไม่ถูกหักออก ·
        1 ไอดีซื้อได้ 1 ครั้งต่อรายการ
      </p>
      <p className={styles.legend}>
        รายการที่ยังเลือกการ์ดไม่ครบ {REQUIRED_CARDS} ใบ หรือยังไม่เลือกการ์ดที่ขาย จะเก็บไว้ที่นี่แต่ผู้เล่นยังมองไม่เห็น ·
        Special Point แจกได้จากแท็บ เงินในเกม หรือใส่เป็นรางวัลในโค้ด ภารกิจ และกล่องจดหมาย
      </p>
      {status && <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>{status.text}</span>}

      <div className={styles.columns}>
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
          <button
            type="button"
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() => patch({ enabled: !config.enabled })}
          >
            {config.enabled ? 'เปิดระบบการ์ดพิเศษอยู่' : 'ปิดระบบการ์ดพิเศษอยู่'}
          </button>
          <p className={styles.legend}>ปิดแล้วปุ่ม การ์ดพิเศษ ที่แถบล่างจะกดไม่ได้</p>

          <label className={styles.field}>
            <span className={styles.label}>ชื่อหน้าจอ</span>
            <input
              className={styles.input}
              maxLength={TITLE_MAX}
              value={config.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>คำอธิบายบนหน้าจอ</span>
            <textarea
              className={styles.area}
              maxLength={NOTE_MAX}
              rows={4}
              value={config.note}
              onChange={(event) => patch({ note: event.target.value })}
            />
          </label>

          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('ลบรายการการ์ดพิเศษทั้งหมดและรีเซ็ตกลับเป็นค่าเริ่มต้น?')) {
                const result = reset();
                setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
              }
            }}
          >
            รีเซ็ตทั้งหมด
          </button>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            รายการการ์ดพิเศษ ({config.offers.length} รายการ · ผู้เล่นเห็น {live})
          </h3>

          {config.offers.length === 0 && (
            <p className={styles.legend}>ยังไม่มีรายการ — กด &quot;เพิ่มรายการ&quot; ด้านล่าง</p>
          )}

          {config.offers.map((offer) => {
            const special = offer.cardId ? byId(offer.cardId) : undefined;
            const count = offer.requiredIds.length;
            return (
              <div key={offer.id} className={`${styles.code} ${offer.enabled ? '' : styles.codeOff}`}>
                <div className={styles.offerTop}>
                  <label className={styles.field}>
                    <span className={styles.label}>ชื่อรายการ (เว้นว่าง = ชื่อการ์ดที่ขาย)</span>
                    <input
                      className={styles.input}
                      maxLength={NAME_MAX}
                      value={offer.name}
                      onChange={(event) => patchOffer(offer.id, { name: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>ราคา (Special Point)</span>
                    <input
                      className={styles.input}
                      inputMode="numeric"
                      defaultValue={offer.price}
                      key={`${offer.id}-price-${offer.price}`}
                      // Committed on blur, so a half-typed number never clamps.
                      onBlur={(event) => patchOffer(offer.id, { price: Math.min(MAX_PRICE, whole(event.target.value)) })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>ตีบวกที่ได้</span>
                    <select
                      className={styles.input}
                      value={offer.plus}
                      onChange={(event) => patchOffer(offer.id, { plus: Number(event.target.value) })}
                    >
                      {Array.from({ length: MAX_PLUS + 1 }, (_, plus) => (
                        <option key={plus} value={plus}>
                          +{plus}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.codeSide}>
                    <button
                      type="button"
                      className={`${styles.toggle} ${offer.enabled ? styles.toggleOn : ''}`}
                      onClick={() => patchOffer(offer.id, { enabled: !offer.enabled })}
                    >
                      {offer.enabled ? 'เปิด' : 'ปิด'}
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => {
                        if (window.confirm('ลบรายการนี้?')) {
                          patch({ offers: latest.current.offers.filter((entry) => entry.id !== offer.id) }, 'ลบรายการแล้ว');
                        }
                      }}
                    >
                      ลบ
                    </button>
                  </div>
                </div>

                <div className={styles.pickTitle}>
                  <span className={styles.label}>
                    การ์ดพิเศษที่ขาย: {special ? `${special.name} (${special.rating} · ${special.position})` : 'ยังไม่ได้เลือก'}
                  </span>
                </div>
                <AdminCardPicker
                  selected={offer.cardId ? [offer.cardId] : []}
                  max={1}
                  onChange={(ids) => patchOffer(offer.id, { cardId: ids[0] ?? '' })}
                />

                <div className={styles.pickTitle}>
                  <span className={styles.label}>การ์ดที่ผู้เล่นต้องมี (กดเลือกให้ครบ {REQUIRED_CARDS} ใบ)</span>
                  <span className={`${styles.pickCount} ${count === REQUIRED_CARDS ? styles.pickCountFull : ''}`}>
                    {count}/{REQUIRED_CARDS}
                  </span>
                </div>
                {count > 0 && (
                  <div className={styles.chosen}>
                    {offer.requiredIds.map((id) => {
                      const card = byId(id);
                      const art = card ? playerArtUrl(card.artId) : null;
                      return (
                        <span key={id} className={styles.chosenChip}>
                          {art && <img src={art} alt="" />}
                          {card?.name ?? 'การ์ดถูกลบ'}
                        </span>
                      );
                    })}
                  </div>
                )}
                <AdminCardPicker
                  selected={offer.requiredIds}
                  max={REQUIRED_CARDS}
                  onChange={(ids) => patchOffer(offer.id, { requiredIds: ids })}
                />

                {!isComplete(offer) && (
                  <p className={styles.warn}>
                    ยังไม่ครบ — {count < REQUIRED_CARDS ? `เลือกการ์ดที่ต้องมีอีก ${REQUIRED_CARDS - count} ใบ` : ''}
                    {count < REQUIRED_CARDS && !offer.cardId ? ' และ' : ''}
                    {!offer.cardId ? 'เลือกการ์ดพิเศษที่ขาย' : ''} · ผู้เล่นยังมองไม่เห็นรายการนี้
                  </p>
                )}
                <span className={styles.mine}>{progress.bought[offer.id] ? 'ไอดีนี้ซื้อรายการนี้แล้ว' : 'ไอดีนี้ยังไม่ได้ซื้อ'}</span>
              </div>
            );
          })}

          <button type="button" className={styles.ghost} disabled={config.offers.length >= MAX_OFFERS} onClick={addOffer}>
            + เพิ่มรายการ
          </button>
        </div>
      </div>
    </div>
  );
}
