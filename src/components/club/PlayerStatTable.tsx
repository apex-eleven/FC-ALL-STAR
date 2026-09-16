import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { formatHeight, formatWeight, type CardStats, type WorkRate } from '@/features/squad/stats';
import styles from './PlayerStatTable.module.css';

export interface PlayerStatTableProps {
  /** The card in the slot, or null for an empty slot. */
  stats: CardStats | null;
  /** The card being compared, shown in the right-hand column. */
  compare: CardStats | null;
}

const WORK_RANK: Record<WorkRate, number> = { ต่ำ: 0, กลาง: 1, สูง: 2 };

function stars(filled: number) {
  // Filled stars sit on the right, as in the reference (☆★★★★ is 4).
  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={27}
          strokeWidth={0}
          className={index >= 5 - filled ? styles.starOn : styles.starOff}
        />
      ))}
    </span>
  );
}

function feet(stats: CardStats) {
  const leftStrong = stats.leftFoot >= stats.rightFoot;
  return (
    <span className={styles.feet}>
      <span className={`${styles.foot} ${leftStrong ? styles.footStrong : ''}`}>{stats.leftFoot}</span>
      <span className={`${styles.foot} ${leftStrong ? '' : styles.footStrong}`}>{stats.rightFoot}</span>
    </span>
  );
}

interface Row {
  label: string;
  show: (stats: CardStats) => ReactNode;
  /** A number to compare by; higher is better. Absent for text-only rows. */
  rank?: (stats: CardStats) => number;
  /** Thai text rather than a number — drawn in the UI face, a size down. */
  text?: boolean;
}

const ROWS: readonly Row[] = [
  { label: 'WFA', show: feet, rank: (s) => Math.min(s.leftFoot, s.rightFoot) },
  { label: 'พลังงาน', show: (s) => stars(s.stamina), rank: (s) => s.stamina },
  { label: 'ท่าสกิล', show: (s) => stars(s.skillMoves), rank: (s) => s.skillMoves },
  { label: 'ความสูง', show: (s) => formatHeight(s.heightCm), text: true },
  { label: 'น้ำหนัก', show: (s) => formatWeight(s.weightKg), text: true },
  {
    label: 'ความขยันในการบุก',
    show: (s) => s.attackWorkRate,
    rank: (s) => WORK_RANK[s.attackWorkRate],
    text: true,
  },
  {
    label: 'ความขยันในการตั้งรับ',
    show: (s) => s.defenseWorkRate,
    rank: (s) => WORK_RANK[s.defenseWorkRate],
    text: true,
  },
  { label: 'กำหนดท่าสกิลแล้ว', show: (s) => s.skillTrait, text: true },
  { label: 'การเร่งความเร็ว', show: (s) => s.acceleration, rank: (s) => s.acceleration },
  { label: 'ความเร็วการวิ่ง', show: (s) => s.sprintSpeed, rank: (s) => s.sprintSpeed },
];

/**
 * The detail rows under the radar: the slot card's value on the left, the label in
 * the middle, and — once a card is picked to compare — its value on the right, green
 * where it is better and red where it is worse.
 */
export default function PlayerStatTable({ stats, compare }: PlayerStatTableProps) {
  return (
    <div className={styles.table}>
      {ROWS.map((row) => {
        const diff = row.rank && stats && compare ? row.rank(compare) - row.rank(stats) : 0;
        return (
          <div key={row.label} className={`${styles.row} ${row.text ? styles.textRow : ''}`}>
            <span className={styles.value}>{stats ? row.show(stats) : '-'}</span>
            <span className={styles.label}>{row.label}</span>
            <span
              className={`${styles.compare} ${diff > 0 ? styles.better : ''} ${
                diff < 0 ? styles.worse : ''
              }`}
            >
              {compare ? row.show(compare) : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
