import type { PointerEvent } from 'react';
import type { DisplayCard } from '@/features/club/types';
import { CARD_HEIGHT, CARD_WIDTH } from '@/features/squad/constants';
import { effectiveRating, positionPenalty } from '@/features/squad/rating';
import type { FormationSlot } from '@/features/squad/types';
import SquadCard from './SquadCard';
import styles from './PitchSlot.module.css';

export interface PitchSlotProps {
  slot: FormationSlot;
  player: DisplayCard | null;
  dragging: boolean;
  over: boolean;
  blocked: boolean;
  onPointerDown(event: PointerEvent): void;
  /** Tapping the slot opens the picker; dragging a card out of it still works. */
  onOpen(): void;
}

export default function PitchSlot({
  slot,
  player,
  dragging,
  over,
  blocked,
  onPointerDown,
  onOpen,
}: PitchSlotProps) {
  const width = CARD_WIDTH * slot.scale;
  const height = CARD_HEIGHT * slot.scale;

  // Out of position: the badge carries the number the card is actually worth here,
  // because the rating printed on the artwork cannot change.
  const penalty = player ? positionPenalty(slot.position, player.position) : 0;

  return (
    <div className={styles.slot} style={{ left: slot.x, top: slot.y }}>
      <div
        data-drop-kind="slot"
        data-drop-id={slot.id}
        className={`${styles.drop} ${player ? '' : styles.empty} ${
          over ? (blocked ? styles.blocked : styles.over) : ''
        }`}
        style={{ width, height }}
        onClick={onOpen}
      >
        {player ? (
          <SquadCard
            player={player}
            scale={slot.scale}
            dragging={dragging}
            allowStill={false}
            onPointerDown={onPointerDown}
          />
        ) : (
          <span className={styles.emptyLabel} style={{ fontSize: 22 * slot.scale }}>
            {slot.position}
          </span>
        )}
        {player && penalty > 0 && (
          <span className={styles.penalty}>
            {effectiveRating(player, slot.position)}
            <span className={styles.penaltyDelta}>-{penalty}</span>
          </span>
        )}
      </div>
      {/* Name first, then the slot's position under it. The artwork prints the name
          too, but at this size it is a few pixels tall and unreadable — this is the
          line you actually read when scanning the eleven. */}
      <span className={styles.caption}>
        {player && <span className={styles.name}>{player.name}</span>}
        <span className={styles.tag}>{slot.position}</span>
      </span>
    </div>
  );
}
