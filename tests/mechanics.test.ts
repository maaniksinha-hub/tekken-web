import { describe, expect, it } from "vitest";
import { characters } from "../src/data/characters";
import { cloneState, createGame, emptyInput, inRage, step, STAGE_HALF_WIDTH, type GameState, type InputFrame } from "../src/sim/game";
import type { Button } from "../src/data/types";

const [KAI, RIN] = characters;
const btn = (...bs: Button[]): InputFrame["buttons"] => ({
  lp: bs.includes("lp"), rp: bs.includes("rp"), lk: bs.includes("lk"), rk: bs.includes("rk"),
});
const inp = (o: Partial<InputFrame> & { b?: Button[] } = {}): InputFrame => ({ ...emptyInput(), ...o, buttons: btn(...(o.b ?? [])) });
const idle = emptyInput;

function setup(gap = 1): GameState {
  const g = createGame(KAI, RIN);
  g.fighters[0].x = -gap / 2;
  g.fighters[1].x = gap / 2;
  return g;
}
const frames = (g: GameState, n: number, a: () => InputFrame = idle, b: () => InputFrame = idle) => {
  for (let i = 0; i < n; i++) step(g, [a(), b()]);
};
/** Press once on the first frame, then release. */
const tap = (mk: () => InputFrame) => {
  let first = true;
  return () => (first ? ((first = false), mk()) : idle());
};

describe("jump", () => {
  it("holding up jumps, rises, and lands", () => {
    const g = setup(3);
    let maxY = 0;
    for (let i = 0; i < 80; i++) {
      step(g, [inp({ z: 1 }), idle()]);
      maxY = Math.max(maxY, g.fighters[0].y);
    }
    expect(maxY).toBeGreaterThan(1);
    frames(g, 30);
    expect(g.fighters[0].y).toBe(0);
    expect(g.fighters[0].state).toBe("idle");
  });

  it("a low attack whiffs on a jumping defender", () => {
    const g = setup(1);
    for (let i = 0; i < 12; i++) step(g, [idle(), inp({ z: 1 })]);
    expect(g.fighters[1].state).toBe("jump");
    frames(g, 30, tap(() => inp({ b: ["rk"], z: -1 })), () => inp({ z: 1 })); // d+4 Low sweep
    expect(g.fighters[1].hp).toBe(RIN.maxHp);
  });
});

describe("throws", () => {
  it("1+3 throws and deals damage after the break window", () => {
    const g = setup(1);
    frames(g, 80, tap(() => inp({ b: ["lp", "lk"] })));
    expect(g.fighters[1].hp).toBe(RIN.maxHp - KAI.throws[0].damage);
    expect(g.fighters[1].state === "knockdown" || g.fighters[1].state === "idle").toBe(true);
  });

  it("throws beat blocking", () => {
    const g = setup(0.8); // close enough that walking back cannot escape the throw
    frames(g, 80, tap(() => inp({ b: ["lp", "lk"] })), () => inp({ x: 1 }));
    expect(g.fighters[1].hp).toBeLessThan(RIN.maxHp);
  });

  it("pressing the matching button breaks the throw: no damage", () => {
    const g = setup(1);
    const a = tap(() => inp({ b: ["lp", "lk"] }));
    for (let i = 0; i < 80; i++) {
      const defender = i === 18 ? inp({ b: ["lp"] }) : idle(); // inside the break window
      step(g, [a(), defender]);
    }
    expect(g.fighters[1].hp).toBe(RIN.maxHp);
    expect(g.fighters[0].hp).toBe(KAI.maxHp);
  });

  it("the wrong button does not break it", () => {
    const g = setup(1);
    const a = tap(() => inp({ b: ["lp", "lk"] }));
    for (let i = 0; i < 80; i++) step(g, [a(), i === 18 ? inp({ b: ["rp"] }) : idle()]);
    expect(g.fighters[1].hp).toBeLessThan(RIN.maxHp);
  });

  it("misses out of range", () => {
    const g = setup(3);
    frames(g, 60, tap(() => inp({ b: ["lp", "lk"] })));
    expect(g.fighters[1].hp).toBe(RIN.maxHp);
  });
});

describe("strings", () => {
  it("1,2 chains on hit with the second hit landing before the defender recovers", () => {
    const g = setup(1);
    let n = 0;
    const a = () => {
      n++;
      if (n === 1) return inp({ b: ["lp"] });
      if (n === 15) return inp({ b: ["rp"] });
      return idle();
    };
    frames(g, 60, a);
    expect(g.fighters[1].hp).toBe(RIN.maxHp - KAI.moves.lp.damage - KAI.moves.lp.next![0].move.damage);
  });

  it("does not chain if the first hit whiffs", () => {
    const g = setup(3);
    let n = 0;
    frames(g, 60, () => (++n === 1 ? inp({ b: ["lp"] }) : n === 15 ? inp({ b: ["rp"] }) : idle()));
    expect(g.fighters[0].activeMove?.name === "Jab-Straight").toBe(false);
  });

  it("1,2,3 chains three moves", () => {
    const g = setup(1);
    let n = 0;
    const a = () => {
      n++;
      if (n === 1) return inp({ b: ["lp"] });
      if (n === 15) return inp({ b: ["rp"] });
      if (n === 28) return inp({ b: ["rk"] });
      return idle();
    };
    frames(g, 90, a);
    const m = KAI.moves.lp.next![0].move;
    const total = KAI.moves.lp.damage + m.damage + m.next![0].move.damage;
    expect(g.fighters[1].hp).toBe(RIN.maxHp - total);
  });
});

