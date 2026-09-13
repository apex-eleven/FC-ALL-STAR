/**
 * Hard cap on owned cards. The club lives in localStorage alongside everything else,
 * and an unbounded list would eventually take the quota down with it. Oldest cards
 * are dropped first.
 */
export const CLUB_CAPACITY = 1000;

/** How many players the club rating averages over. */
export const SQUAD_SIZE = 11;
