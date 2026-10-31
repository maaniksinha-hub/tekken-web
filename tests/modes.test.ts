import { describe, expect, it } from "vitest";
import { characters } from "../src/data/characters";
import { buildLadder, shadowOf, stageScore } from "../src/modes/arcade";
import { dummyInput, trainingDriver } from "../src/modes/training";
import { createGame, emptyInput, type InputFrame } from "../src/sim/game";

describe("arcade ladder", () => {
  it("has 5 steps, ends with the shadow boss, never repeats an opponent, and ramps difficulty", () => {
    const player = characters[0];
    const ladder = buildLadder(player, characters, 42);
    expect(ladder).toHaveLength(5);
    expect(ladder[4].boss).toBe(true);
    expect(ladder[4].opponent.id).toBe(`${player.id}-shadow`);
    const ids = ladder.slice(0, 4).map((s) => s.opponent.id);
    expect(new Set(ids).size).toBe(Math.min(4, characters.length - 1));
    expect(ids).not.toContain(player.id);
    expect(ladder.map((s) => s.difficulty)).toEqual(["easy", "normal", "normal", "hard", "hard"]);
  });

  it("is reproducible for a seed and varies between seeds", () => {
    const a = buildLadder(characters[0], characters, 1).map((s) => s.opponent.id).join();
    expect(buildLadder(characters[0], characters, 1).map((s) => s.opponent.id).join()).toBe(a);
    const seen = new Set([1, 2, 3, 4, 5, 6].map((s) => buildLadder(characters[0], characters, s).map((x) => x.opponent.id).join()));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("the shadow boss is tougher and looks different", () => {
    const s = shadowOf(characters[1]);
    expect(s.maxHp).toBeGreaterThan(characters[1].maxHp);
    expect(s.look.color).not.toBe(characters[1].look.color);
    expect(s.name.length).toBeLessThanOrEqual(14);
  });

  it("scores more for later stages, flawless wins and leftover time; continues cost points", () => {
    const g = createGame(characters[0], characters[1]);
    const flawless = stageScore(g, 0, 0);
    g.fighters[0].hp = 50;
    expect(stageScore(g, 0, 0)).toBeLessThan(flawless);
    g.fighters[0].hp = g.fighters[0].char.maxHp;
    expect(stageScore(g, 3, 0)).toBeGreaterThan(flawless);
    expect(stageScore(g, 0, 2)).toBeLessThan(flawless);
    g.timer = 0;
    expect(stageScore(g, 0, 0)).toBeLessThan(flawless);
  });
});

describe("training mode", () => {
  const press = (b: "lp" | "rp" | "lk" | "rk"): InputFrame => ({ ...emptyInput(), buttons: { lp: b === "lp", rp: b === "rp", lk: b === "lk", rk: b === "rk" } });

  it("dummy behaves as configured", () => {
    const g = createGame(characters[0], characters[1]);
    const dummy = g.fighters[1]; // faces left, so back is +x
    expect(dummyInput("stand", dummy)).toEqual(emptyInput());
    expect(dummyInput("crouch", dummy).z).toBe(-1);
    expect(dummyInput("block", dummy).x).toBe(1);
    expect(dummyInput("crouchblock", dummy)).toMatchObject({ x: 1, z: -1 });
  });

  it("never KOs, refills health, and reports damage and combo totals", () => {
    const g = createGame(characters[0], characters[1]);
    let n = 0;
    const d = trainingDriver(g, () => (++n % 40 === 1 ? press("rk") : emptyInput()));
    g.fighters[0].x = -0.5; g.fighters[1].x = 0.5;
    for (let i = 0; i < 60 * 60; i++) { d.step(); if (i % 40 === 0) { g.fighters[0].x = -0.5; g.fighters[1].x = 0.5; } }
    expect(g.phase).toBe("fight");
    expect(g.fighters[1].state).not.toBe("ko");
    expect(g.fighters[1].hp).toBeGreaterThan(0);
    expect(d.stats.lastDamage).toBeGreaterThan(0);
  });

  it("reports frame advantage: positive on hit for a fast jab, negative on block for a slow kick", () => {
    const hit = createGame(characters[0], characters[1]);
    let n = 0;
    const dh = trainingDriver(hit, () => (++n === 1 ? press("lp") : emptyInput()));
    hit.fighters[0].x = -0.5; hit.fighters[1].x = 0.5;
    for (let i = 0; i < 40; i++) dh.step();
    expect(dh.stats.advantageOn).toBe("hit");
    expect(dh.stats.advantage).not.toBeNull();

    const blocked = createGame(characters[0], characters[1]);
    let m = 0;
    const db = trainingDriver(blocked, () => (++m === 1 ? press("rk") : emptyInput()));
    db.dummy = "block";
    blocked.fighters[0].x = -0.5; blocked.fighters[1].x = 0.5;
    for (let i = 0; i < 50; i++) db.step();
    expect(db.stats.advantageOn).toBe("block");
    expect(db.stats.advantage as number).toBeLessThan(0); // big kick is unsafe on block
  });

  it("starts the fighters apart and can reset positions", () => {
    const g = createGame(characters[0], characters[1]);
    const d = trainingDriver(g, emptyInput);
    g.fighters[0].x = 5;
    d.resetPositions();
    expect(g.fighters[0].x).toBe(-1.5);
  });
});
