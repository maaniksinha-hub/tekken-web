import { characters } from "./data/characters";
import { loadCustomCharacters } from "./data/loader";
import type { CharacterData } from "./data/types";
import { createCpu, type CpuPlayer, type Difficulty } from "./sim/ai";
import {
  createGame, emptyInput, inHeat, inRage, restartMatch, step, HEAT_FRAMES, ROUNDS_TO_WIN, type GameEvent, type GameState,
} from "./sim/game";
import { connectedPadCount, installKeyboard, pollNav, readInput } from "./input";
import type { Driver } from "./driver";
import { Renderer } from "./render";
import { isMuted, playEvent, setMuted, unlock, bell, uiSelect } from "./audio";
import {
  clearScreen, showControls, showMenu, showMoveList, showSelect, type Screen,
} from "./ui";

type Mode = "local" | "cpu" | "online";
type AppState = "menu" | "select" | "fight" | "pause" | "moves" | "controls" | "online" | "result";


const STEP_MS = 1000 / 60;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

const renderer = new Renderer(canvas);
installKeyboard();

let state: AppState = "menu";
let screen: Screen | null = null;
let driver: Driver | null = null;
let mode: Mode = "local";
let difficulty: Difficulty = (localStorage.getItem("tekken-web.difficulty") as Difficulty) || "normal";
let chosen: [CharacterData, CharacterData] = [characters[0], characters[1]];
let cpu: CpuPlayer | null = null;
let idleGame: GameState = createGame(characters[0], characters[1]); // backdrop behind menus

// Combo counter / presentation state.
const combo = { count: [0, 0], last: [-999, -999], show: [0, 0] };
let timeScale = 1;
let slowUntil = 0;
let hintUntil = 0;
let resultShown = false;

function setScreen(next: Screen | null): void {
  // A new screen has already replaced the old one's DOM; only clean up when closing screens entirely.
  const old = screen;
  screen = next;
  if (!next) {
    old?.destroy();
    clearScreen();
  }
}

// ---------- Screens ----------

function goMenu(): void {
  state = "menu";
  driver?.destroy();
  driver = null;
  $("hud").hidden = true;
  renderer.setCharacters([characters[0], characters[1]]);
  idleGame = createGame(characters[0], characters[1]);
  const diffLabel = () => ({ easy: "Easy", normal: "Normal", hard: "Hard" }[difficulty]);
  setScreen(showMenu({
    title: "TEKKEN",
    titleAccent: "WEB",
    subtitle: "A browser fighting game. 2 players on one screen, PS5 controllers supported.",
    items: [
      { label: () => "Local versus", hint: () => "2 players", action: () => goSelect("local") },
      { label: () => "Versus CPU", hint: () => `difficulty: ${diffLabel()}`, action: () => goSelect("cpu") },
      {
        label: () => "CPU difficulty", hint: () => diffLabel(),
        action: (dir) => {
          const order: Difficulty[] = ["easy", "normal", "hard"];
          difficulty = order[(order.indexOf(difficulty) + (dir ?? 1) + 3) % 3];
          localStorage.setItem("tekken-web.difficulty", difficulty);
        },
      },
      { label: () => "Online versus", hint: () => "2 devices", action: goOnline },
      { label: () => "Move list", action: () => goMoves("menu") },
      { label: () => "Controls", action: () => goControls("menu") },
      { label: () => "Sound", hint: () => (isMuted() ? "off" : "on"), action: () => setMuted(!isMuted()) },
    ],
    footer: "P1: WASD + F G V B · P2: arrows + U I J K · PS5 pad: D-pad/stick + □ △ ✕ ○ · Esc/Options: pause. Pick with Enter, Space or ✕.",
  }));
}

function goSelect(m: Mode): void {
  mode = m;
  state = "select";
  setScreen(showSelect({
    characters,
    mode: m === "cpu" ? "cpu" : "local",
    onBack: goMenu,
    onDone: (a, b) => startMatch(a, b),
  }));
}

function goMoves(from: "menu" | "pause"): void {
  state = "moves";
  const back = () => (from === "menu" ? goMenu() : openPause());
  setScreen(showMoveList(characters, 0, back));
}