describe("juggles", () => {
  it("a launcher sends the defender airborne and a follow-up connects with scaling", () => {
    const g = setup(1);
    let n = 0;
    const a = () => {
      n++;
      if (n === 1) return inp({ b: ["rp"], x: 1, z: -1 }); // d/f+2 Uppercut (launcher)
      if (n === 28) return inp({ b: ["lk"] }); // juggle kick after the cancel window opens
      return idle();
    };
    let sawJuggle = false;
    for (let i = 0; i < 100; i++) {
      step(g, [a(), idle()]);
      if (g.fighters[1].state === "juggle") sawJuggle = true;
    }
    expect(sawJuggle).toBe(true);
    expect(g.fighters[1].hp).toBeLessThan(RIN.maxHp - 20);
    expect(g.fighters[1].y).toBe(0);
  });

  it("juggle damage is scaled down for later hits", () => {
    const g = setup(1);
    g.fighters[1].state = "juggle";
    g.fighters[1].y = 1;
    g.fighters[1].vy = 0.01;
    g.fighters[1].juggleHits = 3;
    const before = g.fighters[1].hp;
    frames(g, 30, tap(() => inp({ b: ["lk"] })));
    const dealt = before - g.fighters[1].hp;
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(KAI.moves.lk.damage);
  });

  it("knockdown protects against oki hits", () => {
    const g = setup(1);
    g.fighters[1].state = "knockdown";
    g.fighters[1].stun = 40;
    frames(g, 30, tap(() => inp({ b: ["lk"] })));
    expect(g.fighters[1].hp).toBe(RIN.maxHp);
  });
});

describe("wall splat", () => {
  it("a heavy hit into the wall adds damage and stun once", () => {
    const g = createGame(KAI, RIN);
    g.fighters[0].x = STAGE_HALF_WIDTH - 1.2;
    g.fighters[1].x = STAGE_HALF_WIDTH - 0.4;
    frames(g, 40, tap(() => inp({ b: ["rk"] })));
    const dealt = RIN.maxHp - g.fighters[1].hp;
    expect(dealt).toBeGreaterThan(KAI.moves.rk.damage);
  });
});

describe("rage and heat", () => {
  it("rage activates under 25% hp and boosts damage", () => {
    const g = setup(1);
    g.fighters[0].hp = 30;
    expect(inRage(g.fighters[0])).toBe(true);
    frames(g, 30, tap(() => inp({ b: ["lk"] })));
    expect(g.fighters[1].hp).toBe(RIN.maxHp - Math.round(KAI.moves.lk.damage * 1.15));
  });

  it("rage art needs rage; once per round", () => {
    const no = setup(1);
    frames(no, 60, tap(() => inp({ b: ["lp", "rp"] })));
    expect(no.fighters[1].hp).toBe(RIN.maxHp - KAI.moves.lp.damage); // 1+2 was just a jab

    const g = setup(1);
    g.fighters[0].hp = 30;
    frames(g, 60, tap(() => inp({ b: ["lp", "rp"] })), () => inp({ x: 1 })); // unblockable
    expect(g.fighters[1].hp).toBeLessThanOrEqual(RIN.maxHp - KAI.rageArt.damage);
    expect(g.fighters[0].rageArtUsed).toBe(true);
  });

  it("heat engage starts heat, once per round, and adds chip damage on block", () => {
    const g = setup(1);
    frames(g, 40, tap(() => inp({ b: ["lk", "rk"] })));
    expect(g.fighters[0].heat).toBeGreaterThan(0);
    expect(g.fighters[0].heatUsed).toBe(true);
    g.fighters[1].x = g.fighters[0].x + 1; // reset spacing after the burst's pushback
    const hpBefore = g.fighters[1].hp;
    frames(g, 40, tap(() => inp({ b: ["rp"] })), () => inp({ x: 1 })); // blocked straight (high)
    expect(g.fighters[1].hp).toBeLessThan(hpBefore);
    // Second engage does nothing.
    const heat = g.fighters[0].heat;
    frames(g, 40, tap(() => inp({ b: ["lk", "rk"] })));
    expect(g.fighters[0].heat).toBeLessThanOrEqual(heat);
  });
});

describe("snapshot", () => {
  it("cloneState is independent and resumes identically", () => {
    const g = setup(1);
    frames(g, 20, tap(() => inp({ b: ["lp"] })));
    const snap = cloneState(g);
    frames(g, 100, tap(() => inp({ b: ["rk"] })));
    const replay = snap;
    frames(replay, 100, tap(() => inp({ b: ["rk"] })));
    const strip = (s: GameState) => JSON.stringify(s, (k, v) => (k === "char" || k === "activeMove" ? undefined : v));
    expect(strip(replay)).toBe(strip(g));
  });
});

describe("trades", () => {
  it("two attacks landing on the same frame both connect without crashing", () => {
    const g = createGame(KAI, KAI); // identical startup, so both jabs connect on the same frame
    g.fighters[0].x = -0.5;
    g.fighters[1].x = 0.5;
    frames(g, 40, tap(() => inp({ b: ["lp"] })), tap(() => inp({ b: ["lp"] })));
    expect(g.fighters[0].hp).toBe(KAI.maxHp - KAI.moves.lp.damage);
    expect(g.fighters[1].hp).toBe(KAI.maxHp - KAI.moves.lp.damage);
  });
});
