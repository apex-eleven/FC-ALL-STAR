import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { bonusOf, slotStatuses, teamRating, type NameLookup } from './badges';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './badgeConfigStore';
import { defaultBadges } from './constants';
import type { BadgeConfig, BadgeStatus } from './types';

interface BadgeValue {
  config: BadgeConfig;
  replace(next: BadgeConfig): SaveResult;
  reset(): SaveResult;
  /** Catalogue id -> player name, so crests match the player rather than one card entry. */
  nameOf: NameLookup;
  /** Team rating with crest bonuses — what every screen shows for a squad. */
  ratingOf(squad: Squad, owned: OwnedIndex): number;
  bonusOf(squad: Squad, owned: OwnedIndex): number;
  slotsOf(squad: Squad, owned: OwnedIndex): (BadgeStatus | null)[];
}

const BadgeContext = createContext<BadgeValue | null>(null);

/**
 * Holds the crest config and hands out the rating that includes it.
 *
 * Sits above the cup and manager providers, which grade the squad too: one
 * function, one number, so the home tile, the club panel and the match engine
 * cannot disagree about how strong the team is.
 */
export function BadgeProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BadgeConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: BadgeConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultBadges()), [replace]);

  const { byId } = usePlayers();
  const nameOf = useCallback<NameLookup>((cardId) => byId(cardId)?.name, [byId]);

  const value = useMemo<BadgeValue>(
    () => ({
      config,
      replace,
      reset,
      nameOf,
      ratingOf: (squad, owned) => teamRating(squad, owned, config, nameOf),
      bonusOf: (squad, owned) => bonusOf(squad, owned, config, nameOf),
      slotsOf: (squad, owned) => slotStatuses(squad, owned, config, nameOf),
    }),
    [config, replace, reset, nameOf],
  );

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>;
}

export function useBadges(): BadgeValue {
  const value = useContext(BadgeContext);
  if (!value) throw new Error('useBadges must be used inside a BadgeProvider');
  return value;
}
