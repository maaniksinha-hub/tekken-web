import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Fighter } from "./sim/game";
import { inHeat, inRage } from "./sim/game";
import type { CharacterData } from "./data/types";

/**
 * Procedural articulated fighter. Presentation only: it reads a Fighter and poses joints. The sim
 * never depends on any of this, so swapping in a GLB model (src/rig-glb.ts) changes looks only.
 */

export interface FighterRig {
  root: TransformNode;
  meshes: Mesh[];
  /** The mesh at the tip of the limb that performs `button` (for motion trails). Procedural rigs only. */
  tip?(button: "lp" | "rp" | "lk" | "rk"): Mesh | null;
  /** Pose from sim state. `t` is real seconds (for idle sway / walk cycle). */
  pose(f: Fighter, t: number): void;
  dispose(): void;
}

const ease = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

interface Joints {
  body: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  lSh: TransformNode; rSh: TransformNode;
  lEl: TransformNode; rEl: TransformNode;
  lHip: TransformNode; rHip: TransformNode;
  lKn: TransformNode; rKn: TransformNode;
}

export function buildProceduralRig(scene: Scene, char: CharacterData): FighterRig {
  const root = new TransformNode(`rig-${char.id}`, scene);
  const meshes: Mesh[] = [];
  const mats: StandardMaterial[] = [];
  const base: { d: Color3 }[] = [];

  const mat = (hex: string) => {
    const m = new StandardMaterial(`m-${char.id}-${mats.length}`, scene);
    const c = Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.specularColor = new Color3(0.15, 0.15, 0.15);
    mats.push(m);
    base.push({ d: c });
    return m;
  };
  const cloth = mat(char.look.color);
  const trim = mat(char.look.accent);
  const skin = mat("#e0b48f");
  const dark = mat("#22222a");

  const node = (name: string, parent: TransformNode, pos: Vector3) => {
    const n = new TransformNode(name, scene);
    n.parent = parent;
    n.position = pos;
    return n;
  };
  const attach = (m: Mesh, parent: TransformNode, pos: Vector3, material: StandardMaterial) => {
    m.parent = parent;
    m.position = pos;
    m.material = material;
    meshes.push(m);
    return m;
  };
  const limbMesh = (parent: TransformNode, len: number, r: number, material: StandardMaterial) =>
    attach(MeshBuilder.CreateCapsule("limb", { height: len, radius: r }, scene), parent, new Vector3(0, -len / 2, 0), material);

  const body = node("body", root, new Vector3(0, 0.92, 0));
  attach(MeshBuilder.CreateBox("pelvis", { width: 0.34, height: 0.2, depth: 0.22 }, scene), body, new Vector3(0, 0, 0), dark);
  attach(MeshBuilder.CreateBox("belt", { width: 0.36, height: 0.06, depth: 0.24 }, scene), body, new Vector3(0, 0.1, 0), trim);

  const leg = (side: 1 | -1) => {
    const hip = node("hip", body, new Vector3(side * 0.1, -0.05, 0));
    limbMesh(hip, 0.46, 0.085, cloth);
    const knee = node("knee", hip, new Vector3(0, -0.45, 0));
    limbMesh(knee, 0.44, 0.07, cloth);
    const foot = attach(MeshBuilder.CreateBox("foot", { width: 0.12, height: 0.07, depth: 0.26 }, scene), knee, new Vector3(0, -0.44, 0.06), dark);
    return { hip, knee, foot };
  };
  const l = leg(1), r = leg(-1);

  const torso = node("torso", body, new Vector3(0, 0.1, 0));
  attach(MeshBuilder.CreateCapsule("chest", { height: 0.62, radius: 0.18 }, scene), torso, new Vector3(0, 0.3, 0), cloth);
  attach(MeshBuilder.CreateBox("sash", { width: 0.3, height: 0.08, depth: 0.2 }, scene), torso, new Vector3(0, 0.12, 0), trim);
  const head = node("head", torso, new Vector3(0, 0.66, 0));
  attach(MeshBuilder.CreateSphere("skull", { diameter: 0.3 }, scene), head, new Vector3(0, 0.15, 0), skin);
  attach(MeshBuilder.CreateBox("band", { width: 0.32, height: 0.05, depth: 0.32 }, scene), head, new Vector3(0, 0.2, 0), trim);

  const arm = (side: 1 | -1) => {
    const sh = node("shoulder", torso, new Vector3(side * 0.25, 0.54, 0));
    limbMesh(sh, 0.32, 0.06, cloth);
    const el = node("elbow", sh, new Vector3(0, -0.31, 0));
    limbMesh(el, 0.3, 0.05, skin);
    const fist = attach(MeshBuilder.CreateSphere("fist", { diameter: 0.13 }, scene), el, new Vector3(0, -0.32, 0), trim);
    return { sh, el, fist };
  };
  const la = arm(1), ra = arm(-1);

  const j: Joints = {
    body, torso, head,
    lSh: la.sh, rSh: ra.sh, lEl: la.el, rEl: ra.el,
    lHip: l.hip, rHip: r.hip, lKn: l.knee, rKn: r.knee,
  };

  let walkPhase = 0;
  let lastX = NaN;

  const reset = () => {
    for (const n of Object.values(j)) {
      n.rotation.set(0, 0, 0);
    }
    root.rotation.set(0, root.rotation.y, 0);
    body.position.y = 0.92;
  };

  return {
    root,
    meshes,
    tip(button) {
      return { lp: la.fist, rp: ra.fist, lk: l.foot, rk: r.foot }[button];
    },
    pose(f, t) {
      reset();
      const sway = Math.sin(t * 2.4) * 0.025;
      const speed = Number.isNaN(lastX) ? 0 : (f.x - lastX) * f.facing;
      lastX = f.x;
      if (f.state === "walk") walkPhase += 0.28 * Math.sign(speed || 1);

      root.position.set(f.x, f.y, f.z);
      root.rotation.y = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;

      // Guard stance (default). Negative x rotation swings a hanging limb forward.
      j.lSh.rotation.x = -0.75; j.rSh.rotation.x = -0.95;
      j.lEl.rotation.x = -1.5; j.rEl.rotation.x = -1.6;
      j.lSh.rotation.z = -0.15; j.rSh.rotation.z = 0.15;
      j.lHip.rotation.x = -0.28; j.rHip.rotation.x = 0.22;
      j.lKn.rotation.x = 0.25; j.rKn.rotation.x = 0.18;
      j.torso.rotation.x = -0.12 + sway;
      j.head.rotation.x = 0.1;
      body.position.y = 0.88 + sway * 0.5;

      switch (f.state) {
        case "walk": {
          const s = Math.sin(walkPhase), c = Math.cos(walkPhase);
          j.lHip.rotation.x = -0.28 - s * 0.55; j.rHip.rotation.x = 0.22 + s * 0.55;
          j.lKn.rotation.x = 0.25 + Math.max(0, c) * 0.5; j.rKn.rotation.x = 0.18 + Math.max(0, -c) * 0.5;
          body.position.y = 0.86 + Math.abs(c) * 0.02;
          break;
        }
        case "jump": {
          j.lHip.rotation.x = -1.0; j.rHip.rotation.x = -0.7;
          j.lKn.rotation.x = 1.4; j.rKn.rotation.x = 1.1;
          j.lSh.rotation.x = -0.4; j.rSh.rotation.x = -0.4;
          break;
        }
        case "attack":
          poseAttack(j, f);
          break;
        case "hitstun": {
          const k = Math.min(1, f.stun / 10);
          j.torso.rotation.x = 0.35 * k + 0.1;
          j.head.rotation.x = 0.4 * k;
          j.lSh.rotation.x = 0.4; j.rSh.rotation.x = 0.6;
          j.lEl.rotation.x = -0.4; j.rEl.rotation.x = -0.4;
          body.position.y = 0.84;
          break;
        }
        case "blockstun":
          j.lSh.rotation.x = -1.7; j.rSh.rotation.x = -1.8;
          j.lEl.rotation.x = -2.3; j.rEl.rotation.x = -2.3;
          j.torso.rotation.x = 0.05;
          break;
        case "thrown":
          j.body.rotation.x = 0.9;
          j.lSh.rotation.x = 0.8; j.rSh.rotation.x = 0.8;
          body.position.y = 0.7;
          break;
        case "juggle": {
          // Airborne, lying back; tilt follows vertical speed.
          j.body.rotation.x = 1.0 + Math.max(-0.4, Math.min(0.4, -f.vy * 3));
          j.lSh.rotation.x = 0.6; j.rSh.rotation.x = 0.6; j.lSh.rotation.z = -0.8; j.rSh.rotation.z = 0.8;
          j.lHip.rotation.x = -0.3; j.rHip.rotation.x = 0.2;
          body.position.y = 0.8;
          break;
        }
        case "knockdown":
        case "ko": {
          j.body.rotation.x = Math.PI / 2 - 0.05;
          j.lSh.rotation.x = 0.2; j.rSh.rotation.x = 0.2;
          j.lEl.rotation.x = -0.1; j.rEl.rotation.x = -0.1;
          j.lHip.rotation.x = -0.1; j.rHip.rotation.x = 0.1;
          j.lKn.rotation.x = 0.1; j.rKn.rotation.x = 0.1;
          body.position.y = 0.2;
          break;
        }
        default:
          if (f.crouching) {
            j.lHip.rotation.x = -1.35; j.rHip.rotation.x = -1.15;
            j.lKn.rotation.x = 1.9; j.rKn.rotation.x = 1.75;
            j.torso.rotation.x = -0.45;
            body.position.y = 0.52;
          }
      }

      // Tints: hit flash, block flash, Heat glow, Rage pulse.
      const hit = f.state === "hitstun" || f.state === "juggle" || f.state === "thrown";
      const blocked = f.state === "blockstun";
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        m.diffuseColor = hit ? Color3.Lerp(base[i].d, new Color3(1, 0.15, 0.1), 0.65) :
          blocked ? Color3.Lerp(base[i].d, new Color3(0.3, 0.6, 1), 0.5) : base[i].d;
        m.emissiveColor = inHeat(f) ? new Color3(0.32, 0.13, 0.0) :
          inRage(f) ? new Color3(0.35 + 0.25 * Math.sin(t * 8), 0, 0) : Color3.Black();
      }
    },
    dispose() {
      root.dispose(false, true);
      mats.forEach((m) => m.dispose());
    },
  };
}

