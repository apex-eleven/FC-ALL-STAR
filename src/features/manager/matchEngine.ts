/**
 * The live manager-mode match: 22 players and a ball on a 105 x 68 m pitch.
 *
 * PURE — no React, no DOM, no clock. The screen calls `step()` with a fixed `dt`
 * and reads positions back each frame. Given the same lineups, seed, and the same
 * manager inputs at the same match times, it plays the same game.
 *
 * Time is "screen seconds", not match seconds: 90 minutes is compressed into
 * `duration` seconds, and players move at speeds that look right on screen at that
 * pace. The match clock is derived from it.
 *
 * Coordinates: x runs from the home goal (0) to the away goal (105), y from the top
 * touchline (0) to the bottom (68). Home attacks +x, away attacks -x.
 */

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const MAX_SUBS = 5;

export type Side = 'home' | 'away';
export type Tactic = 'attack' | 'balanced' | 'defend';

/** One player as the engine needs them. Skills are 0..1. */
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
  | 'tactic';

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

interface Flight {
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

interface Ball {
  x: number;
  y: number;
  ownerId: string | null;
  flight: Flight | null;
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

const HALF = PITCH_WIDTH / 2;
const GOAL_HALF_WIDTH = 3.66;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32 — small, fast, and good enough to decide a football match. */
function makeRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Own-frame coordinates to pitch coordinates. */
function toPitch(side: Side, x: number, y: number): [number, number] {
  return side === 'home' ? [x, y] : [PITCH_LENGTH - x, PITCH_WIDTH - y];
}

/** How far up the pitch a point is, for `side`. */
function ownX(side: Side, x: number): number {
  return side === 'home' ? x : PITCH_LENGTH - x;
}

function other(side: Side): Side {
  return side === 'home' ? 'away' : 'home';
}

const TACTIC_LABEL: Record<Tactic, string> = { attack: 'บุก', balanced: 'สมดุล', defend: 'ตั้งรับ' };

export class MatchEngine {
  readonly duration: number;
  readonly homeName: string;
  readonly awayName: string;

  t = 0;
  phase: MatchPhase = 'play';
  half: 1 | 2 = 1;
  players: EnginePlayer[] = [];
  bench: MatchPlayer[];
  subsUsed = 0;
  score: Record<Side, number> = { home: 0, away: 0 };
  stats: Record<Side, SideStats> = {
    home: { shots: 0, onTarget: 0, passes: 0, tackles: 0, possession: 0 },
    away: { shots: 0, onTarget: 0, passes: 0, tackles: 0, possession: 0 },
  };
  tactics: Record<Side, Tactic> = { home: 'balanced', away: 'balanced' };
  events: MatchEvent[] = [];
  /** Who scored, for the result screen. */
  scorers: { side: Side; name: string; minute: number }[] = [];
  ball: Ball = { x: PITCH_LENGTH / 2, y: HALF, ownerId: null, flight: null };
  /** Dead-ball time left after a goal or restart; the clock is stopped meanwhile. */
  pause = 0;
  /** Set on a goal until the restart, for the screen's goal flash. */
  goalFlash: Side | null = null;

  private rng: () => number;
  private possession: Side = 'home';
  private cooldown = 0;
  private eventId = 0;
  private pendingKickoff: Side | null = null;

  constructor(setup: MatchSetup) {
    this.duration = setup.duration;
    this.homeName = setup.homeName;
    this.awayName = setup.awayName;
    this.bench = [...setup.homeBench];
    this.rng = makeRng(setup.seed);

    const place = (side: Side, spot: LineupSpot): EnginePlayer => {
      const [x, y] = toPitch(side, spot.anchorX, spot.anchorY);
      return {
        ...spot.player,
        side,
        x,
        y,
        anchorX: spot.anchorX,
        anchorY: spot.anchorY,
        keeper: spot.keeper,
        enteredAt: 0,
      };
    };
    this.players = [
      ...setup.home.map((spot) => place('home', spot)),
      ...setup.away.map((spot) => place('away', spot)),
    ];
    this.kickoff('home');
    this.log(null, 'kickoff', `เริ่มการแข่งขัน ${this.homeName} พบ ${this.awayName}`);
  }

