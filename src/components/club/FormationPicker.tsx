import { Check, LayoutGrid, X } from 'lucide-react';
import { FORMATION_LIST } from '@/features/squad/constants';
import type { Formation, FormationFamily, FormationId } from '@/features/squad/types';
import styles from './FormationPicker.module.css';

export interface FormationPickerProps {
  current: FormationId;
  onPick(id: FormationId): void;
  onClose(): void;
}

const FAMILIES: { family: FormationFamily; label: string }[] = [
  { family: 4, label: 'กองหลัง 4 ตัว' },
  { family: 3, label: 'กองหลัง 3 ตัว' },
  { family: 5, label: 'กองหลัง 5 ตัว' },
];

/*
  The mini pitch maps the club screen's own card positions, so each preview is the
  formation exactly as it will be drawn: x 560..1640 and y 120..840 of the stage.
*/
const STAGE_LEFT = 560;
const STAGE_WIDTH = 1080;
const STAGE_TOP = 120;
const STAGE_HEIGHT = 720;

function dotTone(position: string): string {
  if (position === 'GK') return styles.dotGk;
  if (['LB', 'CB', 'RB', 'LWB', 'RWB'].includes(position)) return styles.dotDef;
  if (['LW', 'RW', 'ST', 'CF'].includes(position)) return styles.dotAtt;
  return styles.dotMid;
}

/**
 * แผนการเล่น — every formation, grouped by back line, each drawn as the club pitch
 * will draw it. Picking one switches straight away and keeps the eleven
 * (`changeFormation`), so there is nothing to confirm.
 */
export default function FormationPicker({ current, onPick, onClose }: FormationPickerProps) {
  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="เลือกแผนการเล่น">
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.icon}>
            <LayoutGrid size={28} strokeWidth={2.4} />
          </span>
          <h2 className={styles.title}>แผนการเล่น</h2>
          <span className={styles.count}>{FORMATION_LIST.length} แผน</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={24} strokeWidth={2.6} />
          </button>
        </div>
        <p className={styles.hint}>
          เปลี่ยนแผนแล้วนักเตะ 11 คนยังอยู่ครบ — ระบบย้ายไปช่องที่ตำแหน่งตรงที่สุดให้เอง ·
          นักเตะที่เล่นผิดตำแหน่งจะถูกหัก OVR ตามปกติ
        </p>

        <div className={styles.body}>
          {FAMILIES.map(({ family, label }) => (
            <section key={family} className={styles.group}>
              <h3 className={styles.groupTitle}>{label}</h3>
              <div className={styles.grid}>
                {FORMATION_LIST.filter((entry) => entry.family === family).map((entry) => (
                  <Tile key={entry.id} formation={entry} active={entry.id === current} onPick={onPick} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({
  formation,
  active,
  onPick,
}: {
  formation: Formation;
  active: boolean;
  onPick(id: FormationId): void;
}) {
  return (
    <button
      type="button"
      className={`${styles.tile} ${active ? styles.tileOn : ''}`}
      onClick={() => onPick(formation.id)}
      aria-pressed={active}
    >
      <span className={styles.pitch} aria-hidden="true">
        <span className={styles.halfway} />
        <span className={styles.box} />
        {formation.slots.map((slot) => (
          <span
            key={slot.id}
            className={`${styles.dot} ${dotTone(slot.position)}`}
            style={{
              left: `${((slot.x - STAGE_LEFT) / STAGE_WIDTH) * 100}%`,
              top: `${((slot.y - STAGE_TOP) / STAGE_HEIGHT) * 100}%`,
            }}
          >
            {slot.position}
          </span>
        ))}
      </span>
      <span className={styles.name}>
        {active && <Check size={16} strokeWidth={3} />}
        {formation.name}
      </span>
    </button>
  );
}
