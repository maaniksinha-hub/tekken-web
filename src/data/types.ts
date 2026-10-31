export type Button = "lp" | "rp" | "lk" | "rk"; // Tekken 1, 2, 3, 4
export const BUTTONS: Button[] = ["lp", "rp", "lk", "rk"];

/** All times are in simulation frames (60 per second). */
export interface MoveData {
  name: string;
  startup: number; // frames before the hit can connect
  active: number; // frames the hit can connect
  recovery: number; // frames of vulnerability afterwards
  damage: number;
  reach: number; // world units in front of the fighter
  hitstun: number; // frames the defender is stunned on hit
  blockstun: number; // frames the defender is stunned on block
  pushback: number; // world units the defender slides back
}

/**
 * A character is pure data. To add a custom character, add one of these to
 * `characters` (src/data/characters.ts) - no engine code changes required.
 */
export interface CharacterData {
  id: string;
  name: string;
  maxHp: number;
  walkSpeed: number; // units per frame, forward
  backSpeed: number; // units per frame, backward
  sidestepSpeed: number; // units per frame
  moves: Record<Button, MoveData>;
  look: {
    /** "procedural" builds a placeholder body; otherwise a .glb URL (see ASSETS.md). */
    model: "procedural" | string;
    color: string;
    accent: string;
  };
}