  /** 0..90, the minute the broadcast clock shows. */
  get minute(): number {
    return Math.min(90, Math.floor((this.t / this.duration) * 90));
  }

  get finished(): boolean {
    return this.phase === 'fulltime';
  }

  get possessionShare(): number {
    const total = this.stats.home.possession + this.stats.away.possession;
    return total > 0 ? this.stats.home.possession / total : 0.5;
  }

  get ballOwnerId(): string | null {
    return this.ball.ownerId;
  }

  onPitch(side: Side): EnginePlayer[] {
    return this.players.filter((player) => player.side === side);
  }

  // ---- manager inputs -------------------------------------------------------

  setTactic(side: Side, tactic: Tactic): void {
    if (this.tactics[side] === tactic || this.finished) return;
    this.tactics[side] = tactic;
    if (side === 'home') this.log('home', 'tactic', `ปรับแทคติกเป็น "${TACTIC_LABEL[tactic]}"`);
  }

  /** Home only. Returns false when the swap is not allowed. */
  substitute(outId: string, inId: string): boolean {
    if (this.finished || this.subsUsed >= MAX_SUBS) return false;
    const index = this.players.findIndex((player) => player.id === outId && player.side === 'home');
    const benchIndex = this.bench.findIndex((player) => player.id === inId);
    if (index < 0 || benchIndex < 0) return false;

    const leaving = this.players[index]!;
    const coming = this.bench[benchIndex]!;
    this.players[index] = {
      ...coming,
      side: 'home',
      x: leaving.x,
      y: leaving.y,
      anchorX: leaving.anchorX,
      anchorY: leaving.anchorY,
      keeper: leaving.keeper,
      enteredAt: this.t,
    };
    this.bench.splice(benchIndex, 1);
    this.subsUsed += 1;
    if (this.ball.ownerId === outId) this.ball.ownerId = coming.id;
    if (this.ball.flight?.receiverId === outId) this.ball.flight.receiverId = coming.id;
    this.log('home', 'sub', `เปลี่ยนตัว: ${coming.name} ลงแทน ${leaving.name}`);
    return true;
  }

  /** Leaves the half-time break. */
  resume(): void {
    if (this.phase !== 'halftime') return;
    this.phase = 'play';
    this.half = 2;
    this.kickoff('away');
    this.log(null, 'kickoff', 'เริ่มครึ่งหลัง');
  }

  // ---- simulation -----------------------------------------------------------

  step(dt: number): void {
    if (this.phase !== 'play') return;

    this.awayManager();

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.pendingKickoff) {
        this.kickoff(this.pendingKickoff);
        this.pendingKickoff = null;
      }
      this.movePlayers(dt, true);
      return;
    }

    this.t += dt;
    this.stats[this.possession].possession += dt;

    if (this.half === 1 && this.t >= this.duration / 2) {
      this.t = this.duration / 2;
      this.phase = 'halftime';
      this.log(null, 'halftime', `หมดครึ่งแรก ${this.score.home} - ${this.score.away}`);
      return;
    }
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.phase = 'fulltime';
      this.log(null, 'fulltime', `จบการแข่งขัน ${this.score.home} - ${this.score.away}`);
      return;
    }

