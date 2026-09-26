import type { CSSProperties } from 'react';
import type { OwnedPlayer } from '@/features/club/types';
import { plusTone } from '@/features/rankup/constants';
import type { RankUpOutcome } from '@/features/rankup/types';
import SquadCard from '@/components/club/SquadCard';
import RankFrame from './RankFrame';
import styles from './RankUpResult.module.css';

export interface RankUpResultProps {
  outcome: RankUpOutcome;
  /** The card as it was *before* the try — the account copy may already be gone. */
  card: OwnedPlayer;
  onClose(): void;
}

/**
 * What just happened, in one screen.
 *
 * The card is passed in rather than read back from the account: a `destroy` rule
 * deletes it, and an overlay that announced the loss with an empty frame would be
 * telling the player nothing at the exact moment they most want to look.
 */
export default function RankUpResult({ outcome, card, onClose }: RankUpResultProps) {
  const tone = outcome.success ? plusTone(outcome.to) : '#e5343f';
  const shown = { ...card, plus: outcome.destroyed ? outcome.from : outcome.to };

  const headline = outcome.success ? 'ตีบวกสำเร็จ' : 'ตีบวกล้มเหลว';
  const detail = outcome.destroyed
    ? 'การ์ดหลักหายไปแล้ว'
    : outcome.to === outcome.from
      ? `การ์ดยังอยู่ที่ +${outcome.from}`
      : `+${outcome.from} → +${outcome.to}`;

  return (
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      style={{ '--tone': tone } as CSSProperties}
    >
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <div className={`${styles.panel} ${outcome.success ? styles.win : styles.lose}`}>
        <span className={styles.burst} aria-hidden="true" />

        <h2 className={styles.headline}>{headline}</h2>

        {/* The frame the card now sits at. Skipped at +0 and on a destroy, where
            there is no level to celebrate. */}
        {!outcome.destroyed && outcome.to > 0 && (
          <RankFrame level={outcome.to} className={styles.frame} />
        )}

        <div className={`${styles.card} ${outcome.destroyed ? styles.gone : ''}`}>
          <SquadCard player={shown} scale={2.4} interactive={false} />
        </div>

        <p className={styles.detail}>{detail}</p>

        <button type="button" className={styles.ok} onClick={onClose}>
          ตกลง
        </button>
      </div>
    </div>
  );
}
