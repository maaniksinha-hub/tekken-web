# Tekken Web

A browser-based 3D fighting game inspired by Tekken 8's mechanics. Two players on one screen, versus the
CPU, or online over a direct browser-to-browser link. PS5 (DualSense) controllers are supported, and you
can add your own characters without touching code.

**Play:** https://maaniksinha-hub.github.io/tekken-web/

Everything is original and free: characters, stage and sounds are generated in code, the game is hosted on
GitHub Pages, and nothing needs an account or a server.

## Features
- **Modes:** local 2-player, versus CPU (easy / normal / hard), online versus (WebRTC with rollback netcode).
- **Tekken-style mechanics:** four limb buttons (1 2 3 4), sidestep, crouch, jump, blocking by holding back,
  high / mid / low attacks, throws and throw breaks, strings (`1,2,3`), launchers and juggles, wall splat,
  Rage (Rage Art), Heat (Heat Burst, chip damage), best-of-3 rounds.
- **Move list:** notation-based specials such as `d/f+2` and `f,f+1`, with an input buffer.
- **Presentation:** articulated fighters, stage with shadows, tracking camera, hit sparks, screen shake, KO
  slow-motion, combo counter, synthesised sound.
- **Controls:** keyboard (remappable), PS5 / PS4 / standard gamepads, menu navigation by pad.
- **Custom characters:** drop in a JSON file (and optionally a `.glb` model). See [CHARACTERS.md](CHARACTERS.md)
  and [ASSETS.md](ASSETS.md).

## Controls
| | Keyboard (defaults) | PS5 pad |
|---|---|---|
| Move / sidestep | P1 `A` `D` / tap `W` `S`; P2 `←` `→` / tap `↑` `↓` | D-pad or left stick |
| Jump / crouch | hold up / hold down | same |
| Attacks 1 2 3 4 | P1 `F G V B`, P2 `U I J K` | □ △ ✕ ○ |
| Block | hold back (away from the opponent) | same |
| Throw | `1+3` or `2+4` (break with `1` or `2`) | same |
| Rage Art | `1+2` below 25% health, once per round | same |
| Heat | `3+4`, once per round | same |
| Pause | `Esc` | Options |

Pad 1 controls player 1 and pad 2 controls player 2; the keyboard always works too. Connect a pad by USB or
Bluetooth and press a button so the browser detects it (Chrome or Edge recommended). Keys can be changed in
**Controls**. The full move list is in the game (**Move list**).

## Online play
No server is involved: one player hosts and sends a short code, the other pastes it and sends a reply code
back (any chat app works). The game then runs peer to peer with GGPO-style rollback, so it stays responsive
on normal connections. Strict firewalls or VPNs can block direct connections.

## Develop
```bash
npm install
npm run dev                 # http://localhost:5173
npm test                    # 50+ simulation, AI, character and netcode tests
npm run validate-characters # check public/characters/*.json
npm run build               # production build in dist/
```
Pushes to `main` build, test and deploy to GitHub Pages (`.github/workflows/deploy.yml`); pull requests run CI.

## How it is built
- `src/sim/game.ts` - the deterministic 60 fps fight simulation. No rendering, DOM, randomness or wall-clock time,
  so the same inputs always give the same result. This is what makes tests, the CPU and rollback possible.
- `src/sim/inputs.ts` - input buffer and Tekken notation parser. `src/sim/ai.ts` - CPU opponent.
- `src/net/rollback.ts` - rollback session with desync detection. `src/net/rtc.ts` - WebRTC link.
- `src/data/` - characters and moves as plain data, plus validation and the JSON loader.
- `src/render.ts`, `src/rig.ts`, `src/rig-glb.ts` - Babylon.js presentation only; they read state and never change it.
- `src/input.ts`, `src/ui.ts`, `src/online-ui.ts`, `src/main.ts` - input, screens and the app loop.

## Not included (yet)
Touch controls (phones work with a Bluetooth pad), more stages, replays, ranked online or matchmaking, and
character models: bring your own free CC0 models (see [ASSETS.md](ASSETS.md)).

## Legal
Tekken is a trademark of Bandai Namco. This is an unaffiliated fan project that uses game *mechanics* only. Do
not add Tekken characters, models, audio or other copyrighted assets. See [CREDITS.md](CREDITS.md).
