# features/sim

The quick simulation, shared by every mode that has to resolve a match nobody is
watching.

```
sim/
  types.ts      MatchOutcome
  constants.ts  RIVAL_NAMES — invented clubs the generated sides are named from
  seeded.ts     PURE — seeded(), playMatch(), scoreFor(), playTie(), shootoutFor()
```

## Why it is its own folder

These four functions used to live in `features/league/`, which made every mode that
needed a seeded match import from the league — manager mode, Star Pass, and later the
cup. When the league was replaced by the cup that import would have become a cycle
(the cup needs the sim, the sim would have lived in the cup), so the shared half moved
here and nothing owns it.

## Two ways a match is decided

| | who plays it | where |
| --- | --- | --- |
| quick | nobody watches; a seed and two ratings | `seeded.ts` |
| live | the engine, in front of the player | `src/match-engine/` |

Both produce the same shape — a score — so the rules that read a result never care
which one produced it. That is why `playManagerMatch` and `playCupTie` both take an
optional `result`: supplied, the live engine decided it; absent, `playMatch` did.

## Knockout ties

`playTie` is `playMatch` with the draw removed, because a cup tie has to produce a
winner. It does **not** re-roll until the match is not a draw — that would quietly
bend the odds toward the stronger side. A level match goes to penalties, where the
rating gap is worth a nudge (±15 points at most) and not a verdict. `shootoutFor` is
the same rule applied to a live match the engine left level.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
