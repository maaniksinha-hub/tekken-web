import {
  Color3, Engine, HemisphericLight, DirectionalLight, MeshBuilder, Scene, StandardMaterial,
  TransformNode, Vector3, FreeCamera, Color4, type Mesh,
} from "@babylonjs/core";
import type { Fighter } from "./sim/game";
import { STAGE_HALF_WIDTH, STAGE_HALF_DEPTH } from "./sim/game";
import type { Button, CharacterData } from "./data/types";

interface FighterView {
  root: TransformNode;
  limbs: Record<Button, Mesh>;
  parts: Mesh[];
  mats: StandardMaterial[];
  base: Color3[];
}

const LIMB_REST: Record<Button, Vector3> = {
  lp: new Vector3(0.28, 1.25, 0.1),
  rp: new Vector3(-0.28, 1.25, 0.1),
  lk: new Vector3(0.14, 0.45, 0.05),
  rk: new Vector3(-0.14, 0.45, 0.05),
};

function buildProcedural(scene: Scene, char: CharacterData): FighterView {
  const root = new TransformNode(`fighter-${char.id}`, scene);
  const mats: StandardMaterial[] = [];
  const base: Color3[] = [];
  const mat = (hex: string) => {
    const m = new StandardMaterial(`m-${char.id}-${mats.length}`, scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    mats.push(m);
    base.push(c);
    return m;
  };
  const body = mat(char.look.color);
  const accent = mat(char.look.accent);
  const parts: Mesh[] = [];
  const add = (mesh: Mesh, m: StandardMaterial, pos: Vector3) => {
    mesh.material = m;
    mesh.parent = root;
    mesh.position = pos;
    parts.push(mesh);
    return mesh;
  };
  add(MeshBuilder.CreateCapsule("torso", { height: 1.0, radius: 0.25 }, scene), body, new Vector3(0, 1.05, 0));
  add(MeshBuilder.CreateSphere("head", { diameter: 0.38 }, scene), accent, new Vector3(0, 1.8, 0));
  add(MeshBuilder.CreateBox("hips", { width: 0.5, height: 0.2, depth: 0.3 }, scene), accent, new Vector3(0, 0.6, 0));
  const limb = (name: string, size: Vector3, m: StandardMaterial, pos: Vector3) => {
    const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
    return add(mesh, m, pos.clone());
  };
  const limbs = {
    lp: limb("lp", new Vector3(0.14, 0.14, 0.5), accent, LIMB_REST.lp),
    rp: limb("rp", new Vector3(0.14, 0.14, 0.5), accent, LIMB_REST.rp),
    lk: limb("lk", new Vector3(0.18, 0.7, 0.18), body, LIMB_REST.lk),
    rk: limb("rk", new Vector3(0.18, 0.7, 0.18), body, LIMB_REST.rk),
  };
  return { root, limbs, parts, mats, base };
}

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private views: FighterView[] = [];

  constructor(canvas: HTMLCanvasElement, chars: [CharacterData, CharacterData]) {
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.04, 0.07, 1);

    const cam = new FreeCamera("cam", new Vector3(0, 2.6, -9), this.scene);
    cam.setTarget(new Vector3(0, 1.1, 0));
    cam.fov = 0.8;
    new HemisphericLight("hemi", new Vector3(0, 1, -0.3), this.scene).intensity = 0.7;
    const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.6), this.scene);
    sun.intensity = 0.6;

    const floor = MeshBuilder.CreateGround("floor", { width: STAGE_HALF_WIDTH * 2 + 4, height: STAGE_HALF_DEPTH * 2 + 6 }, this.scene);
    const fm = new StandardMaterial("floor", this.scene);
    fm.diffuseColor = new Color3(0.16, 0.16, 0.2);
    floor.material = fm;
    const wall = MeshBuilder.CreatePlane("wall", { width: 30, height: 10 }, this.scene);
    wall.position = new Vector3(0, 4, 5);
    const wm = new StandardMaterial("wall", this.scene);
    wm.diffuseColor = new Color3(0.1, 0.1, 0.16);
    wall.material = wm;

    this.views = chars.map((c) => buildProcedural(this.scene, c));
    addEventListener("resize", () => this.engine.resize());
  }

  /** Pose the fighters from simulation state. Pure presentation - never mutates the sim. */
  draw(fighters: readonly [Fighter, Fighter]): void {
    fighters.forEach((f, i) => {
      const v = this.views[i];
      v.root.position.set(f.x, 0, f.z);
      v.root.rotation.y = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
      v.root.rotation.z = 0;
      v.root.rotation.x = 0;

      (Object.keys(v.limbs) as Button[]).forEach((b) => v.limbs[b].position.copyFrom(LIMB_REST[b]));
      if (f.state === "attack" && f.move) {
        const m = f.char.moves[f.move];
        const t = f.frame < m.startup + m.active ? Math.min(1, f.frame / m.startup) : 1 - (f.frame - m.startup - m.active) / m.recovery;
        const limb = v.limbs[f.move];
        limb.position.z += t * (m.reach - 0.6);
        if (f.move === "lk" || f.move === "rk") limb.position.y += t * 0.5;
      }
      if (f.state === "hitstun") v.root.rotation.x = -0.25;
      if (f.state === "ko") {
        v.root.rotation.x = -Math.PI / 2;
        v.root.position.y = 0.25;
      }
      const tint =
        f.state === "hitstun" ? Color3.Red() : f.state === "blockstun" ? new Color3(0.3, 0.6, 1) : null;
      v.mats.forEach((m, k) => (m.diffuseColor = tint ?? v.base[k]));
    });
  }
}
