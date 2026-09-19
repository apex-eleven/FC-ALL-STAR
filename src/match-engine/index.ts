/**
 * หน้าประตูของ Match Engine
 *
 * ระบบอื่นควร import จากที่นี่ที่เดียว จะได้เปลี่ยนโครงข้างในได้อิสระ
 *   import { createMatch } from '@/match-engine';
 *
 * ส่วนการวาดภาพอยู่คนละโมดูล (@/match-renderer) โดยตั้งใจ —
 * เอนจินไม่รู้จัก canvas และไม่ควรรู้จัก
 */
export { BallEntity } from '@/match-engine/ball';
export { createMatch, MatchEngine, type MatchTeamState } from '@/match-engine/MatchEngine';
export {
  MIN_PASS_SCORE,
  passSpeed,
  scorePass,
  selectPassTarget,
  type PassCandidate,
} from '@/match-engine/passing';
export {
  GOAL_DEPTH,
  PITCH,
  formationToWorld,
  goalCrossed,
  goalPosts,
  roleOf,
} from '@/match-engine/pitch';
export {
  MAX_SHOT_DISTANCE,
  MIN_SHOT_SCORE,
  SHOT_TENDENCY,
  calculateShot,
  evaluateShot,
  type ShotChance,
  type ShotPlan,
} from '@/match-engine/shooting';
export { SAVE_REACH, keeperTarget, saveChance, shotCoverTarget } from '@/match-engine/goalkeeper';
export {
  TACKLE_COOLDOWN,
  TACKLE_RANGE,
  resolveTackle,
  tackleSuccessChance,
} from '@/match-engine/defense';
export {
  ballControlRating,
  defendingRating,
  goalkeepingRating,
  normalise,
  shootingRating,
} from '@/match-engine/ratings';
export { PlayerAgent } from '@/match-engine/playerAgent';
export {
  DEFAULT_TACTICS,
  NEUTRAL_MODIFIERS,
  normaliseTactics,
  tacticalModifiers,
  type Mentality,
  type Tactics,
  type TacticalModifiers,
} from '@/match-engine/tactics';
export type {
  AgentRole,
  BallState,
  MatchClock,
  MatchEngineOptions,
  MatchPhase,
  MatchPlayerInput,
  MatchSide,
  MatchSimEvent,
  MatchTeamInput,
  MatchPeriod,
  MatchSnapshot,
  MovementState,
  PlayerDecision,
  PlayerMatchStats,
  TeamMatchStats,
  Vec2,
} from '@/match-engine/types';
