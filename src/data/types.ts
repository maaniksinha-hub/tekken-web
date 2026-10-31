export type Button = "lp" | "rp" | "lk" | "rk"; // Tekken 1, 2, 3, 4
export const BUTTONS: Button[] = ["lp", "rp", "lk", "rk"];

export type Height = "high" | "mid" | "low";

/** All times are in simulation frames (60 per second). */
export interface MoveData {
  name: string;
  height: Height; // high: ducked by crouching; low: must be blocked crouching; mid: must be blocked standing
  startup: number; // frames before the hit can connect
  active: number; // frames the hit can connect
  recovery: number; // frames of vulnerability afterwards
  damage: number;
  reach: number; // world units in front of the fighter
  hitstun: number; // frames the defender is stunned on hit
  blockstun: number; // frames the defender is stunned on block
  pushback: number; // world units the defender slides back
  /** Sends a grounded defender into a juggle. */
  launch?: boolean;
  /** A throw: grounded targets only, ignores blocking, can be broken (see `throws`). */
  throw?: boolean;
  /** Cannot be blocked (Rage Art, heat engage). */
  unblockable?: boolean;
  /**
   * String follow-ups ("1,2,3"): after this move connects, pressing `button` during the
   * cancel window starts `move` immediately.
   */
  next?: { button: Button; move: MoveData }[];
}

/**
 * A character is pure data. To add a custom character, add one of these to
 * `characters` (src/data/characters.ts) - no engine code changes required.
 * See ASSETS.md and `npm run validate-characters`.
 */
export interface CharacterData {
  id: string;
  name: string;
  maxHp: number;
  walkSpeed: number; // units per frame, forward
  backSpeed: number; // units per frame, backward
  sidestepSpeed: number; // units per frame
  moves: Record<Button, MoveData>;
  /** Move-list entries triggered by a notation string, e.g. "d/f+2" (see src/sim/inputs.ts). */
  specials: { notation: string; move: MoveData }[];
  /** Throws: [1+3 (broken with 1), 2+4 (broken with 2)]. */
  throws: [MoveData, MoveData];
  /** Rage Art: 1+2 while Rage is active (below 25% health), once per round. */
  rageArt: MoveData;
  /** Heat Engage: 3+4, once per round, starts Heat. */
  heatEngage: MoveData;
  look: {
    /** "procedural" builds a placeholder body; otherwise a .glb URL (see ASSETS.md). */
    model: "procedural" | string;
    color: string;
    accent: string;
    /** Extra yaw (radians) for GLB models that do not face +z. */
    yaw?: number;
    /** Optional height in world units the model is scaled to (default 1.85). */
    height?: number;
  };
}
