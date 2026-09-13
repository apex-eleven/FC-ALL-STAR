import { X } from 'lucide-react';
import type { PullOutcome } from '@/features/draft/pull';
import type { PlayerSet } from '@/features/draft/types';
import GlassPanel from '@/components/ui/GlassPanel';
import styles from './DraftResult.module.css';

export interface DraftResultProps {
  outcomes: PullOutcome[];
  onClose(): void;
}

const SET_CLASS: Record<PlayerSet, string> = {
  A: styles.setA!,
  B: styles.setB!,
  C: styles.setC!,
  D: styles.setD!,
};

/**
 * Placeholder reveal. The walkout animation replaces this screen, not the pull logic
 * behind it — results are already committed to the club by the time this renders, so
 * closing early cannot lose a card.
 */
export default function DraftResult({ outcomes, onClose }: DraftResultProps) {
  const best = outcomes.reduce<PlayerSet>(
    (top, outcome) => (outcome.set < top ? outcome.set : top),
    'D',
  );

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="ผลการสุ่ม">
      <GlassPanel edged className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title}>ได้รับนักเตะ {outcomes.length} คน</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={22} strokeWidth={2.6} />
          </button>
        </div>
        <p className={styles.note}>
          เก็บเข้า CLUB เรียบร้อยแล้ว · ระบบ walkout จะมาแทนหน้านี้ในขั้นต่อไป
        </p>

        <div className={styles.grid}>
          {outcomes.map((outcome, index) => (
            <div
              key={`${outcome.player.id}-${index}`}
              className={`${styles.card} ${SET_CLASS[outcome.set]}`}
            >
              {outcome.pityRule && <span className={styles.pity}>รับประกัน</span>}
              <span className={styles.tier}>{outcome.set}</span>
              <img className={styles.portrait} src={outcome.player.portrait} alt="" />
              <span className={styles.rating}>{outcome.player.rating}</span>
              <span className={styles.position}>{outcome.player.position}</span>
              <span className={styles.name}>{outcome.player.name}</span>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.summary}>ชุดดีที่สุดที่ได้: {best}</span>
          <button type="button" className={styles.done} onClick={onClose}>
            เรียบร้อย
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
