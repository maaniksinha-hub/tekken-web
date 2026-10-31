import { characters } from "./data/characters";
import { loadCustomCharacters } from "./data/loader";
import type { CharacterData } from "./data/types";
import { createCpu, type CpuPlayer, type Difficulty } from "./sim/ai";
import {
  createGame, emptyInput, inHeat, inRage, restartMatch, step, HEAT_FRAMES, ROUNDS_TO_WIN, type GameEvent, type GameState,
} from "./sim/game";
import { connectedPadCount, installKeyboard, pollNav, readInput } from "./input";
import { installTouch, setTouchVisible } from "./touch";
import type { Driver } from "./driver";
import { Renderer } from "./render";
import { isMuted, playEvent, setMuted, unlock, bell } from "./audio";
import { duckMusic, playMusic, resumeMusic, setMusicLevel } from "./music";
import { say } from "./announcer";
import { onSettingsChange, settings, updateSettings } from "./settings";
import { STAGES } from "./stages";
import { buildLadder, loadBest, MAX_CONTINUES, saveBest, stageScore, type LadderStep } from "./modes/arcade";
import { DUMMY_LABEL, DUMMY_MODES, trainingDriver, type TrainingDriver } from "./modes/training";
import {
  clearScreen, showControls, showHowTo, showMenu, showMoveList, showSelect, type Screen,
} from "./ui";

type Mode = "local" | "cpu" | "online" | "arcade" | "training";
type AppState = "menu" | "select" | "fight" | "pause" | "moves" | "controls" | "howto" | "settings" | "online" | "result" | "interstitial";

const STEP_MS = 1000 / 60;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

// A WebGL failure should explain itself, not leave a black page.
let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  console.error(err);
  document.getElementById("screen")!.innerHTML =
    '<div class="panel"><h1>Cannot start <span>3D</span></h1><p class="sub">This browser or device could not start WebGL, which the game needs. Try the latest Chrome, Edge, Firefox or Safari, turn on hardware acceleration, or open the game on another device.</p></div>';
  throw err;
}
const params = new URLSearchParams(location.search);
if (params.get("quality")) { renderer.lockQuality = true; renderer.setQuality(params.get("quality") as "low" | "medium" | "high"); }
onSettingsChange(() => { if (!renderer.lockQuality && renderer.quality !== settings.quality) renderer.setQuality(settings.quality); });

installKeyboard();
installTouch(() => { if (state === "fight" && mode !== "online") openPause(); });

let state: AppState = "menu";
let screen: Screen | null = null;
let driver: Driver | null = null;
let mode: Mode = "local";
let difficulty: Difficulty = (localStorage.getItem("tekken-web.difficulty") as Difficulty) || "normal";
let cpu: CpuPlayer | null = null;
let idleGame: GameState = createGame(characters[0], characters[1]); // backdrop behind menus
let stageChoice = Number(localStorage.getItem("tekken-web.stage") ?? -1); // -1 = random

interface ArcadeRun { steps: LadderStep[]; index: number; score: number; continues: number; player: CharacterData; seed: number }
let arcade: ArcadeRun | null = null;
let arcadeAutoAt = 0;

// Combo counter / presentation state.
const combo = { count: [0, 0], last: [-999, -999], show: [0, 0] };
let timeScale = 1;
let slowUntil = 0;
let hintUntil = 0;
let resultShown = false;
let hitstop = 0; // frames the sim is frozen for impact. Offline only: online peers must never diverge in pacing.
let announced = "";
let toastUntil = 0;

function setScreen(next: Screen | null): void {
  // A new screen has already replaced the old one's DOM; only clean up when closing screens entirely.
  const old = screen;
  screen = next;
  if (!next) {
    old?.destroy();
    clearScreen();
  }
}

function toast(text: string): void {
  const t = $("padstatus");
  t.textContent = text;
  toastUntil = performance.now() + 4000;
}

