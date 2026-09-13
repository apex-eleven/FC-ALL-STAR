import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SHOWCASE,
  MAX_SHOWCASE_SLOTS,
  SHOWCASE_BANNER_H,
  SHOWCASE_BANNER_X,
  SHOWCASE_CARD_MAX_W,
  SHOWCASE_CARD_MIN_W,
  SHOWCASE_VIEWPORT_H,
  SHOWCASE_VIEWPORT_W,
} from '@/features/draft/constants';
import { resolveShowcase } from '@/features/draft/showcase';
import type { DraftEvent, ShowcaseSlot } from '@/features/draft/types';
import { playerArtUrl } from '@/features/players/artManifest';
import { usePlayers } from '@/features/players/PlayerContext';
import styles from './AdminShowcase.module.css';

export interface AdminShowcaseProps {
  event: DraftEvent;
  onChange(slots: ShowcaseSlot[]): void;
}

/** The preview is drawn at this fraction of stage size so it fits inside the panel. */
const SCALE = 0.42;

/**
 * Drag the cards where you want them.
 *
 * The preview is the real showcase at 42%: same canvas, same banner, same art, so
 * what is dragged here is what appears on the draft screen. A numeric-field version
 * of this would be quicker to build and useless to use — placement is a thing you
 * judge by eye.
 */
