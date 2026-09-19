/**
 * Team crests (ตราทีม).
 *
 * A crest is an admin-made set: a handful of catalogue players, and an OVR bonus for
 * fielding them together. A player pins up to three crests under the OVR shield;
 * each one is *active* while the starting eleven holds enough of its players, and
 * only active crests add to the team rating.
 *
 * Crests are config, shared read-only. Which three an account has pinned is on the
 * squad (`squad.badges`), as ids — the same rule as every other arrangement.
 */

export interface TeamBadge {
  id: string;
  enabled: boolean;
  name: string;
  /** One line under the name, e.g. "ตำนานทีมชาติ". */
  description: string;
  /** Crest artwork as a data URL, or '' for the drawn fallback. */
  image: string;
  /** Catalogue ids of the players the set is made of. Any rank-up level counts. */
  cardIds: string[];
  /** How many of `cardIds` must be in the starting eleven. 0 = all of them. */
  need: number;
  /** OVR added to the team rating while active. */
  bonus: number;
}

export interface BadgeConfig {
  enabled: boolean;
  badges: TeamBadge[];
}

/** One crest as the club screen sees it against the current eleven. */
export interface BadgeStatus {
  badge: TeamBadge;
  /** Players from the set on the pitch right now. */
  have: number;
  /** Players the set asks for. */
  need: number;
  active: boolean;
}
