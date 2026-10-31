import type { CharacterData } from "../data/types";
import type { Difficulty } from "../sim/ai";
import { mulberry32 } from "../sim/ai";
import type { GameState } from "../sim/game";

/** Arcade ladder: beat every opponent in a row. Pure logic so it is easy to test. */

export interface LadderStep {
  opponent: CharacterData;
  difficulty: Difficulty;
  boss: boolean;
}

const RAMP: Difficulty[] = ["easy", "normal", "normal", "hard", "hard"];

/** A darker, tougher copy of the player's character: the final boss. */
export function shadowOf(c: CharacterData): CharacterData {
  return {
    ...c,
    id: `${c.id}-shadow`,
    name: `SHADOW ${c.name}`.slice(0, 14),
    maxHp: Math.round(c.maxHp * 1.2),
    look: { ...c.look, model: "procedural", color: "#1b1b24", accent: "#ff3b30" },
  };
}

export function buildLadder(player: CharacterData, roster: CharacterData[], seed: number, length = 5): LadderStep[] {
  const rand = mulberry32(seed);
  const others = roster.filter((c) => c.id !== player.id);
  // Fisher-Yates shuffle with the seeded generator so a run is reproducible.
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const steps: LadderStep[] = [];
  for (let i = 0; i < length - 1; i++) {
    steps.push({ opponent: others[i % Math.max(1, others.length)] ?? player, difficulty: RAMP[Math.min(i, RAMP.length - 1)], boss: false });
  }
  steps.push({ opponent: shadowOf(player), difficulty: "hard", boss: true });
  return steps;
}

/** Points for winning a stage: base by stage, plus health and time bonuses, plus a perfect-round bonus. */
export function stageScore(game: GameState, stageIndex: number, continuesUsed: number): number {
  const me = game.fighters[0];
  const base = 1000 * (stageIndex + 1);
  const health = Math.round((me.hp / me.char.maxHp) * 500);
  const time = Math.round((game.timer / 60) * 5);
  const perfect = me.hp === me.char.maxHp ? 1500 : 0;
  return Math.max(0, base + health + time + perfect - continuesUsed * 400);
}

const KEY = "tekken-web.arcade.best.v1";

export function loadBest(): number {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}

/** Saves the score if it is a new best; returns whether it was. */
export function saveBest(score: number): boolean {
  if (score <= loadBest()) return false;
  try { localStorage.setItem(KEY, String(score)); } catch { /* storage unavailable */ }
  return true;
}

export const MAX_CONTINUES = 3;
