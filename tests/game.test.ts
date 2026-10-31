import { describe, expect, it } from "vitest";
import { characters } from "../src/data/characters";
import { createGame, emptyInput, step, type InputFrame } from "../src/sim/game";

const press = (b: "lp" | "rp" | "lk" | "rk", extra: Partial<InputFrame> = {}): InputFrame => ({
  ...emptyInput(),
  ...extra,
  buttons: { lp: false, rp: false, lk: false, rk: false, [b]: true },
});

function run(frames: number, i0: () => InputFrame, i1: () => InputFrame, g = createGame(characters[0], characters[1])) {
  for (let n = 0; n < frames; n++) step(g, [i0(), i1()]);
  return g;
}

describe("fight simulation", () => {
  it("is deterministic", () => {
    const script = (n: number): InputFrame => (n % 40 === 0 ? press("rp", { x: 1 }) : { ...emptyInput(), x: 1 });
    const play = () => {
      const g = createGame(characters[0], characters[1]);
      for (let n = 0; n < 600; n++) step(g, [script(n), n % 55 === 0 ? press("lk") : emptyInput()]);
      return JSON.stringify(g, (k, v) => (k === "char" ? undefined : v));
    };
    expect(play()).toBe(play());
  });

  it("walks forward, backward and sidesteps", () => {
    const g = run(30, () => ({ ...emptyInput(), x: 1, z: 1 }), emptyInput);
    expect(g.fighters[0].x).toBeGreaterThan(-2);
    expect(g.fighters[0].z).toBeGreaterThan(0);
  });

  it("lands a hit in range and deals damage", () => {
    const g = createGame(characters[0], characters[1]);
    g.fighters[0].x = -0.5;
    g.fighters[1].x = 0.5;
    let first = true;
    run(40, () => (first ? ((first = false), press("lp")) : emptyInput()), emptyInput, g);
    expect(g.fighters[1].hp).toBe(characters[1].maxHp - characters[0].moves.lp.damage);
  });

  it("misses when the defender sidesteps away", () => {
    const g = createGame(characters[0], characters[1]);
    g.fighters[0].x = -0.5;
    g.fighters[1].x = 0.5;
    g.fighters[1].z = 1.4;
    let first = true;
    run(40, () => (first ? ((first = false), press("lp")) : emptyInput()), emptyInput, g);
    expect(g.fighters[1].hp).toBe(characters[1].maxHp);
  });

  it("blocks when holding back and takes no damage", () => {
    const g = createGame(characters[0], characters[1]);
    g.fighters[0].x = -0.5;
    g.fighters[1].x = 0.5;
    let first = true;
    // Defender (facing left) holds right = back.
    run(40, () => (first ? ((first = false), press("lp")) : emptyInput()), () => ({ ...emptyInput(), x: 1 }), g);
    expect(g.fighters[1].hp).toBe(characters[1].maxHp);
    expect(g.fighters[0].lastResult).toBe("block");
  });

  it("ends the round on KO and the match after two round wins", () => {
    const g = createGame(characters[0], characters[1]);
    for (let n = 0; n < 4000 && g.phase !== "matchEnd"; n++) {
      g.fighters[0].x = -0.5;
      g.fighters[1].x = 0.5;
      step(g, [n % 30 === 0 ? press("rk") : emptyInput(), emptyInput()]);
    }
    expect(g.phase).toBe("matchEnd");
    expect(g.wins[0]).toBe(2);
  });
});
