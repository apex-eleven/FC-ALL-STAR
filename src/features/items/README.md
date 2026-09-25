# features/items

Bag items (กระเป๋า) — the screen behind the home rail's "กระเป๋า" tile.

```
items/
  types.ts              ItemDef, ItemEffect, Inventory
  constants.ts          storage key, limits, item types, default catalogue
  inventory.ts          count arithmetic; withItems() for anything paying rewards
  items.ts              PURE — apply*Item() for every item type, shield helpers, grantItem()
  itemsConfigStore.ts   the only file here that touches localStorage; normalizers
  ItemsContext.tsx      ItemsProvider, useItems()
```

## Catalogue

The admin defines each item: name, description, art (upload, or the default for its
type), and an effect:

| type | what using one does |
| --- | --- |
| avatar | unlocks one profile avatar regardless of level, and puts it on |
| shield | nothing directly — switched on in manager mode, a ranked loss played to the end keeps its stars and spends one |
| pack | a random catalogue card rated ovrMin..ovrMax at a random plus plusMin..plusMax |
| rename | sets `account.displayName`; the login ID never changes |
| plus | raises one owned card (below that level) to the item's plus |
| box | a random min..max of one currency; several can be opened at once |
| pick | the player chooses any catalogue card rated ovrMin..ovrMax (+0) |
| premium | opens the Star Pass premium line for the current season |

## Handing items out

Rewards use the shop's shape, so `{ kind: 'item', itemId, amount }` works anywhere a
reward list does — missions, mission chests, Star Pass levels. The admin tab can
also add or take copies directly.

Randomness (packs, boxes) is rolled before `updateAccount` and passed in, so a
mutator that runs twice gives the same result both times.

## Special Point

Not an item: a currency (`special`) on the wallet, granted from the admin wallet
tab or any reward list, shown on the bag screen. It is spent on special cards (การ์ดพิเศษ, `features/special`): own the eleven cards an offer names, then buy its card with Special Point.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
