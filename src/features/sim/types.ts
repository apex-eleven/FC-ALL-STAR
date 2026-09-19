/**
 * The result of one match, from the home side's point of view.
 *
 * Lives here rather than inside any one mode because three of them speak it:
 * manager mode's ladder, the cup's bracket, and Star Pass's per-match XP.
 */
export type MatchOutcome = 'win' | 'draw' | 'loss';
