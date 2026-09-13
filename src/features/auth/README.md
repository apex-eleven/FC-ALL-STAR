# features/auth

Local accounts with passwords and roles. Phase 2.

```
auth/
  types.ts              Account, StoredAccount, Role, AuthError, AccountStore
  constants.ts          username/password rules, ADMIN_USERNAMES, ADMIN_SIGNUP_CODE
  crypto.ts             PBKDF2-SHA-256 hashing via Web Crypto
  localAccountStore.ts  the only file that knows about localStorage
  AuthContext.tsx       AuthProvider, useAuth(), useAccount(), useIsAdmin()
```

The screen lives in `src/components/auth/AuthScreen.tsx`, not here — this folder
must not import from `src/components/`. See CLAUDE.md.

## Read this before trusting it

**This is a UI gate, not a security boundary.** Everything runs in the browser:

- The account registry is in `localStorage`. Anyone can open DevTools and set
  `role: "admin"` on their own record.
- `ADMIN_USERNAMES` and `ADMIN_SIGNUP_CODE` are compiled into the bundle, so the
  admin code ships to every visitor. It is not a secret.
- Password checking happens on the client, so it can be bypassed by editing the
  stored record rather than guessing the password.

What it does buy: passwords are never stored in plain text, casual users cannot
claim the admin name, and every call site that will eventually need real
enforcement already goes through `useIsAdmin()` / the `AccountStore` interface.

Real enforcement requires a server that owns the role and re-checks it on every
privileged request. Until then, do not gate anything that matters on `isAdmin`.

## Passwords

`crypto.ts` derives a 256-bit key with PBKDF2-SHA-256, 150,000 iterations, and a
fresh 16-byte salt per account. Hashing takes roughly 30 ms. Comparison is constant
time.

`crypto.subtle` only exists in a secure context, so this works on `localhost` and on
any `https` host, and fails on plain `http` over a LAN address. That failure surfaces
as the `crypto-unavailable` error rather than falling back to storing the password —
falling back would be worse than not working.

## Admin

An account gets `role: 'admin'` when its username is in `ADMIN_USERNAMES`
(case-insensitive). Claiming one of those names at signup also requires
`ADMIN_SIGNUP_CODE`, which the UI asks for only when the typed name matches.

The role is re-resolved on every sign-in, so adding a name to `ADMIN_USERNAMES`
promotes an account that already exists the next time it signs in.

To add an admin: edit `ADMIN_USERNAMES` in `constants.ts`.

## Storage keys

```
football-home-ui:accounts:v2   { [lowercase username]: StoredAccount }
football-home-ui:session:v2    lowercase username of the active session
```

The `v1` single-account key from the previous phase is not migrated. Accounts made
before passwords existed have no credential, so they are simply ignored — create a
new one.

## Swapping in a real backend

Everything talks to the `AccountStore` interface: `find`, `create`, `update`,
`remove`, `listUsernames`, and the three session methods. Write a
`firebaseAccountStore.ts` next to `localAccountStore.ts` and pass it in:

```tsx
<AuthProvider store={firebaseAccountStore}>
```

No component changes. When you do, move password verification and role assignment
to the server as well — that is the step that turns this from a gate into a
boundary.

## Not done yet

Password change and recovery, renaming, avatar selection, an admin panel, and
anything that actually restricts what an admin can do.