function goControls(from: "menu" | "pause"): void {
  state = "controls";
  const back = () => (from === "menu" ? goMenu() : openPause());
  setScreen(showControls(back, connectedPadCount));
}

function goOnline(): void {
  state = "online";
  void import("./online-ui").then(({ showOnline }) => {
    setScreen(showOnline({
      characters,
      onBack: goMenu,
      onStart: (d: Driver, chars: [CharacterData, CharacterData]) => {
        mode = "online";
        chosen = chars;
        beginDriver(d, chars);
      },
    }));
  });
}

function openPause(): void {
  state = "pause";
  renderer.animate = false;
  setScreen(showMenu({
    title: "PAUSED",
    items: [
      { label: () => "Resume", action: resume },
      { label: () => "Move list", action: () => goMoves("pause") },
      { label: () => "Controls", action: () => goControls("pause") },
      { label: () => "Restart match", action: () => { resume(); if (driver) { restartMatch(driver.game); resetFx(); } } },
      { label: () => "Quit to menu", action: goMenu },
    ],
    onBack: resume,
  }));
}

function resume(): void {
  setScreen(null);
  state = "fight";
  renderer.animate = true;
}

function showResult(winner: 0 | 1): void {
  resultShown = true;
  state = "result";
  const name = driver?.game.fighters[winner].char.name ?? "";
  const items = [
    { label: () => "Rematch", action: () => { setScreen(null); if (driver) { restartMatch(driver.game); resetFx(); state = "fight"; resultShown = false; } } },
    { label: () => "Change fighters", action: () => goSelect(mode === "online" ? "local" : mode) },
    { label: () => "Main menu", action: goMenu },
  ];
  setScreen(showMenu({ title: `${name} WINS`, subtitle: `${driver?.game.wins[0]} - ${driver?.game.wins[1]}`, items }));
}

// ---------- Match ----------

function resetFx(): void {
  combo.count = [0, 0]; combo.last = [-999, -999]; combo.show = [0, 0];
  timeScale = 1;
  resultShown = false;
}

export function localDriver(game: GameState): Driver {
  return {
    game,
    step() {
      const p1 = readInput(0);
      // Versus CPU: the CPU is player 2; otherwise player 2 reads its own keys / pad.
      const p2 = cpu ? cpu.next(game) : readInput(1);
      step(game, [p1, p2]);
    },
    destroy() {},
  };
}

function startMatch(a: CharacterData, b: CharacterData): void {
  chosen = [a, b];
  cpu = mode === "cpu" ? createCpu(1, difficulty, (Date.now() & 0xffff) + 1) : null;
  beginDriver(localDriver(createGame(a, b)), chosen);
}

function beginDriver(d: Driver, chars: [CharacterData, CharacterData]): void {
  driver?.destroy();
  driver = d;
  resetFx();
  setScreen(null);
  state = "fight";
  renderer.animate = true;
  renderer.setCharacters(chars);
  $("name0").textContent = chars[0].name;
  $("name1").textContent = chars[1].name;
  $("hud").hidden = false;
  hintUntil = performance.now() + 9000;
  bell();
}

function handleEvents(events: GameEvent[], tick: number): void {
  if (events.length === 0) return;
  renderer.handleEvents(events);
  for (const e of events) {
    playEvent(e);
    if (e.type === "hit" || e.type === "launch" || e.type === "splat") {
      const i = e.by;
      combo.count[i] = tick - combo.last[i] < 80 ? combo.count[i] + 1 : 1;
      combo.last[i] = tick;
      combo.show[i] = tick + 100;
    }
    if (e.type === "ko") { slowUntil = performance.now() + 1500; }
  }
}

const pips = (n: number) => "●".repeat(n) + "○".repeat(Math.max(0, ROUNDS_TO_WIN - n));

