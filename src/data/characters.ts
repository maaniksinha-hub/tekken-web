import type { CharacterData, MoveData } from "./types";

// Original placeholder fighters. Names and move stats are our own.

const move = (m: Omit<MoveData, "height"> & { height?: MoveData["height"] }): MoveData => ({ height: "mid", ...m });

/** A standard grounded throw. Break it by pressing the matching button (1 or 2) quickly. */
const throwMove = (name: string, damage: number, startup = 12): MoveData =>
  move({ name, throw: true, startup, active: 2, recovery: 30, damage, reach: 1.3, hitstun: 0, blockstun: 0, pushback: 0 });

export const characters: CharacterData[] = [
  {
    id: "kai",
    name: "KAI",
    maxHp: 180,
    walkSpeed: 0.035,
    backSpeed: 0.025,
    sidestepSpeed: 0.03,
    moves: {
      lp: move({
        name: "Jab", height: "high", startup: 10, active: 3, recovery: 12, damage: 8, reach: 1.5, hitstun: 16, blockstun: 9, pushback: 0.15,
        next: [{
          button: "rp",
          move: move({
            name: "Jab-Straight", height: "high", startup: 8, active: 3, recovery: 14, damage: 12, reach: 1.6, hitstun: 18, blockstun: 10, pushback: 0.2,
            next: [{ button: "rk", move: move({ name: "Jab-Straight-Kick", startup: 9, active: 4, recovery: 26, damage: 18, reach: 2.0, hitstun: 24, blockstun: 12, pushback: 0.7 }) }],
          }),
        }],
      }),
      rp: move({ name: "Straight", height: "high", startup: 13, active: 3, recovery: 16, damage: 14, reach: 1.6, hitstun: 18, blockstun: 10, pushback: 0.3 }),
      lk: move({ name: "Front kick", startup: 14, active: 4, recovery: 18, damage: 16, reach: 1.9, hitstun: 20, blockstun: 12, pushback: 0.4 }),
      rk: move({ name: "Roundhouse", startup: 18, active: 4, recovery: 24, damage: 24, reach: 2.0, hitstun: 26, blockstun: 14, pushback: 0.7 }),
    },
    specials: [
      { notation: "d/f+2", move: move({ name: "Uppercut", launch: true, startup: 16, active: 3, recovery: 26, damage: 20, reach: 1.4, hitstun: 24, blockstun: 12, pushback: 0.4,
          next: [{ button: "lk", move: move({ name: "Juggle kick", startup: 8, active: 4, recovery: 22, damage: 14, reach: 1.7, hitstun: 20, blockstun: 12, pushback: 0.3 }) }] }) },
      { notation: "d+4", move: move({ name: "Low sweep", height: "low", startup: 18, active: 4, recovery: 24, damage: 12, reach: 1.9, hitstun: 22, blockstun: 10, pushback: 0.4 }) },
      { notation: "f,f+1", move: move({ name: "Dash jab", startup: 15, active: 3, recovery: 20, damage: 14, reach: 1.8, hitstun: 20, blockstun: 11, pushback: 0.4 }) },
    ],
    throws: [throwMove("Shoulder throw", 28), throwMove("Back throw", 32)],
    rageArt: move({ name: "Iron Fist Art", unblockable: true, launch: true, startup: 22, active: 3, recovery: 40, damage: 48, reach: 1.9, hitstun: 30, blockstun: 0, pushback: 0.6 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 14, active: 3, recovery: 22, damage: 10, reach: 1.7, hitstun: 22, blockstun: 0, pushback: 0.5 }),
    look: { model: "procedural", color: "#3b6fd4", accent: "#f5c542" },
  },
  {
    id: "rin",
    name: "RIN",
    maxHp: 170,
    walkSpeed: 0.04,
    backSpeed: 0.028,
    sidestepSpeed: 0.034,
    moves: {
      lp: move({
        name: "Quick jab", height: "high", startup: 9, active: 3, recovery: 11, damage: 7, reach: 1.4, hitstun: 15, blockstun: 8, pushback: 0.12,
        next: [{ button: "lp", move: move({ name: "Double jab", height: "high", startup: 7, active: 3, recovery: 14, damage: 8, reach: 1.4, hitstun: 16, blockstun: 9, pushback: 0.15,
          next: [{ button: "lk", move: move({ name: "Jab-Jab-Low", height: "low", startup: 10, active: 4, recovery: 22, damage: 12, reach: 1.8, hitstun: 20, blockstun: 10, pushback: 0.3 }) }] }) }],
      }),
      rp: move({ name: "Hook", height: "high", startup: 14, active: 3, recovery: 17, damage: 15, reach: 1.5, hitstun: 19, blockstun: 10, pushback: 0.3 }),
      lk: move({ name: "Low-line kick", height: "low", startup: 12, active: 4, recovery: 17, damage: 14, reach: 1.9, hitstun: 19, blockstun: 11, pushback: 0.35 }),
      rk: move({ name: "Spin kick", startup: 20, active: 4, recovery: 26, damage: 28, reach: 2.1, hitstun: 28, blockstun: 15, pushback: 0.8 }),
    },
    specials: [
      { notation: "d/f+1", move: move({ name: "Rising palm", launch: true, startup: 14, active: 3, recovery: 24, damage: 16, reach: 1.3, hitstun: 22, blockstun: 11, pushback: 0.35,
          next: [{ button: "rp", move: move({ name: "Palm follow-up", startup: 8, active: 3, recovery: 22, damage: 12, reach: 1.5, hitstun: 20, blockstun: 11, pushback: 0.3 }) }] }) },
      { notation: "d+3", move: move({ name: "Shin kick", height: "low", startup: 15, active: 4, recovery: 20, damage: 10, reach: 1.8, hitstun: 20, blockstun: 9, pushback: 0.3 }) },
      { notation: "f,f+2", move: move({ name: "Lunge hook", startup: 17, active: 3, recovery: 22, damage: 18, reach: 1.9, hitstun: 22, blockstun: 12, pushback: 0.5 }) },
    ],
    throws: [throwMove("Hip throw", 26, 11), throwMove("Spin throw", 30, 11)],
    rageArt: move({ name: "Crimson Art", unblockable: true, launch: true, startup: 20, active: 3, recovery: 38, damage: 46, reach: 2.0, hitstun: 30, blockstun: 0, pushback: 0.6 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 13, active: 3, recovery: 22, damage: 10, reach: 1.8, hitstun: 22, blockstun: 0, pushback: 0.5 }),
    look: { model: "procedural", color: "#d4453b", accent: "#ffffff" },
  },
];
