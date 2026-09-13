import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { PullOutcome } from '@/features/draft/pull';
import { DEFAULT_WALKOUT } from './constants';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './walkoutConfigStore';
import type { WalkoutConfig } from './types';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';

interface WalkoutValue {
  config: WalkoutConfig;
  update(changes: Partial<WalkoutConfig>): SaveResult;
  reset(): SaveResult;
  isDefault: boolean;
}

const WalkoutContext = createContext<WalkoutValue | null>(null);

export function WalkoutProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<WalkoutConfig>(loadConfig);

  /**
   * Re-reads storage when the shared settings are replaced underneath the app.
   *
   * The admin opening or closing a pack writes one document; every open tab applies
   * it to storage and fires this. Without it the only way to see the change is a
   * page reload, which is a poor thing to ask of someone mid-draft.
   */
  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);


  const commit = useCallback((next: WalkoutConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const update = useCallback(
    (changes: Partial<WalkoutConfig>) => commit({ ...config, ...changes }),
    [config, commit],
  );

  const reset = useCallback(() => commit({ ...DEFAULT_WALKOUT }), [commit]);

  const value = useMemo<WalkoutValue>(
    () => ({
      config,
      update,
      reset,
      isDefault: JSON.stringify(config) === JSON.stringify(DEFAULT_WALKOUT),
    }),
    [config, update, reset],
  );

  return <WalkoutContext.Provider value={value}>{children}</WalkoutContext.Provider>;
}

export function useWalkout(): WalkoutValue {
  const value = useContext(WalkoutContext);
  if (!value) throw new Error('useWalkout must be used inside a WalkoutProvider');
  return value;
}

/**
 * The card that earns the animation, or null.
 *
 * Two conditions, each of which can be switched off:
 *
 * - **Tier**: the card's set must be one of the chosen ones. An empty list means any
 *   tier qualifies.
 * - **Rating**: only checked when `useMinRating` is on.
 *
 * They are ANDed, so "tier A and 120+" is expressible, and so is "tier A, whatever
 * the rating". Turning both off means every card walks out — silly, but it is the
 * honest reading of the settings rather than a hidden override.
 *
 * A ten-pull can contain more than one qualifying card; only the best gets a
 * walkout. Playing several back to back would mean up to seventy seconds of video
 * before the player sees what they actually got.
 */
export function pickWalkout(
  outcomes: readonly PullOutcome[],
  config: WalkoutConfig,
): PullOutcome | null {
  if (!config.enabled) return null;

  const qualifying = outcomes.filter((outcome) => {
    if (config.sets.length > 0 && !config.sets.includes(outcome.player.set)) return false;
    if (config.useMinRating && outcome.player.rating < config.minRating) return false;
    return true;
  });
  if (qualifying.length === 0) return null;

  return qualifying.reduce((best, outcome) =>
    outcome.player.rating > best.player.rating ? outcome : best,
  );
}
