# features/currencies

Three in-game currencies with per-account balances and an audit trail.

```
currencies/
  types.ts       CurrencyDefinition, Wallet, WalletEntry, WalletResult
  constants.ts   order, caps, starting balances, formatting
  wallet.ts      pure arithmetic — credit, debit, setBalance, normalizeWallet
  useWallet.ts   useWallet() for the player, useAdminWallet() for minting
  README.md
```

The UI lives in `src/components/currency/` and `src/components/admin/`.

## The currencies

| kind | Thai label | icon |
|---|---|---|
| `exchange` | แต้มแลกเปลี่ยน | `currency-exchange.png` |
| `gem` | เจม | `currency-gem.png` |
| `fcpoint` | เอฟซีพอยต์ | `currency-fcpoint.png` |

Artwork, labels, and icon sizes are in `data/mock/currencies.ts`. Adding a fourth
currency means extending `CurrencyKind`, adding an entry to that catalogue, and
adding it to `CURRENCY_ORDER` and `STARTING_WALLET` — TypeScript will point at every
place that needs updating, because the wallet is a `Record<CurrencyKind, number>`.

## Where balances live

On the account, not in mock data. Two players signed into the same browser must not
share a wallet, and a balance that is not attached to an identity cannot survive
sign-out. `Account.wallet` is persisted through the same `AccountStore` as everything
else.

Accounts created before currencies existed have no `wallet` field.
`normalizeWallet()` repairs them on load: missing balances fall back to
`STARTING_WALLET`, and anything non-numeric, negative, or fractional is coerced into
a whole number inside `[0, MAX_BALANCE]`. That is also the guard against a
hand-edited `localStorage` record breaking the top bar.

## Using it from game code

```ts
const { balances, earn, spend, affords } = useWallet();

if (!affords('gem', 250)) return;
const result = spend('gem', 250, 'purchase');
if (!result.ok) console.warn(result.error);
```

Call `earn`/`spend` rather than writing `account.wallet` directly — they clamp,
validate, and write a ledger entry. The arithmetic in `wallet.ts` is pure and never
mutates the wallet passed in, so it is safe under StrictMode's double invocation.

Failure modes are returned, not thrown: `invalid-amount` (zero, negative, or
fractional), `insufficient-funds`, `at-cap`.

## Ledger

Every balance change appends a `WalletEntry` (kind, signed delta, resulting balance,
reason, timestamp, and the admin responsible when minted by hand). Newest first,
capped at `LEDGER_LIMIT` (25). The admin panel reads it; nothing depends on it yet.

It is a convenience, not an audit log — it lives in the same record an attacker
would edit.

## Admin minting

`useAdminWallet()` exposes `grant(username, kind, amount)` and
`set(username, kind, amount)` for any account in the store. The panel at
`components/admin/AdminPanel.tsx` opens from the ADMIN chip beside the player name.

`MAX_GRANT` (100,000,000) caps a single grant so a stray extra zero cannot push a
balance to the ceiling by accident.

**This is not a permission system.** Gating happens in the browser, so anyone can
edit `localStorage` and give themselves any balance. Real enforcement means the
server owns the wallet and re-checks the role on every mutation.

## Not done yet

Purchases, rewards from missions, currency packs behind the "+" buttons, transfers
between players, and any server-side authority over balances.
