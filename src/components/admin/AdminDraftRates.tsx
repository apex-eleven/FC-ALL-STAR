import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ASSETS } from '@/assets/assetMap';
import { useDraft } from '@/features/draft/DraftContext';
import { PLAYER_SETS } from '@/features/draft/types';
import type { DraftPlayer, PityRule, PlayerSet, SetOdds } from '@/features/draft/types';
import styles from './AdminDraftRates.module.css';

const SET_PORTRAIT: Record<PlayerSet, string> = {
  A: ASSETS.draft.portraitA,
  B: ASSETS.draft.portraitB,
  C: ASSETS.draft.portraitC,
  D: ASSETS.draft.portraitD,
};

/**
 * A guarantee rule for one tier.
 *
 * Packs created in the admin panel start with none — they have no catalogue entry to
 * inherit from — so without this there was no way to promise "ชุด A ใน 40 ครั้ง" on a
 * pack that was not written in code.
 */
function newRule(set: PlayerSet, threshold: number): PityRule {
  return {
    id: `pity-${set.toLowerCase()}-${Date.now().toString(36)}`,
    set,
    threshold,
    label: `รับประกันชุด ${set}`,
    description: `ครบ ${threshold} ครั้งได้ชุด ${set} แน่นอน`,
    tone: set === 'A' ? 'primary' : 'secondary',
  };
}

function newPlayer(index: number): DraftPlayer {
  return {
    id: `custom-${Date.now().toString(36)}-${index}`,
    name: 'นักเตะใหม่',
    rating: 100,
    position: 'CM',
    set: 'D',
    portrait: SET_PORTRAIT.D,
    nation: 'XX',
    club: 'สโมสรอิสระ',
  };
}

/**
 * Odds, pity thresholds, and the player pool.
 *
 * Kept apart from the artwork tab because these are the numbers that decide what a
 * pull is worth. Editing them here is fine while the whole game runs in the browser;
 * the moment pulls cost real money these move server-side and this panel becomes a
 * read-only view.
 */
