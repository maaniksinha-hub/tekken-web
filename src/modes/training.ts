import { BUTTONS } from "../data/types";
import type { Driver } from "../driver";
import { createCpu, type CpuPlayer } from "../sim/ai";
import { emptyInput, ROUND_FRAMES, step, type Fighter, type GameState, type InputFrame } from "../sim/game";

/** Training room: a dummy to hit, endless health, and readouts for frame advantage and combo damage. */

export type DummyMode = "stand" | "crouch" | "block" | "crouchblock" | "cpu";
export const DUMMY_MODES: DummyMode[] = ["stand", "crouch", "block", "crouchblock", "cpu"];
export const DUMMY_LABEL: Record<DummyMode, string> = {
  stand: "Stand still", crouch: "Crouch", block: "Block high/mid", crouchblock: "Block low", cpu: "CPU (easy)",
};

export interface TrainingStats {
  lastDamage: number;
  comboHits: number;
  comboDamage: number;
  /** Frame advantage of the last move for the attacker (positive = attacker acts first). */
  advantage: number | null;
  advantageOn: "hit" | "block" | null;
  lastMove: string;
}

export interface TrainingDriver extends Driver {
  dummy: DummyMode;
  stats: TrainingStats;
  /** Recent player inputs, newest last, for the on-screen input display. */
  history: string[];
  resetPositions(): void;
}

export const inputLabel = (i: InputFrame): string => {
  const d = (i.z > 0 ? "↑" : i.z < 0 ? "↓" : "") + (i.x < 0 ? "←" : i.x > 0 ? "→" : "");
  const b = BUTTONS.filter((k) => i.buttons[k]).map((k) => ({ lp: "1", rp: "2", lk: "3", rk: "4" }[k])).join("+");
  return [d, b].filter(Boolean).join(" ") || "·";
};

export function dummyInput(mode: DummyMode, dummy: Fighter): InputFrame {
  const i = emptyInput();
  // The dummy stands on the right facing left, so "back" is +x.
  const back = (dummy.facing === 1 ? -1 : 1) as -1 | 1;
  if (mode === "crouch") i.z = -1;
  if (mode === "block") i.x = back;
  if (mode === "crouchblock") { i.x = back; i.z = -1; }
  return i;
}

export function trainingDriver(game: GameState, readP1: () => InputFrame): TrainingDriver {
  let cpu: CpuPlayer | null = null;
  let lastHitFrame = -1;
  let idleFrames = 0;
  const d: TrainingDriver = {
    game,
    dummy: "stand",
    stats: { lastDamage: 0, comboHits: 0, comboDamage: 0, advantage: null, advantageOn: null, lastMove: "" },
    history: [],
    resetPositions() {
      game.fighters[0].x = -1.5; game.fighters[1].x = 1.5;
      for (const f of game.fighters) { f.z = 0; f.hp = f.char.maxHp; }
    },
    step() {
      const [p1, p2] = game.fighters;
      const in1 = readP1();
      if (d.history.length === 0 || d.history[d.history.length - 1] !== inputLabel(in1)) {
        d.history.push(inputLabel(in1));
        if (d.history.length > 14) d.history.shift();
      }
      if (d.dummy === "cpu") cpu ??= createCpu(1, "easy", 7);
      const in2 = d.dummy === "cpu" && cpu ? cpu.next(game) : dummyInput(d.dummy, p2);

      const hpBefore = p2.hp;
      const hitDoneBefore = p1.hitDone;
      step(game, [in1, in2]);

      // Damage / combo tracking on the dummy.
      const dealt = hpBefore - p2.hp;
      if (dealt > 0) {
        d.stats.lastDamage = dealt;
        d.stats.comboHits += 1;
        d.stats.comboDamage += dealt;
        lastHitFrame = game.tick;
      }
      // Frame advantage the moment a move connects (hit or block).
      if (!hitDoneBefore && p1.hitDone && p1.activeMove && (p2.state === "hitstun" || p2.state === "blockstun")) {
        const m = p1.activeMove;
        const remaining = m.startup + m.active + m.recovery - p1.frame;
        d.stats.advantage = p2.stun - remaining;
        d.stats.advantageOn = p2.state === "blockstun" ? "block" : "hit";
        d.stats.lastMove = m.name;
      }
      // The combo counter resets once the dummy is free again.
      const free = p2.state === "idle" || p2.state === "walk";
      idleFrames = free ? idleFrames + 1 : 0;
      if (idleFrames > 30 && game.tick - lastHitFrame > 30) { d.stats.comboHits = 0; d.stats.comboDamage = 0; }

      // Endless health and time, and no KOs: top up whenever a fighter is not mid-combo.
      game.timer = ROUND_FRAMES;
      for (const f of game.fighters) {
        if (f.hp < f.char.maxHp * 0.15 || (f.state !== "hitstun" && f.state !== "juggle" && f.state !== "thrown" && f.state !== "blockstun" && f.hp < f.char.maxHp && game.tick - lastHitFrame > 45)) {
          f.hp = f.char.maxHp;
        }
        if (f.state === "ko") { f.state = "idle"; f.hp = f.char.maxHp; }
      }
      if (game.phase !== "fight") { game.phase = "fight"; game.phaseFrame = 100; game.winner = null; }
    },
    destroy() {},
  };
  d.resetPositions();
  return d;
}