    this.moveBall(dt);
    this.movePlayers(dt, false);
    this.decide(dt);
  }

  private log(side: Side | null, kind: MatchEventKind, text: string): void {
    this.eventId += 1;
    this.events.push({ id: this.eventId, minute: this.minute, side, kind, text });
  }

  private byId(id: string | null): EnginePlayer | undefined {
    return id ? this.players.find((player) => player.id === id) : undefined;
  }

  private keeper(side: Side): EnginePlayer | undefined {
    return this.players.find((player) => player.side === side && player.keeper);
  }

  /**
   * 0..1, how fresh a player is. Falls over the match, faster for players with less
   * physical strength; a substitute starts full.
   */
  energyOf(player: EnginePlayer): number {
    const played = clamp((this.t - player.enteredAt) / this.duration, 0, 1);
    return clamp(1 - played * (1.2 - player.physical * 0.4) * 0.7, 0.15, 1);
  }

  /** Legs go: a spent player is about 15% slower. */
  private speedOf(player: EnginePlayer): number {
    const tired = 0.85 + 0.15 * this.energyOf(player);
    return (5 + player.pace * 3.5) * tired;
  }

  private kickoff(side: Side): void {
    this.goalFlash = null;
    for (const player of this.players) {
      // Everyone back in their own half.
      const x = Math.min(player.anchorX, 48);
      const [px, py] = toPitch(player.side, x, player.anchorY);
      player.x = px;
      player.y = py;
    }
    const taker = this.onPitch(side)
      .filter((player) => !player.keeper)
      .sort((a, b) => b.anchorX - a.anchorX)[0];
    this.ball = { x: PITCH_LENGTH / 2, y: HALF, ownerId: taker?.id ?? null, flight: null };
    if (taker) {
      taker.x = PITCH_LENGTH / 2 + (side === 'home' ? -0.8 : 0.8);
      taker.y = HALF;
    }
    this.possession = side;
    this.cooldown = 0.8;
    this.pause = 0;
  }

  /** The away side's manager: chase a game it is losing, sit on a lead late on. */
  private awayManager(): void {
    const diff = this.score.away - this.score.home;
    const late = this.minute >= 70;
    const next: Tactic = late && diff < 0 ? 'attack' : late && diff > 0 ? 'defend' : 'balanced';
    this.tactics.away = next;
  }

  private moveBall(dt: number): void {
    const flight = this.ball.flight;
    if (flight) {
      flight.elapsed += dt;
      const progress = clamp(flight.elapsed / flight.duration, 0, 1);
      this.ball.x = flight.fromX + (flight.toX - flight.fromX) * progress;
      this.ball.y = flight.fromY + (flight.toY - flight.fromY) * progress;
      if (progress >= 1) this.land(flight);
      return;
    }

    const owner = this.byId(this.ball.ownerId);
    if (owner) {
      const ahead = owner.side === 'home' ? 0.7 : -0.7;
      this.ball.x = owner.x + ahead;
      this.ball.y = owner.y;
      return;
    }

    // Loose: first player to reach it takes it.
    let nearest: EnginePlayer | undefined;
    let best = Infinity;
    for (const player of this.players) {
      const distance = Math.hypot(player.x - this.ball.x, player.y - this.ball.y);
      if (distance < best) {
        best = distance;
        nearest = player;
      }
    }
    if (nearest && best < 1.3) this.giveBall(nearest);
  }

  private giveBall(player: EnginePlayer): void {
    this.ball.ownerId = player.id;
    this.ball.flight = null;
    this.possession = player.side;
    this.cooldown = 0.45 + this.rng() * 0.5;
  }

  private land(flight: Flight): void {
    this.ball.flight = null;
    const shooter = this.byId(flight.shooterId);

    if (flight.kind === 'pass') {
      const receiver = this.byId(flight.receiverId);
      // Taken cleanly only if the receiver got there; otherwise it runs loose and
      // whoever is nearest collects it.
      if (receiver && Math.hypot(receiver.x - flight.toX, receiver.y - flight.toY) < 2.5) {
        this.giveBall(receiver);
      } else {
        this.ball.ownerId = null;
      }
      return;
    }

    const side = flight.side;
    const defending = other(side);
    if (flight.outcome === 'goal') {
      this.score[side] += 1;
      this.goalFlash = side;
      const name = shooter?.name ?? '';
      this.scorers.push({ side, name, minute: this.minute });
      this.log(side, 'goal', `ประตู! ${name} ยิงเข้าไป (${this.score.home} - ${this.score.away})`);
      this.ball.ownerId = null;
      this.pause = 2.6;
      this.pendingKickoff = defending;
      return;
    }

    const keeper = this.keeper(defending);
    if (flight.outcome === 'save') {
      this.log(defending, 'save', `${keeper?.name ?? 'ผู้รักษาประตู'} เซฟลูกยิงของ ${shooter?.name ?? ''}`);
    } else {
      this.log(side, 'miss', `${shooter?.name ?? ''} ยิงไม่ตรงกรอบ`);
    }
    if (keeper) {
      keeper.x = flight.toX;
      keeper.y = clamp(flight.toY, HALF - 6, HALF + 6);
      this.giveBall(keeper);
      this.cooldown = 1.1;
    }
  }

  private movePlayers(dt: number, restart: boolean): void {
    const owner = this.byId(this.ball.ownerId);
    const flight = this.ball.flight;
    const ballSide = owner?.side ?? flight?.side ?? this.possession;

    // Who presses: the two nearest opponents to the ball carrier.
    const pressers = new Set<string>();
    if (owner && !restart) {
      this.onPitch(other(owner.side))
        .filter((player) => !player.keeper)
        .map((player) => ({ player, d: Math.hypot(player.x - owner.x, player.y - owner.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.tactics[other(owner.side)] === 'attack' ? 3 : 2)
        .forEach(({ player }) => pressers.add(player.id));
    }

    // With the ball loose, the nearest player from each side goes for it.
    const chasers = new Set<string>();
    if (!owner && !flight && !restart) {
      for (const side of ['home', 'away'] as const) {
        const nearest = this.onPitch(side)
          .map((player) => ({ player, d: Math.hypot(player.x - this.ball.x, player.y - this.ball.y) }))
          .sort((a, b) => a.d - b.d)[0];
        if (nearest) chasers.add(nearest.player.id);
      }
    }

    for (const player of this.players) {
      let tx: number;
      let ty: number;

      if (owner && player.id === owner.id && !restart) {
        // Carry the ball at the goal, drifting toward the middle.
        const goalX = player.side === 'home' ? PITCH_LENGTH : 0;
        tx = goalX;
        ty = HALF + (player.y - HALF) * 0.6;
      } else if (flight && flight.kind === 'pass' && player.id === flight.receiverId) {
        tx = flight.toX;
        ty = flight.toY;
      } else if (pressers.has(player.id) && owner) {
        tx = owner.x;
        ty = owner.y;
      } else if (chasers.has(player.id)) {
        tx = this.ball.x;
        ty = this.ball.y;
      } else {
        [tx, ty] = this.shape(player, ballSide, restart);
      }

      const dx = tx - player.x;
      const dy = ty - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.05) continue;
      const pace = this.speedOf(player) * (owner && player.id === owner.id ? 0.78 : 1);
      const move = Math.min(distance, pace * dt);
      player.x = clamp(player.x + (dx / distance) * move, 0.5, PITCH_LENGTH - 0.5);
      player.y = clamp(player.y + (dy / distance) * move, 0.5, PITCH_WIDTH - 0.5);
    }
  }

  /** Where a player off the ball wants to be: their spot, moved with the play. */
  private shape(player: EnginePlayer, ballSide: Side, restart: boolean): [number, number] {
    if (restart) {
      return toPitch(player.side, Math.min(player.anchorX, 48), player.anchorY);
    }

    const ballOwn = ownX(player.side, this.ball.x);
    const ballOwnY = player.side === 'home' ? this.ball.y : PITCH_WIDTH - this.ball.y;
    const tactic = this.tactics[player.side];
    const tacticShift = tactic === 'attack' ? 7 : tactic === 'defend' ? -7 : 0;
    const inPossession = ballSide === player.side;

    if (player.keeper) {
      const x = clamp(3 + (ballOwn - 30) * 0.08, 2, 14);
      const y = HALF + (ballOwnY - HALF) * 0.2;
      return toPitch(player.side, x, y);
    }

    const shift = (ballOwn - 52.5) * 0.5 + (inPossession ? 7 : -5) + tacticShift;
    const x = clamp(player.anchorX + shift, 6, 100);
    const y = clamp(player.anchorY + (ballOwnY - HALF) * 0.3, 3, PITCH_WIDTH - 3);
    return toPitch(player.side, x, y);
  }

  private decide(dt: number): void {
    const owner = this.byId(this.ball.ownerId);
    if (!owner || this.ball.flight) return;

    this.cooldown -= dt;
    const side = owner.side;
    const opponents = this.onPitch(other(side));

    // A tackle can come at any moment the carrier is close to a presser.
    let nearest: EnginePlayer | undefined;
    let gap = Infinity;
    for (const opponent of opponents) {
      if (opponent.keeper) continue;
      const distance = Math.hypot(opponent.x - owner.x, opponent.y - owner.y);
      if (distance < gap) {
        gap = distance;
        nearest = opponent;
      }
    }
    if (nearest && gap < 1.6 && this.rng() < dt * 1.4) {
      // A side sitting deep wins more of its challenges; one pushed up loses more.
      const stance = this.tactics[nearest.side];
      const bonus = stance === 'defend' ? 0.1 : stance === 'attack' ? -0.04 : 0;
      const chance = clamp(0.38 + bonus + 0.6 * (nearest.defending - owner.dribbling), 0.1, 0.85);
      if (this.rng() < chance) {
        this.stats[nearest.side].tackles += 1;
        this.giveBall(nearest);
        return;
      }
    }

    if (this.cooldown > 0) return;
    this.cooldown = 0.55 + this.rng() * 0.7;

    const goalX = side === 'home' ? PITCH_LENGTH : 0;
    const distanceToGoal = Math.hypot(goalX - owner.x, HALF - owner.y);
    const tactic = this.tactics[side];

    if (owner.keeper) {
      this.pass(owner, true);
      return;
    }

    const inRange = distanceToGoal < 30;
    const shootChance = inRange
      ? (1 - distanceToGoal / 30) * 0.9 + (tactic === 'attack' ? 0.08 : 0) + owner.shooting * 0.12
      : 0;
    if (inRange && this.rng() < shootChance) {
      this.shoot(owner, distanceToGoal, gap);
      return;
    }

    // Deep in the opponent's half with space: keep running. Otherwise move it on.
    const carryChance = 0.25 + owner.dribbling * 0.3 - (gap < 4 ? 0.2 : 0);
    if (!inRange && gap > 5 && this.rng() < carryChance) return;
    this.pass(owner, false);
  }

  private pass(owner: EnginePlayer, fromKeeper: boolean): void {
    const side = owner.side;
    const mates = this.onPitch(side).filter((player) => player.id !== owner.id && !player.keeper);
    const opponents = this.onPitch(other(side));
    const tactic = this.tactics[side];
    const ownerOwn = ownX(side, owner.x);

    const options = mates.map((mate) => {
      const forward = ownX(side, mate.x) - ownerOwn;
      const distance = Math.hypot(mate.x - owner.x, mate.y - owner.y);
      const space = Math.min(...opponents.map((o) => Math.hypot(o.x - mate.x, o.y - mate.y)));
      const reach = distance > 38 ? 0.2 : 1;
      const lean = tactic === 'attack' ? 0.07 : tactic === 'defend' ? 0.02 : 0.045;
      const weight =
        Math.max(0.05, 1 + forward * lean) * Math.min(1, space / 6 + 0.15) * reach * (fromKeeper && forward > 30 ? 0.3 : 1);
      return { mate, weight, distance };
    });

    const total = options.reduce((sum, option) => sum + option.weight, 0);
    let roll = this.rng() * total;
    let choice = options[0];
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        choice = option;
        break;
      }
    }
    if (!choice) return;

    const target = choice.mate;
    // Lead the runner a little toward goal.
    const lead = side === 'home' ? 2 : -2;
    const toX = clamp(target.x + lead, 1, PITCH_LENGTH - 1);
    const toY = target.y;

    // The opponent best placed to cut it out.
    let blocker: EnginePlayer | undefined;
    let blockGap = Infinity;
    for (const opponent of opponents) {
      if (opponent.keeper) continue;
      const d = distanceToSegment(opponent.x, opponent.y, owner.x, owner.y, toX, toY);
      if (d < blockGap) {
        blockGap = d;
        blocker = opponent;
      }
    }
    const lane = blockGap < 2.5 ? 0.22 : blockGap < 5 ? 0.08 : 0;
    const length = choice.distance > 25 ? 0.08 : 0;
    const theirStance = this.tactics[other(side)];
    const compact = theirStance === 'defend' ? 0.08 : theirStance === 'attack' ? -0.03 : 0;
    const intercept = clamp(
      0.1 + lane + length + compact + 0.3 * ((blocker?.defending ?? 0.5) - owner.passing),
      0.03,
      0.55,
    );
    const intercepted = blocker !== undefined && this.rng() < intercept;
    this.stats[side].passes += 1;

    const speed = 20 + owner.passing * 10;
    if (intercepted && blocker) {
      // Cut out where the blocker stands on the lane.
      const [ix, iy] = projectOnSegment(blocker.x, blocker.y, owner.x, owner.y, toX, toY);
      this.ball.flight = {
        kind: 'pass',
        fromX: owner.x,
        fromY: owner.y,
        toX: ix,
        toY: iy,
        elapsed: 0,
        duration: Math.max(0.15, Math.hypot(ix - owner.x, iy - owner.y) / speed),
        side,
        receiverId: blocker.id,
        shooterId: owner.id,
        outcome: 'intercepted',
      };
    } else {
      this.ball.flight = {
        kind: 'pass',
        fromX: owner.x,
        fromY: owner.y,
        toX,
        toY,
        elapsed: 0,
        duration: Math.max(0.2, Math.hypot(toX - owner.x, toY - owner.y) / speed),
        side,
        receiverId: target.id,
        shooterId: owner.id,
        outcome: 'complete',
      };
    }
    this.ball.ownerId = null;
  }

  private shoot(owner: EnginePlayer, distance: number, pressure: number): void {
    const side = owner.side;
    const defending = other(side);
    const keeper = this.keeper(defending);
    const keeperSkill = keeper ? (keeper.defending + keeper.physical) / 2 : 0.3;
    const theirTactic = this.tactics[defending];
    const pressed = pressure < 2.5 ? 0.12 : 0;

    const onTarget = clamp(
      0.32 + 0.45 * owner.shooting - pressed - (theirTactic === 'defend' ? 0.06 : 0),
      0.12,
      0.85,
    );
    const scores = clamp(
      0.4 * Math.exp(-distance / 16) +
        0.4 * (owner.shooting - keeperSkill) +
        0.05 +
        (theirTactic === 'attack' ? 0.08 : 0) -
        (theirTactic === 'defend' ? 0.06 : 0),
      0.04,
      0.75,
    );

    const hits = this.rng() < onTarget;
    const goal = hits && this.rng() < scores;
    this.stats[side].shots += 1;
    if (hits) this.stats[side].onTarget += 1;

    const goalX = side === 'home' ? PITCH_LENGTH : 0;
    const aim = (this.rng() * 2 - 1) * (hits ? GOAL_HALF_WIDTH - 0.4 : GOAL_HALF_WIDTH + 4);
    const toY = HALF + (hits ? aim : Math.sign(aim || 1) * (GOAL_HALF_WIDTH + 1.5 + Math.abs(aim) * 0.5));
    const toX = goal || !hits ? goalX : goalX + (side === 'home' ? -1.2 : 1.2);

    this.ball.flight = {
      kind: 'shot',
      fromX: owner.x,
      fromY: owner.y,
      toX,
      toY,
      elapsed: 0,
      duration: Math.max(0.25, distance / 34),
      side,
      receiverId: '',
      shooterId: owner.id,
      outcome: goal ? 'goal' : hits ? 'save' : 'miss',
    };
    this.ball.ownerId = null;
  }
}

function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return [ax + dx * t, ay + dy * t];
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const [x, y] = projectOnSegment(px, py, ax, ay, bx, by);
  return Math.hypot(px - x, py - y);
}
