import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Account } from '@/features/auth/types';
import { useAuth } from '@/features/auth/AuthContext';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import type { MatchOutcome } from '@/features/sim/types';
import { seasonEnd, seasonIndex } from '@/features/manager/manager';
import { loadConfig as loadManagerConfig } from '@/features/manager/managerConfigStore';
import type { ManagerConfig } from '@/features/manager/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import { defaultStarPass } from './constants';
import {
  addXp,
  buyLevel,
  buyPremium,
  claimAll,
  claimLevel,
  currentPass,
  matchXp,
  missionXp,
  setPremium,
  type PremiumPayKind,
  type StarPassOutcome,
} from './starpass';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './starpassConfigStore';
import type {
  StarPassConfig,
  StarPassError,
  StarPassProgress,
  StarPassReward,
  StarPassTrack,
} from './types';

export interface StarPassResult {
  ok: boolean;
  error: StarPassError | null;
  rewards: StarPassReward[];
}

interface StarPassValue {
  config: StarPassConfig;
  replace(next: StarPassConfig): SaveResult;
  reset(): SaveResult;
  /** Manager-mode season the pass runs on, and when it ends. */
  season: number;
  endsAt: Date;
  /** The signed-in account's pass for this season. */
  pass: StarPassProgress | null;
  /** Re-reads the manager season settings (they live in another feature's store). */
  refresh(): void;
  /**
   * XP for a claimed mission / finished match. Pure — callers apply these inside
   * their own updateAccount mutator, so the action and its XP are one save.
   */
  awardMission(account: Account, points: number): Account;
  awardMatch(account: Account, outcome: MatchOutcome): Account;
  claim(levelId: string, track: StarPassTrack): StarPassResult;
  claimEverything(): StarPassResult;
  buy(kind: PremiumPayKind): StarPassResult;
  /** Buys the next level with FC points. */
  buyNextLevel(): StarPassResult;
  /** Admin: open or close another account's premium track for this season. */
  grant(username: string, premium: boolean): Promise<boolean>;
}

const StarPassContext = createContext<StarPassValue | null>(null);

export function StarPassProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount, updateOther } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<StarPassConfig>(loadConfig);
  const [manager, setManager] = useState<ManagerConfig>(loadManagerConfig);
  const [clock, setClock] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setManager(loadManagerConfig());
    setClock(Date.now());
  }, []);

  useEffect(() => {
    const onChange = () => {
      setConfig(loadConfig());
      refresh();
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, onChange);
  }, [refresh]);

  // Once a minute: the season can roll over, and the manager tab saves its settings
  // without announcing them.
  useEffect(() => {
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const replace = useCallback((next: StarPassConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultStarPass()), [replace]);

  const now = useMemo(() => new Date(clock), [clock]);
  const season = useMemo(() => seasonIndex(now, manager), [now, manager]);
  const endsAt = useMemo(() => seasonEnd(now, manager), [now, manager]);

  const pass = useMemo(
    () => (account ? currentPass(account.starpass, season) : null),
    [account, season],
  );

  // The season is read fresh at award time: a match that ends just after the
  // rollover belongs to the new season.
  const seasonNow = useCallback(() => seasonIndex(new Date(), manager), [manager]);

  const awardMission = useCallback(
    (target: Account, points: number) => addXp(target, missionXp(points, config), seasonNow(), config),
    [config, seasonNow],
  );

  const awardMatch = useCallback(
    (target: Account, outcome: MatchOutcome) => addXp(target, matchXp(outcome, config), seasonNow(), config),
    [config, seasonNow],
  );

  /** Checked on the account on screen, then applied to the latest save with the same ids. */
  const settle = useCallback(
    (run: (target: Account, stamp: ReturnType<typeof shopStamp>) => StarPassOutcome): StarPassResult => {
      if (!account) return { ok: false, error: 'closed', rewards: [] };
      const stamp = shopStamp();
      const preview = run(account, stamp);
      if (!preview.ok) return { ok: false, error: preview.error, rewards: [] };
      updateAccount((current) => {
        const outcome = run(current, stamp);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, rewards: preview.rewards };
    },
    [account, updateAccount],
  );

  const claim = useCallback(
    (levelId: string, track: StarPassTrack) =>
      settle((target, stamp) => claimLevel(target, levelId, track, season, config, byId, stamp)),
    [settle, season, config, byId],
  );

  const claimEverything = useCallback(
    () => settle((target, stamp) => claimAll(target, season, config, byId, stamp)),
    [settle, season, config, byId],
  );

  const buy = useCallback(
    (kind: PremiumPayKind) => settle((target) => buyPremium(target, kind, season, config)),
    [settle, season, config],
  );

  const buyNextLevel = useCallback(
    () => settle((target) => buyLevel(target, season, config)),
    [settle, season, config],
  );

  const grant = useCallback(
    (username: string, premium: boolean) =>
      updateOther(username, (current) => setPremium(current, premium, seasonNow())),
    [updateOther, seasonNow],
  );

  const value = useMemo<StarPassValue>(
    () => ({
      config,
      replace,
      reset,
      season,
      endsAt,
      pass,
      refresh,
      awardMission,
      awardMatch,
      claim,
      claimEverything,
      buy,
      buyNextLevel,
      grant,
    }),
    [
      config,
      replace,
      reset,
      season,
      endsAt,
      pass,
      refresh,
      awardMission,
      awardMatch,
      claim,
      claimEverything,
      buy,
      buyNextLevel,
      grant,
    ],
  );

  return <StarPassContext.Provider value={value}>{children}</StarPassContext.Provider>;
}

export function useStarPass(): StarPassValue {
  const value = useContext(StarPassContext);
  if (!value) throw new Error('useStarPass must be used inside a StarPassProvider');
  return value;
}
