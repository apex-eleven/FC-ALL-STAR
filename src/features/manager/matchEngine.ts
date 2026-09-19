/**
 * The live manager-mode match — ตอนนี้เป็น "หน้ากาก" ของ `@/match-engine` ตัวจริง
 *
 * ไฟล์นี้ไม่ได้จำลองอะไรเองแล้วสักบรรทัด หน้าที่เดียวคือแปลงสองทาง:
 *
 *   LineupSpot / MatchPlayer (ภาษาของหน้าจอ)  →  MatchTeamInput (ภาษาของเอนจิน)
 *   MatchSimEvent / PlayerAgent (ภาษาของเอนจิน) →  MatchEvent / EnginePlayer (ภาษาของหน้าจอ)
 *
 * ทำแบบนี้เพราะ ManagerLiveMatch.tsx, MatchSubsDialog.tsx, ManagerScreen.tsx และ
 * lineup.ts เรียก API ชุดนี้อยู่ 23 จุด — คงชื่อและรูปร่างเดิมไว้ทั้งหมด
 * ทั้งสี่ไฟล์จึงไม่ต้องแก้แม้แต่บรรทัดเดียว
 *
 * ระบบพิกัดตรงกันอยู่แล้ว (105 x 68 ม., home บุก +x) จึงไม่มีการแปลงพิกัดที่นี่
 * นอกจากตอนแปลงช่องในแผน ซึ่งของเดิมนับ x = ความยาว ส่วนเอนจินนับ y = ความกว้าง
 *
 * PURE เหมือนเดิม — ไม่มี React ไม่มี DOM ไม่มีนาฬิกาของตัวเอง
 * หน้าจอเรียก step() ด้วย dt คงที่แล้วอ่านตำแหน่งกลับไปวาดเอง
 */
import {
  PITCH,
  createMatch,
  type MatchEngine as CoreEngine,
  type MatchPlayerInput,
  type MatchSide,
  type MatchSimEvent,
  type MatchTeamInput,
  type PlayerAgent,
  type Tactics,
} from '@/match-engine';
import type { PlayerStats, Position } from '@/match-engine/playerTypes';

export const PITCH_LENGTH = PITCH.length;
export const PITCH_WIDTH = PITCH.width;
export const MAX_SUBS = 5;

export type Side = MatchSide;
export type Tactic = 'attack' | 'balanced' | 'defend';