const stageForMatch = () => (stageChoice >= 0 ? stageChoice : Math.floor(Math.random() * STAGES.length));

// ---------- Screens ----------

function goMenu(): void {
  setTouchVisible(false);
  state = "menu";
  driver?.destroy();
  driver = null;
  arcade = null;
  cpu = null;
  $("hud").hidden = true;
  $("training").hidden = true;
  renderer.setCharacters([characters[0], characters[1]]);
  renderer.setStage(0);
  playMusic(0);
  setMusicLevel(0.7);
  idleGame = createGame(characters[0], characters[1]);
  const diffLabel = () => ({ easy: "Easy", normal: "Normal", hard: "Hard" }[difficulty]);
  const best = loadBest();
  setScreen(showMenu({
    title: "TEKKEN",
    titleAccent: "WEB",
    subtitle: "A browser fighting game. Free, no install. Keyboard, PS5 pad or touch.",
    items: [
      { label: () => "Arcade", hint: () => (best ? `best ${best.toLocaleString()}` : "5 fights + boss"), action: () => goSolo("arcade") },
      { label: () => "Local versus", hint: () => "2 players", action: () => goSelect("local") },
      { label: () => "Versus CPU", hint: () => `difficulty: ${diffLabel()}`, action: () => goSelect("cpu") },
      { label: () => "Online versus", hint: () => "2 devices", action: goOnline },
      { label: () => "Training", hint: () => "frame data", action: () => goSolo("training") },
      { label: () => "Move list", action: () => goMoves("menu") },
      { label: () => "How to play", action: () => goHowTo("menu") },
      { label: () => "Controls", action: () => goControls("menu") },
      { label: () => "Settings", action: goSettings },
    ],
    footer: "P1: WASD + F G V B · P2: arrows + U I J K · PS5 pad: D-pad/stick + □ △ ✕ ○ · Esc/Options: pause. Pick with Enter, Space or ✕.",
  }));
  if (!settings.seenHowTo) { updateSettings({ seenHowTo: true }); goHowTo("menu"); }
}

function goSelect(m: "local" | "cpu"): void {
  mode = m;
  state = "select";
  setScreen(showSelect({
    characters,
    mode: m,
    onBack: goMenu,
    onDone: (a, b) => startMatch(a, b),
  }));
}

