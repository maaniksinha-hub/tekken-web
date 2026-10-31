import { TransformNode, type AnimationGroup, type AbstractMesh, type Scene } from "@babylonjs/core";
import type { Fighter } from "./sim/game";
import type { CharacterData } from "./data/types";
import type { FighterRig } from "./rig";

/**
 * Loads a user-supplied .glb as a fighter. Animation clips are matched to sim states by name
 * (idle, walk, punch/jab, kick, hit, block, jump, ko/down...). Missing clips fall back to simple
 * transforms, so even a static model is playable. See ASSETS.md.
 */

const CLIPS: [string, RegExp][] = [
  ["idle", /idle|stance|breath/i],
  ["walk", /walk|run|move/i],
  ["punch", /punch|jab|hook|strike/i],
  ["kick", /kick/i],
  ["hit", /hit|react|damage|hurt/i],
  ["block", /block|guard/i],
  ["jump", /jump/i],
  ["down", /ko|die|death|down|fall/i],
];

export async function loadGlbRig(scene: Scene, char: CharacterData): Promise<FighterRig> {
  const url = char.look.model;
  await import("@babylonjs/loaders/glTF");
  const { SceneLoader } = await import("@babylonjs/core/Loading/sceneLoader");
  const cut = url.lastIndexOf("/") + 1;
  const result = await SceneLoader.ImportMeshAsync("", url.slice(0, cut), url.slice(cut), scene);

  const root = new TransformNode(`glb-${char.id}`, scene);
  const holder = new TransformNode(`glb-holder-${char.id}`, scene);
  holder.parent = root;
  const top = result.meshes[0];
  top.parent = holder;

  // Scale to the requested height and stand the model on the floor.
  holder.rotation.y = char.look.yaw ?? 0;
  const { min, max } = holder.getHierarchyBoundingVectors(true);
  const h = Math.max(0.01, max.y - min.y);
  const k = (char.look.height ?? 1.85) / h;
  holder.scaling.setAll(k);
  holder.position.y = -min.y * k;

  const clips = new Map<string, AnimationGroup>();
  for (const ag of result.animationGroups) {
    ag.stop();
    for (const [key, re] of CLIPS) if (!clips.has(key) && re.test(ag.name)) clips.set(key, ag);
  }
  let current: AnimationGroup | null = null;
  const play = (key: string, loop: boolean) => {
    const ag = clips.get(key) ?? (key === "idle" ? undefined : clips.get("idle"));
    if (!ag || ag === current) return;
    current?.stop();
    ag.start(loop);
    current = ag;
  };

  const meshes = result.meshes as AbstractMesh[];
  return {
    root,
    meshes: meshes as never,
    pose(f: Fighter) {
      root.position.set(f.x, f.y, f.z);
      root.rotation.y = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
      root.rotation.x = 0;
      root.scaling.y = f.crouching ? 0.7 : 1;
      switch (f.state) {
        case "walk": play("walk", true); break;
        case "jump": play("jump", false); break;
        case "hitstun": case "juggle": case "thrown": play("hit", false); break;
        case "blockstun": play("block", true); break;
        case "knockdown": case "ko":
          play("down", false);
          if (!clips.has("down")) { root.rotation.x = -Math.PI / 2; root.position.y = 0.2; }
          break;
        case "attack": {
          const kick = f.move === "lk" || f.move === "rk";
          play(kick ? "kick" : "punch", false);
          if (!clips.has(kick ? "kick" : "punch")) root.rotation.x = 0.15; // lean into the attack
          break;
        }
        default: play("idle", true);
      }
    },
    dispose() {
      for (const ag of clips.values()) ag.dispose();
      root.dispose(false, true);
    },
  };
}
