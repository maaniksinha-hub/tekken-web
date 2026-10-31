# Adding your own characters

A character is a small JSON file. You do not need to change any code.

1. Copy `public/characters/example-zed.json` to `public/characters/<id>.json` and edit it.
2. Add the file name to `public/characters/index.json`, e.g. `["example-zed.json", "my-hero.json"]`.
3. Run `npm run validate-characters`. It checks every file and prints what is wrong in plain language.
4. Start the game (`npm run dev`). Your fighter shows up in character select. A file that fails
   validation is skipped with a message in the browser console, so a typo never breaks the game.

## What you can set
| Field | Meaning |
|---|---|
| `id`, `name` | Unique lowercase id; display name (max 14 characters). |
| `maxHp`, `walkSpeed`, `backSpeed`, `sidestepSpeed` | Health and movement. Speeds are world units per frame (60 frames = 1 second). |
| `moves.lp / rp / lk / rk` | The four normals: buttons 1, 2, 3, 4 (□ △ ✕ ○). |
| `specials` | Move-list entries: a `notation` such as `d/f+2` or `f,f+1` plus a move. |
| `throws` | Exactly two: `1+3` (broken with 1) and `2+4` (broken with 2). Each needs `"throw": true`. |
| `rageArt` | Used with `1+2` when below 25% health, once per round. |
| `heatEngage` | Used with `3+4`, once per round; starts Heat. |
| `look` | `model`: `"procedural"` or a `.glb` path; `color`, `accent` as `#rrggbb`. Optional `yaw`, `height`. |

## Move fields (all times in frames, 60 per second)
`name`, `height` (`high`, `mid` or `low`), `startup`, `active`, `recovery`, `damage`, `reach`,
`hitstun`, `blockstun`, `pushback`. Optional: `launch` (starts a juggle), `unblockable`, `throw`, and
`next`: follow-up presses that make strings such as `1,2,3`.

Height rules: highs miss crouching opponents, lows must be blocked crouching, mids must be blocked standing.

## Notation
`f` forward, `b` back, `d` down, `u` up, `d/f` `d/b` `u/f` `u/b` diagonals, `n` neutral; `1 2 3 4` buttons.
`+` means together, `,` means in order. Examples: `d/f+2`, `d+4`, `f,f+1`.
