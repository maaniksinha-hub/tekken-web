import type { CharacterData } from "./types";

// Original placeholder fighters. Names and move stats are our own.
export const characters: CharacterData[] = [
  {
    id: "kai",
    name: "KAI",
    maxHp: 180,
    walkSpeed: 0.035,
    backSpeed: 0.025,
    sidestepSpeed: 0.03,
    moves: {
      lp: { name: "Jab", height: "high", startup: 10, active: 3, recovery: 12, damage: 8, reach: 1.5, hitstun: 14, blockstun: 8, pushback: 0.15 },
      rp: { name: "Straight", height: "high", startup: 13, active: 3, recovery: 16, damage: 14, reach: 1.6, hitstun: 18, blockstun: 10, pushback: 0.3 },
      lk: { name: "Front kick", height: "mid", startup: 14, active: 4, recovery: 18, damage: 16, reach: 1.9, hitstun: 20, blockstun: 12, pushback: 0.4 },
      rk: { name: "Roundhouse", height: "mid", startup: 18, active: 4, recovery: 24, damage: 24, reach: 2.0, hitstun: 26, blockstun: 14, pushback: 0.7 },
    },
    specials: [
      { notation: "d/f+2", move: { name: "Uppercut", height: "mid", startup: 16, active: 3, recovery: 22, damage: 20, reach: 1.4, hitstun: 24, blockstun: 12, pushback: 0.4 } },
      { notation: "d+4", move: { name: "Low sweep", height: "low", startup: 18, active: 4, recovery: 24, damage: 12, reach: 1.9, hitstun: 22, blockstun: 10, pushback: 0.4 } },
      { notation: "f,f+1", move: { name: "Dash jab", height: "mid", startup: 15, active: 3, recovery: 20, damage: 14, reach: 1.8, hitstun: 20, blockstun: 11, pushback: 0.4 } },
    ],
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
      lp: { name: "Quick jab", height: "high", startup: 9, active: 3, recovery: 11, damage: 7, reach: 1.4, hitstun: 13, blockstun: 8, pushback: 0.12 },
      rp: { name: "Hook", height: "high", startup: 14, active: 3, recovery: 17, damage: 15, reach: 1.5, hitstun: 19, blockstun: 10, pushback: 0.3 },
      lk: { name: "Low-line kick", height: "low", startup: 12, active: 4, recovery: 17, damage: 14, reach: 1.9, hitstun: 19, blockstun: 11, pushback: 0.35 },
      rk: { name: "Spin kick", height: "mid", startup: 20, active: 4, recovery: 26, damage: 28, reach: 2.1, hitstun: 28, blockstun: 15, pushback: 0.8 },
    },
    specials: [
      { notation: "d/f+1", move: { name: "Rising palm", height: "mid", startup: 14, active: 3, recovery: 20, damage: 16, reach: 1.3, hitstun: 22, blockstun: 11, pushback: 0.35 } },
      { notation: "d+3", move: { name: "Shin kick", height: "low", startup: 15, active: 4, recovery: 20, damage: 10, reach: 1.8, hitstun: 20, blockstun: 9, pushback: 0.3 } },
      { notation: "f,f+2", move: { name: "Lunge hook", height: "mid", startup: 17, active: 3, recovery: 22, damage: 18, reach: 1.9, hitstun: 22, blockstun: 12, pushback: 0.5 } },
    ],
    look: { model: "procedural", color: "#d4453b", accent: "#ffffff" },
  },
];
