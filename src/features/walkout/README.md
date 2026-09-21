# features/walkout

The reveal animation for a high-rated pull.

```
walkout/
  types.ts              WalkoutConfig, WalkoutPhase
  constants.ts          the loop point, keyframes and defaults
  walkoutConfigStore.ts the only file that touches localStorage
  WalkoutContext.tsx    WalkoutProvider, useWalkout(), pickWalkout()
```

UI lives in `src/components/walkout/WalkoutOverlay.tsx`.

## One clip, looped from a chosen point

The walkout is a single file, `src/assets/video/walkout.mp4`. Everything before
`loopStart` plays once as the intro while nation, position and club appear; from
`loopStart` to the end repeats until the player leaves, with the card on top.

It used to be two clips — a flight that played once and a stage that looped — with a
crossfade tuned into the flight's closing white flash. The shipped file is exactly
those two joined end to end with `ffmpeg -c copy`, so the picture is unchanged and
the default `loopStart` (**7.08s**) is the old join.

- 28.14s, 60fps, 1080x810, AAC audio.
- Keyframes: 3.86 · 5.52 · 6.94 · 7.08 · 11.30 · 15.47 · 19.63 · 23.80 · 27.97

**Why a hand-driven loop.** The `loop` attribute can only go back to zero, which
would replay the intro every time round. A per-frame watcher jumps back to
`loopStart` one frame before the end (`LOOP_LEAD`) instead of waiting for `ended`:
`ended` pauses the element first, and that pause is a black frame on most phones.
`ended` is still handled as a fallback, for a backgrounded tab where animation frames
stop.

**Why keyframes matter.** Seeking to a keyframe is instant. Seeking anywhere else
makes the browser decode forward from the keyframe before it — up to four seconds of
1080p at 60fps here — which can stutter on a phone. The admin panel lists the
keyframes for the shipped clip and has a preview player that loops the same way the
overlay does, so a seam can be checked before saving.

`loopStart` is clamped at play time to half a second before the clip's real end, so a
number left over from a longer clip still leaves something to loop.

## Buffering

The overlay shows a brief loading state until `canplaythrough` and then starts. A
safety timer moves to the loop after `loopStart + 3` seconds even if playback never
crosses the loop point — a stalled buffer or a backgrounded tab must not trap the
player in the intro.

The **ข้าม** button is present in every phase for the same reason.

## Trigger

`pickWalkout(outcomes, config)` returns the card that earns the animation, or null.
The default threshold is **121**, which in the shipped pools means tier A and nothing
else.

A ten-pull can contain several qualifying cards; **only the best gets a walkout.**
Playing them back to back would mean up to seventy seconds of video before the player
sees what they actually got. The full grid follows the walkout, so nothing is hidden.

## Safety

Results are committed to the account in `useDraftRun` **before** this overlay mounts.
Skipping, closing, or a crashed video cannot lose a card.

## Replacing the footage

Drop new files at `src/assets/video/walkout-flight.mp4` and `walkout-stage.mp4`,
keeping the names. There is deliberately **no upload button**: the two clips are 11 MB
together, far past the `localStorage` quota every other admin-editable asset in this
project shares.

If the new flight clip is a different length, update `FLIGHT_DURATION` and
`FLASH_START` in `constants.ts` and re-check the beat timings — the admin panel
validates against those constants, so stale values make its warnings wrong.

## Not done yet

Per-event walkout variants, a rarer animation for tier A specifically, sound, and
letting an admin preview the sequence without pulling.
