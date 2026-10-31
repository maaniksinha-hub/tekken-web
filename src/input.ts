import { BUTTONS, type Button } from "./data/types";
import { emptyInput, type InputFrame } from "./sim/game";
import { touchState, touchVisible } from "./touch";

export type Action = "left" | "right" | "up" | "down" | Button;
export const ACTIONS: Action[] = ["left", "right", "up", "down", "lp", "rp", "lk", "rk"];
export type KeyMap = Record<Action, string>;

// KeyboardEvent.code values, so layouts other than QWERTY still work.
export const DEFAULT_KEYMAPS: [KeyMap, KeyMap] = [
  { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", lp: "KeyF", rp: "KeyG", lk: "KeyV", rk: "KeyB" },
  { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", lp: "KeyU", rp: "KeyI", lk: "KeyJ", rk: "KeyK" },
];

const STORAGE_KEY = "tekken-web.keys.v1";

function load(): [KeyMap, KeyMap] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as [Partial<KeyMap>, Partial<KeyMap>];
      return [{ ...DEFAULT_KEYMAPS[0], ...p[0] }, { ...DEFAULT_KEYMAPS[1], ...p[1] }];
    }
  } catch { /* corrupt storage: fall back to defaults */ }
  return [{ ...DEFAULT_KEYMAPS[0] }, { ...DEFAULT_KEYMAPS[1] }];
}

let keymaps = load();

export const getKeymaps = () => keymaps;

export function setKey(player: 0 | 1, action: Action, code: string): void {
  // A key can only do one thing: take it from any other action first.
  for (const p of [0, 1] as const) {
    for (const a of ACTIONS) if (keymaps[p][a] === code && !(p === player && a === action)) keymaps[p][a] = "";
  }
  keymaps[player][action] = code;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keymaps)); } catch { /* storage may be unavailable */ }
}