/** One player as the screen knows them. Skills are 0..1. */
export interface MatchPlayer {
  id: string;
  name: string;
  portrait: string;
  /** The card's own position (GK, CB, ST …). */
  position: string;
  rating: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

/** A starter and the formation spot they hold, in the side's own attacking frame. */
export interface LineupSpot {
  player: MatchPlayer;
  /** 0..105 from own goal, 0..68 from own left touchline. */
  anchorX: number;
  anchorY: number;
  keeper: boolean;
}

export interface EnginePlayer extends MatchPlayer {
  side: Side;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  keeper: boolean;
  /** Screen time they came on, for fatigue. */
  enteredAt: number;
}

export type MatchEventKind =
  | 'kickoff'
  | 'goal'
  | 'save'
  | 'miss'
  | 'tackle'
  | 'halftime'
  | 'fulltime'
  | 'sub'
  | 'tactic'
  | 'foul'
  | 'card';

export interface MatchEvent {
  id: number;
  minute: number;
  side: Side | null;
  kind: MatchEventKind;
  text: string;
}

export interface SideStats {
  shots: number;
  onTarget: number;
  passes: number;
  tackles: number;
  /** Screen seconds with the ball. */
  possession: number;
}

export type MatchPhase = 'play' | 'halftime' | 'fulltime';

/**
 * ลูกที่กำลังเดินทาง — ชั้น 3 มิติอ่านตัวนี้ไปคำนวณความสูงของบอลและสั่งท่าทาง
 *
 * เอนจินไม่ได้เก็บก้อนนี้ไว้ตรง ๆ (มันเก็บเป็น velocity กับ state) ตัวนี้จึงถูก
 * ประกอบขึ้นที่นี่ทุกครั้งที่บอลออกจากเท้า แล้วคงตัวเดิมไว้จนกว่าจะถึงปลายทาง
 * — สำคัญมากว่าต้องเป็น**วัตถุก้อนเดิม**ตลอดการเดินทางหนึ่งครั้ง
 * เพราะ ActionWatcher เทียบด้วย reference ไม่ได้เทียบค่าข้างใน
 */
export interface BallFlight {
  kind: 'pass' | 'shot';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  duration: number;
  side: Side;
  /** Pass: who ends up with it. Shot: the shooter. */
  receiverId: string;
  shooterId: string;
  outcome: 'complete' | 'intercepted' | 'goal' | 'save' | 'miss';
}

export interface MatchSetup {
  home: LineupSpot[];
  away: LineupSpot[];
  homeBench: MatchPlayer[];
  homeName: string;
  awayName: string;
  seed: string;
  /** Screen seconds for 90 minutes. */
  duration: number;
}

/* ── การแปลงข้อมูลขาเข้า ───────────────────────────────── */

/**
 * ตำแหน่งของการ์ดเป็น string อิสระ (มี LWB/CF ที่เอนจินไม่รู้จัก)
 * แปลงลงมาเป็น 12 ตำแหน่งที่เอนจินใช้ตัดสินพฤติกรรม ตัวที่ไม่รู้จักถอยไปเป็น CM
 */
const POSITION_MAP: Record<string, Position> = {
  GK: 'GK',
  CB: 'CB',
  LB: 'LB',
  RB: 'RB',
  LWB: 'LB',
  RWB: 'RB',
  CDM: 'CDM',
  CM: 'CM',
  CAM: 'CAM',
  LM: 'LM',
  RM: 'RM',
  LW: 'LW',
  RW: 'RW',
  ST: 'ST',
  CF: 'ST',
};

function toPosition(raw: string, keeper: boolean): Position {
  if (keeper) return 'GK';
  return POSITION_MAP[raw.toUpperCase()] ?? 'CM';
}

/**
 * ค่าพลัง 0..1 ของหน้าจอ → สเกลดิบที่ ratings.ts คาดหวัง
 *
 * normalise() ในเอนจินตัดล่างที่ 50 และเพดานที่ 125 การแมป 0..1 → 50..125
 * จึงทำให้ค่าที่ผ่านเข้าไปใช้ช่วงเต็มพอดี ไม่มีส่วนไหนของสเกลถูกทิ้ง
 */
function raw(skill: number): number {
  return 50 + Math.min(Math.max(skill, 0), 1) * 75;
}

function statsOf(player: MatchPlayer): PlayerStats {
  return {
    pace: raw(player.pace),
    shooting: raw(player.shooting),
    passing: raw(player.passing),
    dribbling: raw(player.dribbling),
    defending: raw(player.defending),
    physical: raw(player.physical),
  };
}

/** ovr ที่เอนจินใช้ = ค่าเฉลี่ยของ 6 ด้านจริง ไม่ได้เอา rating ของการ์ดมาตรง ๆ
 *  (rating ของ FC-ALL-STAR วิ่งได้ถึง ~199 ซึ่งอยู่คนละสเกลกับเอนจิน) */
function ovrOf(stats: PlayerStats): number {
  const total =
    stats.pace +
    stats.shooting +
    stats.passing +
    stats.dribbling +
    stats.defending +
    stats.physical;
  return Math.round(total / 6);
}

function toInput(player: MatchPlayer, index: number, spot: LineupSpot | null): MatchPlayerInput {
  const stats = statsOf(player);
  return {
    id: player.id,
    name: player.name,
    shirtNumber: index + 1,
    position: toPosition(player.position, spot?.keeper ?? false),
    ovr: ovrOf(stats),
    pace: stats.pace,
    stats,
    slotId: spot ? `slot-${index}` : `bench-${index}`,
    // ช่องในแผนของเกมนับ x = ความกว้าง / y = ความลึก (0–100)
    // ส่วน LineupSpot นับ anchorX = ความลึกเป็นเมตร / anchorY = ความกว้างเป็นเมตร
    formationX: spot ? (spot.anchorY / PITCH_WIDTH) * 100 : 50,
    formationY: spot ? (spot.anchorX / PITCH_LENGTH) * 100 : 50,
  };
}

function toTeam(
  id: string,
  name: string,
  spots: LineupSpot[],
  color: string,
  accent: string,
): MatchTeamInput {
  return {
    id,
    name,
    formationName: '4-3-3',
    color,
    accent,
    players: spots.map((spot, index) => toInput(spot.player, index, spot)),
  };
}

/** แทคติกสามปุ่มบนหน้าจอ → ชุดแทคติกเต็มของเอนจิน */
const TACTIC_PRESET: Record<Tactic, Partial<Tactics>> = {
  attack: { mentality: 'ATTACKING', defensiveLine: 'HIGH', pressing: 'HIGH', tempo: 'FAST' },
  balanced: {},
  defend: { mentality: 'DEFENSIVE', defensiveLine: 'DEEP', pressing: 'LOW', tempo: 'SLOW' },
};

const TACTIC_LABEL: Record<Tactic, string> = { attack: 'บุก', balanced: 'สมดุล', defend: 'ตั้งรับ' };

/** เอนจินจะไม่ออกจากการพักครึ่งเอง — ปุ่มบนหน้าจอเป็นคนสั่ง */
const NO_AUTO_HALF_TIME = 1e9;

/**
 * ตัวคูณจังหวะเกมทั้งแมตช์ — ปรับที่นี่ที่เดียว
 *
 * 1 ทั้งชุด = พฤติกรรมดิบของ match-engine ซึ่งให้แมตช์ประมาณ 5–6 ลูกยิงต่อทีม
 * และ 2 ประตูต่อแมตช์ เทียบกับเอนจินตัวเดิมของ FC-ALL-STAR ที่ให้ราว 9–10 ลูกยิง
 * และ 3 ประตู — สถิติบนแผงข้างสนามจึงจะดูเงียบกว่าเดิมเล็กน้อย
 *
 * ข้อควรรู้ก่อนขยับ: เร่ง decisionSpeed ขึ้นทำให้ "ส่งบอลถี่ขึ้นแต่ยิงน้อยลง"
 * เพราะคนถือบอลจ่ายออกก่อนจะได้จังหวะยิงดี ๆ ลองวัดก่อนทุกครั้งอย่าเดา
 */
export const MATCH_TUNING = { decisionSpeed: 1, shotBias: 1, tackleTendency: 1 };

/* ── ตัวหน้ากาก ─────────────────────────────────────────── */

export class MatchEngine {
  readonly duration: number;
  readonly homeName: string;
  readonly awayName: string;

