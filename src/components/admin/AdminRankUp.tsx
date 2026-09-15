import { useMemo, useState, type ChangeEvent } from 'react';
import { currencyList } from '@/data/mock/currencies';
import type { CurrencyKind } from '@/features/currencies/types';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { playerArtUrl } from '@/features/players/artManifest';
import { usePlayers } from '@/features/players/PlayerContext';
import {
  BACKGROUND_MAX_BYTES,
  BACKGROUND_MAX_H,
  BACKGROUND_MAX_W,
  MAX_COST,
  MAX_MATERIALS,
  MAX_PLUS,
} from '@/features/rankup/constants';
import { useRankUp } from '@/features/rankup/RankUpContext';
import { FAIL_LABEL } from '@/features/rankup/rankup';
import type { RankUpFailMode } from '@/features/rankup/types';
import type { SaveResult } from '@/features/rankup/rankupConfigStore';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import styles from './AdminRankUp.module.css';

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'decode-failed': 'เปิดไฟล์รูปไม่ได้ ลองไฟล์อื่น',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
  'too-large-to-store': 'รูปใหญ่เกินกว่าจะเก็บได้ ลองความละเอียดต่ำกว่านี้',
};

const SAVE_ERROR: Record<'quota' | 'unavailable', string> = {
  quota: 'พื้นที่เก็บข้อมูลเต็ม',
  unavailable: 'เบราว์เซอร์บล็อกการบันทึก',
};

const FAIL_MODES: readonly RankUpFailMode[] = ['keep', 'down', 'reset', 'destroy'];

type Status = { tone: 'ok' | 'bad'; text: string } | null;

/** `'global'` edits the fallback list; a number edits that level's own. */
type ListScope = 'global' | number;

function describe(result: SaveResult, success: string): Status {
  return result.ok ? { tone: 'ok', text: success } : { tone: 'bad', text: SAVE_ERROR[result.reason] };
}

const formatKB = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

/**
 * Tuning for the rank-up ladder.
 *
 * Eight rows, one per level, plus the material lists and the screen backdrop. The
 * numbers are all clamped on the way into storage, so a slip here is corrected
 * rather than carried into the game.
 */
