import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { STAGE_HALF_DEPTH, STAGE_HALF_WIDTH } from "./sim/game";

/** Stages are presentation only: floor, backdrop, lights and mood. The fight itself never reads them. */

export interface StageHandle {
  clear: Color4;
  fogColor: Color3;
  fogDensity: number;
  lights: PointLight[];
  floors: Mesh[];
  /** Per-frame animation (flickering lights etc.). `t` is seconds. */
  update(t: number): void;
  dispose(): void;
}

export interface StageDef {
  id: string;
  name: string;
  /** Index into the music styles in music.ts. */
  music: number;
  build(scene: Scene): StageHandle;
}

const hex = (h: string) => Color3.FromHexString(h);

function mat(scene: Scene, name: string, diffuse: Color3, emissive?: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = diffuse;
  m.specularColor = new Color3(0.08, 0.08, 0.1);
  if (emissive) m.emissiveColor = emissive;
  return m;
}

function paint(scene: Scene, name: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): DynamicTexture {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(t.getContext() as unknown as CanvasRenderingContext2D);
  t.update();
  return t;
}

function makeFloor(scene: Scene, root: TransformNode, tex: DynamicTexture, tint = new Color3(1, 1, 1)): Mesh {
  const m = new StandardMaterial("floor", scene);
  m.diffuseTexture = tex;
  m.diffuseColor = tint;
  m.specularColor = new Color3(0.12, 0.12, 0.14);
  const floor = MeshBuilder.CreateGround("floor", { width: STAGE_HALF_WIDTH * 2 + 8, height: STAGE_HALF_DEPTH * 2 + 8 }, scene);
  floor.material = m;
  floor.receiveShadows = true;
  floor.parent = root;
  return floor;
}

function finish(root: TransformNode, base: Omit<StageHandle, "dispose" | "update">, update: (t: number) => void = () => {}): StageHandle {
  return {
    ...base,
    update,
    dispose() {
      base.lights.forEach((l) => l.dispose());
      root.dispose(false, true);
    },
  };
}

// ---------------------------------------------------------------- 1. Neon arena
const neon: StageDef = {
  id: "neon", name: "Neon Arena", music: 0,
  build(scene) {
    const root = new TransformNode("stage-neon", scene);
    const tex = paint(scene, "neonFloor", 1024, 512, (c) => {
      c.fillStyle = "#181822"; c.fillRect(0, 0, 1024, 512);
      c.strokeStyle = "#2a2a3c"; c.lineWidth = 2;
      for (let x = 0; x <= 1024; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 512); c.stroke(); }
      for (let y = 0; y <= 512; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(1024, y); c.stroke(); }
      c.strokeStyle = "#f5c542"; c.lineWidth = 6;
      c.strokeRect(100, 60, 824, 392);
      c.beginPath(); c.arc(512, 256, 110, 0, Math.PI * 2); c.stroke();
    });
    const floor = makeFloor(scene, root, tex);
    const wall = MeshBuilder.CreateBox("wall", { width: 34, height: 11, depth: 0.5 }, scene);
    wall.position.set(0, 5, 6); wall.material = mat(scene, "wall", new Color3(0.07, 0.07, 0.12)); wall.parent = root;
    const colors = ["#3b6fd4", "#d4453b", "#f5c542"];
    for (let i = -5; i <= 5; i++) {
      const p = MeshBuilder.CreateBox(`panel${i}`, { width: 1.2, height: 6 + (i % 2) * 1.5, depth: 0.2 }, scene);
      p.position.set(i * 2.6, 3.2 + (i % 2) * 0.7, 5.7);
      p.material = mat(scene, `pm${i}`, Color3.Black(), hex(colors[Math.abs(i) % 3]).scale(0.7));
      p.parent = root;
    }
    const lights: PointLight[] = [];
    ([[-1, "#3b6fd4"], [1, "#d4453b"]] as const).forEach(([side, c]) => {
      const x = side * (STAGE_HALF_WIDTH + 1.4);
      const pillar = MeshBuilder.CreateCylinder("pillar", { height: 3.2, diameter: 0.5 }, scene);
      pillar.position.set(x, 1.6, 1.8); pillar.material = mat(scene, "pillar", new Color3(0.12, 0.12, 0.16), hex(c).scale(0.3)); pillar.parent = root;
      const l = new PointLight("pl", new Vector3(x, 3, 0.5), scene);
      l.diffuse = hex(c); l.intensity = 0.55; l.range = 12;
      lights.push(l);
    });
    return finish(root, { clear: new Color4(0.03, 0.03, 0.06, 1), fogColor: new Color3(0.03, 0.03, 0.06), fogDensity: 0.018, lights, floors: [floor] },
      (t) => lights.forEach((l, i) => (l.intensity = 0.5 + 0.12 * Math.sin(t * 2 + i * 2))));
  },
};