  /** เอนจินตัวจริง — เปิดไว้เผื่อหน้าอื่นอยากอ่านสถิติรายคนหรือ snapshot() */
  readonly core: CoreEngine;

  t = 0;
  players: EnginePlayer[] = [];
  bench: MatchPlayer[];
  events: MatchEvent[] = [];
  /** Who scored, for the result screen. */
  scorers: { side: Side; name: string; minute: number }[] = [];
  ball: { x: number; y: number; ownerId: string | null; flight: BallFlight | null } = {
    x: PITCH_LENGTH / 2,
    y: PITCH_WIDTH / 2,
    ownerId: null,
    flight: null,
  };
  /** Set on a goal until the restart, for the screen's goal flash. */
  goalFlash: Side | null = null;
  tactics: Record<Side, Tactic> = { home: 'balanced', away: 'balanced' };
  stats: Record<Side, SideStats> = {
    home: { shots: 0, onTarget: 0, passes: 0, tackles: 0, possession: 0 },
    away: { shots: 0, onTarget: 0, passes: 0, tackles: 0, possession: 0 },
  };

  /** การ์ดตั้งต้นของทุกคน (รวมตัวสำรอง) — เอนจินไม่รู้จักรูปหน้าหรือ rating ของการ์ด */
  private readonly cards = new Map<string, MatchPlayer>();
  private readonly spots = new Map<string, { anchorX: number; anchorY: number; keeper: boolean }>();
  private readonly seats = new Map<string, EnginePlayer>();
  private agents = new Map<string, PlayerAgent>();
  private cursor = 0;
  private eventId = 0;
  /** นาทีที่ AI ฝั่งตรงข้ามทบทวนแทคติกครั้งล่าสุด */
  private lastThink = -1;
  /** เวลาเดินทางของบอลเมื่อเฟรมก่อน — ใช้จับว่า "ลูกใหม่ออกจากเท้าแล้ว" */
  private lastTravel = -1;
  /** สกอร์และจำนวนเซฟตอนที่ลูกนี้ออกจากเท้า — ใช้สรุปผลตอนบอลถึงปลายทาง */
  private flightMark = { goals: 0, saves: 0 };

