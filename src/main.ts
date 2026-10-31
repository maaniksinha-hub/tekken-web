import { characters } from "./data/characters";
import { createGame, restartMatch, step, ROUNDS_TO_WIN, type GameState } from "./sim/game";
import { installKeyboard, readInput, restartPressed } from "./input";
import { Renderer } from "./render";

const STEP_MS = 1000 / 60;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const game: GameState = createGame(characters[0], characters[1]);
const renderer = new Renderer(canvas, [characters[0], characters[1]]);
installKeyboard();

const bars = Array.from(document.querySelectorAll<HTMLDivElement>(".bar > div"));
const timerEl = document.getElementById("timer") as HTMLDivElement;
const banner = document.getElementById("banner") as HTMLDivElement;
(document.getElementById("name0") as HTMLElement).textContent = characters[0].name;
(document.getElementById("name1") as HTMLElement).textContent = characters[1].name;

function updateHud(g: GameState): void {
  g.fighters.forEach((f, i) => (bars[i].style.width = `${(f.hp / f.char.maxHp) * 100}%`));
  timerEl.textContent = String(Math.ceil(g.timer / 60));
  if (g.phase === "fight") {
    banner.textContent = g.phaseFrame < 60 ? `ROUND ${g.round}` : g.phaseFrame < 90 ? "FIGHT!" : "";
  } else if (g.phase === "roundEnd") {
    banner.textContent = g.winner === "draw" ? "DRAW" : "K.O.";
  } else {
    const w = g.wins[0] >= ROUNDS_TO_WIN ? 0 : 1;
    banner.textContent = `${g.fighters[w].char.name} WINS — press R`;
  }
}

// Fixed 60 Hz simulation, rendered at the display rate.
let last = performance.now();
let acc = 0;
let wasRestart = false;
renderer.engine.runRenderLoop(() => {
  const now = performance.now();
  acc = Math.min(acc + (now - last), 250); // avoid a spiral after tab switches
  last = now;

  const r = restartPressed();
  if (r && !wasRestart) restartMatch(game);
  wasRestart = r;

  while (acc >= STEP_MS) {
    step(game, [readInput(0), readInput(1)]);
    acc -= STEP_MS;
  }
  renderer.draw(game.fighters);
  updateHud(game);
  renderer.scene.render();
});

// Handy for debugging in the console and for automated checks.
(window as unknown as { __game: GameState }).__game = game;
canvas.focus();
