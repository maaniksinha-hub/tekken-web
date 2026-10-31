import { BUTTONS, type Button, type CharacterData, type MoveData } from "../data/types";
import { InputBuffer, parseNotation, toDir, type Step } from "./inputs";

/**
 * Deterministic fight simulation. No rendering, no DOM, no Math.random, no
 * wall-clock time: the same inputs always give the same result. That is what
 * makes tests, replays and rollback netcode possible.
 */

export const STAGE_HALF_WIDTH = 6;
export const STAGE_HALF_DEPTH = 1.5;
export const BODY_DISTANCE = 0.8; // fighters cannot get closer than this on x
export const HIT_DEPTH = 0.6; // sidestepping further than this dodges a hit
export const ROUND_FRAMES = 60 * 60;
export const ROUND_END_FRAMES = 150;
export const ROUNDS_TO_WIN = 2;
/** Holding down this many frames crouches; holding up this long jumps; a shorter tap is a sidestep. */
export const CROUCH_HOLD_FRAMES = 6;

export const GRAVITY = 0.008;
export const JUMP_VY = 0.16; // 40-frame jump
export const LAUNCH_VY = 0.17;
export const MAX_JUGGLE_HITS = 6;
export const KNOCKDOWN_FRAMES = 50;
export const THROW_TOTAL = 32; // frames from throw connecting to damage
export const THROW_BREAK_WINDOW = 14; // the defender can break during the first frames
export const RAGE_THRESHOLD = 0.25; // fraction of max health
export const RAGE_DAMAGE_MULT = 1.15;
export const HEAT_FRAMES = 60 * 10;
export const HEAT_DAMAGE_MULT = 1.1;
export const HEAT_CHIP_FRACTION = 0.15;
export const WALL_SPLAT_DAMAGE = 8;
export const WALL_SPLAT_STUN = 22;
/** A move may be string-cancelled from this frame after its active frames end, until recovery ends. */
export const STRING_CANCEL_WINDOW = 12;

// Parsed once; notation strings live in character data.
const parsedCache = new Map<string, Step[]>();
const steps = (n: string) => {
  let v = parsedCache.get(n);
  if (!v) parsedCache.set(n, (v = parseNotation(n)));
  return v;
};

export interface InputFrame {
  x: -1 | 0 | 1; // screen space: -1 left, +1 right
  z: -1 | 0 | 1; // +1 = into the screen / up, -1 = down
  buttons: Record<Button, boolean>;
}

export const emptyInput = (): InputFrame => ({
  x: 0,
  z: 0,
  buttons: { lp: false, rp: false, lk: false, rk: false },
});

export type FighterState =
  | "idle" | "walk" | "jump" | "attack" | "hitstun" | "blockstun"
  | "juggle" | "thrown" | "knockdown" | "ko";

export interface PendingThrow {
  damage: number;
  breakButton: Button;
}

export interface Fighter {
  char: CharacterData;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  hp: number;
  facing: 1 | -1;
  state: FighterState;
  frame: number;
  move: Button | null; // button that started the move (drives which limb animates)
  activeMove: MoveData | null;
  crouching: boolean;
  holdDown: number;
  holdUp: number;
  buffer: InputBuffer;
  hitDone: boolean;
  stun: number;
  prev: Record<Button, boolean>;
  lastResult: "none" | "hit" | "block";
  juggleHits: number;
  splatUsed: boolean;
  heat: number; // frames of Heat left
  heatUsed: boolean;
  rageArtUsed: boolean;
  pending: PendingThrow | null;
}

export type Phase = "fight" | "roundEnd" | "matchEnd";

export type GameEventType = "hit" | "block" | "throw" | "break" | "splat" | "launch" | "heat" | "rage" | "ko" | "whiff";
export interface GameEvent {
  type: GameEventType;
  x: number;
  y: number;
  z: number;
  /** 0..1, how heavy the impact was. */
  power: number;
  by: 0 | 1;
}

