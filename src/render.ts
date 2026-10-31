import {
  Color3, Color4, DirectionalLight, DynamicTexture, Engine, FreeCamera, HemisphericLight, Mesh, MeshBuilder,
  PointLight, Scene, ShadowGenerator, StandardMaterial, Vector3,
} from "@babylonjs/core";
import type { GameEvent, GameState } from "./sim/game";
import { STAGE_HALF_DEPTH, STAGE_HALF_WIDTH } from "./sim/game";
import type { CharacterData } from "./data/types";
import { buildProceduralRig, type FighterRig } from "./rig";

interface Spark {
  mesh: Mesh;
  vel: Vector3;
  life: number;
  max: number;
  grow: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Presentation only: reads GameState, never writes it. */
export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private cam: FreeCamera;
  private shadows: ShadowGenerator;
  private rigs: FighterRig[] = [];
  private rigToken = 0;
  private sparks: Spark[] = [];
  private pool: Mesh[] = [];
  private shake = 0;
  private camPos = new Vector3(0, 2.4, -9);
  private camTarget = new Vector3(0, 1.1, 0);
  private flash = 0;
  private time = 0;
  private lights: PointLight[] = [];
  /** Set to false to freeze presentation time (pause). */
  animate = true;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.03, 0.03, 0.06, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.018;
    this.scene.fogColor = new Color3(0.03, 0.03, 0.06);

    this.cam = new FreeCamera("cam", this.camPos.clone(), this.scene);
    this.cam.minZ = 0.1;
    this.cam.fov = 0.75;
    this.cam.setTarget(this.camTarget);

    new HemisphericLight("hemi", new Vector3(0, 1, -0.3), this.scene).intensity = 0.55;
    const sun = new DirectionalLight("sun", new Vector3(-0.35, -1, 0.5), this.scene);
    sun.position = new Vector3(4, 10, -5);
    sun.intensity = 0.75;
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 12;

