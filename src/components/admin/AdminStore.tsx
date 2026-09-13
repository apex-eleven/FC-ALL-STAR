import { useMemo, useState } from 'react';
import { currencies } from '@/data/mock/currencies';
import { CURRENCY_ORDER } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import {
  MAX_PACKS_PER_EVENT,
  PACK_BADGE_MAX,
  PACK_LABEL_MAX,
  PACK_LIMIT_MAX,
  PACK_PULLS_MAX,
} from '@/features/draft/constants';
import { useDraft } from '@/features/draft/DraftContext';
import type { SaveResult } from '@/features/draft/draftConfigStore';
import type { DraftEvent, DraftPack } from '@/features/draft/types';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { playerArtUrl } from '@/features/players/artManifest';
import { usePlayers } from '@/features/players/PlayerContext';
import AdminShowcase from './AdminShowcase';
import styles from './AdminStore.module.css';

const SAVE_ERROR: Record<'quota' | 'unavailable', string> = {
  quota: 'พื้นที่เก็บข้อมูลเต็ม — ลบรูปแบนเนอร์หรือแพ็คเก่าออกก่อน',
  unavailable: 'เบราว์เซอร์บล็อกการบันทึก',
};

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function newPackId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `pk-${crypto.randomUUID()}`;
  return `pk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** `2026-01-31T18:00:00.000Z` -> `2026-01-31T18:00`, which is what the input wants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function statusOf(event: DraftEvent): { text: string; tone: 'live' | 'off' | 'wait' } {
  if (event.hidden) return { text: 'ปิดอยู่', tone: 'off' };
  if (event.pool.length === 0) return { text: 'ยังไม่มีการ์ด', tone: 'wait' };
  if (event.packs.filter((pack) => pack.visible !== false).length === 0) {
    return { text: 'ยังไม่มีปุ่มขาย', tone: 'wait' };
  }
  if (!event.live) return { text: 'นอกช่วงเวลา', tone: 'wait' };
  return { text: 'เปิดขายอยู่', tone: 'live' };
}

/**
 * The pack store.
 *
 * One screen for the whole shop: which packs exist, what is inside them, what they
 * cost, and when they sell. Odds and pity thresholds stay on the "อัตราสุ่ม" tab —
 * they are per-event tuning that existed before this panel and still works there.
 */
export default function AdminStore() {
  const {
    events,
    setRailName,
    setTitle,
    setPoolIds,
    setPacks,
    setHidden,
    setOrder,
    setWindow,
    createEvent,
    deleteEvent,
    removedEvents,
    restoreEvent,
    setShowcase,
  } = useDraft();
  const { players } = usePlayers();

  const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id ?? null);
  const [status, setStatus] = useState<Status>(null);
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<PlayerSet | 'all'>('all');
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? events[0] ?? null,
    [events, selectedId],
  );

  const report = (result: SaveResult, success: string) =>
    setStatus(
      result.ok ? { tone: 'ok', text: success } : { tone: 'bad', text: SAVE_ERROR[result.reason] },
    );

  const inPool = useMemo(
    () => new Set(selected?.pool.map((player) => player.id) ?? []),
    [selected],
  );

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players
      .filter((card) => (tierFilter === 'all' ? true : card.set === tierFilter))
      .filter(
        (card) =>
          !needle ||
          card.name.toLowerCase().includes(needle) ||
          card.club.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.rating - a.rating);
  }, [players, query, tierFilter]);

  const tierCounts = useMemo(() => {
    const counts: Record<PlayerSet, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const player of selected?.pool ?? []) counts[player.set] += 1;
    return counts;
  }, [selected]);

  /**
   * Pool edits always write the full id list.
   *
   * A catalogue event starts with its shipped pool of inline players; the first edit
   * converts it to ids, which is why the current pool is read back out rather than
   * assumed to already be a list of catalogue cards.
   */
  function togglePlayer(cardId: string) {
    if (!selected) return;
    const current = selected.pool.map((player) => player.id);
    const next = current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : [...current, cardId];
    report(setPoolIds(selected.id, next), `พูลของ ${selected.railName}: ${next.length} ใบ`);
  }

  function patchPack(packId: string, changes: Partial<DraftPack>) {
    if (!selected) return;
    const next = selected.packs.map((pack) => (pack.id === packId ? { ...pack, ...changes } : pack));
    report(setPacks(selected.id, next), 'บันทึกปุ่มขายแล้ว');
  }

  function addPack() {
    if (!selected || selected.packs.length >= MAX_PACKS_PER_EVENT) return;
    const pack: DraftPack = {
      id: newPackId(),
      label: selected.packs.length === 0 ? 'สุ่ม 1 ครั้ง' : 'สุ่ม 10 ครั้ง',
      cost: selected.packs.length === 0 ? 100 : 900,
      currency: CURRENCY_ORDER[0]!,
      pulls: selected.packs.length === 0 ? 1 : 10,
      visible: true,
    };
    report(setPacks(selected.id, [...selected.packs, pack]), 'เพิ่มปุ่มขายแล้ว');
  }

  function removePack(packId: string) {
    if (!selected) return;
    report(
      setPacks(
        selected.id,
        selected.packs.filter((pack) => pack.id !== packId),
      ),
      'ลบปุ่มขายแล้ว',
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          จัดการร้านค้าแพ็คทั้งหมด · เลือกการ์ดลงแพ็ค ตั้งราคา จำนวนครั้งที่สุ่มได้
          ช่วงเวลาเปิดขาย และลิมิตต่อผู้เล่น
        </p>
      </div>

      <div className={styles.columns}>
        {/* ---- pack list ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>แพ็คทั้งหมด ({events.length})</h3>

          <div className={styles.eventList}>
            {events.map((event) => {
              const state = statusOf(event);
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`${styles.eventRow} ${event.id === selected?.id ? styles.eventOn : ''}`}
                  onClick={() => setSelectedId(event.id)}
                >
                  <span className={styles.eventName}>
                    {event.railName}
                    {event.custom && <span className={styles.tagCustom}>สร้างเอง</span>}
                  </span>
                  <span className={`${styles.state} ${styles[state.tone] ?? ''}`}>{state.text}</span>
                  <span className={styles.eventMeta}>
                    {event.pool.length} ใบ · {event.packs.length} ปุ่ม
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.createRow}>
            <input
              className={styles.input}
              placeholder="ชื่อแพ็คใหม่"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                const { result, id } = createEvent(newName);
                report(result, 'สร้างแพ็คใหม่แล้ว — ยังปิดอยู่จนกว่าจะใส่การ์ดและตั้งราคา');
                if (id) setSelectedId(id);
                setNewName('');
              }}
            >
              สร้าง
            </button>
          </div>
          <p className={styles.legend}>
            แพ็คใหม่เกิดมาในสถานะปิด ไม่มีการ์ด ไม่มีราคา · ตั้งใจให้เป็นแบบนั้น
            เพราะแพ็คที่เปิดขายทันทีที่ตั้งชื่อคือแพ็คที่ขายของว่างเปล่า
          </p>

          {removedEvents.length > 0 && (
            <div className={styles.removedBlock}>
              <span className={styles.label}>แพ็คที่ลบไปแล้ว ({removedEvents.length})</span>
              {/* Packs that ship in code cannot be erased from the source at runtime,
                  so a deleted one is remembered as deleted — and can come back. */}
              {removedEvents.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={styles.ghost}
                  onClick={() => report(restoreEvent(id), 'คืนค่าแพ็คแล้ว')}
                >
                  คืนค่า {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---- editor ---- */}
        {selected ? (
          <div className={styles.editor}>
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>ข้อมูลแพ็ค</h3>

              <div className={styles.grid2}>
                <label className={styles.field}>
                  <span className={styles.label}>ชื่อบนแถบเลือก</span>
                  <input
                    className={styles.input}
                    value={selected.railName}
                    onChange={(event) => report(setRailName(selected.id, event.target.value), 'บันทึกแล้ว')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>หัวข้อบนแบนเนอร์</span>
                  <input
                    className={styles.input}
                    value={selected.title}
                    onChange={(event) => report(setTitle(selected.id, event.target.value), 'บันทึกแล้ว')}
                  />
                </label>
              </div>

              <div className={styles.grid3}>
                <div className={styles.field}>
                  <span className={styles.label}>สถานะ</span>
                  <button
                    type="button"
                    data-sound="toggle"
                    aria-pressed={!selected.hidden}
                    className={`${styles.switch} ${!selected.hidden ? styles.switchOn : ''}`}
                    onClick={() =>
                      report(
                        setHidden(selected.id, !selected.hidden),
                        selected.hidden ? 'เปิดขายแล้ว' : 'ปิดขายแล้ว',
                      )
                    }
                  >
                    {selected.hidden ? 'ปิดขาย' : 'เปิดขาย'}
                  </button>
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>ลำดับบนแถบ (น้อย = ซ้าย)</span>
                  <input
                    className={styles.input}
                    value={selected.order}
                    inputMode="numeric"
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value.replace(/[^\d]/g, ''), 10);
                      if (Number.isFinite(value)) report(setOrder(selected.id, value), 'จัดลำดับแล้ว');
                    }}
                  />
                </label>

                <div className={styles.field}>
                  <span className={styles.label}>ลบแพ็คนี้</span>
                  {confirmDelete === selected.id ? (
                    <div className={styles.confirmRow}>
                      <button
                        type="button"
                        className={styles.danger}
                        data-sound="back"
                        onClick={() => {
                          const wasCustom = selected.custom;
                          report(
                            deleteEvent(selected.id),
                            wasCustom ? 'ลบแพ็คแล้ว' : 'ลบแพ็คแล้ว — กดคืนค่าได้ด้านซ้าย',
                          );
                          setSelectedId(null);
                          setConfirmDelete(null);
                        }}
                      >
                        ยืนยันลบ
                      </button>
                      <button type="button" className={styles.ghost} onClick={() => setConfirmDelete(null)}>
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => setConfirmDelete(selected.id)}
                    >
                      ลบแพ็ค
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.grid2}>
                <label className={styles.field}>
                  <span className={styles.label}>เริ่มขาย</span>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={toLocalInput(selected.startsAt)}
                    onChange={(event) =>
                      report(
                        setWindow(selected.id, fromLocalInput(event.target.value), selected.endsAt),
                        'ตั้งเวลาแล้ว',
                      )
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ปิดขาย</span>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={toLocalInput(selected.endsAt)}
                    onChange={(event) =>
                      report(
                        setWindow(selected.id, selected.startsAt, fromLocalInput(event.target.value)),
                        'ตั้งเวลาแล้ว',
                      )
                    }
                  />
                </label>
              </div>
              <p className={styles.legend}>
                เว้นว่างทั้งคู่ = ขายตลอด · เวลาอิงนาฬิกาเครื่องผู้เล่น ไม่ใช่เซิร์ฟเวอร์
                เพราะเกมนี้ยังไม่มีเซิร์ฟเวอร์ให้อิง
              </p>
            </div>

            {/* ---- contents ---- */}
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>
                การ์ดในแพ็ค — {selected.pool.length} ใบ
                <span className={styles.counts}>
                  {PLAYER_SETS.map((set) => (
                    <span key={set} className={`${styles.count} ${styles[`set${set}`] ?? ''}`}>
                      {set} {tierCounts[set]}
                    </span>
                  ))}
                </span>
              </h3>

              <div className={styles.filters}>
                <input
                  className={styles.input}
                  placeholder="ค้นหาการ์ดในคลัง"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className={styles.chips}>
                  <button
                    type="button"
                    className={`${styles.chip} ${tierFilter === 'all' ? styles.chipOn : ''}`}
                    onClick={() => setTierFilter('all')}
                  >
                    ทั้งหมด
                  </button>
                  {PLAYER_SETS.map((set) => (
                    <button
                      key={set}
                      type="button"
                      className={`${styles.chip} ${tierFilter === set ? styles.chipOn : ''}`}
                      onClick={() => setTierFilter(set)}
                    >
                      {set}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.cardGrid}>
                {candidates.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`${styles.cardCell} ${inPool.has(card.id) ? styles.cardOn : ''}`}
                    onClick={() => togglePlayer(card.id)}
                    title={`${card.name} · ${card.rating} · ชุด ${card.set}`}
                  >
                    <img
                      className={styles.cardArt}
                      src={playerArtUrl(card.artId) ?? ''}
                      alt=""
                      loading="lazy"
                    />
                    <span className={styles.cardName}>{card.name}</span>
                    <span className={styles.cardRating}>{card.rating}</span>
                  </button>
                ))}
              </div>

              {!selected.custom && !selected.poolIdsOverridden && selected.pool.length > 0 && (
                <p className={styles.legend}>
                  แพ็คนี้ยังใช้พูลตัวอย่างที่มากับเกม ({selected.pool.length} ใบ) ·
                  พอกดเลือกการ์ดใบแรกจากคลัง พูลจะเปลี่ยนมาใช้คลังการ์ดแทนทั้งหมด
                  กดคืนค่าที่แท็บ "อัตราสุ่ม" ถ้าอยากได้พูลเดิมกลับมา
                </p>
              )}
              {players.length === 0 && (
                <p className={styles.legend}>
                  คลังการ์ดยังว่าง — ไปสร้างการ์ดที่แท็บ "การ์ดนักเตะ" ก่อน
                </p>
              )}
              {selected.pool.length > 0 && tierCounts[selected.pool[0]!.set] === selected.pool.length && (
                <p className={styles.legend}>
                  ตอนนี้มีแค่ชุดเดียวในพูล · อัตราสุ่มจะถูกปรับให้เหลือชุดที่มีคนอยู่จริงโดยอัตโนมัติ
                </p>
              )}
            </div>

            {/* ---- card placement ---- */}
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>ตำแหน่งการ์ดบนแบนเนอร์</h3>
              <AdminShowcase
                event={selected}
                onChange={(slots) => report(setShowcase(selected.id, slots), 'จัดตำแหน่งแล้ว')}
              />
            </div>

            {/* ---- store buttons ---- */}
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>ปุ่มขายในร้าน ({selected.packs.length}/{MAX_PACKS_PER_EVENT})</h3>

              {selected.packs.map((pack) => (
                <div key={pack.id} className={styles.packRow}>
                  <div className={styles.grid4}>
                    <label className={styles.field}>
                      <span className={styles.label}>ข้อความบนปุ่ม</span>
                      <input
                        className={styles.input}
                        value={pack.label}
                        maxLength={PACK_LABEL_MAX}
                        onChange={(event) => patchPack(pack.id, { label: event.target.value })}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>สุ่มกี่ใบต่อกด</span>
                      <input
                        className={styles.input}
                        value={pack.pulls}
                        inputMode="numeric"
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value.replace(/[^\d]/g, ''), 10);
                          if (Number.isFinite(value)) {
                            patchPack(pack.id, { pulls: Math.max(1, Math.min(PACK_PULLS_MAX, value)) });
                          }
                        }}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>ราคา</span>
                      <input
                        className={styles.input}
                        value={pack.cost}
                        inputMode="numeric"
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value.replace(/[^\d]/g, ''), 10);
                          patchPack(pack.id, { cost: Number.isFinite(value) ? value : 0 });
                        }}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>สกุลเงิน</span>
                      <select
                        className={styles.input}
                        value={pack.currency}
                        onChange={(event) =>
                          patchPack(pack.id, { currency: event.target.value as CurrencyKind })
                        }
                      >
                        {CURRENCY_ORDER.map((kind) => (
                          <option key={kind} value={kind}>
                            {currencies[kind].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.grid4}>
                    <label className={styles.field}>
                      <span className={styles.label}>ราคาเดิม (ขีดฆ่า)</span>
                      <input
                        className={styles.input}
                        value={pack.listCost ?? ''}
                        inputMode="numeric"
                        placeholder="ไม่ลด"
                        onChange={(event) => {
                          const raw = event.target.value.replace(/[^\d]/g, '');
                          const value = Number.parseInt(raw, 10);
                          patchPack(pack.id, { listCost: Number.isFinite(value) ? value : 0 });
                        }}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>ป้ายมุมปุ่ม</span>
                      <input
                        className={styles.input}
                        value={pack.badge ?? ''}
                        maxLength={PACK_BADGE_MAX}
                        placeholder="เช่น คุ้มที่สุด"
                        onChange={(event) => patchPack(pack.id, { badge: event.target.value })}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>จำกัดต่อผู้เล่น (0 = ไม่จำกัด)</span>
                      <input
                        className={styles.input}
                        value={pack.limitPerAccount ?? 0}
                        inputMode="numeric"
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value.replace(/[^\d]/g, ''), 10);
                          patchPack(pack.id, {
                            limitPerAccount: Number.isFinite(value)
                              ? Math.min(PACK_LIMIT_MAX, value)
                              : 0,
                          });
                        }}
                      />
                    </label>

                    <div className={styles.field}>
                      <span className={styles.label}>แสดงในร้าน</span>
                      <div className={styles.confirmRow}>
                        <button
                          type="button"
                          data-sound="toggle"
                          aria-pressed={pack.visible !== false}
                          className={`${styles.switch} ${pack.visible !== false ? styles.switchOn : ''}`}
                          onClick={() => patchPack(pack.id, { visible: pack.visible === false })}
                        >
                          {pack.visible !== false ? 'แสดง' : 'ซ่อน'}
                        </button>
                        <button
                          type="button"
                          className={styles.danger}
                          data-sound="back"
                          onClick={() => removePack(pack.id)}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className={styles.primary}
                disabled={selected.packs.length >= MAX_PACKS_PER_EVENT}
                onClick={addPack}
              >
                เพิ่มปุ่มขาย
              </button>

              <p className={styles.legend}>
                ลิมิตนับแยกรายบัญชีต่อปุ่ม เก็บไว้ในเซฟของผู้เล่นเอง — เกมนี้ไม่มีเซิร์ฟเวอร์
                ตัวเลขสต็อกรวมทั้งเกมจึงเป็นเลขที่แต่ละเบราว์เซอร์คิดขึ้นเอง ไม่ทำจะตรงกว่า
                <br />
                อัตราสุ่มแต่ละชุดกับตัวนับรับประกัน ปรับได้ที่แท็บ "อัตราสุ่ม"
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.block}>
            <p className={styles.legend}>ยังไม่มีแพ็คให้แก้ไข</p>
          </div>
        )}
      </div>

      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}
    </div>
  );
}
