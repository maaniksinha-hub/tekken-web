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

describe("heights and move list", () => {
  const setup = () => {
    const g = createGame(characters[0], characters[1]);
    g.fighters[0].x = -0.5;
    g.fighters[1].x = 0.5;
    return g;
  };
  const crouchHold = (): InputFrame => ({ ...emptyInput(), z: -1 });
  const once = (mk: () => InputFrame) => {
    let first = true;
    return () => (first ? ((first = false), mk()) : emptyInput());
  };

  it("a high attack whiffs on a crouching defender", () => {
    const g = setup();
    // Defender crouches for 10 frames first, then attacker jabs (high).
    for (let n = 0; n < 10; n++) step(g, [emptyInput(), crouchHold()]);
    expect(g.fighters[1].crouching).toBe(true);
    for (let n = 0; n < 40; n++) step(g, [n === 0 ? press("lp") : emptyInput(), crouchHold()]);
    expect(g.fighters[1].hp).toBe(characters[1].maxHp);
  });

  it("a low attack hits a standing blocker but is blocked by a crouch-blocker", () => {
    const standing = setup();
    run(40, once(() => press("rk", { z: -1 })), () => ({ ...emptyInput(), x: 1 }), standing);
    expect(standing.fighters[1].hp).toBeLessThan(characters[1].maxHp); // Low sweep d+4

    const crouched = setup();
    run(40, once(() => press("rk", { z: -1 })), () => ({ ...emptyInput(), x: 1, z: -1 }), crouched);
    expect(crouched.fighters[1].hp).toBe(characters[1].maxHp);
  });

  it("a mid beats a crouch-blocker", () => {
    const g = setup();
    run(40, once(() => press("lk")), () => ({ ...emptyInput(), x: 1, z: -1 }), g); // Front kick, mid
    expect(g.fighters[1].hp).toBeLessThan(characters[1].maxHp);
  });

  it("d/f+2 triggers the special instead of the plain 2", () => {
    const g = setup();
    step(g, [press("rp", { x: 1, z: -1 }), emptyInput()]);
    expect(g.fighters[0].activeMove?.name).toBe("Uppercut");
  });

  it("plain 2 stays a normal move", () => {
    const g = setup();
    step(g, [press("rp"), emptyInput()]);
    expect(g.fighters[0].activeMove?.name).toBe("Straight");
  });

  it("f,f+1 dashes only after a real double tap, not while holding forward", () => {
    const held = setup();
    for (let n = 0; n < 6; n++) step(held, [{ ...emptyInput(), x: 1 }, emptyInput()]);
    step(held, [press("lp", { x: 1 }), emptyInput()]);
    expect(held.fighters[0].activeMove?.name).toBe("Jab");

    const tapped = setup();
    step(tapped, [{ ...emptyInput(), x: 1 }, emptyInput()]);
    step(tapped, [emptyInput(), emptyInput()]);
    step(tapped, [press("lp", { x: 1 }), emptyInput()]);
    expect(tapped.fighters[0].activeMove?.name).toBe("Dash jab");
  });
});
