import { BUTTONS, type Button } from "../data/types";

/**
 * Input buffer + Tekken-style notation parser.
 *
 * Notation: steps separated by "," (in order), parts of one step joined by "+" (together).
 *   "d/f+2"  down-forward held while 2 is pressed
 *   "f,f+1"  forward, then forward + 1
 *   "d+4"    down + 4
 * Directions are relative to the way the fighter faces: f forward, b back, d down, u up,
 * d/f, d/b, u/f, u/b diagonals, n neutral.
 */

/** Numpad directions: 7 8 9 / 4 5 6 / 1 2 3, where 6 = forward. */
export type Dir = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface BufferFrame {
  dir: Dir;
  pressed: Button[]; // buttons that went down on this frame
  held: Button[];
}

export interface Step {
  dir: Dir | null;
  buttons: Button[];
}

export const BUFFER_FRAMES = 30;
/** A final button press counts for this many frames, so slightly early direction input still works. */
export const PRESS_WINDOW = 4;
/** Each earlier step must happen within this many frames of the next one. */
export const STEP_WINDOW = 14;

const DIRS: Record<string, Dir> = {
  "d/b": 1, d: 2, "d/f": 3, b: 4, n: 5, f: 6, "u/b": 7, u: 8, "u/f": 9,
};

export function toDir(fwd: -1 | 0 | 1, vert: -1 | 0 | 1): Dir {
  // vert: -1 down, +1 up. fwd: +1 toward the opponent.
  return (5 + fwd + vert * 3) as Dir;
}

export function parseNotation(notation: string): Step[] {
  return notation
    .toLowerCase()
    .replace(/\s+/g, "")
    .split(",")
    .map((part) => {
      let dir: Dir | null = null;
      const buttons: Button[] = [];
      for (const tok of part.split("+")) {
        if (tok in DIRS) {
          dir = DIRS[tok];
        } else if (/^[1-4]$/.test(tok)) {
          buttons.push(BUTTONS[Number(tok) - 1]);
        } else {
          throw new Error(`Bad notation token "${tok}" in "${notation}"`);
        }
      }
      if (dir === null && buttons.length === 0) throw new Error(`Empty step in "${notation}"`);
      return { dir, buttons };
    });
}

export class InputBuffer {
  private frames: BufferFrame[] = [];

  push(frame: BufferFrame): void {
    this.frames.push(frame);
    if (this.frames.length > BUFFER_FRAMES) this.frames.shift();
  }

  clear(): void {
    this.frames = [];
  }

  /** Does the most recent input complete `steps`? */
  matches(steps: Step[]): boolean {
    if (steps.length === 0) return false;
    const stepOk = (f: BufferFrame, s: Step) =>
      (s.dir === null || f.dir === s.dir) &&
      s.buttons.every((b) => f.held.includes(b)) &&
      (s.buttons.length === 0 || s.buttons.some((b) => f.pressed.includes(b)));

    // Final step: must be satisfied recently.
    const last = steps[steps.length - 1];
    let idx = -1;
    for (let i = this.frames.length - 1; i >= Math.max(0, this.frames.length - PRESS_WINDOW); i--) {
      if (stepOk(this.frames[i], last)) { idx = i; break; }
    }
    if (idx < 0) return false;

    // Earlier steps, walking backwards in order.
    for (let s = steps.length - 2; s >= 0; s--) {
      let found = -1;
      const next = steps[s + 1];
      // "f,f": the same direction twice needs a release in between, or holding f would count.
      const needsGap = steps[s].dir !== null && steps[s].buttons.length === 0 && steps[s].dir === next.dir;
      for (let i = idx - 1; i >= Math.max(0, idx - STEP_WINDOW); i--) {
        if (!stepOk(this.frames[i], steps[s])) continue;
        const gap = this.frames.slice(i + 1, idx).some((fr) => fr.dir !== steps[s].dir);
        if (!needsGap || gap) { found = i; break; }
      }
      if (found < 0) return false;
      idx = found;
    }
    return true;
  }
}
