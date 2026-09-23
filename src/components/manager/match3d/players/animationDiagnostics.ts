import type { AnimationCommand } from './FootballAnimationStateMachine';

/**
 * The development read-out of what every player's body is doing — who, which state,
 * how fast, which action, and what drew it — for checking the animation against the
 * engine. Off by default (`SHOW_ANIMATION_DEBUG` in Match3DStage), in the same way as
 * the coordinate read-out beside it; nothing here runs unless it is switched on.
 *
 *   #7   H:cam      RUN      3.82 m/s  PASS 0.42        PROCEDURAL
 *
 * Pure: it formats, and the stage writes the text into one DOM node a few times a
 * second — never React state, never per frame.
 */

/** How each player is being drawn. */
export type AnimationBody = 'GLB' | 'GLB+POSE' | 'PROCEDURAL';

export interface AnimationDiagnostic {
  id: string;
  shirtNumber: number;
  /** The engine's speed, m/s. */
  speed: number;
  command: AnimationCommand;
  body: AnimationBody;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/** One line per player. */
export function describeAnimation(entry: AnimationDiagnostic): string {
  const { command } = entry;
  const action = command.action.state
    ? `${command.action.state}${command.action.variant ? `#${command.action.variant + 1}` : ''} ${command.action.normalizedTime.toFixed(2)}`
    : '—';
  const turn = command.locomotion.state === 'TURN' ? (command.locomotion.turnDirection > 0 ? ' ↺' : ' ↻') : '';
  return [
    pad(`#${entry.shirtNumber}`, 4),
    pad(entry.id, 10),
    pad(`${command.locomotion.state}${turn}`, 10),
    pad(`${entry.speed.toFixed(2)} m/s`, 10),
    pad(action, 20),
    entry.body,
  ].join(' ');
}