// ---------------------------------------------------------------- 2. Rooftop at dusk
const rooftop: StageDef = {
  id: "rooftop", name: "Rooftop Dusk", music: 1,
  build(scene) {
    const root = new TransformNode("stage-rooftop", scene);
    const tex = paint(scene, "roofFloor", 1024, 512, (c) => {
      c.fillStyle = "#3a3a44"; c.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 2600; i++) { const g = 50 + Math.random() * 40; c.fillStyle = `rgb(${g},${g},${g + 6})`; c.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2); }
      c.strokeStyle = "#caa84a"; c.lineWidth = 5; c.setLineDash([36, 22]);
      c.strokeRect(90, 54, 844, 404);
      c.setLineDash([]); c.strokeStyle = "#5a5a68"; c.lineWidth = 3;
      for (let x = 0; x <= 1024; x += 256) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 512); c.stroke(); }
    });
    const floor = makeFloor(scene, root, tex);

    // Skyline: dark towers with lit windows against a sunset.
    const skyline = paint(scene, "skyline", 1024, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#2b1b4a"); g.addColorStop(0.55, "#c2506b"); g.addColorStop(1, "#ffb25a");
      c.fillStyle = g; c.fillRect(0, 0, 1024, 256);
      c.fillStyle = "#ffe9b0"; c.beginPath(); c.arc(760, 170, 46, 0, Math.PI * 2); c.fill();
      let x = 0;
      while (x < 1024) {
        const w = 40 + Math.random() * 70, h = 60 + Math.random() * 130;
        c.fillStyle = "#14101f"; c.fillRect(x, 256 - h, w, h);
        for (let wy = 256 - h + 8; wy < 248; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 10) {
          if (Math.random() < 0.28) { c.fillStyle = Math.random() < 0.5 ? "#ffd27a" : "#9ad1ff"; c.fillRect(wx, wy, 5, 6); }
        }
        x += w + 4;
      }
    });
    const back = MeshBuilder.CreatePlane("skyline", { width: 44, height: 11 }, scene);
    back.position.set(0, 4.3, 9); back.parent = root;
    const bm = new StandardMaterial("skylineMat", scene);
    bm.diffuseTexture = skyline; bm.emissiveTexture = skyline; bm.disableLighting = true;
    back.material = bm;

    // Railing along the back edge and corner lamps.
    const rail = mat(scene, "rail", new Color3(0.2, 0.2, 0.25));
    const bar = MeshBuilder.CreateBox("rail", { width: 22, height: 0.08, depth: 0.08 }, scene);
    bar.position.set(0, 1.1, 4.2); bar.material = rail; bar.parent = root;
    for (let i = -10; i <= 10; i += 2) {
      const post = MeshBuilder.CreateBox("post", { width: 0.07, height: 1.1, depth: 0.07 }, scene);
      post.position.set(i, 0.55, 4.2); post.material = rail; post.parent = root;
    }
    const lights: PointLight[] = [];
    for (const side of [-1, 1]) {
      const x = side * (STAGE_HALF_WIDTH + 1.4);
      const lamp = MeshBuilder.CreateSphere("lamp", { diameter: 0.35 }, scene);
      lamp.position.set(x, 2.6, 1.5); lamp.material = mat(scene, "lampMat", Color3.Black(), hex("#ffd27a")); lamp.parent = root;
      const l = new PointLight("lamp", new Vector3(x, 2.6, 0.6), scene);
      l.diffuse = hex("#ffb55a"); l.intensity = 0.6; l.range = 11;
      lights.push(l);
    }
    return finish(root, { clear: new Color4(0.7, 0.35, 0.4, 1), fogColor: new Color3(0.62, 0.33, 0.4), fogDensity: 0.012, lights, floors: [floor] },
      (t) => lights.forEach((l, i) => (l.intensity = 0.55 + 0.05 * Math.sin(t * 3 + i))));
  },
};

