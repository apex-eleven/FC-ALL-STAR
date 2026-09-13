import type { PointerEvent } from 'react';
import type { OwnedPlayer } from '@/features/club/types';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import SquadCard from './SquadCard';
import styles from './BenchStrip.module.css';

export interface BenchStripProps {
  squad: Squad;
  owned: OwnedIndex;
  draggingId: string | null;
  overIndex: number | null;
  onPointerDown(cardId: string, event: PointerEvent): void;
  /** Tapping a seat opens the picker, the same way a pitch slot does. */
  onOpen(index: number): void;
}

export default function BenchStrip({
  squad,
  owned,
  draggingId,
  overIndex,
  onPointerDown,
  onOpen,
}: BenchStripProps) {
  return (
    <div className={styles.strip} aria-label="ตัวสำรอง">
      {squad.bench.map((cardId, index) => {
        const player: OwnedPlayer | undefined = cardId ? owned.get(cardId) : undefined;

        return (
          <div
            key={index}
            data-drop-kind="bench"
            data-drop-id={String(index)}
            className={`${styles.seat} ${overIndex === index ? styles.over : ''}`}
            onClick={() => onOpen(index)}
          >
            {player ? (
              <div className={styles.card}>
                <SquadCard
                  player={player}
                  scale={0.58}
                  dragging={draggingId === player.id}
                  onPointerDown={(event) => onPointerDown(player.id, event)}
                />
              </div>
            ) : (
              // An empty seat reads as a button now, not as a numbered box.
              <span className={styles.empty}>
                <span className={styles.plus}>+</span>
                <span className={styles.seatNumber}>{index + 1}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