function poseAttack(j: Joints, f: Fighter): void {
  const m = f.activeMove;
  if (!m || !f.move) return;
  const s = m.startup, a = m.active, r = Math.max(1, m.recovery);
  const fr = f.frame;
  // Wind-up (pull back), thrust, hold, then recover. The small negative wind-up is what sells the hit.
  const windEnd = s * 0.45;
  const e = fr < windEnd ? -0.28 * ease(fr / windEnd)
    : fr < s ? -0.28 + 1.28 * ease((fr - windEnd) / (s - windEnd))
    : fr < s + a ? 1
    : 1 - ease((fr - s - a) / r);

  if (m.throw) {
    j.lSh.rotation.x = -1.5 * e - 0.4; j.rSh.rotation.x = -1.5 * e - 0.4;
    j.lEl.rotation.x = -0.3; j.rEl.rotation.x = -0.3;
    j.torso.rotation.x = -0.35 * e;
    return;
  }
  if (m.unblockable) {
    // Rage Art / Heat Burst: both arms thrown forward, deep stance.
    j.lSh.rotation.x = -1.6 * e - 0.4; j.rSh.rotation.x = -1.6 * e - 0.4;
    j.lEl.rotation.x = -0.2; j.rEl.rotation.x = -0.2;
    j.lHip.rotation.x = -0.9 * e - 0.2; j.rHip.rotation.x = 0.6 * e;
    j.lKn.rotation.x = 0.9 * e; j.torso.rotation.x = -0.4 * e;
    j.body.position.y = 0.8 - 0.2 * e;
    return;
  }
  const punch = f.move === "lp" || f.move === "rp";
  const left = f.move === "lp" || f.move === "lk";
  if (punch) {
    const sh = left ? j.lSh : j.rSh, el = left ? j.lEl : j.rEl;
    if (m.launch) {
      sh.rotation.x = -0.5 - 2.3 * e; // uppercut: arm rises
      el.rotation.x = -1.2 * (1 - e);
      j.body.position.y = 0.88 - 0.18 * e;
      j.torso.rotation.x = -0.3 * e;
    } else {
      sh.rotation.x = -0.9 - 0.65 * e;
      el.rotation.x = -1.5 * (1 - e);
    }
    j.torso.rotation.y = (left ? 1 : -1) * 0.45 * e;
    return;
  }
  const leg = left ? j.lHip : j.rHip, knee = left ? j.lKn : j.rKn;
  const support = left ? j.rHip : j.lHip;
  if (m.height === "low") {
    j.body.position.y = 0.88 - 0.35 * e;
    leg.rotation.x = -1.5 * e - 0.2;
    knee.rotation.x = 0.1;
    support.rotation.x = -1.2 * e;
    j.rKn.rotation.x = 1.6 * e;
    j.torso.rotation.x = -0.3 * e;
  } else {
    leg.rotation.x = -1.65 * e - 0.2;
    knee.rotation.x = 0.15 + 0.2 * (1 - e);
    support.rotation.x = 0.1;
    j.torso.rotation.x = 0.3 * e;
    j.torso.rotation.y = (left ? -1 : 1) * 0.4 * e;
  }
}

