# Using your own 3D models and animations (free)

Real Tekken assets are copyrighted: do not use them. These sources are free.

## Where to get models and animations
- **Quaternius** - https://quaternius.com - CC0 (no attribution needed). Rigged characters.
- **Kenney** - https://kenney.nl - CC0.
- **Poly Pizza** - https://poly.pizza - mixed CC0 / CC-BY; check each model's licence.
- **Mixamo** - https://www.mixamo.com - free with a free Adobe account. Upload a model, let it auto-rig,
  then download animations (idle, walk, punches, kicks, block, hit reaction, knockdown).

## Add a model to a character
1. Export as **GLB** (Blender, free: File > Export > glTF 2.0, format "glTF Binary"). Put the animations
   in the same file as separate clips.
2. Save it as `public/characters/<id>.glb`.
3. In the character's JSON (see [CHARACTERS.md](CHARACTERS.md)) set `"look": { "model": "characters/<id>.glb", ... }`.
4. If the model faces the wrong way, add `"yaw": 3.1416` (radians). To change its size, add `"height": 1.85`.
5. Reload. The game scales the model to the right height and stands it on the floor.
   The procedural body shows for a moment while a large model loads, and stays if loading fails.

## Animation clip names
Clips are matched by name (case-insensitive), so name them like this:

| Game state | Clip name contains |
|---|---|
| standing | `idle`, `stance` |
| walking | `walk`, `run` |
| punches | `punch`, `jab`, `hook` |
| kicks | `kick` |
| getting hit | `hit`, `react`, `damage` |
| blocking | `block`, `guard` |
| jumping | `jump` |
| knocked down / KO | `ko`, `death`, `down`, `fall` |

Missing clips are fine: the model simply leans or lies down instead of animating.

## Credits
Record every asset's source and licence in `CREDITS.md`.
