import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragState {
  cardId: string;
  /** Pointer position in client pixels, for the floating ghost. */
  x: number;
  y: number;
}

export interface DropTarget {
  kind: 'slot' | 'bench' | 'remove';
  id: string;
}

export interface CardDragApi {
  drag: DragState | null;
  /** Drop target currently under the pointer, for highlighting. */
  over: DropTarget | null;
  start(cardId: string, event: React.PointerEvent): void;
}

const MOVE_THRESHOLD = 4;

function readTarget(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const host = element?.closest<HTMLElement>('[data-drop-kind]');
  if (!host) return null;

  const kind = host.dataset.dropKind as DropTarget['kind'] | undefined;
  const id = host.dataset.dropId;
  if (!kind || id === undefined) return null;
  return { kind, id };
}

/**
 * Pointer-based drag and drop.
 *
 * HTML5 drag events are not an option: they do not fire on touch at all, and this
 * screen is a reconstruction of a mobile game. Pointer events cover mouse, touch, and
 * pen with one code path.
 *
 * Targets opt in with `data-drop-kind` and `data-drop-id` attributes and are resolved
 * with `elementFromPoint` on release, so a slot can move or rescale without the hook
 * knowing anything about the layout.
 */
export function useCardDrag(onDrop: (cardId: string, target: DropTarget | null) => void): CardDragApi {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const active = useRef<string | null>(null);

  const start = useCallback((cardId: string, event: React.PointerEvent) => {
    // Only the primary button starts a drag; right-click must stay available.
    if (event.button !== 0) return;
    active.current = cardId;
    origin.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    setDrag({ cardId, x: event.clientX, y: event.clientY });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const from = origin.current;
      if (from && !moved.current) {
        const distance = Math.hypot(event.clientX - from.x, event.clientY - from.y);
        // A press that never travels is a click, not a drag. Without this every tap
        // would pick the card up and drop it again.
        if (distance < MOVE_THRESHOLD) return;
        moved.current = true;
      }

      setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
      setOver(readTarget(event.clientX, event.clientY));
    };

    const onUp = (event: PointerEvent) => {
      const cardId = active.current;
      const target = moved.current ? readTarget(event.clientX, event.clientY) : null;

      active.current = null;
      origin.current = null;
      setDrag(null);
      setOver(null);

      if (cardId && moved.current) onDrop(cardId, target);
    };

    const onCancel = () => {
      active.current = null;
      origin.current = null;
      setDrag(null);
      setOver(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, onDrop]);

  return { drag, over, start };
}
