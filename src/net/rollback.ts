import { BUTTONS } from "../data/types";
import { cloneState, createGame, emptyInput, step, type GameState, type InputFrame } from "../sim/game";
import type { CharacterData } from "../data/types";

/**
 * GGPO-style rollback for 2 players on top of the deterministic sim.
 *
 * Each peer simulates every frame immediately, guessing the remote player's input (repeat the last
 * one). When the real input arrives and differs from the guess, it rewinds to a saved snapshot and
 * re-simulates. Local input is applied INPUT_DELAY frames late so that most guesses are right.
 * Both peers end up with identical state once every input is known.
 */

export const INPUT_DELAY = 3;
export const MAX_ROLLBACK = 10; // stall instead of predicting further than this
const SNAPSHOT_KEEP = 40;
const HASH_EVERY = 60;

export type NetMsg =
  | { t: "in"; f: number; v: number }
  | { t: "hash"; f: number; h: number };

export interface Transport {
  send(msg: NetMsg): void;
  /** Register the single receive handler. */
  onMessage(cb: (msg: NetMsg) => void): void;
}

export const packInput = (i: InputFrame): number =>
  (i.x + 1) | ((i.z + 1) << 2) | (BUTTONS.reduce((m, b, k) => m | (i.buttons[b] ? 1 << k : 0), 0) << 4);

export function unpackInput(v: number): InputFrame {
  const o = emptyInput();
  o.x = ((v & 3) - 1) as -1 | 0 | 1;
  o.z = (((v >> 2) & 3) - 1) as -1 | 0 | 1;
  BUTTONS.forEach((b, k) => (o.buttons[b] = !!((v >> (4 + k)) & 1)));
  return o;
}

/** FNV-1a over the rule-relevant state (not presentation events). */
export function hashState(g: GameState): number {
  const s = JSON.stringify(g, (k, v) => (k === "char" || k === "activeMove" || k === "events" ? undefined : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class RollbackSession {
  game: GameState;
  frame = 0; // next frame to simulate
  desynced = false;
  stalls = 0;
  rollbacks = 0;
  private inputs: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  private used = new Map<number, number>(); // remote input actually simulated per frame
  private snaps = new Map<number, GameState>();
  private rollbackTo: number | null = null;
  private lastRemote = 0;
  private myHashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();
  private sentHashes = new Set<number>();
  private readonly remote: 0 | 1;

  constructor(
    chars: [CharacterData, CharacterData],
    readonly local: 0 | 1,
    private net: Transport,
    private readLocal: () => InputFrame,
    private onDesync?: () => void,
  ) {
    this.remote = local === 0 ? 1 : 0;
    this.game = createGame(chars[0], chars[1]);
    this.lastRemote = packInput(emptyInput());
    net.onMessage((m) => this.receive(m));
    // Frames before INPUT_DELAY have no real input from anyone: both sides use neutral.
    for (let f = 0; f < INPUT_DELAY; f++) {
      this.inputs[local].set(f, this.lastRemote);
      this.inputs[this.remote].set(f, this.lastRemote);
    }
  }

  /** Remote inputs for every frame below this are known (kept incrementally; old inputs get pruned). */
  private known = INPUT_DELAY;
  private knownThrough(): number {
    return this.known;
  }

  private receive(m: NetMsg): void {
    if (m.t === "in") {
      this.inputs[this.remote].set(m.f, m.v);
      while (this.inputs[this.remote].has(this.known)) this.known += 1;
      this.lastRemote = m.v;
      if (m.f < this.frame && this.used.get(m.f) !== m.v) {
        this.rollbackTo = this.rollbackTo === null ? m.f : Math.min(this.rollbackTo, m.f);
      }
    } else {
      this.theirHashes.set(m.f, m.h);
      this.checkHashes();
    }
  }

  private inputFor(player: 0 | 1, f: number): number {
    const known = this.inputs[player].get(f);
    if (known !== undefined) return known;
    return this.lastRemote; // prediction for the remote player
  }

  private simulate(f: number): void {
    const a = this.inputFor(0, f), b = this.inputFor(1, f);
    this.used.set(f, this.remote === 0 ? a : b);
    step(this.game, [unpackInput(a), unpackInput(b)]);
  }

  /** Apply a pending correction without advancing. Exposed for tests. */
  applyRollback(): void {
    if (this.rollbackTo === null) return;
    const from = this.rollbackTo;
    this.rollbackTo = null;
    const snap = this.snaps.get(from);
    if (!snap) return; // too old to correct (cannot happen within MAX_ROLLBACK)
    this.rollbacks += 1;
    const target = this.frame;
    this.game = cloneState(snap);
    for (let f = from; f < target; f++) {
      this.snaps.set(f, cloneState(this.game));
      this.simulate(f);
    }
    this.game.events.length = 0; // events from the replayed past were already shown (or are moot)
  }

  /**
   * Advance one frame if allowed. Returns false when stalled waiting for the remote player.
   * Call at 60 Hz.
   */
  tick(): boolean {
    this.applyRollback();
    if (this.frame - this.knownThrough() > MAX_ROLLBACK) {
      this.stalls += 1;
      return false;
    }
    // Capture and send local input for a future frame.
    const target = this.frame + INPUT_DELAY;
    if (!this.inputs[this.local].has(target)) {
      const v = packInput(this.readLocal());
      this.inputs[this.local].set(target, v);
      this.net.send({ t: "in", f: target, v });
    }
    this.snaps.set(this.frame, cloneState(this.game));
    this.simulate(this.frame);
    this.frame += 1;
    this.prune();
    this.sendHash();
    return true;
  }

  private prune(): void {
    const old = this.frame - SNAPSHOT_KEEP;
    if (old <= 0) return;
    this.snaps.delete(old);
    this.used.delete(old);
    this.inputs[0].delete(old - 1);
    this.inputs[1].delete(old - 1);
  }

  private sendHash(): void {
    // Hash a frame only once both inputs for everything before it are known (no guesses inside).
    const through = Math.min(this.knownThrough(), this.frame);
    const f = through - (through % HASH_EVERY);
    if (f <= 0 || this.sentHashes.has(f)) return;
    const snap = this.snaps.get(f);
    if (!snap) return;
    this.sentHashes.add(f);
    const h = hashState(snap);
    this.myHashes.set(f, h);
    this.net.send({ t: "hash", f, h });
    this.checkHashes();
  }

  private checkHashes(): void {
    for (const [f, h] of this.theirHashes) {
      const mine = this.myHashes.get(f);
      if (mine === undefined) continue;
      this.theirHashes.delete(f);
      this.myHashes.delete(f);
      if (mine !== h && !this.desynced) {
        this.desynced = true;
        this.onDesync?.();
      }
    }
  }
}