function goSolo(m: "arcade" | "training"): void {
  mode = m;
  state = "select";
  setScreen(showSelect({
    characters,
    mode: "solo",
    title: m === "arcade" ? "ARCADE: CHOOSE YOUR FIGHTER" : "TRAINING: CHOOSE YOUR FIGHTER",
    onBack: goMenu,
    onDone: (a) => (m === "arcade" ? startArcade(a) : startTraining(a)),
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

function goHowTo(from: "menu" | "pause"): void {
  state = "howto";
  setScreen(showHowTo(() => (from === "menu" ? goMenu() : openPause())));
}

function goSettings(): void {
  state = "settings";
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const stepVol = (key: "sfx" | "music", dir?: -1 | 1) => updateSettings({ [key]: Math.max(0, Math.min(1, Math.round((settings[key] + (dir ?? 1) * 0.1) * 10) / 10)) });
  const stageName = () => (stageChoice < 0 ? "Random" : STAGES[stageChoice].name);
  setScreen(showMenu({
    title: "SETTINGS",
    subtitle: "Left / right changes a value.",
    items: [
      { label: () => "Sound", hint: () => (isMuted() ? "off" : "on"), action: () => setMuted(!isMuted()) },
      { label: () => "Effects volume", hint: () => pct(settings.sfx), action: (d) => stepVol("sfx", d) },
      { label: () => "Music volume", hint: () => pct(settings.music), action: (d) => stepVol("music", d) },
      { label: () => "Announcer voice", hint: () => (settings.announcer ? "on" : "off"), action: () => updateSettings({ announcer: !settings.announcer }) },
      { label: () => "Screen shake", hint: () => (settings.shake ? "on" : "off"), action: () => updateSettings({ shake: !settings.shake }) },
      {
        label: () => "Graphics", hint: () => settings.quality,
        action: (d) => { const q = ["low", "medium", "high"] as const; updateSettings({ quality: q[(q.indexOf(settings.quality) + (d ?? 1) + 3) % 3] }); },
      },
      {
        label: () => "Stage", hint: stageName,
        action: (d) => { stageChoice = ((stageChoice + 1 + (d ?? 1) + STAGES.length + 1) % (STAGES.length + 1)) - 1; localStorage.setItem("tekken-web.stage", String(stageChoice)); },
      },
      {
        label: () => "CPU difficulty", hint: () => difficulty,
        action: (d) => {
          const order: Difficulty[] = ["easy", "normal", "hard"];
          difficulty = order[(order.indexOf(difficulty) + (d ?? 1) + 3) % 3];
          localStorage.setItem("tekken-web.difficulty", difficulty);
        },
      },
      { label: () => "Back", action: goMenu },
    ],
    onBack: goMenu,
  }));
}

function goOnline(): void {
  state = "online";
  void import("./online-ui").then(({ showOnline }) => {
    setScreen(showOnline({
      characters,
      onBack: goMenu,
      onStart: (d: Driver, chars: [CharacterData, CharacterData]) => {
        mode = "online";
        beginDriver(d, chars);
      },
    }));
  });
}

function openPause(): void {
  setTouchVisible(false);
  state = "pause";
  renderer.animate = false;
  setMusicLevel(0.3);
  const items = [
    { label: () => "Resume", action: resume },
    ...(mode === "training" && driver ? [
      { label: () => "Dummy", hint: () => DUMMY_LABEL[(driver as TrainingDriver).dummy], action: (d?: -1 | 1) => {
        const t = driver as TrainingDriver;
        t.dummy = DUMMY_MODES[(DUMMY_MODES.indexOf(t.dummy) + (d ?? 1) + DUMMY_MODES.length) % DUMMY_MODES.length];
      } },
      { label: () => "Reset positions", action: () => { (driver as TrainingDriver).resetPositions(); resume(); } },
    ] : []),
    { label: () => "Move list", action: () => goMoves("pause") },
    { label: () => "How to play", action: () => goHowTo("pause") },
    { label: () => "Controls", action: () => goControls("pause") },
    ...(mode !== "training" ? [{ label: () => "Restart match", action: () => { resume(); if (driver && mode !== "arcade") { restartMatch(driver.game); resetFx(); } else if (arcade) startArcadeFight(); } }] : []),
    { label: () => "Quit to menu", action: goMenu },
  ];
  setScreen(showMenu({ title: "PAUSED", items, onBack: resume }));
}

function resume(): void {
  setTouchVisible(true);
  setScreen(null);
  state = "fight";
  renderer.animate = true;
  setMusicLevel(1);
}

function showResult(winner: 0 | 1): void {
  resultShown = true;
  state = "result";
  if (mode === "arcade" && arcade) { arcadeResult(winner); return; }
  const name = driver?.game.fighters[winner].char.name ?? "";
  say(`${name} wins`, true);
  setScreen(showMenu({
    title: `${name} WINS`,
    subtitle: `${driver?.game.wins[0]} - ${driver?.game.wins[1]}`,
    items: [
      { label: () => "Rematch", action: () => { setScreen(null); if (driver) { restartMatch(driver.game); resetFx(); state = "fight"; resultShown = false; } } },
      { label: () => "Change fighters", action: () => goSelect(mode === "cpu" ? "cpu" : "local") },
      { label: () => "Main menu", action: goMenu },
    ],
  }));
}

// ---------- Arcade ----------

function startArcade(player: CharacterData): void {
  const seed = (Date.now() & 0xffff) + 1;
  arcade = { steps: buildLadder(player, characters, seed), index: 0, score: 0, continues: 0, player, seed };
  arcadeIntro();
}

function arcadeIntro(): void {
  if (!arcade) return;
  state = "interstitial";
  const st = arcade.steps[arcade.index];
  $("hud").hidden = true;
  setTouchVisible(false);
  arcadeAutoAt = performance.now() + 3200;
  setScreen(showMenu({
    title: `STAGE ${arcade.index + 1} / ${arcade.steps.length}`,
    titleAccent: st.boss ? "BOSS" : "",
    subtitle: `${arcade.player.name} vs ${st.opponent.name} · ${st.difficulty.toUpperCase()} · score ${arcade.score.toLocaleString()}`,
    items: [{ label: () => "Fight!", action: startArcadeFight }, { label: () => "Quit to menu", action: goMenu }],
    onBack: goMenu,
  }));
}

function startArcadeFight(): void {
  if (!arcade) return;
  arcadeAutoAt = 0;
  mode = "arcade";
  const st = arcade.steps[arcade.index];
  cpu = createCpu(1, st.difficulty, arcade.seed + arcade.index * 31);
  beginDriver(localDriver(createGame(arcade.player, st.opponent)), [arcade.player, st.opponent], arcade.index % STAGES.length);
}

function arcadeResult(winner: 0 | 1): void {
  if (!arcade || !driver) return;
  const a = arcade;
  if (winner === 0) {
    a.score += stageScore(driver.game, a.index, a.continues);
    if (a.index + 1 >= a.steps.length) {
      const isBest = saveBest(a.score);
      say("Arcade clear", true);
      setScreen(showMenu({
        title: "ARCADE CLEAR",
        subtitle: `Final score ${a.score.toLocaleString()}${isBest ? " · NEW BEST!" : ` · best ${loadBest().toLocaleString()}`} · continues used: ${a.continues}`,
        items: [{ label: () => "Play again", action: () => goSolo("arcade") }, { label: () => "Main menu", action: goMenu }],
      }));
    } else {
      a.index += 1;
      arcadeIntro();
    }
    return;
  }
  const left = MAX_CONTINUES - a.continues;
  setScreen(showMenu({
    title: "DEFEATED",
    subtitle: `Stage ${a.index + 1}. Score ${a.score.toLocaleString()}.`,
    items: [
      { label: () => "Continue", hint: () => `${left} left · -400 points`, disabled: () => left <= 0, action: () => { a.continues += 1; arcadeIntro(); } },
      { label: () => "Quit to menu", action: () => { saveBest(a.score); goMenu(); } },
    ],
    onBack: () => { saveBest(a.score); goMenu(); },
  }));
}

// ---------- Training ----------

function startTraining(player: CharacterData): void {
  mode = "training";
  const dummy = characters.find((c) => c.id !== player.id) ?? player;
  const d = trainingDriver(createGame(player, dummy), () => readInput(0));
  beginDriver(d, [player, dummy]);
  $("training").hidden = false;
}

function updateTrainingPanel(d: TrainingDriver): void {
  const s = d.stats;
  const adv = s.advantage === null ? "-" : `${s.advantage > 0 ? "+" : ""}${s.advantage}`;
  const cls = s.advantage === null ? "" : s.advantage > 0 ? "pos" : s.advantage < 0 ? "neg" : "";
  $("training").innerHTML =
    `<div class="t">TRAINING · dummy: ${DUMMY_LABEL[d.dummy]}</div>` +
    `<div>Last hit: ${s.lastDamage} dmg</div>` +
    `<div>Combo: ${s.comboHits} hits · ${s.comboDamage} dmg</div>` +
    `<div>${s.lastMove || "last move"} on ${s.advantageOn ?? "-"}: <span class="${cls}">${adv}</span> frames</div>` +
    `<div class="inputs">${d.history.slice(-10).join("  ")}</div>` +
    `<div style="opacity:.55;margin-top:4px">Esc: dummy / reset</div>`;
}

// ---------- Match ----------

function resetFx(): void {
  hitstop = 0;
  combo.count = [0, 0]; combo.last = [-999, -999]; combo.show = [0, 0];
  timeScale = 1;
  resultShown = false;
  announced = "";
}

export function localDriver(game: GameState): Driver {
  return {
    game,
    step() {
      const p1 = readInput(0);
      // Versus CPU / arcade: the CPU is player 2; otherwise player 2 reads its own keys / pad.
      const p2 = cpu ? cpu.next(game) : readInput(1);
      step(game, [p1, p2]);
    },
    destroy() {},
  };
}

function startMatch(a: CharacterData, b: CharacterData): void {
  cpu = mode === "cpu" ? createCpu(1, difficulty, (Date.now() & 0xffff) + 1) : null;
  beginDriver(localDriver(createGame(a, b)), [a, b]);
}

function beginDriver(d: Driver, chars: [CharacterData, CharacterData], stage = stageForMatch()): void {
  driver?.destroy();
  driver = d;
  resetFx();
  setScreen(null);
  state = "fight";
  renderer.animate = true;
  renderer.setCharacters(chars);
  renderer.setStage(stage);
  playMusic(STAGES[renderer.stageIndex].music);
  setMusicLevel(1);
  $("name0").textContent = chars[0].name;
  $("name1").textContent = chars[1].name;
  $("hud").hidden = false;
  $("training").hidden = mode !== "training";
  setTouchVisible(true);
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
      if (e.power > 0.6) duckMusic();
    }
    if (e.type === "ko") { slowUntil = performance.now() + 1500; duckMusic(); if (mode !== "training") say("K.O.!", true); }
    if (e.type === "heat") say("Heat!");
    if (e.type === "rage") say("Rage art!");
    if (mode !== "online") {
      const stop = e.type === "hit" ? 2 + Math.round(e.power * 5) : e.type === "block" ? 2 : e.type === "launch" || e.type === "splat" ? 7 : e.type === "ko" ? 14 : 0;
      hitstop = Math.max(hitstop, stop);
    }
  }
}

const pips = (n: number) => "●".repeat(n) + "○".repeat(Math.max(0, ROUNDS_TO_WIN - n));
const ROUND_WORDS = ["", "Round one", "Round two", "Final round"];

function updateHud(g: GameState): void {
  const training = mode === "training";
  g.fighters.forEach((f, i) => {
    const pct = (f.hp / f.char.maxHp) * 100;
    $(`hp${i}`).style.width = `${pct}%`;
    $(`trail${i}`).style.width = `${pct}%`;
    $(`heat${i}`).style.width = f.heatUsed ? `${(f.heat / HEAT_FRAMES) * 100}%` : "0%";
    $(`side${i}`).classList.toggle("rage", inRage(f));
    $(`tag${i}`).textContent = inHeat(f) ? "HEAT" : inRage(f) ? "RAGE" : "";
    $(`pips${i}`).textContent = training ? "" : pips(g.wins[i]);
    const c = $(`combo${i === 0 ? 0 : 1}`);
    const on = g.tick < combo.show[i] && combo.count[i] >= 2;
    c.classList.toggle("on", on);
    if (on) c.textContent = `${combo.count[i]} HITS`;
  });
  $("timer").textContent = training ? "∞" : String(Math.ceil(g.timer / 60));
  const banner = $("banner");
  if (training) {
    banner.textContent = "";
  } else if (g.phase === "fight") {
    banner.textContent = g.phaseFrame < 60 ? `ROUND ${g.round}` : g.phaseFrame < 95 ? "FIGHT!" : "";
    // Announce each round once: "Round one" then "Fight!".
    const key = `${g.round}`;
    if (g.phaseFrame < 60 && announced !== `r${key}`) { announced = `r${key}`; say(g.round >= 3 ? "Final round" : ROUND_WORDS[g.round] ?? `Round ${g.round}`, true); }
    if (g.phaseFrame >= 60 && g.phaseFrame < 95 && announced !== `f${key}`) { announced = `f${key}`; say("Fight!"); }
  } else if (g.phase === "roundEnd") {
    banner.textContent = g.winner === "draw" ? "DRAW" : g.fighters.some((f) => f.hp === 0) ? "K.O.!" : "TIME UP";
  } else {
    banner.textContent = "";
  }
  $("hint").textContent = performance.now() < hintUntil
    ? training
      ? "Training: hit the dummy · Esc = change dummy / reset · the panel shows damage and frame advantage"
      : "Hold down = crouch · hold up = jump · back = block · 1+3 / 2+4 throw (break with 1 / 2) · 1+2 Rage Art (low health) · 3+4 Heat · Esc = pause"
    : "";
}

// ---------- Pad status ----------

let lastPads = -1;
function updatePadStatus(): void {
  if (performance.now() < toastUntil) return;
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
const unlockAudio = () => { if (!audioUnlocked) { unlock(); audioUnlocked = true; resumeMusic(); } };
addEventListener("pointerdown", unlockAudio);
addEventListener("keydown", unlockAudio);
addEventListener("gamepadconnected", () => { lastPads = -1; });
addEventListener("gamepaddisconnected", () => { lastPads = -1; });
addEventListener("blur", () => { if (state === "fight" && mode !== "online") openPause(); });
addEventListener("keydown", (e) => { if (e.code === "KeyR" && state === "fight" && mode === "training") (driver as TrainingDriver).resetPositions(); });

void loadCustomCharacters(import.meta.env.BASE_URL, new Set(characters.map((c) => c.id))).then((extra) => {
  characters.push(...extra);
});

// Installable + offline: register the service worker in production builds only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* private mode etc.: fine */ }); });
}

// Fullscreen toggle (not available on iPhone Safari, so the button hides itself there).
const fsBtn = $("fs");
if (document.fullscreenEnabled) {
  fsBtn.hidden = false;
  fsBtn.addEventListener("click", () => {
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    void document.documentElement.requestFullscreen().then(() => (window.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation?.lock?.("landscape")?.catch(() => {})).catch(() => {});
  });
}

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

  if (state === "interstitial" && arcadeAutoAt && now > arcadeAutoAt) startArcadeFight();

  if (state === "fight" || state === "result") {
    timeScale = now < slowUntil ? 0.3 : 1;
    acc += dtReal * timeScale;
    while (acc >= STEP_MS && driver && state === "fight") {
      if (hitstop > 0) { hitstop -= 1; acc -= STEP_MS; continue; }
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
      if (mode === "training") updateTrainingPanel(driver as TrainingDriver);
      if (driver.status) $("banner").textContent = driver.status;
      if (driver.closed && state === "fight") {
        $("banner").textContent = "OPPONENT LEFT";
        state = "result";
        setTimeout(goMenu, 2500);
      }
    }
    if (state === "fight") {
      const lower = renderer.sampleFrame(dtReal);
      if (lower) { updateSettings({ quality: lower }); renderer.setQuality(lower); toast(`Graphics lowered to ${lower} for smoother play. Change it in Settings.`); }
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
  get mode() { return mode; },
  get game() { return driver?.game ?? null; },
  get arcade() { return arcade; },
  get quality() { return renderer.quality; },
  get stage() { return renderer.stageIndex; },
  get driver() { return driver; },
  get fx() { return renderer.fxCounts(); },
  get hitstop() { return hitstop; },
  forceTouch: (on: boolean) => setTouchVisible(on, true),
  start: (m: "local" | "cpu", a = 0, b = 1) => { mode = m; startMatch(characters[a], characters[b]); },
  startArcade: (a = 0) => { startArcade(characters[a]); },
  startTraining: (a = 0) => { startTraining(characters[a]); },
  setStage: (i: number) => renderer.setStage(i),
};
