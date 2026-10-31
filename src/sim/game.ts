import { BUTTONS, type Button, type CharacterData } from "../data/types";

/**
 * Deterministic fight simulation. No rendering, no DOM, no Math.random, no
 * wall-clock time: the same inputs always give the same result. That is what
 * makes tests, replays and (later) rollback netcode possible.
 */

export const STAGE_HALF_WIDTH = 6;
export const STAGE_HALF_DEPTH = 1.5;
export const BODY_DISTANCE = 0.8; // fighters cannot get closer than this on x
export const HIT_DEPTH = 0.6; // sidestepping further than this dodges a hit
export const ROUND_FRAMES = 60 * 60;
export const ROUND_END_FRAMES = 150;
export const ROUNDS_TO_WIN = 2;

export interface InputFrame {
  x: -1 | 0 | 1; // screen space: -1 left, +1 right
  z: -1 | 0 | 1; // +1 = into the screen (sidestep away from camera)
  buttons: Record<Button, boolean>;
}

export const emptyInput = (): InputFrame => ({
  x: 0,
  z: 0,
  buttons: { lp: false, rp: false, lk: false, rk: false },
});

export type FighterState = "idle" | "walk" | "attack" | "hitstun" | "blockstun" | "ko";

export interface Fighter {
  char: CharacterData;
  x: number;
  z: number;
  hp: number;
  facing: 1 | -1;
  state: FighterState;
  frame: number;
  move: Button | null;
  hitDone: boolean;
  stun: number;
  prev: Record<Button, boolean>;
  lastResult: "none" | "hit" | "block";
}

export type Phase = "fight" | "roundEnd" | "matchEnd";

export interface GameState {
  fighters: [Fighter, Fighter];
  phase: Phase;
  timer: number; // frames left in round
  phaseFrame: number;
  wins: [number, number];
  round: number;
  winner: 0 | 1 | "draw" | null; // of the last round / match
}

const START_X = 2;

function makeFighter(char: CharacterData, side: 0 | 1): Fighter {
  return {
    char,
    x: side === 0 ? -START_X : START_X,
    z: 0,
    hp: char.maxHp,
    facing: side === 0 ? 1 : -1,
    state: "idle",
    frame: 0,
    move: null,
    hitDone: false,
    stun: 0,
    prev: { lp: false, rp: false, lk: false, rk: false },
    lastResult: "none",
  };
}

export function createGame(c0: CharacterData, c1: CharacterData): GameState {
  return {
    fighters: [makeFighter(c0, 0), makeFighter(c1, 1)],
    phase: "fight",
    timer: ROUND_FRAMES,
    phaseFrame: 0,
    wins: [0, 0],
    round: 1,
    winner: null,
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
const canAct = (f: Fighter) => f.state === "idle" || f.state === "walk";
/** Holding away from the opponent. */
const holdingBack = (f: Fighter, i: InputFrame) => i.x * f.facing < 0;

function updateFighter(f: Fighter, foe: Fighter, input: InputFrame): void {
  if (f.state !== "ko") f.facing = foe.x >= f.x ? 1 : -1;

  if (f.state === "hitstun" || f.state === "blockstun") {
    if (--f.stun <= 0) f.state = "idle";
  }

  if (canAct(f)) {
    // Attack on a fresh button press.
    let pressed: Button | null = null;
    for (const b of BUTTONS) if (input.buttons[b] && !f.prev[b]) pressed = pressed ?? b;
    if (pressed) {
      f.state = "attack";
      f.move = pressed;
      f.frame = 0;
      f.hitDone = false;
    } else {
      const fwd = input.x * f.facing; // +1 toward the opponent
      const speed = fwd > 0 ? f.char.walkSpeed : fwd < 0 ? f.char.backSpeed : 0;
      f.x += fwd * speed * f.facing;
      f.z += input.z * f.char.sidestepSpeed;
      f.state = input.x !== 0 || input.z !== 0 ? "walk" : "idle";
    }
  } else if (f.state === "attack") {
    f.frame += 1;
    const m = f.char.moves[f.move as Button];
    if (f.frame >= m.startup + m.active + m.recovery) {
      f.state = "idle";
      f.move = null;
    }
  }

  f.x = clamp(f.x, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  f.z = clamp(f.z, -STAGE_HALF_DEPTH, STAGE_HALF_DEPTH);
  for (const b of BUTTONS) f.prev[b] = input.buttons[b];
}

function separate(a: Fighter, b: Fighter): void {
  if (Math.abs(a.z - b.z) >= HIT_DEPTH) return;
  const gap = Math.abs(a.x - b.x);
  if (gap >= BODY_DISTANCE) return;
  const push = (BODY_DISTANCE - gap) / 2;
  const dir = a.x <= b.x ? -1 : 1; // direction a moves
  a.x = clamp(a.x + dir * push, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
  b.x = clamp(b.x - dir * push, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
}

/** Does `atk`'s current move connect on `def` this frame? */
function connects(atk: Fighter, def: Fighter): boolean {
  if (atk.state !== "attack" || atk.hitDone || def.state === "ko") return false;
  const m = atk.char.moves[atk.move as Button];
  if (atk.frame < m.startup || atk.frame >= m.startup + m.active) return false;
  if (Math.abs(atk.z - def.z) >= HIT_DEPTH) return false;
  const ahead = (def.x - atk.x) * atk.facing;
  return ahead > 0 && ahead <= m.reach;
}

function resolveHits(g: GameState, inputs: [InputFrame, InputFrame]): void {
  const [a, b] = g.fighters;
  // Decide both hits from the same snapshot so trades are symmetrical.
  const hits: [boolean, boolean] = [connects(a, b), connects(b, a)];
  const defended = [
    b.state !== "attack" && holdingBack(b, inputs[1]) && b.state !== "hitstun",
    a.state !== "attack" && holdingBack(a, inputs[0]) && a.state !== "hitstun",
  ];
  const apply = (atk: Fighter, def: Fighter, blocked: boolean) => {
    const m = atk.char.moves[atk.move as Button];
    atk.hitDone = true;
    def.move = null;
    def.stun = blocked ? m.blockstun : m.hitstun;
    def.state = blocked ? "blockstun" : "hitstun";
    def.x = clamp(def.x + atk.facing * m.pushback, -STAGE_HALF_WIDTH, STAGE_HALF_WIDTH);
    atk.lastResult = blocked ? "block" : "hit";
    if (!blocked) {
      def.hp = Math.max(0, def.hp - m.damage);
      if (def.hp === 0) def.state = "ko";
    }
  };
  if (hits[0]) apply(a, b, defended[0]);
  if (hits[1]) apply(b, a, defended[1]);
}

function endRound(g: GameState, winner: 0 | 1 | "draw"): void {
  g.phase = "roundEnd";
  g.phaseFrame = 0;
  g.winner = winner;
  if (winner !== "draw") g.wins[winner] += 1;
}

export function step(g: GameState, inputs: [InputFrame, InputFrame]): void {
  g.phaseFrame += 1;

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
  updateFighter(a, b, inputs[0]);
  updateFighter(b, a, inputs[1]);
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
