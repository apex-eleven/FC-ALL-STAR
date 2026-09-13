import { useEffect } from 'react';
import { INTERACTIVE_SELECTOR } from './constants';
import { playSfx, unlockSfx } from './sfx';
import type { SoundId } from './types';

const SOUND_IDS: readonly SoundId[] = ['click', 'back', 'toggle', 'error', 'shake', 'tear'];

function readSoundId(element: Element): SoundId | 'off' | null {
  const requested = element.getAttribute('data-sound');
  if (requested === 'off') return 'off';
  if (requested && (SOUND_IDS as readonly string[]).includes(requested)) return requested as SoundId;
  return null;
}

/**
 * One document-level listener instead of an onClick in every component.
 *
 * Wiring the sound into each button would mean every new screen has to remember to
 * do it, and a screen that forgets goes silent in a way nobody notices for weeks.
 * Delegation means an affordance is audible because it is a button, not because
 * someone added a line.
 *
 * Fires on `pointerdown`, not `click`: on touch, `click` lands up to 100ms after the
 * finger, which is long enough to feel like the sound is lagging the tap.
 */
export function useUiClickSounds(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const resolve = (target: EventTarget | null): SoundId | null => {
      if (!(target instanceof Element)) return null;

      const hit = target.closest(INTERACTIVE_SELECTOR);
      if (!hit) return null;

      // An opt-out anywhere up the chain wins, so wrapping a silent region in
      // data-sound="off" silences everything inside it.
      const silenced = target.closest('[data-sound="off"]');
      if (silenced) return null;

      if (hit instanceof HTMLButtonElement && hit.disabled) return null;
      if (hit.getAttribute('aria-disabled') === 'true') return null;

      const requested = readSoundId(hit);
      if (requested === 'off') return null;
      return requested ?? 'click';
    };

    const onPointerDown = (event: PointerEvent) => {
      const id = resolve(event.target);
      if (!id) return;
      unlockSfx();
      playSfx(id);
    };

    // Keyboard activation of a button never produces a pointer event, and a keyboard
    // player should not get a silent app.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const id = resolve(event.target);
      if (!id) return;
      unlockSfx();
      playSfx(id);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
}
