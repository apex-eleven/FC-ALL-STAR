# features/shop

The item shop (ร้านค้า): admin-defined tabs, a category rail, and item cards paid for
with FC points, gems, or — through the admin — real money.

```
shop/
  types.ts            ShopConfig → ShopSection → ShopCategory → ShopItem, ShopProgress
  constants.ts        storage key, limits, image budget, the default shop
  shopConfigStore.ts  the only file here that touches localStorage
  shop.ts             PURE — live window, limits, bonus, buyWith(), grantPurchase()
  ShopContext.tsx     ShopProvider, useShop()
```

## Paying

An item can carry a baht price, an FC-point price, and a gem price at once. Every
in-game price is its own button and the player picks. A baht price is never taken in
the game: the dialog shows the player's ID and the admin's contact link, and the
admin delivers the item from the admin tab. That delivery counts as a purchase — the
limit and first-purchase bonus apply exactly as for an in-game one — but charges
nothing.

## Limits and bonus

`limit` 0 is unlimited. `lifetime` counts every purchase; `daily` starts again at
`dailyResetHour`. `firstBonus` is paid on top of `rewards` the first time an account
buys the item, and the card's BONUS line disappears once it has been claimed.

## Images

Uploaded in the admin tab and re-encoded to at most 45 KB. They live in the one shared
settings document, which Firestore caps at 1 MiB for everything, so the admin tab shows
the running total.
