import { describe, expect, it } from "vitest";
import { characters } from "../src/data/characters";
import { BUTTONS } from "../src/data/types";
import { mulberry32 } from "../src/sim/ai";
import { createGame, emptyInput, step, type InputFrame } from "../src/sim/game";
import { hashState, INPUT_DELAY, packInput, RollbackSession, unpackInput, type NetMsg, type Transport } from "../src/net/rollback";

/** In-memory link with latency, jitter and reordering-free delivery. */
class Link {
  private queue: { at: number; msg: NetMsg }[] = [];
  handler: ((m: NetMsg) => void) | null = null;
  constructor(private clock: () => number, private latency: () => number) {}
  send(msg: NetMsg) { this.queue.push({ at: this.clock() + this.latency(), msg }); }
  pump(upTo = this.clock()) {
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length && this.queue[0].at <= upTo) this.handler?.(this.queue.shift()!.msg);
  }
}

function scripted(player: 0 | 1, seed: number) {
  const rnd = mulberry32(seed + player * 101);
  const cache: InputFrame[] = [];
  return (frame: number): InputFrame => {
    while (cache.length <= frame) {
      const i = emptyInput();
      // Mostly hold a direction for a while, with bursts of buttons: realistic enough to cause mispredictions.
      const prev = cache[cache.length - 1];
      i.x = rnd() < 0.85 && prev ? prev.x : ((Math.floor(rnd() * 3) - 1) as -1 | 0 | 1);
      i.z = rnd() < 0.9 && prev ? prev.z : ((Math.floor(rnd() * 3) - 1) as -1 | 0 | 1);
      if (rnd() < 0.12) i.buttons[BUTTONS[Math.floor(rnd() * 4)]] = true;
      if (rnd() < 0.02) { i.buttons.lp = true; i.buttons.lk = true; }
      cache.push(i);
    }
    return cache[frame];
  };
}

function run(frames: number, latencyFn: () => number, seed: number) {
  let clock = 0;
  const aToB = new Link(() => clock, latencyFn);
  const bToA = new Link(() => clock, latencyFn);
  const ta: Transport = { send: (m) => aToB.send(m), onMessage: (cb) => (bToA.handler = cb) };
  const tb: Transport = { send: (m) => bToA.send(m), onMessage: (cb) => (aToB.handler = cb) };
  const inA = scripted(0, seed), inB = scripted(1, seed);
  // A reads input for the frame it is about to schedule: frame + delay. The script is indexed by that frame.
  let fa = 0, fb = 0;
  const A = new RollbackSession([characters[0], characters[1]], 0, ta, () => inA(fa + 3));
  const B = new RollbackSession([characters[0], characters[1]], 1, tb, () => inB(fb + 3));
  for (let t = 0; A.frame < frames || B.frame < frames; t++) {
    clock = t;
    aToB.pump(); bToA.pump();
    if (A.frame < frames) { fa = A.frame; A.tick(); }
    if (B.frame < frames) { fb = B.frame; B.tick(); }
    if (t > frames * 20) throw new Error("did not finish");
  }
  clock = 1e9;
  aToB.pump(); bToA.pump();
  A.applyRollback(); B.applyRollback();
  return { A, B };
}

describe("input packing", () => {
  it("round-trips every direction and button combination", () => {
    for (const x of [-1, 0, 1] as const) for (const z of [-1, 0, 1] as const) for (let m = 0; m < 16; m++) {
      const i = emptyInput(); i.x = x; i.z = z;
      BUTTONS.forEach((b, k) => (i.buttons[b] = !!((m >> k) & 1)));
      expect(unpackInput(packInput(i))).toEqual(i);
    }
  });
});

describe("rollback netcode", () => {
  it("peers converge with zero latency", () => {
    const { A, B } = run(600, () => 0, 1);
    expect(hashState(A.game)).toBe(hashState(B.game));
  });

  it("peers converge with latency and jitter", () => {
    for (const seed of [1, 2, 3]) {
      const r = mulberry32(seed);
      const { A, B } = run(900, () => 2 + Math.floor(r() * 6), seed);
      expect(A.rollbacks + B.rollbacks).toBeGreaterThan(0);
      expect(hashState(A.game)).toBe(hashState(B.game));
      expect(A.desynced || B.desynced).toBe(false);
    }
  });

  it("matches a lag-free reference sim fed the same inputs", () => {
    const frames = 500;
    const { A, B } = run(frames, () => 4, 9);
    const inA = scripted(0, 9), inB = scripted(1, 9);
    const ref = createGame(characters[0], characters[1]);
    // Local input read at frame f is applied at f + INPUT_DELAY; the first INPUT_DELAY frames are neutral.
    for (let f = 0; f < frames; f++) {
      step(ref, [f < INPUT_DELAY ? emptyInput() : inA(f), f < INPUT_DELAY ? emptyInput() : inB(f)]);
    }
    expect(hashState(A.game)).toBe(hashState(ref));
    expect(hashState(B.game)).toBe(hashState(ref));
  });

  it("stalls instead of predicting without bound when the remote goes silent", () => {
    let clock = 0;
    const out: NetMsg[] = [];
    const s = new RollbackSession([characters[0], characters[1]], 0, { send: (m) => out.push(m), onMessage() {} }, () => emptyInput());
    let advanced = 0;
    for (let i = 0; i < 100; i++) { clock++; if (s.tick()) advanced++; }
    expect(advanced).toBeLessThanOrEqual(14);
    expect(s.stalls).toBeGreaterThan(50);
    void clock;
  });

  it("detects a desync through hash mismatch", () => {
    let clock = 0;
    const aToB = new Link(() => clock, () => 0), bToA = new Link(() => clock, () => 0);
    let flagged = false;
    const A = new RollbackSession([characters[0], characters[1]], 0,
      { send: (m) => aToB.send(m), onMessage: (cb) => (bToA.handler = cb) }, () => emptyInput(), () => (flagged = true));
    const B = new RollbackSession([characters[0], characters[1]], 1,
      { send: (m) => bToA.send(m), onMessage: (cb) => (aToB.handler = cb) }, () => emptyInput());
    for (let t = 0; t < 400; t++) {
      clock = t; aToB.pump(); bToA.pump();
      if (t === 100) B.game.fighters[0].hp -= 5; // corrupt B's state behind its back
      A.tick(); B.tick();
    }
    aToB.pump(1e9); bToA.pump(1e9);
    expect(flagged).toBe(true);
  });
});
