import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragState {
  cardId: string;
}

export interface DropTarget {
  kind: 'slot' | 'bench' | 'remove';
  id: string;
}

export interface CardDragApi {
  /** Set once the pointer has actually travelled, not on press. */
  drag: DragState | null;
  /** Drop target currently under the pointer, for highlighting. */
  over: DropTarget | null;
  start(cardId: string, event: React.PointerEvent): void;
  /**
   * Attach to the floating ghost. The hook moves it directly, every frame, without a
   * React render. Render the ghost outside the scaled stage (a portal to `body`) with
   * `position: fixed; left: 0; top: 0` — see `ghostStyle`.
   */
  ghostRef(element: HTMLElement | null): void;
  /** Size of the ghost box in client pixels, matching the card that was grabbed. */
  ghostSize: { width: number; height: number } | null;
}

const MOVE_THRESHOLD = 4;
/** The ghost is drawn this much larger than the card it came from. */
export const GHOST_LIFT = 1.1;

function readTarget(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const host = element?.closest<HTMLElement>('[data-drop-kind]');
  if (!host) return null;

  const kind = host.dataset.dropKind as DropTarget['kind'] | undefined;
  const id = host.dataset.dropId;
  if (!kind || id === undefined) return null;
  return { kind, id };
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
}

interface Session {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Where on the card it was grabbed, as a fraction of its size — kept under the pointer. */
  grabX: number;
  grabY: number;
  moved: boolean;
}

/**
 * Pointer-based drag and drop.
 *
 * HTML5 drag events are not an option: they do not fire on touch at all, and this
 * screen is a reconstruction of a mobile game. Pointer events cover mouse, touch, and
 * pen with one code path.
 *
 * Targets opt in with `data-drop-kind` and `data-drop-id` attributes and are resolved
 * with `elementFromPoint`, so a slot can move or rescale without the hook knowing
 * anything about the layout.
 *
 * Smoothness rules, each one fixing a stutter the first version had:
 * - The pointer position lives in a ref and the ghost is moved with a transform once
 *   per animation frame. React only renders when the drag starts, ends, or the target
 *   under the pointer changes — not on every mouse move.
 * - The window listeners are attached once per drag, not re-attached on every move.
 * - The ghost keeps the point where the card was grabbed under the pointer, at the
 *   grabbed card's on-screen size, so it does not jump when the drag begins.
 */
export function useCardDrag(
  onDrop: (cardId: string, target: DropTarget | null) => void,
): CardDragApi {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const [ghostSize, setGhostSize] = useState<CardDragApi['ghostSize']>(null);
  // Bumped on press so the listener effect runs once per drag.
  const [pressId, setPressId] = useState(0);

  const session = useRef<Session | null>(null);
  const ghost = useRef<HTMLElement | null>(null);
  const size = useRef<{ width: number; height: number } | null>(null);
  const overRef = useRef<DropTarget | null>(null);
  const frame = useRef(0);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const place = useCallback(() => {
    const now = session.current;
    const element = ghost.current;
    const box = size.current;
    if (!now || !element || !box) return;
    const left = now.x - now.grabX * box.width;
    const top = now.y - now.grabY * box.height;
    element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, []);

  const ghostRef = useCallback(
    (element: HTMLElement | null) => {
      ghost.current = element;
      // Positioned before its first paint, so it never flashes at the corner.
      if (element) place();
    },
    [place],
  );

  const start = useCallback((cardId: string, event: React.PointerEvent) => {
    // Only the primary button starts a drag; right-click must stay available.
    if (event.button !== 0 || session.current) return;

    const rect = event.currentTarget.getBoundingClientRect();
    size.current = { width: rect.width * GHOST_LIFT, height: rect.height * GHOST_LIFT };
    session.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabX: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
      grabY: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5,
      moved: false,
    };
    setPressId((id) => id + 1);
  }, []);

  useEffect(() => {
    if (pressId === 0) return;

    const setTarget = (target: DropTarget | null) => {
      if (sameTarget(overRef.current, target)) return;
      overRef.current = target;
      setOver(target);
    };

    const tick = () => {
      frame.current = 0;
      const now = session.current;
      if (!now || !now.moved) return;
      place();
      setTarget(readTarget(now.x, now.y));
    };

    const finish = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      session.current = null;
      overRef.current = null;
      setDrag(null);
      setOver(null);
      setGhostSize(null);
    };

    const onMove = (event: PointerEvent) => {
      const now = session.current;
      if (!now || event.pointerId !== now.pointerId) return;
      now.x = event.clientX;
      now.y = event.clientY;

      if (!now.moved) {
        // A press that never travels is a click, not a drag. Without this every tap
        // would pick the card up and drop it again.
        if (Math.hypot(now.x - now.startX, now.y - now.startY) < MOVE_THRESHOLD) return;
        now.moved = true;
        setGhostSize(size.current);
        setDrag({ cardId: now.cardId });
      }

      // Stops the page scrolling or selecting text under a touch drag.
      if (event.cancelable) event.preventDefault();
      if (!frame.current) frame.current = requestAnimationFrame(tick);
    };

    const onUp = (event: PointerEvent) => {
      const now = session.current;
      if (!now || event.pointerId !== now.pointerId) return;
      const target = now.moved ? readTarget(event.clientX, event.clientY) : null;
      const { cardId, moved } = now;
      finish();
      if (moved) dropRef.current(cardId, target);
    };

    const onCancel = (event: PointerEvent) => {
      const now = session.current;
      if (!now || event.pointerId !== now.pointerId) return;
      finish();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [pressId, place]);

  return { drag, over, start, ghostRef, ghostSize };
}
