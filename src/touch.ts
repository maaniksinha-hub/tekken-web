import { BUTTONS, type Button } from "./data/types";

/**
 * On-screen controls for phones and tablets: a virtual stick on the left, the four attack buttons on the
 * right, and shortcuts for the two-button moves (throw, Rage Art, Heat). Multi-touch, so you can hold a
 * direction and press buttons at the same time. Only shown on touch devices, and only during a fight.
 */

export interface TouchState {
  x: -1 | 0 | 1;
  z: -1 | 0 | 1;
  buttons: Record<Button, boolean>;
}

const state: TouchState = { x: 0, z: 0, buttons: { lp: false, rp: false, lk: false, rk: false } };
let root: HTMLElement | null = null;
let enabled = false;
let onPause: (() => void) | null = null;

export const isTouchDevice = () =>
  typeof window !== "undefined" && ("ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0) &&
  window.matchMedia?.("(pointer: coarse)").matches !== false;

export const touchState = (): TouchState => state;

const MIN_PRESS_MS = 70;
const GLYPH: Record<Button, string> = { lp: "□", rp: "△", lk: "✕", rk: "○" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function installTouch(onPauseRequest: () => void): void {
  onPause = onPauseRequest;
  if (root) return;
  root = el("div", "touch");
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");

  // Stick
  const stick = el("div", "stick");
  const knob = el("div", "knob");
  stick.append(knob);
  let stickId: number | null = null;
  let origin = { x: 0, y: 0 };
  const setDir = (dx: number, dy: number) => {
    const dead = 16;
    state.x = Math.abs(dx) < dead ? 0 : dx > 0 ? 1 : -1;
    state.z = Math.abs(dy) < dead ? 0 : dy < 0 ? 1 : -1; // up on screen = up/jump
    const len = Math.min(44, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    knob.style.transform = `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px)`;
  };
  stick.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const r = stick.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setDir(e.clientX - origin.x, e.clientY - origin.y);
    e.preventDefault();
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickId) setDir(e.clientX - origin.x, e.clientY - origin.y);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    state.x = 0; state.z = 0;
    knob.style.transform = "";
  };
  stick.addEventListener("pointerup", release);
  stick.addEventListener("pointercancel", release);

  // Attack buttons in a diamond: 1 left, 2 top, 3 bottom, 4 right (matches the PlayStation layout).
  const pad = el("div", "faces");
  const make = (label: string, cls: string, down: (on: boolean) => void) => {
    const b = el("button", `tb ${cls}`, label);
    b.type = "button";
    const ids = new Set<number>();
    let downAt = 0;
    b.addEventListener("pointerdown", (e) => { ids.add(e.pointerId); downAt = performance.now(); b.setPointerCapture(e.pointerId); b.classList.add("on"); down(true); e.preventDefault(); });
    // A very quick tap can start and end between two game frames and be missed, so a press always lasts at least MIN_PRESS_MS.
    const up = (e: PointerEvent) => {
      ids.delete(e.pointerId);
      if (ids.size > 0) return;
      const release = () => { if (ids.size === 0) { b.classList.remove("on"); down(false); } };
      const held = performance.now() - downAt;
      if (held < MIN_PRESS_MS) setTimeout(release, MIN_PRESS_MS - held); else release();
    };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  };
  const face = (b: Button, cls: string) => make(GLYPH[b], `face ${cls}`, (on) => (state.buttons[b] = on));
  pad.append(face("lp", "f1"), face("rp", "f2"), face("lk", "f3"), face("rk", "f4"));

  // Two-button shortcuts press both buttons at once.
  const shortcut = (label: string, cls: string, a: Button, b: Button) =>
    make(label, `tcombo ${cls}`, (on) => { state.buttons[a] = on; state.buttons[b] = on; });
  const combos = el("div", "combos");
  combos.append(shortcut("THROW", "c-throw", "lp", "lk"), shortcut("RAGE", "c-rage", "lp", "rp"), shortcut("HEAT", "c-heat", "lk", "rk"));

  const pause = make("II", "pausebtn", (on) => { if (on) onPause?.(); });
  const hint = el("div", "rotate", "Rotate your phone sideways for the best view");
  root.append(stick, pad, combos, pause, hint);
  document.body.append(root);

  // Safety: clear everything if the page loses focus mid-touch.
  addEventListener("blur", clearTouch);
}

export function clearTouch(): void {
  state.x = 0; state.z = 0;
  for (const b of BUTTONS) state.buttons[b] = false;
  root?.querySelectorAll(".on").forEach((n) => n.classList.remove("on"));
}

/** Show the controls (only has an effect on touch devices unless `force` is set for testing). */
export function setTouchVisible(visible: boolean, force = false): void {
  enabled = visible && (force || isTouchDevice());
  if (root) root.hidden = !enabled;
  if (!enabled) clearTouch();
}

export const touchVisible = () => enabled;
