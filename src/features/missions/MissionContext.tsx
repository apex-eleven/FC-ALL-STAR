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
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import { useStarPass } from '@/features/starpass/StarPassContext';
import { defaultMissions } from './constants';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './missionConfigStore';
import {
  claimChest,
  claimMission,
  currentProgress,
  recordMission,
  type MissionClaimOutcome,
} from './missions';
import type {
  MissionClaimError,
  MissionConfig,
  MissionMetric,
  MissionPeriod,
  MissionProgress,
  MissionReward,
} from './types';

export interface MissionClaimResult {
  ok: boolean;
  error: MissionClaimError | null;
  rewards: MissionReward[];
}

interface MissionValue {
  config: MissionConfig;
  replace(next: MissionConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's progress as of now (periods rolled over). */
  progress: MissionProgress | null;
  /**
   * Adds a counted action to an account. Pure — other features call it inside their
   * own updateAccount mutator, so the action and its count are one save.
   */
  note(account: Account, metric: MissionMetric, amount: number): Account;
  claim(missionId: string): MissionClaimResult;
  openChest(period: MissionPeriod, chestId: string): MissionClaimResult;
}

const MissionContext = createContext<MissionValue | null>(null);

export function MissionProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const { awardMission } = useStarPass();
  const [config, setConfig] = useState<MissionConfig>(loadConfig);
  // Re-read once a minute so the day and week roll over on an open screen.
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

  const replace = useCallback((next: MissionConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultMissions()), [replace]);

  const resetHour = config.resetHour;
  const note = useCallback(
    (target: Account, metric: MissionMetric, amount: number) =>
      recordMission(target, metric, amount, new Date(), { resetHour }),
    [resetHour],
  );

  const progress = useMemo(
    () => (account ? currentProgress(account.missions, new Date(clock), config) : null),
    [account, config, clock],
  );

  // Today's login. recordMission hands back the same account once it is counted, so
  // this settles after one write.
  const signedIn = account !== null;
  useEffect(() => {
    if (!signedIn) return;
    const now = new Date(clock);
    updateAccount((current) => recordMission(current, 'login', 1, now, { resetHour }));
  }, [signedIn, clock, resetHour, updateAccount, account?.missions]);

  /**
   * Checked on the account on screen, then applied to the latest save with the same
   * clock and card ids — the mutator may run twice and both runs must agree.
   */
  const settle = useCallback(
    (run: (target: Account, now: Date, stamp: ReturnType<typeof shopStamp>) => MissionClaimOutcome) => {
      if (!account) return { ok: false, error: 'closed' as const, rewards: [] };
      const now = new Date();
      const stamp = shopStamp();
      const preview = run(account, now, stamp);
      if (!preview.ok) return { ok: false, error: preview.error, rewards: [] };
      updateAccount((current) => {
        const outcome = run(current, now, stamp);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, rewards: preview.rewards };
    },
    [account, updateAccount],
  );

  const claim = useCallback(
    (missionId: string): MissionClaimResult =>
      settle((target, now, stamp) => {
        const outcome = claimMission(target, missionId, now, config, byId, stamp);
        if (!outcome.ok) return outcome;
        // A claimed mission's points also count as Star Pass XP.
        const points = config.missions.find((entry) => entry.id === missionId)?.points ?? 0;
        return { ...outcome, account: awardMission(outcome.account, points) };
      }),
    [settle, config, byId, awardMission],
  );

  const openChest = useCallback(
    (period: MissionPeriod, chestId: string): MissionClaimResult =>
      settle((target, now, stamp) => claimChest(target, period, chestId, now, config, byId, stamp)),
    [settle, config, byId],
  );

  const value = useMemo<MissionValue>(
    () => ({ config, replace, reset, progress, note, claim, openChest }),
    [config, replace, reset, progress, note, claim, openChest],
  );

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

export function useMissions(): MissionValue {
  const value = useContext(MissionContext);
  if (!value) throw new Error('useMissions must be used inside a MissionProvider');
  return value;
}
