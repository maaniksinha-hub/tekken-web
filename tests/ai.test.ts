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
