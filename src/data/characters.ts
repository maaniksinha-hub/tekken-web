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
      lp: { name: "Jab", startup: 10, active: 3, recovery: 12, damage: 8, reach: 1.5, hitstun: 14, blockstun: 8, pushback: 0.15 },
      rp: { name: "Straight", startup: 13, active: 3, recovery: 16, damage: 14, reach: 1.6, hitstun: 18, blockstun: 10, pushback: 0.3 },
      lk: { name: "Front kick", startup: 14, active: 4, recovery: 18, damage: 16, reach: 1.9, hitstun: 20, blockstun: 12, pushback: 0.4 },
      rk: { name: "Roundhouse", startup: 18, active: 4, recovery: 24, damage: 24, reach: 2.0, hitstun: 26, blockstun: 14, pushback: 0.7 },
    },
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
      lp: { name: "Quick jab", startup: 9, active: 3, recovery: 11, damage: 7, reach: 1.4, hitstun: 13, blockstun: 8, pushback: 0.12 },
      rp: { name: "Hook", startup: 14, active: 3, recovery: 17, damage: 15, reach: 1.5, hitstun: 19, blockstun: 10, pushback: 0.3 },
      lk: { name: "Low-line kick", startup: 12, active: 4, recovery: 17, damage: 14, reach: 1.9, hitstun: 19, blockstun: 11, pushback: 0.35 },
      rk: { name: "Spin kick", startup: 20, active: 4, recovery: 26, damage: 28, reach: 2.1, hitstun: 28, blockstun: 15, pushback: 0.8 },
    },
    look: { model: "procedural", color: "#d4453b", accent: "#ffffff" },
  },
];
