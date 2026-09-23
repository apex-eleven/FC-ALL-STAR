import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Shield } from 'lucide-react';
import { useBadges } from '@/features/badges/BadgeContext';
import {
  DESCRIPTION_MAX,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_H,
  IMAGE_MAX_W,
  MAX_BADGES,
  MAX_BONUS,
  MAX_SET_CARDS,
  NAME_MAX,
  badgeId,
} from '@/features/badges/constants';
import type { BadgeConfig, TeamBadge } from '@/features/badges/types';
import { cardToPlayer } from '@/features/draft/pool';
import { usePlayers } from '@/features/players/PlayerContext';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import styles from './AdminBadges.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไป แม้ย่อแล้วก็ยังเกินโควตา',
  'decode-failed': 'อ่านรูปไม่ได้',
  'encode-failed': 'แปลงรูปไม่สำเร็จ',
};

/** The card dropdown lists at most this many matches; search narrows it. */
const CARD_OPTIONS_MAX = 200;

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * ตราทีม settings: the crests, the players each one is made of, and what it pays.
 *
 * Which crests a player has pinned lives on their squad, not here — this tab shapes
 * what can be pinned, never who has pinned it.
 */
export default function AdminBadges() {
  const { config, replace, reset } = useBadges();
  const { players, byId } = usePlayers();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState<Record<string, string>>({});
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  const cardsByRating = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)),
    [players],
  );

  function commit(next: BadgeConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<BadgeConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchBadge(id: string, changes: Partial<TeamBadge>, text?: string) {
    patch(
      { badges: latest.current.badges.map((badge) => (badge.id === id ? { ...badge, ...changes } : badge)) },
      text,
    );
  }

  function addBadge() {
    const badge: TeamBadge = {
      id: badgeId(),
      enabled: true,
      name: '',
      description: '',
      image: '',
      cardIds: [],
      need: 0,
      bonus: 3,
    };
    patch({ badges: [...latest.current.badges, badge] }, 'เพิ่มตราทีมแล้ว');
  }

  async function uploadImage(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    const encoded = await encodeUploadedImage(file, {
      maxWidth: IMAGE_MAX_W,
      maxHeight: IMAGE_MAX_H,
      maxBytes: IMAGE_MAX_BYTES,
    });
    setBusy(false);

    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    patchBadge(id, { image: encoded.dataUrl }, 'ใส่รูปตราแล้ว');
  }

  function cardPicker(badge: TeamBadge) {
    const search = (query[badge.id] ?? '').trim().toLowerCase();
    const shown = cardsByRating
      .filter((card) => !badge.cardIds.includes(card.id))
      .filter(
        (card) =>
          search === '' ||
          [card.code, card.name, card.id, card.club, card.nation, card.position, String(card.rating)].some((field) =>
            field.toLowerCase().includes(search),
          ),
      )
      .slice(0, CARD_OPTIONS_MAX);
    const full = badge.cardIds.length >= MAX_SET_CARDS;

    return (
      <div className={styles.picker}>
        <input
          className={styles.input}
          placeholder="ค้นหาการ์ด เลขการ์ด / ชื่อ / OVR / ตำแหน่ง / สโมสร"
          value={query[badge.id] ?? ''}
          disabled={full}
          onChange={(event) => setQuery((prev) => ({ ...prev, [badge.id]: event.target.value }))}
        />
        <select
          className={styles.input}
          value=""
          disabled={full || shown.length === 0}
          onChange={(event) => {
            if (!event.target.value) return;
            patchBadge(badge.id, { cardIds: [...badge.cardIds, event.target.value] });
          }}
        >
          <option value="">{full ? `ครบ ${MAX_SET_CARDS} คนแล้ว` : '+ เพิ่มนักเตะเข้าชุด'}</option>
          {shown.map((card) => (
            <option key={card.id} value={card.id}>
              {card.code ? `#${card.code}` : '(ไม่มีเลข)'} · {card.name} · OVR {card.rating} · {card.position} · {card.set}
              {card.club ? ` · ${card.club}` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const live = config.badges.filter((badge) => badge.enabled).length;

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ตราทีม (3 ช่องใต้ OVR ในหน้าทีมของฉัน) · ตราหนึ่งอันคือชุดนักเตะจากคลังการ์ด +
        โบนัส OVR · ผู้เล่นใส่ได้ 3 อัน และตราจะทำงานเมื่อ 11 ตัวจริงมีนักเตะในชุดครบตามที่ตั้ง
        (นับจากการ์ดต้นแบบ ตีบวกเท่าไหร่ก็นับ ตัวสำรองไม่นับ) · OVR ที่บวกแล้วใช้ทั้งหน้าหลัก ลีก
        และเมเนเจอร์โหมด
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.columns}>
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
          <button
            type="button"
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() => patch({ enabled: !config.enabled })}
          >
            {config.enabled ? 'เปิดระบบตราทีมอยู่' : 'ปิดระบบตราทีมอยู่'}
          </button>
          <p className={styles.legend}>
            ปิดแล้วช่องตราจะกดไม่ได้และโบนัสหยุดทำงาน แต่ที่ผู้เล่นใส่ไว้ยังอยู่ เปิดกลับมาก็ใช้ต่อได้
          </p>

          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('ลบตราทีมทั้งหมด?')) {
                const result = reset();
                setStatus(
                  result.ok
                    ? { tone: 'ok', text: 'รีเซ็ตแล้ว' }
                    : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' },
                );
              }
            }}
          >
            รีเซ็ตทั้งหมด
          </button>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            ตราทีมทั้งหมด ({config.badges.length} อัน · เปิดอยู่ {live})
          </h3>

          <button
            type="button"
            className={styles.ghost}
            disabled={config.badges.length >= MAX_BADGES}
            onClick={addBadge}
          >
            + เพิ่มตราทีม
          </button>

          {config.badges.length === 0 && (
            <p className={styles.legend}>ยังไม่มีตราทีม — กด &quot;เพิ่มตราทีม&quot;</p>
          )}

          {config.badges.map((badge) => (
            <div key={badge.id} className={`${styles.badge} ${badge.enabled ? '' : styles.badgeOff}`}>
              <div className={styles.badgeTop}>
                <div className={styles.art}>
                  {badge.image ? (
                    <img src={badge.image} alt="" />
                  ) : (
                    <Shield size={34} strokeWidth={2} />
                  )}
                </div>

                <div className={styles.artActions}>
                  <label className={styles.ghost}>
                    {busy ? 'กำลังย่อรูป…' : 'อัปโหลดรูป'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={busy}
                      onChange={(event) => void uploadImage(badge.id, event)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={!badge.image}
                    onClick={() => patchBadge(badge.id, { image: '' }, 'เอารูปออกแล้ว')}
                  >
                    เอารูปออก
                  </button>
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>ชื่อตรา</span>
                  <input
                    className={styles.input}
                    maxLength={NAME_MAX}
                    value={badge.name}
                    onChange={(event) => patchBadge(badge.id, { name: event.target.value })}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>คำอธิบายสั้น ๆ</span>
                  <input
                    className={styles.input}
                    maxLength={DESCRIPTION_MAX}
                    value={badge.description}
                    onChange={(event) => patchBadge(badge.id, { description: event.target.value })}
                  />
                </label>

                <div className={styles.badgeSide}>
                  <button
                    type="button"
                    className={`${styles.toggle} ${badge.enabled ? styles.toggleOn : ''}`}
                    onClick={() => patchBadge(badge.id, { enabled: !badge.enabled })}
                  >
                    {badge.enabled ? 'เปิด' : 'ปิด'}
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => {
                      if (window.confirm(`ลบตรา "${badge.name || 'ตราทีม'}"?`)) {
                        patch(
                          { badges: latest.current.badges.filter((entry) => entry.id !== badge.id) },
                          'ลบตราทีมแล้ว',
                        );
                      }
                    }}
                  >
                    ลบ
                  </button>
                </div>
              </div>

              <div className={styles.numbers}>
                <label className={styles.field}>
                  <span className={styles.label}>โบนัส OVR (สูงสุด {MAX_BONUS})</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    key={`${badge.id}-bonus-${badge.bonus}`}
                    defaultValue={badge.bonus}
                    // Committed on blur, so a half-typed number never clamps.
                    onBlur={(event) =>
                      patchBadge(badge.id, { bonus: Math.min(MAX_BONUS, whole(event.target.value)) })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ต้องมีลงสนามกี่คน (0 = ทั้งชุด)</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    key={`${badge.id}-need-${badge.need}`}
                    defaultValue={badge.need}
                    onBlur={(event) =>
                      patchBadge(badge.id, { need: Math.min(MAX_SET_CARDS, whole(event.target.value)) })
                    }
                  />
                </label>
                <span className={styles.mine}>
                  ชุดนี้มี {badge.cardIds.length} คน · ต้องลงสนาม{' '}
                  {badge.need <= 0 ? badge.cardIds.length : Math.min(badge.need, badge.cardIds.length)} คน
                  {badge.cardIds.length === 0 ? ' · ยังไม่มีนักเตะ ตราจะไม่ทำงาน' : ''}
                </span>
              </div>

              <span className={styles.label}>นักเตะในชุด (สูงสุด {MAX_SET_CARDS} คน)</span>
              <div className={styles.set}>
                {badge.cardIds.map((cardId) => {
                  const card = byId(cardId);
                  return (
                    <span key={cardId} className={styles.chip} title={card ? card.id : cardId}>
                      {card ? (
                        <img className={styles.chipArt} src={cardToPlayer(card).portrait} alt="" />
                      ) : (
                        <Shield size={18} strokeWidth={2} />
                      )}
                      <span className={styles.chipText}>
                        {card
                          ? `${card.code ? `#${card.code} · ` : ''}${card.name} · ${card.rating} ${card.position}`
                          : 'การ์ดที่ถูกลบแล้ว'}
                      </span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        aria-label="เอาออกจากชุด"
                        onClick={() =>
                          patchBadge(badge.id, { cardIds: badge.cardIds.filter((id) => id !== cardId) })
                        }
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
              {cardPicker(badge)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