export default function AdminDraftRates() {
  const { events, setOdds, setPityThreshold, setPity, setPool, resetEvent, hasOverrides } =
    useDraft();
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const event = events.find((candidate) => candidate.id === selectedId) ?? events[0];
  if (!event) return null;

  const totalWeight = PLAYER_SETS.reduce((sum, set) => sum + (event.odds[set] ?? 0), 0);
  const populated = new Set(event.pool.map((player) => player.set));

  const report = (result: { ok: boolean }) =>
    setError(result.ok ? null : 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลอาจเต็ม');

  function updateOdds(set: PlayerSet, raw: string) {
    if (!event) return;
    const value = Math.max(0, Math.min(1000, Number.parseInt(raw || '0', 10) || 0));
    report(setOdds(event.id, { ...event.odds, [set]: value } as SetOdds));
  }

  function updatePool(next: DraftPlayer[]) {
    if (!event) return;
    // An empty pool makes every pull fail, so the last player cannot be removed.
    if (next.length === 0) return;
    report(setPool(event.id, next));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.picker} role="tablist">
        {events.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            role="tab"
            aria-selected={candidate.id === event.id}
            className={`${styles.pick} ${candidate.id === event.id ? styles.pickActive : ''}`}
            onClick={() => setSelectedId(candidate.id)}
          >
            {candidate.railName}
          </button>
        ))}
      </div>

      <div className={styles.panels}>
        <div className={styles.column}>
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>อัตราการออก (น้ำหนัก ไม่ใช่เปอร์เซ็นต์)</h3>
            {PLAYER_SETS.map((set) => {
              const weight = event.odds[set] ?? 0;
              const share = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;

              return (
                <div className={styles.line} key={set}>
                  <span className={styles.lineLabel}>ชุด {set}</span>
                  <input
                    className={styles.num}
                    value={weight}
                    inputMode="numeric"
                    aria-label={`น้ำหนักชุด ${set}`}
                    onChange={(changeEvent) =>
                      updateOdds(set, changeEvent.target.value.replace(/[^\d]/g, ''))
                    }
                  />
                  <span className={styles.pct}>{share.toFixed(1)}%</span>
                  {!populated.has(set) && <span className={styles.muted}>ไม่มีนักเตะ</span>}
                </div>
              );
            })}
            <p className={styles.warn}>
              ชุดที่ไม่มีนักเตะจะถูกตัดออกจากการสุ่ม น้ำหนักของมันจะไม่ถูกนับ
            </p>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>รับประกัน (ครบกี่ครั้งถึงการันตี)</h3>
            {event.pity.map((rule) => (
              <div className={styles.line} key={rule.id}>
                <span className={styles.lineLabel}>{rule.label}</span>
                <input
                  className={styles.num}
                  value={rule.threshold}
                  inputMode="numeric"
                  aria-label={`เกณฑ์รับประกัน ${rule.label}`}
                  onChange={(changeEvent) => {
                    const digits = changeEvent.target.value.replace(/[^\d]/g, '');
                    if (digits === '') return;
                    report(setPityThreshold(event.id, rule.id, Number.parseInt(digits, 10)));
                  }}
                />
                <span className={styles.muted}>ครั้ง</span>
                <button
                  type="button"
                  className={styles.add}
                  data-sound="back"
                  aria-label={`ลบ ${rule.label}`}
                  onClick={() =>
                    report(setPity(event.id, event.pity.filter((entry) => entry.id !== rule.id)))
                  }
                >
                  <Trash2 size={16} strokeWidth={2.4} />
                </button>
              </div>
            ))}

            <div className={styles.line}>
              {(['A', 'B'] as const).map((set) => (
                <button
                  key={set}
                  type="button"
                  className={styles.add}
                  // One rule per tier: two guarantees for the same set would race each
                  // other and only the first could ever fire.
                  disabled={event.pity.some((rule) => rule.set === set)}
                  onClick={() =>
                    report(
                      setPity(event.id, [
                        ...event.pity,
                        newRule(set, set === 'A' ? 40 : 10),
                      ]),
                    )
                  }
                >
                  + รับประกันชุด {set}
                </button>
              ))}
            </div>

            {event.pity.length === 0 && (
              <p className={styles.warn}>
                แพ็คนี้ยังไม่มีรับประกัน · กดปุ่มด้านบนเพื่อเพิ่ม แล้วแก้ตัวเลขครั้งได้เลย
              </p>
            )}

            <p className={styles.warn}>
              ได้ชุดที่ดีกว่าจะรีเซ็ตตัวนับของชุดที่ต่ำกว่าด้วย ตัวนับของผู้เล่นที่เล่นไปแล้วไม่ถูกรีเซ็ตเมื่อแก้เกณฑ์
            </p>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.reset}
              onClick={() => report(resetEvent(event.id))}
              disabled={!hasOverrides}
            >
              คืนค่าเริ่มต้นของดราฟต์นี้
            </button>
            {error && <span className={styles.status}>{error}</span>}
          </div>
        </div>

        <div className={styles.column}>
          <div className={styles.poolHead}>
            <h3 className={styles.blockTitle}>
              พูลนักเตะ ({event.pool.length} คน) · การ์ดที่โชว์บนแบนเนอร์คือ 4 คนที่เรตติ้งสูงสุด
            </h3>
            <button
              type="button"
              className={styles.add}
              onClick={() => updatePool([...event.pool, newPlayer(event.pool.length)])}
            >
              เพิ่มนักเตะ
            </button>
          </div>

          <div className={styles.pool}>
            {event.pool.map((player, index) => (
              <div className={styles.row} key={player.id}>
                <input
                  className={styles.text}
                  value={player.name}
                  aria-label="ชื่อนักเตะ"
                  onChange={(changeEvent) =>
                    updatePool(
                      event.pool.map((p, i) =>
                        i === index ? { ...p, name: changeEvent.target.value } : p,
                      ),
                    )
                  }
                />
                <input
                  className={styles.text}
                  value={player.rating}
                  inputMode="numeric"
                  aria-label="เรตติ้ง"
                  onChange={(changeEvent) => {
                    const digits = changeEvent.target.value.replace(/[^\d]/g, '');
                    if (digits === '') return;
                    updatePool(
                      event.pool.map((p, i) =>
                        i === index
                          ? { ...p, rating: Math.max(1, Math.min(199, Number.parseInt(digits, 10))) }
                          : p,
                      ),
                    );
                  }}
                />
                <input
                  className={styles.text}
                  value={player.position}
                  maxLength={4}
                  aria-label="ตำแหน่ง"
                  onChange={(changeEvent) =>
                    updatePool(
                      event.pool.map((p, i) =>
                        i === index
                          ? { ...p, position: changeEvent.target.value.toUpperCase() }
                          : p,
                      ),
                    )
                  }
                />
                <div className={styles.setPicker}>
                  {PLAYER_SETS.map((set) => (
                    <button
                      type="button"
                      key={set}
                      aria-label={`ชุด ${set}`}
                      aria-pressed={player.set === set}
                      className={`${styles.setButton} ${player.set === set ? styles.setActive : ''}`}
                      onClick={() =>
                        updatePool(
                          event.pool.map((p, i) =>
                            i === index ? { ...p, set, portrait: SET_PORTRAIT[set] } : p,
                          ),
                        )
                      }
                    >
                      {set}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.remove}
                  disabled={event.pool.length <= 1}
                  aria-label={`ลบ ${player.name}`}
                  onClick={() => updatePool(event.pool.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