export function resetKeys(): void {
  keymaps = [{ ...DEFAULT_KEYMAPS[0] }, { ...DEFAULT_KEYMAPS[1] }];
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function keyLabel(code: string): string {
  if (!code) return "-";
  return code.replace(/^Key/, "").replace(/^Arrow/, "").replace(/^Digit/, "").replace("Numpad", "Num ");
}

// Standard gamepad mapping (DualSense/DualShock): 0 ✕, 1 ○, 2 □, 3 △, 9 Options, 12-15 d-pad.
// Tekken PlayStation layout: □ = 1, △ = 2, ✕ = 3, ○ = 4.
export const PAD_BUTTONS: Record<Button, number> = { lp: 2, rp: 3, lk: 0, rk: 1 };
const STICK_DEADZONE = 0.5;

const held = new Set<string>();
let capture: ((code: string) => void) | null = null;

const reserved = new Set(["Escape", "Enter", "Tab", "F5", "F11", "F12"]);
export function installKeyboard(): void {
  const typing = (e: Event) => e.target instanceof HTMLElement && /^(TEXTAREA|INPUT)$/.test(e.target.tagName);
  addEventListener("keydown", (e) => {
    if (typing(e) && !capture) return; // let people type and paste codes in text boxes
    if (capture) {
      e.preventDefault();
      const cb = capture;
      capture = null;
      if (e.code !== "Escape") cb(e.code);
      else cb("");
      return;
    }
    const mapped = keymaps.some((m) => ACTIONS.some((a) => m[a] === e.code));
    if (mapped || e.code === "Space" || e.code === "Escape") e.preventDefault();
    held.add(e.code);
  });
  addEventListener("keyup", (e) => held.delete(e.code));
  addEventListener("blur", () => held.clear());
}

/** Listen for the next key press (used by the controls screen). Escape cancels with "". */
export function captureNextKey(cb: (code: string) => void): void {
  capture = cb;
}
export const isCapturing = () => capture !== null;
export const isReserved = (code: string) => reserved.has(code);

function readPads(): Gamepad[] {
  return Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
}
export const connectedPadCount = () => readPads().length;

/** Player 0 uses the first connected pad, player 1 the second. Keyboard always works too. */
export function readInput(player: 0 | 1): InputFrame {
  const map = keymaps[player];
  const out = emptyInput();
  let x = (held.has(map.right) ? 1 : 0) - (held.has(map.left) ? 1 : 0);
  let z = (held.has(map.up) ? 1 : 0) - (held.has(map.down) ? 1 : 0);
  for (const b of BUTTONS) out.buttons[b] = held.has(map[b]);

  const pad = readPads()[player];
  if (pad) {
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const sx = pad.axes[0] ?? 0;
    const sy = pad.axes[1] ?? 0;
    const padX = (pressed(15) || sx > STICK_DEADZONE ? 1 : 0) - (pressed(14) || sx < -STICK_DEADZONE ? 1 : 0);
    const padZ = (pressed(12) || sy < -STICK_DEADZONE ? 1 : 0) - (pressed(13) || sy > STICK_DEADZONE ? 1 : 0);
    x = x || padX;
    z = z || padZ;
    for (const b of BUTTONS) out.buttons[b] = out.buttons[b] || pressed(PAD_BUTTONS[b]);
  }
  if (player === 0 && touchVisible()) {
    const t = touchState();
    x = x || t.x;
    z = z || t.z;
    for (const b of BUTTONS) out.buttons[b] = out.buttons[b] || t.buttons[b];
  }
  out.x = Math.sign(x) as -1 | 0 | 1;
  out.z = Math.sign(z) as -1 | 0 | 1;
  return out;
}

// ---- Menu navigation (edge-triggered; any keyboard layout or any connected pad) ----

export interface Nav {
  up: boolean; down: boolean; left: boolean; right: boolean;
  confirm: boolean; back: boolean; start: boolean;
  /** Which player produced a confirm/move: 0 = P1 keys / pad 1, 1 = P2 keys / pad 2, -1 = shared keys. */
  who: -1 | 0 | 1;
}

let navPrev = new Set<string>();

export function pollNav(): Nav {
  const now = new Set<string>();
  const nav: Nav = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, who: -1 };
  const edge = (id: string, down: boolean) => {
    if (down) now.add(id);
    return down && !navPrev.has(id);
  };
  const k = (code: string) => held.has(code);
  if (edge("k-up", k("ArrowUp") || k("KeyW"))) nav.up = true;
  if (edge("k-down", k("ArrowDown") || k("KeyS"))) nav.down = true;
  if (edge("k-left", k("ArrowLeft") || k("KeyA"))) nav.left = true;
  if (edge("k-right", k("ArrowRight") || k("KeyD"))) nav.right = true;
  if (edge("k-ok", k("Enter") || k("Space"))) nav.confirm = true;
  if (edge("k-back", k("Backspace"))) nav.back = true;
  if (edge("k-esc", k("Escape"))) { nav.start = true; nav.back = true; }

  readPads().forEach((p, i) => {
    const b = (n: number) => !!p.buttons[n]?.pressed;
    const sx = p.axes[0] ?? 0, sy = p.axes[1] ?? 0;
    const who = Math.min(i, 1) as 0 | 1;
    if (edge(`p${i}-up`, b(12) || sy < -0.6)) { nav.up = true; nav.who = who; }
    if (edge(`p${i}-down`, b(13) || sy > 0.6)) { nav.down = true; nav.who = who; }
    if (edge(`p${i}-left`, b(14) || sx < -0.6)) { nav.left = true; nav.who = who; }
    if (edge(`p${i}-right`, b(15) || sx > 0.6)) { nav.right = true; nav.who = who; }
    if (edge(`p${i}-ok`, b(0) || b(2))) { nav.confirm = true; nav.who = who; }
    if (edge(`p${i}-back`, b(1))) { nav.back = true; nav.who = who; }
    if (edge(`p${i}-start`, b(9))) { nav.start = true; nav.back = true; nav.who = who; }
  });
  navPrev = now;
  return nav;
}

/** Edge-detected player controls for character select: direction + confirm (button 1) + back (button 4). */
const selPrev = [new Set<string>(), new Set<string>()];
export function pollSelect(player: 0 | 1): { left: boolean; right: boolean; up: boolean; down: boolean; confirm: boolean; back: boolean } {
  const i = readInput(player);
  const now = new Set<string>();
  const edge = (id: string, down: boolean) => {
    if (down) now.add(id);
    return down && !selPrev[player].has(id);
  };
  const r = {
    left: edge("l", i.x < 0), right: edge("r", i.x > 0), up: edge("u", i.z > 0), down: edge("d", i.z < 0),
    confirm: edge("c", i.buttons.lp || i.buttons.lk), back: edge("b", i.buttons.rk),
  };
  selPrev[player] = now;
  return r;
}
export function resetSelectEdges(): void {
  selPrev[0].clear();
  selPrev[1].clear();
}