export interface GameState {
  fighters: [Fighter, Fighter];
  phase: Phase;
  timer: number; // frames left in round
  phaseFrame: number;
  tick: number; // total frames simulated
  wins: [number, number];
  round: number;
  winner: 0 | 1 | "draw" | null; // of the last round / match
  /** Presentation events since the consumer last drained this list. Not part of the rules. */
  events: GameEvent[];
}

const START_X = 2;

function makeFighter(char: CharacterData, side: 0 | 1): Fighter {
  return {
    char,
    x: side === 0 ? -START_X : START_X,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    hp: char.maxHp,
    facing: side === 0 ? 1 : -1,
    state: "idle",
    frame: 0,
    move: null,
    activeMove: null,
    crouching: false,
    holdDown: 0,
    holdUp: 0,
    buffer: new InputBuffer(),
    hitDone: false,
    stun: 0,
    prev: { lp: false, rp: false, lk: false, rk: false },
    lastResult: "none",
    juggleHits: 0,
    splatUsed: false,
    heat: 0,
    heatUsed: false,
    rageArtUsed: false,
    pending: null,
  };
}

export function createGame(c0: CharacterData, c1: CharacterData): GameState {
  return {
    fighters: [makeFighter(c0, 0), makeFighter(c1, 1)],
    phase: "fight",
    timer: ROUND_FRAMES,
    phaseFrame: 0,
    tick: 0,
    wins: [0, 0],
    round: 1,
    winner: null,
    events: [],
  };
}

/** Deep copy for rollback netcode. Character data and move data are immutable and shared. */
export function cloneState(g: GameState): GameState {
  const cf = (f: Fighter): Fighter => ({
    ...f,
    buffer: f.buffer.clone(),
    prev: { ...f.prev },
    pending: f.pending ? { ...f.pending } : null,
  });
  return {
    ...g,
    fighters: [cf(g.fighters[0]), cf(g.fighters[1])],
    wins: [g.wins[0], g.wins[1]],
    events: g.events.map((e) => ({ ...e })),
  };
}

function resetRound(g: GameState): void {
  g.fighters = [makeFighter(g.fighters[0].char, 0), makeFighter(g.fighters[1].char, 1)];
  g.phase = "fight";
  g.timer = ROUND_FRAMES;
  g.phaseFrame = 0;
  g.winner = null;
  g.round += 1;
}