// ---------------------------------------------------------------- 3. Temple dojo at night
const temple: StageDef = {
  id: "temple", name: "Moonlit Temple", music: 2,
  build(scene) {
    const root = new TransformNode("stage-temple", scene);
    const tex = paint(scene, "woodFloor", 1024, 512, (c) => {
      for (let y = 0; y < 512; y += 32) {
        const base = 84 + ((y / 32) % 3) * 8;
        c.fillStyle = `rgb(${base + 40},${base + 14},${base - 18})`; c.fillRect(0, y, 1024, 30);
        for (let i = 0; i < 70; i++) { c.fillStyle = "rgba(60,30,10,0.18)"; c.fillRect(Math.random() * 1024, y + Math.random() * 28, 30 + Math.random() * 80, 1.5); }
        c.fillStyle = "rgba(30,15,5,0.55)"; c.fillRect(0, y + 30, 1024, 2);
      }
      c.strokeStyle = "#e8d9b0"; c.lineWidth = 6; c.strokeRect(110, 64, 804, 384);
    });
    const floor = makeFloor(scene, root, tex);

    const sky = paint(scene, "templeSky", 1024, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#070a1c"); g.addColorStop(1, "#1d2a52");
      c.fillStyle = g; c.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`; c.fillRect(Math.random() * 1024, Math.random() * 150, 1.6, 1.6); }
      c.fillStyle = "#f4f1dc"; c.beginPath(); c.arc(300, 80, 36, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(244,241,220,0.12)"; c.beginPath(); c.arc(300, 80, 70, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#0b1226";
      c.beginPath(); c.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 32) c.lineTo(x, 150 + Math.sin(x * 0.011) * 38 + Math.sin(x * 0.037) * 16);
      c.lineTo(1024, 256); c.closePath(); c.fill();
    });
    const back = MeshBuilder.CreatePlane("templeSky", { width: 46, height: 11.5 }, scene);
    back.position.set(0, 4.6, 9); back.parent = root;
    const bm = new StandardMaterial("templeSkyMat", scene);
    bm.diffuseTexture = sky; bm.emissiveTexture = sky; bm.disableLighting = true;
    back.material = bm;

    // Red pillars with a crossbeam, and paper lanterns.
    const red = mat(scene, "red", hex("#8e1f1f"));
    const dark = mat(scene, "dark", hex("#201510"));
    for (const x of [-7.5, -3.6, 3.6, 7.5]) {
      const p = MeshBuilder.CreateCylinder("pillar", { height: 5.2, diameter: 0.55 }, scene);
      p.position.set(x, 2.6, 4.6); p.material = red; p.parent = root;
    }
    const beam = MeshBuilder.CreateBox("beam", { width: 18.5, height: 0.45, depth: 0.5 }, scene);
    beam.position.set(0, 5.2, 4.6); beam.material = dark; beam.parent = root;
    const roof = MeshBuilder.CreateBox("roofEdge", { width: 20.5, height: 0.2, depth: 1.4 }, scene);
    roof.position.set(0, 5.55, 4.4); roof.material = dark; roof.parent = root;

    const lights: PointLight[] = [];
    for (const x of [-6, -2, 2, 6]) {
      const lantern = MeshBuilder.CreateSphere("lantern", { diameter: 0.55, segments: 10 }, scene);
      lantern.scaling.y = 1.25;
      lantern.position.set(x, 3.6, 3.2); lantern.material = mat(scene, "lanternMat", Color3.Black(), hex("#ff9a3c").scale(0.95)); lantern.parent = root;
      const l = new PointLight("lantern", new Vector3(x, 3.4, 2.4), scene);
      l.diffuse = hex("#ff9a52"); l.intensity = 0.42; l.range = 9;
      lights.push(l);
    }
    return finish(root, { clear: new Color4(0.03, 0.05, 0.12, 1), fogColor: new Color3(0.04, 0.06, 0.14), fogDensity: 0.016, lights, floors: [floor] },
      (t) => lights.forEach((l, i) => (l.intensity = 0.4 + 0.07 * Math.sin(t * 5 + i * 1.7) + 0.03 * Math.sin(t * 13 + i))));
  },
};

export const STAGES: StageDef[] = [neon, rooftop, temple];