  constructor(setup: MatchSetup) {
    this.duration = setup.duration;
    this.homeName = setup.homeName;
    this.awayName = setup.awayName;
    this.bench = [...setup.homeBench];

    for (const spot of [...setup.home, ...setup.away]) {
      this.cards.set(spot.player.id, spot.player);
      this.spots.set(spot.player.id, {
        anchorX: spot.anchorX,
        anchorY: spot.anchorY,
        keeper: spot.keeper,
      });
    }
    for (const player of setup.homeBench) this.cards.set(player.id, player);

    this.core = createMatch(
      toTeam('home', setup.homeName, setup.home, '#4ade80', '#04120a'),
      toTeam('away', setup.awayName, setup.away, '#f87171', '#1a0606'),
      {
        seed: setup.seed,
        matchId: setup.seed,
        totalMinutes: 90,
        // 90 นาทีในเกมถูกบีบให้จบใน duration วินาทีของหน้าจอ
        minutesPerSecond: 90 / setup.duration,
        halfTimeSeconds: NO_AUTO_HALF_TIME,
        maxSubs: MAX_SUBS,
        tuning: MATCH_TUNING,
        bench: {
          home: setup.homeBench.map((player, index) => toInput(player, index, null)),
        },
      },
    );

    this.sync();
    this.drain();
    this.push(null, 'kickoff', `เริ่มการแข่งขัน ${this.homeName} พบ ${this.awayName}`);
  }

  /* ── อ่านสถานะ ────────────────────────────────────────── */

  /** 0..90, the minute the broadcast clock shows. */
  get minute(): number {
    return Math.min(90, Math.floor(this.core.clock.minute));
  }

  get phase(): MatchPhase {
    if (this.core.period === 'FULL_TIME') return 'fulltime';
    if (this.core.period === 'HALF_TIME') return 'halftime';
    return 'play';
  }

  get half(): 1 | 2 {
    return this.core.period === 'FIRST_HALF' || this.core.period === 'PRE_MATCH' ? 1 : 2;
  }

  get finished(): boolean {
    return this.core.period === 'FULL_TIME';
  }

  get score(): Record<Side, number> {
    return this.core.score;
  }

  get subsUsed(): number {
    return this.core.subsUsed.home;
  }

  get possessionShare(): number {
    return this.core.possessionShare('home');
  }

  get ballOwnerId(): string | null {
    return this.core.ball.owner;
  }

  onPitch(side: Side): EnginePlayer[] {
    return this.players.filter((player) => player.side === side);
  }

  /**
   * 0..1, how fresh a player is. A substitute starts full.
   * ตัวเลขจริงมาจากเอนจิน (physical ของการ์ด + นาทีที่อยู่ในสนาม) ไม่ได้คิดซ้ำที่นี่
   */
  energyOf(player: EnginePlayer): number {
    const agent = this.agents.get(player.id);
    return agent ? agent.stamina : 1;
  }

  /* ── คำสั่งจากผู้จัดการทีม ──────────────────────────────── */

  setTactic(side: Side, tactic: Tactic): void {
    if (this.tactics[side] === tactic || this.finished) return;
    this.tactics[side] = tactic;
    this.core.updateTactics(side, TACTIC_PRESET[tactic]);
    if (side === 'home') this.push('home', 'tactic', `ปรับแทคติกเป็น "${TACTIC_LABEL[tactic]}"`);
  }

  /** Home only. Returns false when the swap is not allowed. */
  substitute(outId: string, inId: string): boolean {
    if (!this.core.substitute('home', outId, inId)) return false;
    // คนที่ลงมารับช่องในแผนของคนที่ออกไปทั้งดุ้น รวมถึง anchor ที่หน้าจออ่านได้
    const seat = this.spots.get(outId);
    if (seat) this.spots.set(inId, seat);
    this.bench = this.bench.filter((player) => player.id !== inId);
    this.sync();
    this.drain();
    return true;
  }

  /** Leaves the half-time break. */
  resume(): void {
    if (!this.core.resumeHalfTime()) return;
    this.drain();
  }

  /* ── หนึ่งก้าวของการจำลอง ───────────────────────────────── */

  step(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    this.core.tick(dt);
    this.awayManager();
    this.sync();
    this.drain();
  }

