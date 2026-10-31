import { BUTTONS, type Button } from "./data/types";
import { emptyInput, type InputFrame } from "./sim/game";

interface KeyMap {
  left: string; right: string; up: string; down: string;
  buttons: Record<Button, string>;
}

// KeyboardEvent.code values, so layouts other than QWERTY still work.
const KEYMAPS: [KeyMap, KeyMap] = [
  { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", buttons: { lp: "KeyF", rp: "KeyG", lk: "KeyV", rk: "KeyB" } },
  { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", buttons: { lp: "KeyU", rp: "KeyI", lk: "KeyJ", rk: "KeyK" } },
];

// Standard gamepad mapping (DualSense/DualShock): 0 ✕, 1 ○, 2 □, 3 △, 12-15 d-pad.
// Tekken PlayStation layout: □ = 1, △ = 2, ✕ = 3, ○ = 4.
const PAD_BUTTONS: Record<Button, number> = { lp: 2, rp: 3, lk: 0, rk: 1 };
const STICK_DEADZONE = 0.5;

const held = new Set<string>();
const prevent = new Set(KEYMAPS.flatMap((m) => [m.left, m.right, m.up, m.down, ...Object.values(m.buttons)]));

export function installKeyboard(): void {
  addEventListener("keydown", (e) => {
    if (prevent.has(e.code)) e.preventDefault();
    held.add(e.code);
  });
  addEventListener("keyup", (e) => held.delete(e.code));
  addEventListener("blur", () => held.clear());
}

function readPads(): Gamepad[] {
  return Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
}

export function connectedPadCount(): number {
  return readPads().length;
}

/** Player 0 uses the first connected pad, player 1 the second. Keyboard always works too. */
export function readInput(player: 0 | 1): InputFrame {
  const map = KEYMAPS[player];
  const out = emptyInput();
  let x = (held.has(map.right) ? 1 : 0) - (held.has(map.left) ? 1 : 0);
  let z = (held.has(map.up) ? 1 : 0) - (held.has(map.down) ? 1 : 0);
  for (const b of BUTTONS) out.buttons[b] = held.has(map.buttons[b]);

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
  out.x = Math.sign(x) as -1 | 0 | 1;
  out.z = Math.sign(z) as -1 | 0 | 1;
  return out;
}

export function restartPressed(): boolean {
  return held.has("KeyR") || readPads().some((p) => p.buttons[9]?.pressed); // Options/Start
}
