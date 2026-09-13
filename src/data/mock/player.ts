import type { Account } from '@/features/auth/types';

/**
 * Seed account used by the reference screenshot, kept for visual comparison.
 * Nothing in the running app reads this — real accounts come from the AccountStore.
 */
export const referenceAccount: Account = {
  id: 'reference',
  username: 'ĐĐX',
  role: 'player',
  level: 57,
  currentXP: 6132,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSignInAt: '2026-01-01T00:00:00.000Z',
  avatarId: 'rookie',
  wallet: { exchange: 69_010, gem: 960, fcpoint: 121, ticket: 0 },
  ledger: [],
  draftProgress: {},
  club: { players: [] },
  squad: {
    formation: '4-3-3-attack',
    starters: {},
    bench: [null, null, null, null, null, null, null],
  },
};
