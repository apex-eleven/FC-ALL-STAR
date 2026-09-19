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
import { defaultDailyLogin } from './constants';
import {
  canClaim as checkClaim,
  claimToday as applyClaim,
  currentProgress,
  todayKey,
  todayTile,
} from './dailylogin';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './dailyloginConfigStore';
import type { DailyLoginConfig, DailyLoginProgress, LoginClaimError } from './types';

export interface LoginClaimResult {
  ok: boolean;
  error: LoginClaimError | null;
  day: number;
  rewards: ShopReward[];
  cards: OwnedPlayer[];
}

interface DailyLoginValue {
  config: DailyLoginConfig;
  replace(next: DailyLoginConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's calendar as of now (another run started fresh). */
  progress: DailyLoginProgress | null;
  /** Today's day key under the reset hour. */
  today: string;
  /** The tile today's claim lands on, or the one already taken today. */
  tile: number;
  canClaim: boolean;
  claim(): LoginClaimResult;
  /** True while the calendar should open by itself on the home screen. */
  shouldPrompt: boolean;
  /** The player closed the auto-opened calendar; do not open it again today. */
  dismissPrompt(): void;
}

const DailyLoginContext = createContext<DailyLoginValue | null>(null);

/**
 * Which accounts have had the calendar pop up, and for which day.
 *
 * In memory on purpose. It is a per-launch nudge, like the game it reconstructs: a
 * player who closed it without claiming sees it again next time they open the app,
 * but not every time they come back to the home screen in one sitting.
 */
const prompted = new Map<string, string>();

export function DailyLoginProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<DailyLoginConfig>(loadConfig);
  // Re-read once a minute so the day rolls over on an open screen.
  const [clock, setClock] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(0);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const replace = useCallback((next: DailyLoginConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultDailyLogin()), [replace]);

  const today = useMemo(() => todayKey(new Date(clock), config), [clock, config]);

  const progress = useMemo(
    () => (account ? currentProgress(account.login, config, today) : null),
    [account, config, today],
  );

  const tile = progress ? todayTile(progress, today) : 0;
  const canClaim = progress ? checkClaim(config, progress, today) : false;

  const claim = useCallback((): LoginClaimResult => {
    if (!account) return { ok: false, error: 'closed', day: 0, rewards: [], cards: [] };
    // Clock and stamp are fixed here: `updateAccount` may run its mutator twice,
    // and both runs have to hand over the same cards with the same ids.
    const now = new Date();
    const stamp = shopStamp();
    const run = (target: typeof account) => applyClaim(target, config, now, byId, stamp);

    const preview = run(account);
    if (!preview.ok) return { ok: false, error: preview.error, day: 0, rewards: [], cards: [] };

    updateAccount((current) => {
      const outcome = run(current);
      return outcome.ok ? outcome.account : current;
    });
    return { ok: true, error: null, day: preview.day, rewards: preview.rewards, cards: preview.cards };
  }, [account, config, byId, updateAccount]);

  const username = account?.username ?? '';
  const autoOpen = config.autoOpen;
  // `dismissed` is only here to re-run this after the map changes.
  const shouldPrompt = useMemo(
    () => autoOpen && canClaim && username !== '' && prompted.get(username) !== today,
    [autoOpen, canClaim, username, today, dismissed],
  );

  const dismissPrompt = useCallback(() => {
    if (username) prompted.set(username, today);
    setDismissed((count) => count + 1);
  }, [username, today]);

  const value = useMemo<DailyLoginValue>(
    () => ({
      config,
      replace,
      reset,
      progress,
      today,
      tile,
      canClaim,
      claim,
      shouldPrompt,
      dismissPrompt,
    }),
    [config, replace, reset, progress, today, tile, canClaim, claim, shouldPrompt, dismissPrompt],
  );

  return <DailyLoginContext.Provider value={value}>{children}</DailyLoginContext.Provider>;
}

export function useDailyLogin(): DailyLoginValue {
  const value = useContext(DailyLoginContext);
  if (!value) throw new Error('useDailyLogin must be used inside a DailyLoginProvider');
  return value;
}
