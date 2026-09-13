# features/contracts

Reserved slot. Phase 1 ships UI only — nothing here is implemented yet.

When this system lands it should contain:

```
contracts/
  types.ts        domain types
  constants.ts    tuning values, enums, labels
  components/     domain-aware components
  hooks/          data access
```

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
