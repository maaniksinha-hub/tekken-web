import { BUTTONS, type Button, type MoveData } from "../data/types";
import { emptyInput, inRage, type Fighter, type GameState, type InputFrame } from "./game";

/**
 * CPU opponent. It only sees the same GameState a human could read off the screen and returns an
 * InputFrame, exactly like a controller. All randomness comes from a seeded generator, so a match
 * with the same seeds always plays out the same way.
 */

export type Difficulty = "easy" | "normal" | "hard";

interface Profile {
  /** Frames between decisions (reaction time). */
  think: number;
  /** Chance to block an attack it sees coming. */
  block: number;
  /** Chance to attack when in range, per decision. */
  aggression: number;
  /** Chance to use specials / throws / strings. */
  variety: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { think: 22, block: 0.25, aggression: 0.35, variety: 0.15 },
  normal: { think: 14, block: 0.55, aggression: 0.5, variety: 0.35 },
  hard: { think: 8, block: 0.8, aggression: 0.65, variety: 0.55 },
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const btn = (...bs: Button[]) => {
  const o = emptyInput();
  for (const b of bs) o.buttons[b] = true;
  return o.buttons;
};

export interface CpuPlayer {
  /** Returns the input for this frame. Call once per simulation step. */
  next(g: GameState): InputFrame;
}

export function createCpu(side: 0 | 1, difficulty: Difficulty = "normal", seed = 1): CpuPlayer {
  const p = PROFILES[difficulty];
  const rand = mulberry32(seed * 7919 + side);
  const queue: InputFrame[] = []; // scripted frames (motions)
  let cooldown = 0;
  let mode: "approach" | "hold" | "retreat" | "block" | "crouchBlock" = "approach";
  let modeFrames = 0;

  const dir = (f: Fighter, rel: -1 | 0 | 1): -1 | 0 | 1 => (rel * f.facing) as -1 | 0 | 1;
  const reachOf = (f: Fighter) => {
    const ms: MoveData[] = [...Object.values(f.char.moves), ...f.char.specials.map((s) => s.move)];
    return ms.reduce((a, m) => Math.max(a, m.reach), 0);
  };

  /** Scripts for a chosen attack. Directions are relative to facing and converted here. */
  function script(f: Fighter, kind: string): InputFrame[] {
    const mk = (rel: -1 | 0 | 1, z: -1 | 0 | 1, ...bs: Button[]): InputFrame => ({ x: dir(f, rel), z, buttons: btn(...bs) });
    switch (kind) {
      case "lp": case "rp": case "lk": case "rk":
        return [mk(0, 0, kind as Button)];
      case "string": // 1, then 2 shortly after (follow-ups only fire if the first connected)
        return [mk(0, 0, "lp"), ...Array(13).fill(mk(0, 0)), mk(0, 0, "rp")];
      case "special0": // d/f + 2 (KAI uppercut) / d/f + 1 (RIN palm)
        return [mk(1, -1, f.char.id === "rin" ? "lp" : "rp")];
      case "low":
        return [mk(0, -1, f.char.id === "rin" ? "lk" : "rk")];
      case "dash":
        return [mk(1, 0), mk(0, 0), mk(1, 0, f.char.id === "rin" ? "rp" : "lp")];
      case "throw":
        return [mk(0, 0, "lp", "lk")];
      case "throw2":
        return [mk(0, 0, "rp", "rk")];
      case "rage":
        return [mk(0, 0, "lp", "rp")];
      case "heat":
        return [mk(0, 0, "lk", "rk")];
      default:
        return [mk(0, 0)];
    }
  }

  return {
    next(g) {
      const me = g.fighters[side];
      const foe = g.fighters[side === 0 ? 1 : 0];
      if (g.phase !== "fight" || me.state === "ko") return emptyInput();

      if (queue.length > 0) return queue.shift() as InputFrame;
      const idle = emptyInput();
      const dist = Math.abs(foe.x - me.x);
      const threat = foe.state === "attack" && foe.activeMove && dist < foe.activeMove.reach + 0.6;

      // Reactions: only on think ticks, so difficulty controls how often it reads the opponent.
      const tick = g.tick % p.think === 0;
      if (tick || mode === "block" || mode === "crouchBlock") {
        modeFrames -= 1;
        if (tick) {
          cooldown = Math.max(0, cooldown - 1);
          if (threat && rand() < p.block) {
            mode = foe.activeMove?.height === "low" ? "crouchBlock" : "block";
            modeFrames = 1;
          } else if (modeFrames <= 0) {
            mode = "approach";
          }
        }
      }
      if (mode === "block" || mode === "crouchBlock") {
        if (!threat && foe.state !== "blockstun") mode = "approach";
        else return { x: dir(me, -1), z: mode === "crouchBlock" ? -1 : 0, buttons: idle.buttons };
      }

      if (!tick) {
        const m = me.state === "attack" ? 0 : mode === "retreat" ? -1 : mode === "approach" && dist > 1.4 ? 1 : 0;
        return { x: dir(me, m as -1 | 0 | 1), z: 0, buttons: idle.buttons };
      }

      // Decide an action on this think tick.
      if (me.state !== "idle" && me.state !== "walk") return idle;
      if (foe.state === "knockdown") return { x: dir(me, 1), z: 0, buttons: idle.buttons }; // walk up for the wake-up

      if (inRage(me) && !me.rageArtUsed && dist < 1.8) { queue.push(...script(me, "rage")); return idle; }
      if (!me.heatUsed && me.hp / me.char.maxHp < 0.7 && dist < 1.6 && rand() < 0.2) { queue.push(...script(me, "heat")); return idle; }

      const reach = reachOf(me);
      if (dist > reach + 0.3) { mode = "approach"; modeFrames = 4; return { x: dir(me, 1), z: 0, buttons: idle.buttons }; }

      if (foe.state === "blockstun" && rand() < 0.5 * p.variety + 0.2 && dist < 1.25) {
        queue.push(...script(me, rand() < 0.5 ? "throw" : "throw2")); // throw a blocker
        return idle;
      }
      if (rand() < p.aggression) {
        const r = rand();
        let kind: string;
        if (r < p.variety * 0.25) kind = "string";
        else if (r < p.variety * 0.45) kind = "special0";
        else if (r < p.variety * 0.6) kind = "low";
        else if (r < p.variety * 0.7) kind = "dash";
        else kind = BUTTONS[Math.floor(rand() * 4)];
        // Pick something that can reach.
        if (dist > 2.0 && kind !== "dash") kind = "rk";
        queue.push(...script(me, kind));
        return idle;
      }
      if (rand() < 0.2) { mode = "retreat"; modeFrames = 6; }
      else if (rand() < 0.15) return { x: 0, z: rand() < 0.5 ? 1 : -1, buttons: idle.buttons }; // sidestep
      return idle;
    },
  };
}
