# Getting characters and animations (free)

Real Tekken assets are copyrighted - do not use them. Use these free sources instead.

## Models (rigged humanoids)
- **Quaternius** - https://quaternius.com - CC0 (no attribution needed).
- **Kenney** - https://kenney.nl - CC0.
- **Poly Pizza** - https://poly.pizza - mixed CC0 / CC-BY; check each model's licence.

## Animations
- **Mixamo** - https://www.mixamo.com - free with a free Adobe account.
  1. Upload your character (or pick one) and let Mixamo auto-rig it.
  2. Download as FBX or GLB, "With Skin" for the model, "Without Skin" for each animation.
  3. Useful sets: idle, walk, backward walk, punches, kicks, block, hit reaction, knockdown.

## Convert and add
1. Convert FBX to GLB (Blender, free: File > Import FBX > Export glTF Binary).
2. Put the file in `public/characters/<id>.glb`.
3. Add a `CharacterData` entry with `look.model: "characters/<id>.glb"`.
   (GLB loading is on the roadmap - step 5.)

Record each asset's source and licence in `CREDITS.md`.
