# Tekken Web

A browser-based 3D fighting game inspired by Tekken 8's mechanics (4-limb attacks, sidestep,
block-by-holding-back, best-of-3 rounds). Built with Babylon.js + TypeScript. Local 2-player,
keyboard and PS5 (DualSense) controllers. Original placeholder characters; custom characters
are data-driven.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # simulation tests
npm run build    # production build in dist/
```

## Controls
| | Keyboard | PS5 pad |
|---|---|---|
| Move | P1 `A`/`D`, P2 `←`/`→` | D-pad or left stick |
| Sidestep | P1 `W`/`S`, P2 `↑`/`↓` | D-pad / stick up-down |
| Attacks 1 2 3 4 | P1 `F G V B`, P2 `U I J K` | □ △ ✕ ○ |
| Block | hold back (away from opponent) | same |
| Crouch | hold down (a quick tap is a sidestep) | same |
| Specials | `d/f+2`, `d+4`, `f,f+1` (KAI) / `d/f+1`, `d+3`, `f,f+2` (RIN) | same |
| Restart match | `R` | Options |

Pad 1 controls player 1, pad 2 controls player 2. Keyboard works alongside. Connect a pad via
USB or Bluetooth and press any button once so the browser detects it (Chrome/Edge recommended).

## Architecture
- `src/sim/game.ts` - deterministic 60 fps simulation. No rendering, DOM, randomness or wall-clock
  time, so it is testable and ready for replays and rollback netcode.
- `src/data/` - characters and moves as plain data (`CharacterData`).
- `src/render.ts` - Babylon.js presentation only; reads sim state, never changes it.
- `src/input.ts` - keyboard and Gamepad API to `InputFrame`.

## Attack heights
Each move is `high`, `mid` or `low`. Highs whiff against a crouching opponent. Lows must be blocked
crouching (hold back + down); mids must be blocked standing.

## Adding a character
Add an entry to `src/data/characters.ts` (stats, four moves, colours). To use a real 3D model
instead of the placeholder body, see [ASSETS.md](ASSETS.md).

## Roadmap
1. [x] Movement, sidestep, 4 attacks, blocking, rounds, 2 players, PS5 pad
2. [x] Crouch, high/mid/low attacks, input buffer + notation move list (`d/f+2`, `f,f+1`)
3. [ ] Jump, throws, string followups (`1,2,3`), combos and juggles
4. [ ] Rage, Heat, wall and juggle systems
5. [ ] GLB character loading + character select
6. [ ] AI opponent
7. [ ] Online play (WebRTC rollback)

## Legal
Tekken is a trademark of Bandai Namco. This is an unaffiliated fan project that copies game
*mechanics* only. Do not add Tekken characters, models, audio or other copyrighted assets.
