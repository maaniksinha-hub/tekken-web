import type { GameState } from "./sim/game";

/** Something that advances the match by exactly one 60 Hz frame (local, CPU or online). */
export interface Driver {
  /** A getter for online play: rollback replaces the state object. */
  readonly game: GameState;
  step(): void;
  destroy(): void;
  /** Set when the other player left (online). */
  closed?: boolean;
  /** Short status line for the HUD (e.g. "Desync detected"). */
  status?: string;
}
