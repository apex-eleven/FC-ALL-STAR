# features/sound

Everything the app makes noise with: the UI click layer and the volume the walkout
clips play at.

```
sound/
  types.ts             SoundId, SoundConfig
  constants.ts         storage key, defaults, throttle, interactive selector
  sfx.ts               PURE Web Audio synthesiser — no React, no asset files
  soundConfigStore.ts  the only file here that touches localStorage
  useUiClickSounds.ts  one delegated document listener for every button
  SoundContext.tsx     SoundProvider, useSound()
```

## Why the clicks are synthesised

A click is an envelope on an oscillator plus a 45ms noise transient, built at play
time. No `.wav` to ship, nothing to decode before the first gesture, and no asset
that can go missing when the artwork is replaced. If real sampled sound design
arrives later, `playSfx` is the only function that changes.

## Why the listener is delegated

`useUiClickSounds` attaches one `pointerdown` listener to the document and looks for
the nearest `button`, `[role="button"]`, link, checkbox, or `[data-sound]` above the
target. Wiring `onClick` into every component means every new screen has to remember
to do it, and the one that forgets is silent for weeks before anyone notices.

- `data-sound="back"` · `"toggle"` · `"error"` picks a different sound.
- `data-sound="off"` on an element, or on anything wrapping it, silences it.
- Disabled buttons and `aria-disabled="true"` are silent already.

It listens on `pointerdown` rather than `click` because on touch, `click` lands up to
100ms after the finger and the sound reads as lagging the tap.

## The gachapon reel

`playReel(durationMs, cards)` is the one sound that is not a single event. It
schedules the whole tick track up front on the audio clock — one tick per card
crossing the frame — rather than firing ticks from a timer, because a timer-driven
version drifts with every dropped frame, and the frames get dropped exactly when the
reel animation is at its most expensive.

That means it evaluates the strip's own CSS timing function, so the four numbers in
`sfx.ts` and the `cubic-bezier` in `GachaScreen.module.css` have to stay the same. A
reel whose sound runs on a different curve is worse than a silent one: it sounds like
the wheel stopped before it did.

The curve ends at a stop, so the strip always finishes with about a card's width of
settling that no tick belongs to: the ticking stops a little before the transition
does, and `land` marks the actual arrival. How much earlier depends on the curve —
the first one here spent 98% of the travel in the first 62% of the run, which is why
it was opened up when the spin was lengthened to seven seconds.

Because the track is scheduled ahead of time it outlives its own component, so
`stopReel` exists and gets called when a run is cut short, when the screen closes,
and when the player turns the sound off mid-spin.

## Autoplay

Browsers will not start audio before a gesture. Two consequences:

1. The `AudioContext` is built lazily inside the first gesture, not at import. A
   context created earlier starts suspended and often stays that way.
2. The walkout's video sound can be refused even so, because its `play()` runs from a
   `canplaythrough` handler rather than inside the click. `WalkoutOverlay` handles
   that by retrying muted and offering a button to turn the sound on — never by
   letting the animation fail to start.
