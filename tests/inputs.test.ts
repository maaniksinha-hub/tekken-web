import { describe, expect, it } from "vitest";
import { InputBuffer, parseNotation, toDir, type BufferFrame } from "../src/sim/inputs";

const frame = (dir: BufferFrame["dir"], pressed: BufferFrame["pressed"] = []): BufferFrame => ({
  dir, pressed, held: pressed,
});
const feed = (b: InputBuffer, frames: BufferFrame[]) => frames.forEach((f) => b.push(f));

describe("notation parser", () => {
  it("parses directions and buttons", () => {
    expect(parseNotation("d/f+2")).toEqual([{ dir: 3, buttons: ["rp"] }]);
    expect(parseNotation("f, f+1")).toEqual([
      { dir: 6, buttons: [] },
      { dir: 6, buttons: ["lp"] },
    ]);
    expect(parseNotation("1+2")[0].buttons).toEqual(["lp", "rp"]);
  });
  it("rejects garbage", () => {
    expect(() => parseNotation("x+9")).toThrow();
  });
  it("maps relative directions to numpad", () => {
    expect(toDir(0, 0)).toBe(5);
    expect(toDir(1, 0)).toBe(6);
    expect(toDir(1, -1)).toBe(3);
    expect(toDir(-1, -1)).toBe(1);
  });
});

describe("input buffer", () => {
  it("matches d/f+2 when 2 is pressed with down-forward held", () => {
    const b = new InputBuffer();
    feed(b, [frame(5), frame(3, ["rp"])]);
    expect(b.matches(parseNotation("d/f+2"))).toBe(true);
    expect(b.matches(parseNotation("d/f+1"))).toBe(false);
  });
  it("matches f,f+1 only with a release between the forwards", () => {
    const dash = parseNotation("f,f+1");
    const tap = new InputBuffer();
    feed(tap, [frame(6), frame(5), frame(6, ["lp"])]);
    expect(tap.matches(dash)).toBe(true);
    const held = new InputBuffer();
    feed(held, [frame(6), frame(6), frame(6), frame(6, ["lp"])]);
    expect(held.matches(dash)).toBe(false);
  });
  it("expires old inputs", () => {
    const b = new InputBuffer();
    feed(b, [frame(6), frame(5), frame(6)]);
    for (let i = 0; i < 20; i++) b.push(frame(5));
    b.push(frame(6, ["lp"]));
    expect(b.matches(parseNotation("f,f+1"))).toBe(false);
  });
});
