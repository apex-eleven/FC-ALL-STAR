import { useMemo, useState } from 'react';
import { formatCurrency } from '@/features/currencies/constants';
import { usePlayers } from '@/features/players/PlayerContext';
import { MAX_BANDS, MAX_WATCH_LIMIT } from '@/features/transfers/constants';
import { bandFor, buyPrice } from '@/features/transfers/transfer';
import { useTransfer } from '@/features/transfers/TransferContext';
import type { CardPrice, PriceBand } from '@/features/transfers/types';
import styles from './AdminTransfer.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const LIST_LIMIT = 120;

function parse(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? null : Number.parseInt(digits, 10);
}

/**
 * Signing-market settings: the OVR price ladder, per-card overrides, and which
 * cards are for sale at all.
 */
export default function AdminTransfer() {
  const { config, update, setOverride, reset } = useTransfer();
  const { players } = usePlayers();
  const [status, setStatus] = useState<Status>(null);
  const [query, setQuery] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);

  function report(result: { ok: boolean }, text = 'บันทึกแล้ว') {
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patchBand(index: number, changes: Partial<PriceBand>) {
    report(
      update({
        bands: config.bands.map((band, i) => (i === index ? { ...band, ...changes } : band)),
      }),
    );
  }

  function patchCard(cardId: string, changes: Partial<CardPrice>) {
    const current = config.overrides[cardId] ?? { buy: null, sell: null, hidden: false };
    report(setOverride(cardId, { ...current, ...changes }));
  }

  // Selling for as much as buying turns the market into a free swap; selling for
  // more prints points. Neither is refused — the admin may want it for an event —
  // but it is called out.
  const leaks = config.bands.filter((band) => band.buy > 0 && band.sell >= band.buy);

  const hiddenCount = Object.values(config.overrides).filter((entry) => entry.hidden).length;
  const listedCount = players.filter(
    (card) => !config.overrides[card.id]?.hidden && buyPrice(card, config) > 0,
  ).length;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...players]
      .filter((card) => !onlyEdited || config.overrides[card.id] !== undefined)
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  }, [players, query, onlyEdited, config.overrides]);

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        การเซ็นสัญญาดาวเด่น · ผู้เล่นใช้แต้มแลกเปลี่ยนแลกการ์ด และขายการ์ดของตัวเองคืนเป็นแต้ม ·
        ราคาเริ่มจากช่วง OVR แล้วตั้งทับรายใบได้ · ใส่ 0 = ปิดการแลก/ขายของส่วนนั้น
      </p>

      <div className={styles.columns}>
        {/* ---- general ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ทั่วไป</h3>

          <div className={styles.line}>
            <span className={styles.lineLabel}>เปิดใช้งาน</span>
            <button
              type="button"
              data-sound="toggle"
              aria-pressed={config.enabled}
              className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
              onClick={() =>
                report(
                  update({ enabled: !config.enabled }),
                  config.enabled ? 'ปิดการเซ็นสัญญาแล้ว' : 'เปิดการเซ็นสัญญาแล้ว',
                )
              }
            >
              {config.enabled ? 'เปิด' : 'ปิด'}
            </button>
          </div>

          <div className={styles.line}>
            <span className={styles.lineLabel}>รายการติดตามสูงสุด</span>
            <input
              className={styles.num}
              inputMode="numeric"
              value={config.watchLimit}
              onChange={(event) =>
                report(update({ watchLimit: parse(event.target.value) ?? 0 }))
              }
            />
            <span className={styles.unit}>ใบต่อไอดี · 0–{MAX_WATCH_LIMIT}</span>
          </div>

          <p className={styles.legend}>
            ขายอยู่ {formatCurrency(listedCount)} จาก {formatCurrency(players.length)} ใบ · ซ่อนไว้{' '}
            {hiddenCount} ใบ
            <br />
            การ์ดที่อยู่ในไลน์อัปหรือผู้เล่นล็อกไว้จะขายไม่ได้ ราคาขายคิดจาก OVR พื้นฐาน ไม่รวมโบนัสตีบวก
          </p>
        </div>

        {/* ---- bands ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ราคาตามช่วง OVR</h3>

          <div className={styles.bandHead}>
            <span>ตั้งแต่ OVR</span>
            <span>ราคาแลก</span>
            <span>ขายคืนได้</span>
            <span />
          </div>

          {config.bands.map((band, index) => (
            <div className={styles.bandRow} key={`${band.minRating}-${index}`}>
              {/* Committed on blur, not per keystroke: the ladder re-sorts on every
                  save, and a half-typed start would jump the row or collide with
                  another band mid-edit. */}
              <input
                key={`start-${band.minRating}`}
                className={styles.num}
                inputMode="numeric"
                defaultValue={band.minRating}
                disabled={index === 0}
                title={index === 0 ? 'ช่วงแรกเริ่มที่ 0 เสมอ' : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                onBlur={(event) => {
                  const start = Math.min(199, parse(event.target.value) ?? band.minRating);
                  if (start === band.minRating) {
                    event.target.value = String(band.minRating);
                    return;
                  }
                  if (start === 0 || config.bands.some((other) => other.minRating === start)) {
                    event.target.value = String(band.minRating);
                    setStatus({ tone: 'bad', text: `มีช่วงที่เริ่ม OVR ${start} อยู่แล้ว` });
                    return;
                  }
                  patchBand(index, { minRating: start });
                }}
              />
              <input
                className={styles.price}
                inputMode="numeric"
                value={band.buy}
                onChange={(event) => patchBand(index, { buy: parse(event.target.value) ?? 0 })}
              />
              <input
                className={styles.price}
                inputMode="numeric"
                value={band.sell}
                onChange={(event) => patchBand(index, { sell: parse(event.target.value) ?? 0 })}
              />
              <button
                type="button"
                className={styles.danger}
                data-sound="back"
                disabled={index === 0}
                onClick={() =>
                  report(update({ bands: config.bands.filter((_, i) => i !== index) }))
                }
              >
                ลบ
              </button>
            </div>
          ))}

          <div className={styles.row}>
            <button
              type="button"
              className={styles.ghost}
              disabled={config.bands.length >= MAX_BANDS}
              onClick={() => {
                const last = config.bands.at(-1);
                if ((last?.minRating ?? 0) >= 199) {
                  setStatus({ tone: 'bad', text: 'ช่วงสุดท้ายเริ่มที่ OVR สูงสุดแล้ว' });
                  return;
                }
                report(
                  update({
                    bands: [
                      ...config.bands,
                      {
                        minRating: Math.min(199, (last?.minRating ?? 0) + 5),
                        buy: last?.buy ?? 0,
                        sell: last?.sell ?? 0,
                      },
                    ],
                  }),
                );
              }}
            >
              เพิ่มช่วง
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => report(reset(), 'คืนค่าเริ่มต้นทั้งหมดแล้ว')}
            >
              คืนค่าเริ่มต้นทั้งหมด
            </button>
          </div>

          {leaks.length > 0 && (
            <p className={styles.warn}>
              ช่วง OVR {leaks.map((band) => band.minRating).join(', ')} ขายคืนได้เท่ากับหรือมากกว่าราคาแลก
              ผู้เล่นจะแลกแล้วขายวนได้แต้มฟรี
            </p>
          )}

          <p className={styles.legend}>
            แต่ละแถวคือ &quot;ตั้งแต่ OVR นี้ขึ้นไป&quot; จนถึงแถวถัดไป · ช่วงแรกเริ่มที่ 0 เสมอ
          </p>
        </div>

        {/* ---- per card ---- */}
        <div className={`${styles.block} ${styles.cards}`}>
          <h3 className={styles.blockTitle}>ราคารายใบ</h3>

          <div className={styles.line}>
            <input
              className={styles.search}
              placeholder="ค้นหาชื่อการ์ด"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              aria-pressed={onlyEdited}
              className={`${styles.toggle} ${onlyEdited ? styles.toggleOn : ''}`}
              onClick={() => setOnlyEdited((was) => !was)}
            >
              เฉพาะที่ตั้งเอง ({Object.keys(config.overrides).length})
            </button>
          </div>

          <div className={styles.cardHead}>
            <span>การ์ด</span>
            <span>OVR</span>
            <span>ราคาแลก</span>
            <span>ขายคืนได้</span>
            <span>ขาย</span>
            <span />
          </div>

          <div className={styles.list}>
            {rows.slice(0, LIST_LIMIT).map((card) => {
              const override = config.overrides[card.id];
              const band = bandFor(card.rating, config.bands);
              return (
                <div
                  className={`${styles.cardRow} ${override?.hidden ? styles.cardHidden : ''}`}
                  key={card.id}
                >
                  <span className={styles.cardName} title={card.name}>
                    {card.name}
                    <span className={styles.cardPos}>{card.position}</span>
                  </span>
                  <span className={styles.cardOvr}>{card.rating}</span>
                  <input
                    className={styles.price}
                    inputMode="numeric"
                    placeholder={formatCurrency(band?.buy ?? 0)}
                    value={override?.buy ?? ''}
                    onChange={(event) => patchCard(card.id, { buy: parse(event.target.value) })}
                  />
                  <input
                    className={styles.price}
                    inputMode="numeric"
                    placeholder={formatCurrency(band?.sell ?? 0)}
                    value={override?.sell ?? ''}
                    onChange={(event) => patchCard(card.id, { sell: parse(event.target.value) })}
                  />
                  <button
                    type="button"
                    aria-pressed={!override?.hidden}
                    className={`${styles.toggle} ${override?.hidden ? '' : styles.toggleOn}`}
                    onClick={() => patchCard(card.id, { hidden: !override?.hidden })}
                  >
                    {override?.hidden ? 'ซ่อน' : 'ขาย'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={!override}
                    onClick={() => patchCard(card.id, { buy: null, sell: null, hidden: false })}
                  >
                    ล้าง
                  </button>
                </div>
              );
            })}
            {rows.length > LIST_LIMIT && (
              <p className={styles.legend}>
                แสดง {LIST_LIMIT} จาก {formatCurrency(rows.length)} ใบ — พิมพ์ชื่อเพื่อค้นหาใบอื่น
              </p>
            )}
            {rows.length === 0 && <p className={styles.legend}>ไม่พบการ์ด</p>}
          </div>

          <p className={styles.legend}>
            ช่องว่าง = ใช้ราคาตามช่วง OVR (ตัวเลขจางคือราคาช่วง) · ใส่ 0 = ปิดการแลกหรือการขายของใบนั้น
          </p>
        </div>
      </div>

      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}
    </div>
  );
}
