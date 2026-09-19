import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import type { OwnedPlayer } from '@/features/club/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { defaultInbox } from './constants';
import {
  attentionCount,
  claimAll as applyClaimAll,
  claimMail as applyClaim,
  entriesFor,
  markRead,
  removeMail,
  removeRead,
} from './inbox';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './inboxConfigStore';
import type { InboxClaimError, InboxConfig, InboxEntry } from './types';

export interface InboxClaimResult {
  ok: boolean;
  error: InboxClaimError | null;
  rewards: ShopReward[];
  cards: OwnedPlayer[];
  /** How many mails were collected — one for `claim`, any number for `claimAll`. */
  count: number;
}

interface InboxValue {
  config: InboxConfig;
  replace(next: InboxConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's mails as of now, newest first. */
  entries: InboxEntry[];
  /** Unread mails plus mails with attachments waiting — the number on the badge. */
  attention: number;
  open(mailId: string): void;
  claim(mailId: string): InboxClaimResult;
  claimAll(): InboxClaimResult;
  remove(mailId: string): void;
  removeRead(): void;
}

const InboxContext = createContext<InboxValue | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<InboxConfig>(loadConfig);
  // Re-read once a minute so a mail that expires, or one scheduled to arrive, moves
  // on an open screen.
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const replace = useCallback((next: InboxConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultInbox()), [replace]);

  const entries = useMemo(
    () => (account ? entriesFor(config, account, new Date(clock)) : []),
    [account, config, clock],
  );

  const attention = useMemo(() => attentionCount(entries), [entries]);

  const open = useCallback(
    (mailId: string) => updateAccount((current) => markRead(current, mailId)),
    [updateAccount],
  );

  const claim = useCallback(
    (mailId: string): InboxClaimResult => {
      if (!account) return { ok: false, error: 'closed', rewards: [], cards: [], count: 0 };
      // Clock and stamp are fixed here: `updateAccount` may run its mutator twice,
      // and both runs have to hand over the same cards with the same ids.
      const now = new Date();
      const stamp = shopStamp();
      const run = (target: typeof account) => applyClaim(target, config, mailId, now, byId, stamp);

      const preview = run(account);
      if (!preview.ok) return { ok: false, error: preview.error, rewards: [], cards: [], count: 0 };

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, rewards: preview.rewards, cards: preview.cards, count: 1 };
    },
    [account, config, byId, updateAccount],
  );

  const claimAll = useCallback((): InboxClaimResult => {
    if (!account) return { ok: false, error: 'closed', rewards: [], cards: [], count: 0 };
    const now = new Date();
    const stamp = shopStamp();
    const run = (target: typeof account) => applyClaimAll(target, config, now, byId, stamp);

    const preview = run(account);
    if (preview.claimed.length > 0) {
      updateAccount((current) => run(current).account);
    }
    return {
      ok: preview.claimed.length > 0,
      error: preview.error,
      rewards: preview.rewards,
      cards: preview.cards,
      count: preview.claimed.length,
    };
  }, [account, config, byId, updateAccount]);

  const remove = useCallback(
    (mailId: string) => {
      const now = new Date();
      updateAccount((current) => removeMail(current, config, mailId, now));
    },
    [config, updateAccount],
  );

  const removeReadMails = useCallback(() => {
    const now = new Date();
    updateAccount((current) => removeRead(current, config, now));
  }, [config, updateAccount]);

  const value = useMemo<InboxValue>(
    () => ({
      config,
      replace,
      reset,
      entries,
      attention,
      open,
      claim,
      claimAll,
      remove,
      removeRead: removeReadMails,
    }),
    [config, replace, reset, entries, attention, open, claim, claimAll, remove, removeReadMails],
  );

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox(): InboxValue {
  const value = useContext(InboxContext);
  if (!value) throw new Error('useInbox must be used inside an InboxProvider');
  return value;
}
