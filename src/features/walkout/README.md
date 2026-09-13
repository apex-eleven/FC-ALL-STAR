# features/walkout

The reveal animation for a high-rated pull.

```
walkout/
  types.ts              WalkoutConfig, WalkoutPhase
  constants.ts          measured clip timings and defaults
  walkoutConfigStore.ts the only file that touches localStorage
  WalkoutContext.tsx    WalkoutProvider, useWalkout(), pickWalkout()
```

UI lives in `src/components/walkout/WalkoutOverlay.tsx`.

## The join between the two clips

This is the part that needed measuring rather than guessing.

- **Flight** (`walkout-flight.mp4`): 7.042s, 24fps, 2048x1536, silent. It brightens
  from about 6.5s and reaches full white at frame 164 — **6.833s** — holding it to
  the end. The saturated window is **0.208s**.
- **Stage** (`walkout-stage.mp4`): 3.000s, 30fps, loops, silent. Opens on a dark
  lantern-lit arena at roughly a third of the flight's closing brightness.

Both clips are mounted for the whole sequence, stage underneath. The stage starts
`crossfade` seconds before the flight ends and the flight fades out over its own
flash. `crossfade` defaults to **0.2s** so the entire fade happens inside that
saturated window — a more generous value would start the fade while the image is
still resolving, and the join becomes visible. The admin panel warns when the value
exceeds 0.21.

Cutting from pure white straight into a dark arena is still a jolt, so a white veil
is held at the moment of the switch and dissolved over `flashOut` (0.65s). That reads
as the flash blowing out rather than a cut. The veil is set opaque and transparent in
two separate frames via a double `requestAnimationFrame`; setting both in one commit
would skip the transition entirely.

Neither clip has an audio track, so nothing here depends on autoplay-with-sound being
permitted.

## Buffering

The stage clip has the flight's full seven seconds to buffer, so only the flight is
waited on. The overlay shows a brief loading state until `canplaythrough` and then
starts. A nine-second safety timer moves to the stage even if `ended` never fires —
a stalled buffer or a backgrounded tab must not trap the player in the flight.

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