  /**
   * ฝั่งตรงข้ามปรับแทคติกเองตามสกอร์ — ทบทวนทุก 5 นาทีในเกม
   * ตามหลังบุก นำอยู่ถอยลงมาตั้งรับ เสมออยู่เล่นสมดุล
   */
  private awayManager(): void {
    const minute = Math.floor(this.core.clock.minute);
    if (minute === this.lastThink || minute % 5 !== 0) return;
    this.lastThink = minute;

    const { home, away } = this.core.score;
    const want: Tactic = away < home ? 'attack' : away > home + 1 && minute > 60 ? 'defend' : 'balanced';
    this.setTactic('away', want);
  }

  /* ── ซิงก์สถานะกลับมาให้หน้าจอ ───────────────────────────── */

  /** ตำแหน่งคนและบอล + สถิติ — ของที่หน้าจอต้องอ่านทุกเฟรม */
  private sync(): void {
    const agents = this.core.players;

    // รายชื่อเปลี่ยนเมื่อมีการเปลี่ยนตัวหรือใบแดงเท่านั้น เช็คแบบไม่สร้างขยะทุกเฟรม
    let sameRoster = this.players.length === agents.length;
    if (sameRoster) {
      for (let index = 0; index < agents.length; index += 1) {
        if (this.players[index]?.id !== agents[index]?.id) {
          sameRoster = false;
          break;
        }
      }
    }

    if (!sameRoster) {
      this.agents = new Map(agents.map((agent) => [agent.id, agent]));
      this.players = agents.map((agent) => this.seatFor(agent));
    }

    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      const seat = this.players[index];
      if (!agent || !seat) continue;
      seat.x = agent.position2d.x;
      seat.y = agent.position2d.y;
    }

    this.ball.x = this.core.ball.position.x;
    this.ball.y = this.core.ball.position.y;
    this.ball.ownerId = this.core.ball.owner;
    this.syncFlight();

    for (const side of ['home', 'away'] as const) {
      const from = this.core.stats[side];
      const to = this.stats[side];
      to.shots = from.shots;
      to.onTarget = from.shotsOnTarget;
      to.passes = from.completedPasses;
      to.tackles = from.tackles;
      to.possession = from.possessionSeconds;
    }
  }

  /**
   * ประกอบ (หรือปิด) ก้อน flight ของลูกบอล
   *
   * เอนจินตัวนี้ไม่ได้ทอยผลลูกยิงล่วงหน้าเหมือนตัวเดิม — มันตัดสินตอนบอลถึงประตูจริง ๆ
   * ตอนออกจากเท้าจึงเดาไว้ก่อนจากทิศทาง (เข้ากรอบ = 'save' ผู้รักษาประตูจะได้พุ่ง)
   * แล้ว**แก้ค่าให้ตรงความจริงตอนบอลถึงปลายทาง** ก่อนจะปล่อยให้ flight เป็น null
   * ท่าดีใจหลังทำประตูจึงขึ้นถูกจังหวะ ไม่ได้ขึ้นจากการเดา
   */
  private syncFlight(): void {
    const ball = this.core.ball;
    const flying = ball.state === 'TRAVELLING' || ball.state === 'SHOT';

    if (!flying) {
      const ended = this.ball.flight;
      if (ended) {
        const goals = this.core.score.home + this.core.score.away;
        const saves = this.core.stats.home.saves + this.core.stats.away.saves;
        ended.outcome =
          goals > this.flightMark.goals
            ? 'goal'
            : saves > this.flightMark.saves
              ? 'save'
              : ended.kind === 'pass'
                ? this.core.ball.owner === ended.receiverId
                  ? 'complete'
                  : 'intercepted'
                : 'miss';
        this.ball.flight = null;
      }
      this.lastTravel = -1;
      return;
    }

    // ลูกใหม่ออกจากเท้าเมื่อเฟรมก่อนบอลยังไม่ลอย หรือเวลาเดินทางถูกรีเซ็ต
    const fresh = this.lastTravel < 0 || ball.travelElapsed < this.lastTravel;
    this.lastTravel = ball.travelElapsed;

    if (fresh) {
      const kind: 'pass' | 'shot' = ball.state === 'SHOT' ? 'shot' : 'pass';
      const shooter = this.agents.get(ball.lastTouchId ?? '');
      const side: Side = shooter?.side ?? 'home';
      const from = ball.passOrigin ?? ball.position;
      const target =
        kind === 'shot' ? this.goalAim(side, ball) : this.receiverSpot(ball.intendedReceiverId);
      const reach = Math.hypot(target.x - from.x, target.y - from.y);
      const posts = { left: PITCH_WIDTH / 2 - 3.66, right: PITCH_WIDTH / 2 + 3.66 };

      this.flightMark = {
        goals: this.core.score.home + this.core.score.away,
        saves: this.core.stats.home.saves + this.core.stats.away.saves,
      };

      this.ball.flight = {
        kind,
        fromX: from.x,
        fromY: from.y,
        toX: target.x,
        toY: target.y,
        elapsed: ball.travelElapsed,
        duration: Math.max(0.08, reach / Math.max(ball.speed, 1)),
        side,
        receiverId: ball.intendedReceiverId ?? '',
        shooterId: ball.lastTouchId ?? '',
        // เข้ากรอบ = เดาว่าผู้รักษาประตูจะได้ลุ้น (แก้เป็นค่าจริงตอนจบการเดินทาง)
        outcome:
          kind === 'shot'
            ? target.y >= posts.left && target.y <= posts.right
              ? 'save'
              : 'miss'
            : 'complete',
      };
      return;
    }

    if (this.ball.flight) this.ball.flight.elapsed = ball.travelElapsed;
  }