function updateHud(g: GameState): void {
  g.fighters.forEach((f, i) => {
    const pct = (f.hp / f.char.maxHp) * 100;
    $(`hp${i}`).style.width = `${pct}%`;
    $(`trail${i}`).style.width = `${pct}%`;
    $(`heat${i}`).style.width = f.heatUsed ? `${(f.heat / HEAT_FRAMES) * 100}%` : "0%";
    $(`side${i}`).classList.toggle("rage", inRage(f));
    $(`tag${i}`).textContent = inHeat(f) ? "HEAT" : inRage(f) ? "RAGE" : "";
    $(`pips${i}`).textContent = pips(g.wins[i]);
    const c = $(`combo${i === 0 ? 0 : 1}`);
    const on = g.tick < combo.show[i] && combo.count[i] >= 2;
    c.classList.toggle("on", on);
    if (on) c.textContent = `${combo.count[i]} HITS`;
  });
  $("timer").textContent = String(Math.ceil(g.timer / 60));
  const banner = $("banner");
  if (g.phase === "fight") {
    banner.textContent = g.phaseFrame < 60 ? `ROUND ${g.round}` : g.phaseFrame < 95 ? "FIGHT!" : "";
  } else if (g.phase === "roundEnd") {
    banner.textContent = g.winner === "draw" ? "DRAW" : g.fighters.some((f) => f.hp === 0) ? "K.O.!" : "TIME UP";
  } else {
    banner.textContent = "";
  }
  $("hint").textContent = performance.now() < hintUntil
    ? "Hold down = crouch · hold up = jump · back = block · 1+3 / 2+4 throw (break with 1 / 2) · 1+2 Rage Art (low health) · 3+4 Heat · Esc = pause"
    : "";
}

// ---------- Pad status ----------

let lastPads = -1;
function updatePadStatus(): void {
  const n = connectedPadCount();
  if (n === lastPads) return;
  lastPads = n;
  const pads = Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
  $("padstatus").textContent = n === 0 ? "" : `🎮 ${pads.map((p) => (/dualsense|wireless controller|054c/i.test(p.id) ? "PS5/PS4 pad" : "Gamepad")).join(" + ")} connected`;
}

// ---------- Main loop ----------

let last = performance.now();
let acc = 0;
let audioUnlocked = false;
const unlockAudio = () => { if (!audioUnlocked) { unlock(); audioUnlocked = true; } };
addEventListener("pointerdown", unlockAudio);
addEventListener("keydown", unlockAudio);
addEventListener("gamepadconnected", () => { lastPads = -1; });
addEventListener("gamepaddisconnected", () => { lastPads = -1; });
addEventListener("blur", () => { if (state === "fight" && mode !== "online") openPause(); });

void loadCustomCharacters(import.meta.env.BASE_URL, new Set(characters.map((c) => c.id))).then((extra) => {
  characters.push(...extra);
});

goMenu();

renderer.engine.runRenderLoop(() => {
  const now = performance.now();
  const dtReal = Math.min(now - last, 250);
  last = now;
  updatePadStatus();

  const nav = pollNav();
  if (nav.confirm || nav.up || nav.down) unlockAudio();
  if (screen && state !== "fight") screen.update(nav);
  else if (state === "fight" && nav.start && mode !== "online") openPause();

  if (state === "fight" || state === "result") {
    timeScale = now < slowUntil ? 0.3 : 1;
    acc += dtReal * timeScale;
    while (acc >= STEP_MS && driver && state === "fight") {
      driver.step();
      handleEvents(driver.game.events.splice(0), driver.game.tick);
      acc -= STEP_MS;
      if (driver.game.phase === "matchEnd" && !resultShown) {
        showResult(driver.game.wins[0] >= ROUNDS_TO_WIN ? 0 : 1);
        break;
      }
    }
    if (driver) {
      renderer.draw(driver.game, dtReal / 1000);
      updateHud(driver.game);
      if (driver.status) $("banner").textContent = driver.status;
      if (driver.closed && state === "fight") {
        $("banner").textContent = "OPPONENT LEFT";
        state = "result";
        setTimeout(goMenu, 2500);
      }
    }
  } else if (state === "pause") {
    if (driver) renderer.draw(driver.game, 0);
  } else {
    // Menus: idle fighters in front of the stage.
    acc = 0;
    step(idleGame, [emptyInput(), emptyInput()]);
    renderer.draw(idleGame, dtReal / 1000);
  }
  renderer.scene.render();
});

// Handles for automated tests and debugging in the console.
const w = window as unknown as Record<string, unknown>;
w.__tw = {
  get state() { return state; },
  get game() { return driver?.game ?? null; },
  start: (m: Mode, a = 0, b = 1) => { mode = m; startMatch(characters[a], characters[b]); },
  uiSelectSound: uiSelect,
};