export function restartMatch(g: GameState): void {
  g.wins = [0, 0];
  g.round = 0;
  resetRound(g);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const airborne = (f: Fighter) => f.y > 0.001;
/** Holding away from the opponent. */
const holdingBack = (f: Fighter, i: InputFrame) => i.x * f.facing < 0;
export const inRage = (f: Fighter) => f.hp > 0 && f.hp / f.char.maxHp < RAGE_THRESHOLD;
export const inHeat = (f: Fighter) => f.heat > 0;

function emit(g: GameState, type: GameEventType, at: Fighter, power: number, by: 0 | 1): void {
  g.events.push({ type, x: at.x, y: at.y + 1.1, z: at.z, power, by });
}

function startMove(f: Fighter, move: MoveData, button: Button): void {
  f.state = "attack";
  f.move = button;
  f.activeMove = move;
  f.frame = 0;
  f.hitDone = false;
  f.lastResult = "none";
  f.buffer.clear();
}

function updateFighter(g: GameState, idx: 0 | 1, input: InputFrame): void {
  const f = g.fighters[idx];
  const foe = g.fighters[idx === 0 ? 1 : 0];
  if (f.state !== "ko") f.facing = foe.x >= f.x ? 1 : -1;
  if (f.heat > 0) f.heat -= 1;

  const fwd = (input.x * f.facing) as -1 | 0 | 1; // +1 toward the opponent
  f.holdDown = input.z === -1 ? f.holdDown + 1 : 0;
  f.holdUp = input.z === 1 ? f.holdUp + 1 : 0;
  const pressedNow = BUTTONS.filter((b) => input.buttons[b] && !f.prev[b]);
  const pressedBoth = (a: Button, b: Button) => pressedNow.includes(a) && pressedNow.includes(b);
  f.buffer.push({
    dir: toDir(fwd, f.holdDown >= 1 ? -1 : input.z === 1 ? 1 : 0),
    pressed: pressedNow,
    held: BUTTONS.filter((b) => input.buttons[b]),
  });

  f.crouching = false;
  switch (f.state) {
    case "hitstun":
    case "blockstun":
      if (--f.stun <= 0) f.state = "idle";
      break;

    case "knockdown":
      if (--f.stun <= 0) f.state = "idle";
      break;

    case "thrown": {
      const p = f.pending;
      f.stun -= 1;
      if (p && pressedNow.includes(p.breakButton) && f.stun > THROW_TOTAL - THROW_BREAK_WINDOW) {
        // Throw break: nobody takes damage and both get pushed apart.
        f.pending = null;
        f.state = "hitstun";
        f.stun = 14;
        foe.state = "hitstun";
        foe.stun = 14;
        foe.activeMove = null;
        foe.move = null;
        const dir = foe.x <= f.x ? 1 : -1;
        f.x = clamp(f.x + dir * 0.3, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
        foe.x = clamp(foe.x - dir * 0.3, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
        emit(g, "break", f, 0.3, idx);
      } else if (f.stun <= 0 && p) {
        f.hp = Math.max(0, f.hp - p.damage);
        f.pending = null;
        f.state = f.hp === 0 ? "ko" : "knockdown";
        f.stun = KNOCKDOWN_FRAMES;
        f.x = clamp(f.x + foe.facing * 0.6, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
        emit(g, "throw", f, 0.8, idx === 0 ? 1 : 0);
      }
      break;
    }

    case "jump":
    case "juggle":
      break; // physics below

    case "attack": {
      f.frame += 1;
      const m = f.activeMove as MoveData;
      const total = m.startup + m.active + m.recovery;
      // String follow-up: the move must have connected, and the next button comes during the cancel window.
      if (m.next && f.hitDone && f.lastResult !== "none" && f.frame >= m.startup + m.active - 1 &&
          f.frame < Math.min(total, m.startup + m.active + STRING_CANCEL_WINDOW)) {
        const nx = m.next.find((n) => pressedNow.includes(n.button));
        if (nx) {
          startMove(f, nx.move, nx.button);
          break;
        }
      }
      if (f.frame >= total) {
        f.state = "idle";
        f.move = null;
        f.activeMove = null;
      }
      break;
    }

    case "ko":
      break;

    default: {
      // idle / walk: choose an action.
      if (pressedNow.length > 0) {
        const c = f.char;
        let started = false;
        if (pressedBoth("lp", "rp") && inRage(f) && !f.rageArtUsed) {
          f.rageArtUsed = true;
          startMove(f, c.rageArt, "rp");
          emit(g, "rage", f, 1, idx);
          started = true;
        } else if (pressedBoth("lk", "rk") && !f.heatUsed) {
          f.heatUsed = true;
          f.heat = HEAT_FRAMES;
          startMove(f, c.heatEngage, "rk");
          emit(g, "heat", f, 1, idx);
          started = true;
        } else if (pressedBoth("lp", "lk")) {
          startMove(f, c.throws[0], "lp");
          started = true;
        } else if (pressedBoth("rp", "rk")) {
          startMove(f, c.throws[1], "rp");
          started = true;
        }
        if (!started) {
          const button = pressedNow[0];
          const special = c.specials.find((sp) => f.buffer.matches(steps(sp.notation)));
          startMove(f, special ? special.move : c.moves[button], button);
        }
      } else if (f.holdUp === CROUCH_HOLD_FRAMES) {
        f.state = "jump";
        f.vy = JUMP_VY;
        f.vx = fwd * f.char.walkSpeed * 1.4 * f.facing;
      } else if (f.holdDown >= CROUCH_HOLD_FRAMES) {
        f.crouching = true;
        f.state = "idle";
      } else {
        const speed = fwd > 0 ? f.char.walkSpeed : fwd < 0 ? f.char.backSpeed : 0;
        f.x += fwd * speed * f.facing;
        // Sidestep only on a tap; holding up/down turns into jump/crouch.
        f.z += input.z * f.char.sidestepSpeed;
        f.state = input.x !== 0 || input.z !== 0 ? "walk" : "idle";
      }
    }
  }

  // Airborne physics (jump and juggle).
  if (f.state === "jump" || f.state === "juggle") {
    f.x += f.vx;
    f.y += f.vy;
    f.vy -= GRAVITY;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      f.vx = 0;
      if (f.state === "juggle") {
        f.state = "knockdown";
        f.stun = KNOCKDOWN_FRAMES;
        f.juggleHits = 0;
      } else {
        f.state = "idle";
      }
    }
  }
  if (f.state === "ko") {
    f.y = 0;
    f.vx = 0;
    f.vy = 0;
  }

  f.x = clamp(f.x, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  f.z = clamp(f.z, -STAGE_HALF_DEPTH, STAGE_HALF_DEPTH);
  for (const b of BUTTONS) f.prev[b] = input.buttons[b];
}

function separate(a: Fighter, b: Fighter): void {
  if (airborne(a) || airborne(b)) return;
  if (Math.abs(a.z - b.z) >= HIT_DEPTH) return;
  const gap = Math.abs(a.x - b.x);
  if (gap >= BODY_DISTANCE) return;
  const push = (BODY_DISTANCE - gap) / 2;
  const dir = a.x <= b.x ? -1 : 1; // direction a moves
  a.x = clamp(a.x + dir * push, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  b.x = clamp(b.x - dir * push, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
}

const isThrow = (m: MoveData) => m.throw === true;

/** Does `atk`'s current move connect on `def` this frame? */
function connects(atk: Fighter, def: Fighter): boolean {
  if (atk.state !== "attack" || atk.hitDone || def.state === "ko") return false;
  if (def.state === "knockdown" || def.state === "thrown") return false;
  const m = atk.activeMove as MoveData;
  if (atk.frame < m.startup || atk.frame >= m.startup + m.active) return false;
  if (Math.abs(atk.z - def.z) >= HIT_DEPTH) return false;
  const ahead = (def.x - atk.x) * atk.facing;
  if (!(ahead > 0 && ahead <= m.reach)) return false;

  if (isThrow(m)) {
    return !airborne(def) && def.state !== "hitstun" && def.state !== "juggle";
  }
  if (m.height === "high" && def.crouching) return false; // ducked under
  if (m.height === "low" && airborne(def) && def.state === "jump") return false; // jumped over
  if (def.state === "juggle" && def.juggleHits >= MAX_JUGGLE_HITS) return false;
  return true;
}

/** Can `def` block a move of this height right now? Lows need a crouch-block, mids a standing block. */
function guards(def: Fighter, input: InputFrame, incoming: MoveData | null): boolean {
  if (!incoming || incoming.unblockable || isThrow(incoming)) return false;
  if (def.state === "attack" || def.state === "hitstun" || def.state === "ko") return false;
  if (def.state === "juggle" || def.state === "jump" || def.state === "knockdown") return false;
  if (!holdingBack(def, input)) return false;
  const crouchGuard = input.z === -1;
  if (incoming.height === "low") return crouchGuard;
  if (incoming.height === "mid") return !crouchGuard;
  return true;
}

function damageFor(atk: Fighter, def: Fighter, m: MoveData): number {
  let d = m.damage;
  if (inRage(atk)) d *= RAGE_DAMAGE_MULT;
  if (inHeat(atk)) d *= HEAT_DAMAGE_MULT;
  if (def.state === "juggle") d *= Math.max(0.35, 1 - 0.14 * def.juggleHits);
  return Math.max(1, Math.round(d));
}

function resolveHits(g: GameState, inputs: [InputFrame, InputFrame]): void {
  const [a, b] = g.fighters;
  // Decide both hits from the same snapshot so trades are symmetrical.
  const hits: [boolean, boolean] = [connects(a, b), connects(b, a)];
  const defended: [boolean, boolean] = [
    guards(b, inputs[1], a.activeMove),
    guards(a, inputs[0], b.activeMove),
  ];

  // Capture both moves first: applying one hit clears the defender's move, which would break trades.
  const moves: [MoveData | null, MoveData | null] = [a.activeMove, b.activeMove];

  const apply = (atk: Fighter, def: Fighter, blocked: boolean, by: 0 | 1) => {
    const m = moves[by] as MoveData;
    atk.hitDone = true;

    if (isThrow(m)) {
      def.state = "thrown";
      def.stun = THROW_TOTAL;
      def.activeMove = null;
      def.move = null;
      def.pending = { damage: damageFor(atk, def, m), breakButton: m === atk.char.throws[0] ? "lp" : "rp" };
      atk.lastResult = "hit";
      return;
    }

    def.activeMove = null;
    def.move = null;
    atk.lastResult = blocked ? "block" : "hit";
    const push = atk.facing * m.pushback;

    if (blocked) {
      def.stun = m.blockstun;
      def.state = "blockstun";
      def.x = clamp(def.x + push, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      if (inHeat(atk)) def.hp = Math.max(1, def.hp - Math.max(1, Math.round(m.damage * HEAT_CHIP_FRACTION)));
      emit(g, "block", def, 0.3, by);
      return;
    }

    const wasJuggled = def.state === "juggle";
    def.hp = Math.max(0, def.hp - damageFor(atk, def, m));
    const power = Math.min(1, m.damage / 28);

    if (wasJuggled || m.launch || airborne(def)) {
      if (!wasJuggled) {
        def.state = "juggle";
        def.y = Math.max(def.y, 0.02);
        def.vy = LAUNCH_VY;
        def.juggleHits = 1;
        def.splatUsed = false;
        emit(g, "launch", def, 0.8, by);
      } else {
        def.juggleHits += 1;
        // Re-lift early in the juggle; later hits barely extend it.
        if (def.juggleHits <= 4) def.vy = Math.max(def.vy, 0.1);
      }
      def.vx = atk.facing * 0.025;
    } else {
      def.state = "hitstun";
      def.stun = m.hitstun;
      def.x = clamp(def.x + push, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
      // Wall splat: heavy hit into the wall adds damage and stun once per combo.
      if (!def.splatUsed && m.pushback >= 0.35 && Math.abs(def.x) >= STAGE_HALF_WIDTH - 1e-6) {
        def.splatUsed = true;
        def.stun += WALL_SPLAT_STUN;
        def.hp = Math.max(0, def.hp - WALL_SPLAT_DAMAGE);
        emit(g, "splat", def, 0.7, by);
      }
    }
    emit(g, "hit", def, power, by);
    if (def.hp === 0) {
      def.state = "ko";
      emit(g, "ko", def, 1, by);
    }
  };

  if (hits[0]) apply(a, b, defended[0], 0);
  if (hits[1]) apply(b, a, defended[1], 1);
}

function endRound(g: GameState, winner: 0 | 1 | "draw"): void {
  g.phase = "roundEnd";
  g.phaseFrame = 0;
  g.winner = winner;
  if (winner !== "draw") g.wins[winner] += 1;
}

export function step(g: GameState, inputs: [InputFrame, InputFrame]): void {
  g.phaseFrame += 1;
  g.tick += 1;

  if (g.phase === "roundEnd") {
    if (g.phaseFrame >= ROUND_END_FRAMES) {
      if (g.wins[0] >= ROUNDS_TO_WIN || g.wins[1] >= ROUNDS_TO_WIN) {
        g.phase = "matchEnd";
      } else {
        resetRound(g);
      }
    }
    return;
  }
  if (g.phase === "matchEnd") return;

  const [a, b] = g.fighters;
  updateFighter(g, 0, inputs[0]);
  updateFighter(g, 1, inputs[1]);
  separate(a, b);
  resolveHits(g, inputs);
  g.timer -= 1;

  const aKo = a.hp === 0;
  const bKo = b.hp === 0;
  if (aKo || bKo) {
    endRound(g, aKo && bKo ? "draw" : aKo ? 1 : 0);
  } else if (g.timer <= 0) {
    const ra = a.hp / a.char.maxHp;
    const rb = b.hp / b.char.maxHp;
    endRound(g, ra === rb ? "draw" : ra > rb ? 0 : 1);
  }
}
