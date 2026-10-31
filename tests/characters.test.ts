import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { characters } from "../src/data/characters";
import { validateCharacter } from "../src/data/validate";
import { createGame, emptyInput, step } from "../src/sim/game";

const dir = join(__dirname, "..", "public", "characters");
const customFiles = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");

describe("character data", () => {
  it("built-in characters are valid and unique", () => {
    const ids = new Set<string>();
    for (const c of characters) {
      expect(validateCharacter(c), c.id).toEqual([]);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
    expect(characters.length).toBeGreaterThanOrEqual(4);
  });

  it("every public/characters/*.json is valid, listed in index.json, and playable", () => {
    const listed = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as string[];
    expect(customFiles.length).toBeGreaterThan(0);
    for (const f of customFiles) {
      const c = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(validateCharacter(c), f).toEqual([]);
      expect(listed, `${f} should be listed in index.json`).toContain(f);
      // Smoke test: runs a few seconds against a built-in fighter without errors.
      const g = createGame(c, characters[0]);
      g.fighters[0].x = -0.5; g.fighters[1].x = 0.5;
      for (let i = 0; i < 300; i++) step(g, [i % 20 === 0 ? { ...emptyInput(), buttons: { lp: true, rp: false, lk: false, rk: false } } : emptyInput(), emptyInput()]);
      expect(g.fighters[1].hp).toBeLessThan(characters[0].maxHp);
    }
  });

  it("rejects broken characters with readable messages", () => {
    const bad = JSON.parse(JSON.stringify(characters[0]));
    bad.id = "Bad Id!";
    bad.moves.lp.startup = -3;
    bad.specials[0].notation = "x+9";
    bad.look.color = "red";
    const errs = validateCharacter(bad).join("\n");
    expect(errs).toMatch(/id:/);
    expect(errs).toMatch(/moves\.lp\.startup/);
    expect(errs).toMatch(/specials\[0\]\.notation/);
    expect(errs).toMatch(/look\.color/);
    expect(validateCharacter(null)).toEqual(["not an object"]);
  });

  it("every character has 4 fighters-worth of working moves: each normal can hit at close range", () => {
    for (const c of characters) for (const b of ["lp", "rp", "lk", "rk"] as const) {
      const g = createGame(c, characters[0]);
      g.fighters[0].x = -0.5; g.fighters[1].x = 0.5;
      const input = { ...emptyInput(), buttons: { lp: b === "lp", rp: b === "rp", lk: b === "lk", rk: b === "rk" } };
      step(g, [input, emptyInput()]);
      for (let i = 0; i < 60; i++) step(g, [emptyInput(), emptyInput()]);
      expect(g.fighters[1].hp, `${c.id} ${b}`).toBeLessThan(characters[0].maxHp);
    }
  });
});
