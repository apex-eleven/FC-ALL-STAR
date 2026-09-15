import type { LeagueConfig } from './types';

export const LEAGUE_CONFIG_KEY = 'football-home-ui:league:v1';

/** Recent matches kept per season. A day of hourly fixtures is 24. */
export const HISTORY_LIMIT = 24;

export const MAX_TEAMS = 40;
export const MIN_TEAMS = 4;

/**
 * Sentinel seat for the signed-in account in the round-robin (`season.roundRobin`).
 * Never collides with a rival id — those are always `rv-{index}` — so the pairing
 * that includes this id is unambiguously the player's own fixture, whatever the
 * team count or round.
 */
export const PLAYER_TEAM_ID = 'you';

export const DEFAULT_LEAGUE: LeagueConfig = {
  enabled: true,
  teamCount: 20,
  // Half-hourly: a full 20-team round-robin (19 rounds) then fits inside a day
  // with room to repeat, instead of barely completing one lap at the hourly pace.
  matchIntervalMinutes: 30,
  resetHour: 6,
  winStars: 1,
  drawStars: 0,
  lossStars: -1,
  // Stars can go negative in principle; the floor stops a bad day from digging a hole
  // that takes a week to climb out of.
  starFloor: 0,
  rivalMinRating: 95,
  rivalMaxRating: 125,
  rewards: [
    { fromRank: 1, ticket: 2, gem: 1000, fcpoint: 15 },
    { fromRank: 2, ticket: 1, gem: 500, fcpoint: 10 },
    { fromRank: 3, ticket: 1, gem: 250, fcpoint: 5 },
    { fromRank: 4, ticket: 1, gem: 250, fcpoint: 0 },
  ],
};

/**
 * Names the generated rivals draw from.
 *
 * Invented clubs, not real ones: this is a simulated ladder, and borrowing real
 * badges would be both a licensing problem and a lie about who the player beat.
 */
export const RIVAL_NAMES = [
  'ไฟร์เบิร์ด ยูไนเต็ด',
  'ซิลเวอร์ เลค',
  'นอร์ธเกต เอฟซี',
  'ไอรอนไซด์',
  'บลูริดจ์ ซิตี้',
  'ทันเดอร์เบย์',
  'ครีมสัน โรเวอร์ส',
  'อีสต์วูด สตาร์',
  'แกรนด์พอร์ต',
  'ไวลด์แคท เอฟซี',
  'ฮาร์เบอร์ ทาวน์',
  'โกลเดนฟิลด์',
  'สตอร์มเกต',
  'เรเวนฮิลล์',
  'ซันดาวน์เนอร์ส',
  'ไวต์คลิฟฟ์',
  'เรดสโตน เอฟซี',
  'แบล็กพูล เบย์',
  'เอมเบอร์ เลน',
  'ไนน์ไมล์ ครีก',
  'ซัมมิท พาร์ค',
  'โลนสตาร์ เอฟซี',
  'ไบรท์วอเตอร์',
  'โอลด์ฟอร์จ',
  'เคปวิว',
  'ไทเกอร์เบย์',
  'มิดแลนด์ ยูไนเต็ด',
  'ซีไซด์ โรเวอร์ส',
  'ฟอร์ตฮิลล์',
  'นิวเฮเวน เอฟซี',
  'สโนว์พีค',
  'ริเวอร์เกต',
  'แซนด์สโตน',
  'ไพน์วัลเลย์',
  'ควอรีไซด์',
  'ลาสต์ไลท์ เอฟซี',
  'ซิลเวอร์ฮอร์น',
  'บรอดมัวร์',
  'เคปสโตน',
  'ไนท์ฟอลล์ เอฟซี',
] as const;