    this.buildStage();
    addEventListener("resize", () => this.engine.resize());
  }

  private buildStage(): void {
    const s = this.scene;
    // Floor with a painted ring and grid.
    const tex = new DynamicTexture("floorTex", { width: 1024, height: 512 }, s, true);
    const c = tex.getContext() as unknown as CanvasRenderingContext2D;
    c.fillStyle = "#181822"; c.fillRect(0, 0, 1024, 512);
    c.strokeStyle = "#2a2a3c"; c.lineWidth = 2;
    for (let x = 0; x <= 1024; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 512); c.stroke(); }
    for (let y = 0; y <= 512; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(1024, y); c.stroke(); }
    c.strokeStyle = "#f5c542"; c.lineWidth = 6;
    c.strokeRect(100, 60, 824, 392);
    c.beginPath(); c.arc(512, 256, 110, 0, Math.PI * 2); c.stroke();
    tex.update();
    const floorMat = new StandardMaterial("floor", s);
    floorMat.diffuseTexture = tex;
    floorMat.specularColor = new Color3(0.1, 0.1, 0.12);
    const floor = MeshBuilder.CreateGround("floor", { width: STAGE_HALF_WIDTH * 2 + 6, height: STAGE_HALF_DEPTH * 2 + 6 }, s);
    floor.material = floorMat;
    floor.receiveShadows = true;

    // Back wall with glowing panels.
    const wallMat = new StandardMaterial("wall", s);
    wallMat.diffuseColor = new Color3(0.07, 0.07, 0.12);
    const wall = MeshBuilder.CreateBox("wall", { width: 34, height: 11, depth: 0.5 }, s);
    wall.position.set(0, 5, 6);
    wall.material = wallMat;
    const colors = ["#3b6fd4", "#d4453b", "#f5c542"];
    for (let i = -5; i <= 5; i++) {
      const p = MeshBuilder.CreateBox(`panel${i}`, { width: 1.2, height: 6 + (i % 2) * 1.5, depth: 0.2 }, s);
      p.position.set(i * 2.6, 3.2 + (i % 2) * 0.7, 5.7);
      const m = new StandardMaterial(`pm${i}`, s);
      m.emissiveColor = Color3.FromHexString(colors[Math.abs(i) % 3]).scale(0.55);
      m.diffuseColor = Color3.Black();
      p.material = m;
    }
    // Corner pillars mark the edges of the ring and carry coloured lights.
    [[-1, "#3b6fd4"], [1, "#d4453b"]].forEach(([side, hex]) => {
      const x = (side as number) * (STAGE_HALF_WIDTH + 1.4);
      const pillar = MeshBuilder.CreateCylinder("pillar", { height: 3.2, diameter: 0.5 }, s);
      pillar.position.set(x, 1.6, 1.8);
      const pm = new StandardMaterial("pillarMat", s);
      pm.diffuseColor = new Color3(0.12, 0.12, 0.16);
      pm.emissiveColor = Color3.FromHexString(hex as string).scale(0.25);
      pillar.material = pm;
      const l = new PointLight("pl", new Vector3(x, 3, 0.5), s);
      l.diffuse = Color3.FromHexString(hex as string);
      l.intensity = 0.55;
      l.range = 12;
      this.lights.push(l);
    });
    // Spark pool.
    const sm = new StandardMaterial("spark", s);
    sm.emissiveColor = new Color3(1, 0.85, 0.35);
    sm.diffuseColor = Color3.Black();
    sm.disableLighting = true;
    for (let i = 0; i < 48; i++) {
      const m = MeshBuilder.CreateSphere(`spark${i}`, { diameter: 0.12, segments: 4 }, s);
      m.material = sm;
      m.isVisible = false;
      this.pool.push(m);
    }
  }

  /** (Re)build fighters. GLB models load asynchronously; the procedural body shows until they are ready. */
  setCharacters(chars: [CharacterData, CharacterData]): void {
    const token = ++this.rigToken;
    this.rigs.forEach((r) => r.dispose());
    this.rigs = chars.map((c, i) => {
      const rig = buildProceduralRig(this.scene, c);
      rig.meshes.forEach((m) => this.shadows.addShadowCaster(m));
      if (c.look.model !== "procedural") void this.swapToGlb(token, i, c);
      return rig;
    });
  }

  private async swapToGlb(token: number, i: number, c: CharacterData): Promise<void> {
    try {
      const { loadGlbRig } = await import("./rig-glb");
      const rig = await loadGlbRig(this.scene, c);
      if (token !== this.rigToken) { rig.dispose(); return; }
      this.rigs[i]?.dispose();
      this.rigs[i] = rig;
      rig.meshes.forEach((m) => this.shadows.addShadowCaster(m as Mesh));
    } catch (err) {
      console.warn(`Could not load model for ${c.id}; keeping the procedural body.`, err);
    }
  }

  /** Spawn impact effects and camera shake for sim events. */
  handleEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === "whiff") continue;
      const big = e.type === "ko" || e.type === "splat" || e.type === "launch" || e.type === "throw";
      const n = e.type === "block" ? 5 : 6 + Math.round(e.power * 10);
      for (let k = 0; k < n; k++) {
        const m = this.pool.find((p) => !p.isVisible);
        if (!m) break;
        const a = (k / n) * Math.PI * 2 + e.x;
        const sp = (e.type === "block" ? 0.05 : 0.08) + e.power * 0.1;
        m.position.set(e.x, e.y, e.z - 0.2);
        m.scaling.setAll(1);
        m.isVisible = true;
        this.sparks.push({
          mesh: m,
          vel: new Vector3(Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp + 0.02, (k % 2 ? -1 : 1) * 0.03),
          life: 0, max: e.type === "block" ? 14 : 20, grow: big ? 2.2 : 1.4,
        });
      }
      const mag = e.type === "block" ? 0.02 : 0.04 + e.power * 0.08 + (big ? 0.05 : 0);
      this.shake = Math.max(this.shake, mag);
      if (e.type === "ko" || e.type === "heat" || e.type === "rage") this.flash = 1;
    }
  }

  /** `dt` is real seconds. Call before `scene.render()`. */
  draw(game: GameState, dt: number): void {
    if (this.animate) this.time += dt;
    this.rigs.forEach((r, i) => r.pose(game.fighters[i], this.time));

    // Sparks.
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      if (this.animate) {
        s.life += dt * 60;
        s.mesh.position.addInPlace(s.vel);
        s.vel.y -= 0.004;
        s.mesh.scaling.setAll(Math.max(0.01, s.grow * (1 - s.life / s.max)));
      }
      if (s.life >= s.max) {
        s.mesh.isVisible = false;
        this.sparks.splice(i, 1);
      }
    }

    // Camera follows the midpoint and backs off as fighters separate.
    const [a, b] = game.fighters;
    const mid = (a.x + b.x) / 2;
    const gap = Math.abs(a.x - b.x);
    const dist = 7.2 + gap * 0.55;
    const k = Math.min(1, dt * 6);
    this.camPos.x = lerp(this.camPos.x, mid, k);
    this.camPos.y = lerp(this.camPos.y, 2.0 + gap * 0.05, k);
    this.camPos.z = lerp(this.camPos.z, -dist, k);
    this.camTarget.x = lerp(this.camTarget.x, mid, k);
    this.camTarget.y = lerp(this.camTarget.y, 1.15, k);
    this.shake *= Math.pow(0.001, dt); // decays in about a third of a second
    const sx = (Math.sin(this.time * 90) * this.shake), sy = (Math.cos(this.time * 77) * this.shake);
    this.cam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.cam.setTarget(new Vector3(this.camTarget.x, this.camTarget.y, 0));

    this.flash = Math.max(0, this.flash - dt * 3);
    this.scene.clearColor = new Color4(0.03 + this.flash * 0.25, 0.03 + this.flash * 0.12, 0.06 + this.flash * 0.05, 1);
    this.lights.forEach((l, i) => (l.intensity = 0.5 + 0.12 * Math.sin(this.time * 2 + i * 2)));
  }
}