  /** จุดที่ลูกยิงลูกนี้พุ่งไปชนเส้นประตูของอีกฝ่าย (ลากเส้นตรงตามทิศที่บอลออกไป) */
  private goalAim(side: Side, ball: { position: { x: number; y: number }; velocity: { x: number; y: number } }) {
    const line = side === 'home' ? PITCH_LENGTH : 0;
    const dx = ball.velocity.x;
    if (Math.abs(dx) < 0.001) return { x: line, y: ball.position.y };
    const steps = (line - ball.position.x) / dx;
    return { x: line, y: ball.position.y + ball.velocity.y * steps };
  }

  /** ตำแหน่งของคนที่ตั้งใจส่งบอลไปหา (ไม่มีตัวรับก็เล็งไปตามทิศบอล) */
  private receiverSpot(receiverId: string | null) {
    const agent = receiverId ? this.agents.get(receiverId) : undefined;
    if (agent) return { x: agent.position2d.x, y: agent.position2d.y };
    const ball = this.core.ball;
    return { x: ball.position.x + ball.velocity.x, y: ball.position.y + ball.velocity.y };
  }

  /** กล่องข้อมูลของนักเตะหนึ่งคนสำหรับหน้าจอ สร้างครั้งเดียวต่อคน แล้วใช้ซ้ำ */
  private seatFor(agent: PlayerAgent): EnginePlayer {
    const existing = this.seats.get(agent.id);
    if (existing) return existing;

    const card = this.cards.get(agent.id);
    const spot = this.spots.get(agent.id);
    const seat: EnginePlayer = {
      id: agent.id,
      name: card?.name ?? agent.name,
      portrait: card?.portrait ?? '',
      position: card?.position ?? agent.position,
      rating: card?.rating ?? agent.ovr,
      pace: card?.pace ?? 0.5,
      shooting: card?.shooting ?? 0.5,
      passing: card?.passing ?? 0.5,
      dribbling: card?.dribbling ?? 0.5,
      defending: card?.defending ?? 0.5,
      physical: card?.physical ?? 0.5,
      side: agent.side,
      x: agent.position2d.x,
      y: agent.position2d.y,
      anchorX: spot?.anchorX ?? agent.formationPosition.x,
      anchorY: spot?.anchorY ?? agent.formationPosition.y,
      keeper: agent.role === 'gk',
      enteredAt: (agent.enteredMinute / 90) * this.duration,
    };
    this.seats.set(agent.id, seat);
    return seat;
  }

  /* ── ถ่ายทอดสด ──────────────────────────────────────────── */

  private push(side: Side | null, kind: MatchEventKind, text: string): void {
    this.eventId += 1;
    this.events.push({ id: this.eventId, minute: this.minute, side, kind, text });
  }

