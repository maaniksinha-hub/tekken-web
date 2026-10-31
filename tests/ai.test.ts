import { describe, expect, it } from "vitest";
import { characters } from "../src/data/characters";
import { createCpu, mulberry32, type Difficulty } from "../src/sim/ai";
import { createGame, emptyInput, step } from "../src/sim/game";

const play = (d0: Difficulty | null, d1: Difficulty | null, frames: number, seed = 1) => {
  const g = createGame(characters[0], characters[1]);
  const a = d0 ? createCpu(0, d0, seed) : null;
  const b = d1 ? createCpu(1, d1, seed + 1) : null;
  for (let i = 0; i < frames && g.phase !== "matchEnd"; i++) {
    step(g, [a ? a.next(g) : emptyInput(), b ? b.next(g) : emptyInput()]);
  }
  return g;
};

describe("cpu opponent", () => {
  it("seeded RNG is deterministic", () => {
    const a = mulberry32(5), b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("is deterministic for a given seed", () => {
    const s = (g: ReturnType<typeof play>) => JSON.stringify([g.wins, g.tick, g.fighters.map((f) => [f.hp, f.x])]);
    expect(s(play("normal", "normal", 6000, 3))).toBe(s(play("normal", "normal", 6000, 3)));
  });

  it("beats a standing-still opponent at every difficulty", () => {
    for (const d of ["easy", "normal", "hard"] as Difficulty[]) {
      const g = play(d, null, 60 * 60 * 3);
      expect(g.wins[0], d).toBeGreaterThanOrEqual(2);
    }
  });

  it("hard beats easy most of the time", () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = play("hard", "easy", 60 * 60 * 4, seed);
      if (g.wins[0] > g.wins[1]) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(4);
  });

  it("CPU vs CPU finishes matches and uses varied moves", () => {
    const used = new Set<string>();
    const g = createGame(characters[0], characters[1]);
    const a = createCpu(0, "hard", 11), b = createCpu(1, "hard", 12);
    for (let i = 0; i < 60 * 60 * 5 && g.phase !== "matchEnd"; i++) {
      step(g, [a.next(g), b.next(g)]);
      for (const f of g.fighters) if (f.activeMove) used.add(f.activeMove.name);
    }
    expect(g.phase).toBe("matchEnd");
    expect(used.size).toBeGreaterThanOrEqual(6);
  });
});

describe("roster", () => {
  const roster = characters;
  const duel = (i: number, j: number, seed: number) => {
    const g = createGame(roster[i], roster[j]);
    const a = createCpu(0, "hard", seed), b = createCpu(1, "hard", seed + 100);
    for (let n = 0; n < 60 * 60 * 6 && g.phase !== "matchEnd"; n++) step(g, [a.next(g), b.next(g)]);
    return g;
  };

  it("every pairing finishes a match (no soft-locks)", () => {
    for (let i = 0; i < roster.length; i++) for (let j = 0; j < roster.length; j++) {
      expect(duel(i, j, 5).phase, `${roster[i].id} vs ${roster[j].id}`).toBe("matchEnd");
    }
  });

  it("no fighter is hopeless or unbeatable across a CPU round-robin", () => {
    const wins = roster.map(() => 0), played = roster.map(() => 0);
    for (let i = 0; i < roster.length; i++) for (let j = 0; j < roster.length; j++) {
      if (i === j) continue;
      for (const seed of [1, 2, 3, 4]) {
        const g = duel(i, j, seed * 13);
        played[i]++; played[j]++;
        if (g.wins[0] > g.wins[1]) wins[i]++; else if (g.wins[1] > g.wins[0]) wins[j]++;
      }
    }
    roster.forEach((c, k) => {
      const rate = wins[k] / played[k];
      expect(rate, `${c.id} win rate ${rate.toFixed(2)}`).toBeGreaterThan(0.15);
      expect(rate, `${c.id} win rate ${rate.toFixed(2)}`).toBeLessThan(0.85);
    });
  });
});
