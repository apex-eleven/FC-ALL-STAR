# features/bots

ไอดีบอท — accounts the admin creates (ADMIN → ไอดีบอท) that play the game on their own:
log in each day, open packs, build the eleven, rank up cards, play ranked, enter and
play cups, claim missions and Star Pass, and chat.

```
bots/
  types.ts        BotProfile, BotSettings, BotLease, BotPersona, BotAction
  constants.ts    personas (hours, sessions, daily caps, max plus), default settings
  names.ts        realistic login IDs that pass the signup rules
  schedule.ts     PURE — online windows, session rhythm, day counters
  brain.ts        PURE — botStep(): decide one action and apply it to an account
  publish.ts      the leaderboard row, built exactly as ClubScreen builds it
  BotRunner.tsx   headless: plays due bots from an admin's browser
```

Cloud side: `features/cloud/cloudBots.ts`. Admin screen: `components/admin/AdminBots.tsx`.

## Why nobody can tell

A bot is written to the same documents a signup writes — `accounts/{uid}`,
`usernames/{name}`, `leaderboard/{uid}`, `chat`, `oneOfOne` — with the same fields and
nothing extra. Its uid has the shape Firebase Auth uses. Everything that says "bot"
is in `bots/{uid}` and `botConfig/*`, which `firestore.rules` lets only admins read.

Every move goes through the same pure rules as a player's buttons (`pull`,
`attempt`, `playManagerMatch`, `enterCup` / `playCupRound`, `claimMission`,
`claimToday`, `claimAll`), pays the same prices, rolls the same odds, and counts toward
missions and Star Pass the same way. A bot cannot do anything a player could not.

Ranked matches and cup ties are decided with the quick simulation — the same one
manager mode uses for a match nobody watched — and the step is held for part of
`matchSeconds` afterwards so a bot does not finish ten matches in a minute.

## Where they run

There is no server (no Cloud Functions on this project), so bots are played by
`BotRunner`, mounted in `main.tsx`, in the browser of any signed-in admin. One browser
at a time holds `botConfig/lease` (5 minutes, renewed every 2); if it closes, the next
admin browser takes over. With no admin online the bots simply do nothing, and on the
next start the overdue ones are spread out over ~20 minutes rather than all logging
on together.

Each tick (6 s) plays one step for the most overdue bot. A hidden tab is throttled by
the browser to about one tick a minute, which still works, just slower.

## Rhythm

Each bot gets its own online window (the persona's hours ± a couple), a favourite
formation, and a random first start. A session is a few actions 15–140 s apart; then
the bot is gone for hours. Daily caps per persona keep it human (casual: a few packs,
a handful of matches, rank-ups only to +5; whale: much more, up to +10).

Income: `BotSettings.income` pays each persona a daily amount (reason `reward`),
standing in for top-ups and the modes bots do not play (gacha, fusion, shop,
transfer market).

## Firestore cost

Per step: ~2 reads + 2–3 writes (account through `updateOther`, the bot profile, the
leaderboard row when the eleven changed). The opponent list is fetched at most every
30 minutes. The lease renewal is one write every 2 minutes while a runner holds it.

## Rules

`firestore.rules` must be republished in the Firebase Console for any of this to work:
admins may create accounts and username claims for other uids, write any leaderboard
row, post chat as another uid, and read/write `bots/*` and `botConfig/*`.