  private nameOf(id: string | null | undefined): string {
    if (!id) return 'ใครสักคน';
    const card = this.cards.get(id);
    if (card) return card.name;
    return this.agents.get(id)?.name ?? 'ใครสักคน';
  }

  /**
   * ดึงเหตุการณ์ใหม่จากเอนจินมาแปลงเป็นบรรทัดถ่ายทอดสด
   *
   * เอนจินปล่อยเหตุการณ์ดิบทุกอย่างรวมถึง pass / receive / possession_change
   * ซึ่งถี่เกินกว่าจะอ่านทัน — ตรงนี้คัดเฉพาะจังหวะที่คนดูสนใจจริง ที่เหลือทิ้ง
   * (สถิติไม่ได้หายไปไหน มันถูกนับใน core.stats อยู่แล้ว)
   */
  private drain(): void {
    const fresh = this.core.eventsSince(this.cursor);
    this.cursor = this.core.emittedCount;

    for (const event of fresh) {
      const line = this.describe(event);
      if (!line) continue;
      this.eventId += 1;
      this.events.push({
        id: this.eventId,
        minute: event.minute,
        side: event.side ?? null,
        kind: line.kind,
        text: line.text,
      });
    }
  }

  private describe(event: MatchSimEvent): { kind: MatchEventKind; text: string } | null {
    const who = this.nameOf(event.playerId);
    const other = this.nameOf(event.secondaryPlayerId);

    switch (event.type) {
      case 'goal': {
        this.goalFlash = event.side ?? null;
        if (event.side) {
          this.scorers.push({ side: event.side, name: who, minute: event.minute });
        }
        // เอนจินอาจชี้แอสซิสต์กลับมาที่คนยิงเอง (รับบอลแล้วเลี้ยงต่อจนยิง) — ไม่ต้องรายงาน
        const assist =
          event.secondaryPlayerId && event.secondaryPlayerId !== event.playerId
            ? ` (จ่ายโดย ${other})`
            : '';
        return { kind: 'goal', text: `ประตู! ${who} ทำประตูให้ ${this.teamName(event.side)}${assist}` };
      }

      case 'save':
        return { kind: 'save', text: `${who} เซฟไว้ได้! ลูกยิงของ ${other}` };

      case 'shot':
        // ลูกที่เข้ากรอบจะไปจบที่ประตูหรือการเซฟอยู่แล้ว เหลือรายงานแค่ลูกที่ออกนอกกรอบ
        if (event.detail?.onTarget) return null;
        return { kind: 'miss', text: `${who} ยิงออกนอกกรอบ` };

      case 'tackle': {
        if (event.detail?.outcome !== 'won') return null;
        // บอลเปลี่ยนมือไปมาในจังหวะเดียวได้หลายครั้ง — รายงานครั้งแรกของนาทีนั้นพอ
        const last = this.events[this.events.length - 1];
        if (last?.kind === 'tackle' && last.minute === event.minute) return null;
        return { kind: 'tackle', text: `${who} เข้าสกัด ${other} ได้บอลไป` };
      }

      case 'foul':
        return { kind: 'foul', text: `${who} ทำฟาวล์ใส่ ${other}` };

      case 'yellow_card':
        return { kind: 'card', text: `ใบเหลือง — ${who}` };

      case 'red_card':
        return { kind: 'card', text: `ใบแดง! ${who} ต้องออกจากสนาม` };

      case 'substitution':
        return { kind: 'sub', text: `เปลี่ยนตัว: ${who} ลงแทน ${other}` };

      case 'kickoff': {
        this.goalFlash = null;
        if (event.minute === 0) return null; // บรรทัดเปิดเกมถูกเขียนไว้ตั้งแต่ตอนสร้างแล้ว
        if (event.minute === 45) return { kind: 'kickoff', text: 'เริ่มครึ่งหลัง' };
        return { kind: 'kickoff', text: 'กลับมาเล่นต่อ' };
      }

      case 'half_time':
        return {
          kind: 'halftime',
          text: `หมดครึ่งแรก ${this.core.score.home} - ${this.core.score.away}`,
        };

      case 'fulltime':
        return {
          kind: 'fulltime',
          text: `จบการแข่งขัน ${this.core.score.home} - ${this.core.score.away}`,
        };

      default:
        return null;
    }
  }

  private teamName(side: MatchSide | undefined): string {
    return side === 'away' ? this.awayName : this.homeName;
  }
}
