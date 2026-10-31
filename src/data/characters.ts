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
    maxHp: 155,
    walkSpeed: 0.04,
    backSpeed: 0.028,
    sidestepSpeed: 0.034,
    moves: {
      lp: move({
        name: "Quick jab", height: "high", startup: 9, active: 3, recovery: 11, damage: 6, reach: 1.4, hitstun: 14, blockstun: 8, pushback: 0.12,
        next: [{ button: "lp", move: move({ name: "Double jab", height: "high", startup: 7, active: 3, recovery: 14, damage: 6, reach: 1.4, hitstun: 16, blockstun: 9, pushback: 0.15,
          next: [{ button: "lk", move: move({ name: "Jab-Jab-Low", height: "low", startup: 10, active: 4, recovery: 22, damage: 12, reach: 1.8, hitstun: 20, blockstun: 10, pushback: 0.3 }) }] }) }],
      }),
      rp: move({ name: "Hook", height: "high", startup: 14, active: 3, recovery: 17, damage: 13, reach: 1.5, hitstun: 19, blockstun: 10, pushback: 0.3 }),
      lk: move({ name: "Low-line kick", height: "low", startup: 13, active: 4, recovery: 19, damage: 11, reach: 1.9, hitstun: 19, blockstun: 11, pushback: 0.35 }),
      rk: move({ name: "Spin kick", startup: 20, active: 4, recovery: 26, damage: 23, reach: 2.1, hitstun: 28, blockstun: 15, pushback: 0.8 }),
    },
    specials: [
      { notation: "d/f+1", move: move({ name: "Rising palm", launch: true, startup: 14, active: 3, recovery: 24, damage: 14, reach: 1.3, hitstun: 22, blockstun: 11, pushback: 0.35,
          next: [{ button: "rp", move: move({ name: "Palm follow-up", startup: 8, active: 3, recovery: 22, damage: 12, reach: 1.5, hitstun: 20, blockstun: 11, pushback: 0.3 }) }] }) },
      { notation: "d+3", move: move({ name: "Shin kick", height: "low", startup: 15, active: 4, recovery: 20, damage: 10, reach: 1.8, hitstun: 20, blockstun: 9, pushback: 0.3 }) },
      { notation: "f,f+2", move: move({ name: "Lunge hook", startup: 17, active: 3, recovery: 22, damage: 18, reach: 1.9, hitstun: 22, blockstun: 12, pushback: 0.5 }) },
    ],
    throws: [throwMove("Hip throw", 26, 11), throwMove("Spin throw", 30, 11)],
    rageArt: move({ name: "Crimson Art", unblockable: true, launch: true, startup: 20, active: 3, recovery: 38, damage: 46, reach: 2.0, hitstun: 30, blockstun: 0, pushback: 0.6 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 13, active: 3, recovery: 22, damage: 10, reach: 1.8, hitstun: 22, blockstun: 0, pushback: 0.5 }),
    look: { model: "procedural", color: "#d4453b", accent: "#ffffff" },
  },

  {
    id: "mira",
    name: "MIRA",
    maxHp: 185,
    walkSpeed: 0.046,
    backSpeed: 0.03,
    sidestepSpeed: 0.04,
    moves: {
      lp: move({
        name: "Flick jab", height: "high", startup: 8, active: 3, recovery: 10, damage: 8, reach: 1.3, hitstun: 15, blockstun: 8, pushback: 0.1,
        next: [{ button: "rp", move: move({ name: "Flick-Cross", height: "high", startup: 7, active: 3, recovery: 14, damage: 13, reach: 1.4, hitstun: 17, blockstun: 9, pushback: 0.15 }) }],
      }),
      rp: move({ name: "Cross", height: "high", startup: 12, active: 3, recovery: 15, damage: 16, reach: 1.45, hitstun: 18, blockstun: 10, pushback: 0.25 }),
      lk: move({ name: "Snap kick", startup: 11, active: 4, recovery: 15, damage: 16, reach: 1.7, hitstun: 18, blockstun: 10, pushback: 0.3 }),
      rk: move({ name: "Axe kick", startup: 17, active: 4, recovery: 22, damage: 29, reach: 1.9, hitstun: 25, blockstun: 13, pushback: 0.6 }),
    },
    specials: [
      { notation: "d/f+1", move: move({ name: "Hop kick", launch: true, startup: 13, active: 3, recovery: 24, damage: 19, reach: 1.5, hitstun: 22, blockstun: 11, pushback: 0.3 }) },
      { notation: "d+3", move: move({ name: "Toe sweep", height: "low", startup: 12, active: 4, recovery: 18, damage: 13, reach: 1.7, hitstun: 19, blockstun: 8, pushback: 0.25 }) },
      { notation: "f,f+4", move: move({ name: "Rushing kick", startup: 16, active: 4, recovery: 22, damage: 24, reach: 2.1, hitstun: 22, blockstun: 11, pushback: 0.5 }) },
    ],
    throws: [throwMove("Cartwheel throw", 24, 11), throwMove("Sweep throw", 27, 11)],
    rageArt: move({ name: "Tempest Art", unblockable: true, launch: true, startup: 18, active: 3, recovery: 36, damage: 45, reach: 1.9, hitstun: 30, blockstun: 0, pushback: 0.6 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 12, active: 3, recovery: 20, damage: 10, reach: 1.7, hitstun: 22, blockstun: 0, pushback: 0.5 }),
    look: { model: "procedural", color: "#3bb273", accent: "#f2f2f2" },
  },
  {
    id: "bruno",
    name: "BRUNO",
    maxHp: 215,
    walkSpeed: 0.04,
    backSpeed: 0.022,
    sidestepSpeed: 0.024,
    moves: {
      lp: move({ name: "Heavy jab", height: "high", startup: 11, active: 3, recovery: 14, damage: 13, reach: 1.52, hitstun: 17, blockstun: 10, pushback: 0.25 }),
      rp: move({
        name: "Haymaker", height: "high", startup: 15, active: 3, recovery: 19, damage: 23, reach: 1.62, hitstun: 22, blockstun: 12, pushback: 0.5,
        next: [{ button: "lp", move: move({ name: "Haymaker-Elbow", startup: 10, active: 3, recovery: 22, damage: 16, reach: 1.32, hitstun: 22, blockstun: 12, pushback: 0.4 }) }],
      }),
      lk: move({ name: "Stomp kick", startup: 16, active: 4, recovery: 22, damage: 20, reach: 1.82, hitstun: 24, blockstun: 13, pushback: 0.5 }),
      rk: move({ name: "Wrecking kick", startup: 22, active: 4, recovery: 30, damage: 32, reach: 1.92, hitstun: 30, blockstun: 16, pushback: 0.9 }),
    },
    specials: [
      { notation: "d/f+2", move: move({ name: "Gut punch", launch: true, startup: 19, active: 3, recovery: 28, damage: 24, reach: 1.42, hitstun: 26, blockstun: 13, pushback: 0.5 }) },
      { notation: "d+4", move: move({ name: "Leg kick", height: "low", startup: 20, active: 4, recovery: 26, damage: 14, reach: 1.82, hitstun: 24, blockstun: 11, pushback: 0.45 }) },
      { notation: "f,f+2", move: move({ name: "Charging elbow", startup: 18, active: 4, recovery: 26, damage: 24, reach: 1.72, hitstun: 26, blockstun: 14, pushback: 0.7 }) },
    ],
    throws: [throwMove("Bear hug", 36, 13), throwMove("Piledriver", 42, 13)],
    rageArt: move({ name: "Colossus Art", unblockable: true, launch: true, startup: 25, active: 3, recovery: 44, damage: 56, reach: 1.92, hitstun: 32, blockstun: 0, pushback: 0.7 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 15, active: 3, recovery: 24, damage: 12, reach: 1.72, hitstun: 24, blockstun: 0, pushback: 0.6 }),
    look: { model: "procedural", color: "#8a5a2b", accent: "#e8d9b0" },
  },

  {
    id: "nova",
    name: "NOVA",
    maxHp: 155,
    walkSpeed: 0.038,
    backSpeed: 0.032,
    sidestepSpeed: 0.034,
    moves: {
      lp: move({ name: "Long jab", height: "high", startup: 10, active: 3, recovery: 12, damage: 7, reach: 1.42, hitstun: 15, blockstun: 9, pushback: 0.2,
        next: [{ button: "rk", move: move({ name: "Jab-Whip kick", startup: 11, active: 4, recovery: 24, damage: 15, reach: 1.92, hitstun: 22, blockstun: 12, pushback: 0.6 }) }] }),
      rp: move({ name: "Lance", height: "high", startup: 14, active: 3, recovery: 17, damage: 13, reach: 1.67, hitstun: 18, blockstun: 10, pushback: 0.4 }),
      lk: move({ name: "Reach kick", startup: 15, active: 4, recovery: 19, damage: 15, reach: 1.92, hitstun: 20, blockstun: 12, pushback: 0.5 }),
      rk: move({ name: "Whip kick", startup: 20, active: 4, recovery: 26, damage: 23, reach: 2.1, hitstun: 26, blockstun: 14, pushback: 0.8 }),
    },
    specials: [
      { notation: "d/f+3", move: move({ name: "Skyfall kick", launch: true, startup: 17, active: 3, recovery: 28, damage: 17, reach: 1.51, hitstun: 24, blockstun: 12, pushback: 0.4 }) },
      { notation: "d+4", move: move({ name: "Long sweep", height: "low", startup: 19, active: 4, recovery: 24, damage: 12, reach: 1.85, hitstun: 22, blockstun: 10, pushback: 0.4 }) },
      { notation: "f,f+3", move: move({ name: "Glide kick", startup: 20, active: 4, recovery: 24, damage: 19, reach: 2.02, hitstun: 24, blockstun: 12, pushback: 0.6 }) },
    ],
    throws: [throwMove("Flip throw", 24, 12), throwMove("Drop throw", 28, 12)],
    rageArt: move({ name: "Comet Art", unblockable: true, launch: true, startup: 22, active: 3, recovery: 38, damage: 42, reach: 1.85, hitstun: 30, blockstun: 0, pushback: 0.6 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 14, active: 3, recovery: 22, damage: 10, reach: 1.6, hitstun: 22, blockstun: 0, pushback: 0.5 }),
    look: { model: "procedural", color: "#2fb7d6", accent: "#ffd86b" },
  },
  {
    id: "grim",
    name: "GRIM",
    maxHp: 213,
    walkSpeed: 0.03,
    backSpeed: 0.022,
    sidestepSpeed: 0.025,
    moves: {
      lp: move({ name: "Hammer jab", height: "high", startup: 10, active: 3, recovery: 13, damage: 10, reach: 1.55, hitstun: 16, blockstun: 10, pushback: 0.25 }),
      rp: move({ name: "Wrecking punch", height: "high", startup: 14, active: 3, recovery: 20, damage: 20, reach: 1.66, hitstun: 22, blockstun: 12, pushback: 0.5 }),
      lk: move({ name: "Knee", startup: 13, active: 4, recovery: 20, damage: 16, reach: 1.66, hitstun: 22, blockstun: 12, pushback: 0.35 }),
      rk: move({ name: "Heavy kick", startup: 19, active: 4, recovery: 28, damage: 27, reach: 1.87, hitstun: 28, blockstun: 15, pushback: 0.85 }),
    },
    specials: [
      { notation: "d/f+1", move: move({ name: "Slam launcher", launch: true, startup: 12, active: 3, recovery: 26, damage: 18, reach: 1.45, hitstun: 24, blockstun: 12, pushback: 0.3 }) },
      { notation: "d+3", move: move({ name: "Low knee", height: "low", startup: 13, active: 4, recovery: 22, damage: 9, reach: 1.77, hitstun: 20, blockstun: 9, pushback: 0.3 }) },
      { notation: "f,f+2", move: move({ name: "Shoulder charge", startup: 15, active: 4, recovery: 27, damage: 22, reach: 2.0, hitstun: 26, blockstun: 14, pushback: 0.9 }) },
    ],
    throws: [{ ...throwMove("Bear hug", 38, 10), reach: 1.66 }, { ...throwMove("Suplex", 44, 10), reach: 1.66 }],
    rageArt: move({ name: "Titan Art", unblockable: true, launch: true, startup: 22, active: 3, recovery: 44, damage: 50, reach: 2.1, hitstun: 32, blockstun: 0, pushback: 0.7 }),
    heatEngage: move({ name: "Heat Burst", unblockable: true, startup: 13, active: 3, recovery: 24, damage: 11, reach: 1.87, hitstun: 24, blockstun: 0, pushback: 0.6 }),
    look: { model: "procedural", color: "#6b3a8a", accent: "#ff9d3c" },
  },
];