export default function AdminShowcase({ event, onChange }: AdminShowcaseProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { players: catalogue, byId } = usePlayers();
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const slots = event.showcase;
  // Same resolution the draft screen uses, so the preview is not a separate guess.
  const featured = resolveShowcase(slots, event.pool, byId);

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 60);
  }, [catalogue, query]);

  function patchSlot(index: number, changes: Partial<ShowcaseSlot>) {
    onChange(slots.map((slot, i) => (i === index ? { ...slot, ...changes } : slot)));
  }

  /**
   * Pointer capture keeps the drag alive when the cursor leaves the small preview,
   * which happens constantly at this scale — without it a card would stick to the
   * edge the moment the pointer crossed it.
   */
  function startDrag(index: number, event_: React.PointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const slot = slots[index];
    if (!slot) return;

    const box = canvas.getBoundingClientRect();
    const grabX = (event_.clientX - box.left) / SCALE - slot.left;
    const grabY = (event_.clientY - box.top) / SCALE - slot.top;

    setActive(index);
    setDragging(index);
    event_.currentTarget.setPointerCapture(event_.pointerId);

    const move = (pointer: PointerEvent) => {
      patchSlot(index, {
        left: Math.round((pointer.clientX - box.left) / SCALE - grabX),
        top: Math.round((pointer.clientY - box.top) / SCALE - grabY),
      });
    };

    const stop = () => {
      setDragging(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  const canvasWidth = Math.max(
    SHOWCASE_VIEWPORT_W,
    ...slots.map((slot) => slot.left + slot.width + 40),
  );
  const current = slots[active];

  return (
    <div className={styles.wrap}>
      <div
        className={styles.viewport}
        style={{ width: SHOWCASE_VIEWPORT_W * SCALE, height: SHOWCASE_VIEWPORT_H * SCALE }}
      >
        <div
          ref={canvasRef}
          className={styles.canvas}
          style={{ width: canvasWidth * SCALE, height: SHOWCASE_VIEWPORT_H * SCALE }}
        >
          {event.banner && (
            <img
              className={styles.banner}
              src={event.banner}
              alt=""
              draggable={false}
              style={{ left: SHOWCASE_BANNER_X * SCALE, height: SHOWCASE_BANNER_H * SCALE }}
            />
          )}

          {slots.map((slot, index) => {
            const player = featured[index];
            return (
              <div
                key={index}
                className={`${styles.slot} ${index === active ? styles.slotOn : ''} ${
                  dragging === index ? styles.slotDrag : ''
                }`}
                style={{
                  left: slot.left * SCALE,
                  top: slot.top * SCALE,
                  width: slot.width * SCALE,
                }}
                onPointerDown={(pointerEvent) => startDrag(index, pointerEvent)}
              >
                {player ? (
                  <img className={styles.art} src={player.portrait} alt="" draggable={false} />
                ) : (
                  <span className={styles.ghostSlot}>{index + 1}</span>
                )}
                <span className={styles.tag}>{index + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.slotPicker}>
          {slots.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.pick} ${index === active ? styles.pickOn : ''}`}
              onClick={() => setActive(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {current && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>ขนาดการ์ดใบที่ {active + 1} — {current.width}px</span>
              <input
                type="range"
                className={styles.range}
                min={SHOWCASE_CARD_MIN_W}
                max={SHOWCASE_CARD_MAX_W}
                value={current.width}
                data-sound="off"
                onChange={(changeEvent) =>
                  patchSlot(active, { width: Number(changeEvent.target.value) })
                }
              />
            </label>

            <div className={styles.row}>
              <button
                type="button"
                className={styles.ghost}
                disabled={slots.length >= MAX_SHOWCASE_SLOTS}
                onClick={() =>
                  onChange([
                    ...slots,
                    // Lands next to the last card rather than on top of it, so a new
                    // slot is visible without having to hunt for it.
                    {
                      left: (slots.at(-1)?.left ?? 0) + (slots.at(-1)?.width ?? 152) + 40,
                      top: slots.at(-1)?.top ?? 238,
                      width: slots.at(-1)?.width ?? 152,
                      cardId: null,
                    },
                  ])
                }
              >
                เพิ่มช่องการ์ด
              </button>

              <button
                type="button"
                className={styles.ghost}
                data-sound="back"
                disabled={slots.length <= 1}
                onClick={() => {
                  onChange(slots.filter((_, index) => index !== active));
                  setActive(0);
                }}
              >
                ลบช่องที่ {active + 1}
              </button>

              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  onChange(DEFAULT_SHOWCASE.map((slot) => ({ ...slot })));
                  setActive(0);
                }}
              >
                คืนค่าเริ่มต้น
              </button>
            </div>
          </>
        )}

        <div className={styles.chooser}>
          <div className={styles.chooserHead}>
            <span className={styles.label}>
              การ์ดในช่องที่ {active + 1} —{' '}
              {current?.cardId
                ? (byId(current.cardId)?.name ?? 'การ์ดถูกลบไปแล้ว')
                : 'อัตโนมัติ (เรตติ้งสูงสุดในพูล)'}
            </span>
            <input
              className={styles.search}
              placeholder="ค้นหาการ์ดในคลัง"
              value={query}
              onChange={(changeEvent) => setQuery(changeEvent.target.value)}
            />
            <button
              type="button"
              className={styles.ghost}
              disabled={!current?.cardId}
              onClick={() => patchSlot(active, { cardId: null })}
            >
              กลับเป็นอัตโนมัติ
            </button>
          </div>

          <div className={styles.cardGrid}>
            {candidates.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`${styles.cardCell} ${
                  current?.cardId === card.id ? styles.cardCellOn : ''
                }`}
                title={`${card.name} · ${card.rating} · ชุด ${card.set}`}
                onClick={() => patchSlot(active, { cardId: card.id })}
              >
                <img
                  className={styles.cardArt}
                  src={playerArtUrl(card.artId) ?? ''}
                  alt=""
                  loading="lazy"
                />
                <span className={styles.cardName}>{card.name}</span>
              </button>
            ))}
            {catalogue.length === 0 && (
              <p className={styles.legend}>คลังการ์ดยังว่าง — สร้างการ์ดที่แท็บ "การ์ดนักเตะ" ก่อน</p>
            )}
          </div>
        </div>

        <p className={styles.legend}>
          ลากการ์ดในภาพตัวอย่างเพื่อจัดตำแหน่ง · ภาพนี้คือของจริงย่อ {Math.round(SCALE * 100)}%
          วางตรงไหนหน้าดราฟต์ก็อยู่ตรงนั้น
          <br />
          เลือกการ์ดเองได้จากคลังทั้งหมด ไม่จำเป็นต้องอยู่ในแพ็คนี้ ·
          ช่องที่ไม่ได้เลือกจะหยิบนักเตะเรตติ้งสูงสุดในพูลมาเติมตามลำดับ
        </p>
      </div>
    </div>
  );
}