export default function AdminRankUp() {
  const { config, update, updateLevel, reset, isDefault } = useRankUp();
  const { players: catalogue } = usePlayers();

  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<ListScope>('global');
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<PlayerSet | 'all'>('all');

  const selected = useMemo(() => {
    const ids =
      scope === 'global'
        ? config.materialIds
        : (config.levels.find((level) => level.level === scope)?.materialIds ?? []);
    return new Set(ids);
  }, [config, scope]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue
      .filter((card) => (tier === 'all' ? true : card.set === tier))
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 120);
  }, [catalogue, query, tier]);

  function writeList(next: string[]) {
    const result =
      scope === 'global' ? update({ materialIds: next }) : updateLevel(scope, { materialIds: next });
    setStatus(describe(result, 'บันทึกรายชื่อวัสดุแล้ว'));
  }

  function toggleCard(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeList([...next]);
  }

  async function uploadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    const encoded = await encodeUploadedImage(file, {
      maxWidth: BACKGROUND_MAX_W,
      maxHeight: BACKGROUND_MAX_H,
      maxBytes: BACKGROUND_MAX_BYTES,
    });

    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      setBusy(false);
      return;
    }

    setStatus(
      describe(update({ background: encoded.dataUrl }), `เปลี่ยนพื้นหลังแล้ว (${formatKB(encoded.bytes)})`),
    );
    setBusy(false);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          ตั้งค่าระบบตีบวก +1 ถึง +{MAX_PLUS} · ตัวเลขทุกช่องจะถูกจำกัดช่วงอัตโนมัติก่อนบันทึก
        </p>
        <button
          type="button"
          className={styles.reset}
          disabled={isDefault}
          onClick={() => setStatus(describe(reset(), 'คืนค่าเริ่มต้นแล้ว'))}
        >
          คืนค่าเริ่มต้น
        </button>
      </div>

      {status && (
        <p className={`${styles.status} ${status.tone === 'ok' ? styles.ok : styles.bad}`}>
          {status.text}
        </p>
      )}

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>ทั่วไป</h3>

        <div className={styles.row}>
          <button
            type="button"
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() => setStatus(describe(update({ enabled: !config.enabled }), 'บันทึกแล้ว'))}
          >
            <span className={styles.dot} />
            เปิดระบบตีบวก
          </button>

          <button
            type="button"
            className={`${styles.toggle} ${config.refundOnFail ? styles.toggleOn : ''}`}
            onClick={() =>
              setStatus(describe(update({ refundOnFail: !config.refundOnFail }), 'บันทึกแล้ว'))
            }
          >
            <span className={styles.dot} />
            คืนการ์ดวัสดุเมื่อล้มเหลว
          </button>
        </div>

        <div className={styles.bgRow}>
          <div className={styles.bgPreview}>
            {config.background ? (
              <img src={config.background} alt="" />
            ) : (
              <span className={styles.bgEmpty}>ใช้พื้นหลังเริ่มต้น</span>
            )}
          </div>

          <div className={styles.bgActions}>
            <label className={styles.upload}>
              {busy ? 'กำลังอัปโหลด…' : 'อัปโหลดพื้นหลัง'}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={uploadBackground} />
            </label>
            <button
              type="button"
              className={styles.clear}
              disabled={!config.background}
              onClick={() => setStatus(describe(update({ background: '' }), 'ล้างพื้นหลังแล้ว'))}
            >
              ล้างพื้นหลัง
            </button>
            <p className={styles.hint}>
              ย่อเหลือไม่เกิน {BACKGROUND_MAX_W}×{BACKGROUND_MAX_H} และ{' '}
              {Math.round(BACKGROUND_MAX_BYTES / 1024)} KB ก่อนเก็บ เปลี่ยนใหม่ได้ทุกเมื่อ
            </p>
          </div>
        </div>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>บันไดระดับ</h3>

        <div className={styles.table}>
          <div className={`${styles.tr} ${styles.th}`}>
            <span>ระดับ</span>
            <span>วัสดุ</span>
            <span>โอกาส %</span>
            <span>โบนัสเรต</span>
            <span>ค่าธรรมเนียม</span>
            <span>สกุลเงิน</span>
            <span>เมื่อล้มเหลว</span>
            <span>วัสดุเฉพาะ</span>
          </div>

          {config.levels.map((level) => (
            <div className={styles.tr} key={level.level}>
              <span className={styles.level}>+{level.level}</span>

              <input
                className={styles.num}
                value={level.materials}
                inputMode="numeric"
                aria-label={`จำนวนวัสดุระดับ ${level.level}`}
                onChange={(event) =>
                  updateLevel(level.level, {
                    materials: Number(event.target.value.replace(/\D/g, '') || 0),
                  })
                }
                onBlur={() =>
                  setStatus(
                    describe(
                      updateLevel(level.level, {
                        materials: Math.min(MAX_MATERIALS, level.materials),
                      }),
                      'บันทึกแล้ว',
                    ),
                  )
                }
              />

              <input
                className={styles.num}
                value={level.chance}
                inputMode="numeric"
                aria-label={`โอกาสสำเร็จระดับ ${level.level}`}
                onChange={(event) =>
                  updateLevel(level.level, {
                    chance: Number(event.target.value.replace(/\D/g, '') || 0),
                  })
                }
              />

              <input
                className={styles.num}
                value={level.bonus}
                inputMode="numeric"
                aria-label={`โบนัสเรตติ้งระดับ ${level.level}`}
                onChange={(event) =>
                  updateLevel(level.level, {
                    bonus: Number(event.target.value.replace(/\D/g, '') || 0),
                  })
                }
              />

              <input
                className={`${styles.num} ${styles.wide}`}
                value={level.cost}
                inputMode="numeric"
                aria-label={`ค่าธรรมเนียมระดับ ${level.level}`}
                onChange={(event) =>
                  updateLevel(level.level, {
                    cost: Math.min(MAX_COST, Number(event.target.value.replace(/\D/g, '') || 0)),
                  })
                }
              />

              <select
                className={styles.select}
                value={level.currency}
                aria-label={`สกุลเงินระดับ ${level.level}`}
                onChange={(event) =>
                  updateLevel(level.level, { currency: event.target.value as CurrencyKind })
                }
              >
                {currencyList.map((currency) => (
                  <option key={currency.kind} value={currency.kind}>
                    {currency.label}
                  </option>
                ))}
              </select>

              <select
                className={styles.select}
                value={level.onFail}
                aria-label={`ผลเมื่อล้มเหลวระดับ ${level.level}`}
                onChange={(event) =>
                  updateLevel(level.level, { onFail: event.target.value as RankUpFailMode })
                }
              >
                {FAIL_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {FAIL_LABEL[mode]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`${styles.scopeJump} ${scope === level.level ? styles.scopeJumpOn : ''}`}
                onClick={() => setScope(level.level)}
              >
                {level.materialIds.length > 0 ? `${level.materialIds.length} ใบ` : 'ใช้ทั่วไป'}
              </button>
            </div>
          ))}
        </div>

        <p className={styles.legend}>
          โบนัสเรตคือค่าที่บวกให้การ์ด <strong>ตอนอยู่ที่ระดับนั้น</strong> ไม่ใช่ค่าที่บวกสะสมทีละขั้น ·
          &quot;การ์ดหลักหายไป&quot; จะลบการ์ดของผู้เล่นทิ้งจริง ใช้ด้วยความระมัดระวัง
        </p>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>การ์ดที่ใช้เป็นวัสดุได้</h3>

        <div className={styles.scopes}>
          <button
            type="button"
            className={`${styles.scope} ${scope === 'global' ? styles.scopeOn : ''}`}
            onClick={() => setScope('global')}
          >
            ทั่วไป ({config.materialIds.length})
          </button>
          {config.levels.map((level) => (
            <button
              type="button"
              key={level.level}
              className={`${styles.scope} ${scope === level.level ? styles.scopeOn : ''}`}
              onClick={() => setScope(level.level)}
            >
              +{level.level} ({level.materialIds.length})
            </button>
          ))}
        </div>

        <p className={styles.hint}>
          {scope === 'global'
            ? 'รายชื่อนี้ใช้กับทุกระดับที่ไม่ได้กำหนดรายชื่อของตัวเอง · ปล่อยว่างไว้ = ใช้การ์ดใบไหนก็ได้'
            : `รายชื่อเฉพาะของระดับ +${scope} · ถ้าปล่อยว่างจะย้อนไปใช้รายชื่อทั่วไป`}
        </p>

        <div className={styles.filters}>
          <input
            className={styles.search}
            value={query}
            placeholder="ค้นหาชื่อการ์ด"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={styles.tiers}>
            <button
              type="button"
              className={`${styles.tierChip} ${tier === 'all' ? styles.tierOn : ''}`}
              onClick={() => setTier('all')}
            >
              ทั้งหมด
            </button>
            {PLAYER_SETS.map((set) => (
              <button
                type="button"
                key={set}
                className={`${styles.tierChip} ${tier === set ? styles.tierOn : ''}`}
                onClick={() => setTier(set)}
              >
                {set}
              </button>
            ))}
          </div>
          <button type="button" className={styles.clear} disabled={selected.size === 0} onClick={() => writeList([])}>
            ล้างรายชื่อ
          </button>
        </div>

        <div className={styles.cards}>
          {visible.length === 0 && <p className={styles.hint}>ไม่พบการ์ด</p>}

          {visible.map((card) => {
            const art = playerArtUrl(card.artId);
            const on = selected.has(card.id);

            return (
              <button
                type="button"
                key={card.id}
                className={`${styles.card} ${on ? styles.cardOn : ''}`}
                onClick={() => toggleCard(card.id)}
                aria-pressed={on}
              >
                {art ? <img src={art} alt="" /> : <span className={styles.noArt}>{card.set}</span>}
                <span className={styles.cardName}>{card.name}</span>
                <span className={styles.cardMeta}>
                  {card.rating} · {card.position} · {card.set}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
