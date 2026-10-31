import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { GameEvent, GameState } from "./sim/game";
import type { CharacterData } from "./data/types";
import { buildProceduralRig, type FighterRig } from "./rig";
import { STAGES, type StageHandle } from "./stages";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { settings } from "./settings";

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
  private trailPool: Mesh[] = [];
  private trails: { mesh: Mesh; life: number }[] = [];
  private rings: { mesh: Mesh; life: number; max: number; size: number }[] = [];
  private ringPool: Mesh[] = [];
  private zoom = 0;
  private sun!: DirectionalLight;
  private pipeline: DefaultRenderingPipeline | null = null;
  private frameTimes: number[] = [];
  /** When true the quality level is fixed (set from the URL for testing, or by the player). */
  lockQuality = false;
  quality: "low" | "medium" | "high" = "high";
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
    this.sun = sun;
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 12;

    this.buildStage();
    this.setQuality(settings.quality);
    addEventListener("resize", () => this.engine.resize());
  }

  private stage: StageHandle | null = null;
  stageIndex = -1;

  /** Swap the backdrop. Cheap to call; does nothing if the stage is already showing. */
  setStage(index: number): void {
    const i = ((index % STAGES.length) + STAGES.length) % STAGES.length;
    if (i === this.stageIndex) return;
    this.stage?.dispose();
    this.stageIndex = i;
    const st = STAGES[i].build(this.scene);
    this.stage = st;
    this.scene.clearColor = st.clear;
    this.scene.fogColor = st.fogColor;
    this.scene.fogDensity = st.fogDensity;
    st.floors.forEach((f) => (f.receiveShadows = true));
  }

  /** high: bloom + anti-aliasing + shadows; medium: shadows; low: no shadows and a lower resolution. */
  setQuality(q: "low" | "medium" | "high"): void {
    this.quality = q;
    this.sun.shadowEnabled = q !== "low";
    this.engine.setHardwareScalingLevel(q === "low" ? 1.5 : 1);
    if (q === "high" && !this.pipeline) {
      const p = new DefaultRenderingPipeline("fx", true, this.scene, [this.cam]);
      p.fxaaEnabled = true;
      p.bloomEnabled = true;
      p.bloomThreshold = 0.78;
      p.bloomWeight = 0.35;
      p.bloomKernel = 48;
      p.bloomScale = 0.5;
      this.pipeline = p;
    } else if (q !== "high" && this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
  }

  /**
   * Feed real frame times during a fight. Returns the lower quality to switch to if the device is struggling
   * (average frame over about 2.5 s slower than ~24 fps), otherwise null.
   */
  sampleFrame(dtMs: number): "low" | "medium" | null {
    if (this.lockQuality) return null;
    this.frameTimes.push(Math.min(dtMs, 200));
    if (this.frameTimes.length < 150) return null;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg < 42) return null;
    return this.quality === "high" ? "medium" : this.quality === "medium" ? "low" : null;
  }

  private buildStage(): void {
    this.setStage(0);
    const s = this.scene;
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
    // Motion-trail blobs (fade out) and shockwave rings (expand and fade).
    const tm = new StandardMaterial("trail", s);
    tm.emissiveColor = new Color3(1, 1, 1);
    tm.diffuseColor = Color3.Black();
    tm.disableLighting = true;
    for (let i = 0; i < 40; i++) {
      const m = MeshBuilder.CreateSphere(`trail${i}`, { diameter: 0.2, segments: 6 }, s);
      m.material = tm;
      m.isVisible = false;
      m.isPickable = false;
      this.trailPool.push(m);
    }
    const rm = new StandardMaterial("ring", s);
    rm.emissiveColor = new Color3(1, 0.8, 0.4);
    rm.diffuseColor = Color3.Black();
    rm.disableLighting = true;
    rm.backFaceCulling = false;
    for (let i = 0; i < 6; i++) {
      const m = MeshBuilder.CreateTorus(`ring${i}`, { diameter: 1, thickness: 0.06, tessellation: 40 }, s);
      m.material = rm;
      m.isVisible = false;
      m.isPickable = false;
      this.ringPool.push(m);
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
      if (big || e.type === "heat" || e.type === "rage") {
        const ring = this.ringPool.find((r) => !r.isVisible);
        if (ring) {
          ring.position.set(e.x, 0.05, e.z);
          ring.visibility = 1;
          ring.isVisible = true;
          this.rings.push({ mesh: ring, life: 0, max: e.type === "ko" ? 40 : 24, size: e.type === "ko" || e.type === "rage" ? 7 : 4 });
        }
      }
      if (e.type === "ko" || e.type === "launch") this.zoom = Math.max(this.zoom, e.type === "ko" ? 1 : 0.5);
      const mag = e.type === "block" ? 0.02 : 0.04 + e.power * 0.08 + (big ? 0.05 : 0);
      if (settings.shake) this.shake = Math.max(this.shake, mag);
      if (e.type === "ko" || e.type === "heat" || e.type === "rage") this.flash = 1;
    }
  }

  /** Live effect counts, for tests and debugging. */
  fxCounts(): { sparks: number; trails: number; rings: number; shake: number; zoom: number } {
    return { sparks: this.sparks.length, trails: this.trails.length, rings: this.rings.length, shake: this.shake, zoom: this.zoom };
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

    // Motion trails while a limb is in its active frames.
    game.fighters.forEach((f, i) => {
      const rig = this.rigs[i];
      const m = f.activeMove;
      if (!this.animate || !rig?.tip || f.state !== "attack" || !m || !f.move) return;
      if (f.frame < m.startup - 3 || f.frame >= m.startup + m.active + 3) return;
      const tip = rig.tip(f.move);
      const blob = tip && this.trailPool.find((t) => !t.isVisible);
      if (!tip || !blob) return;
      blob.position.copyFrom(tip.getAbsolutePosition());
      blob.scaling.setAll(1);
      blob.visibility = 0.7;
      blob.isVisible = true;
      (blob.material as StandardMaterial).emissiveColor = Color3.FromHexString(f.char.look.accent);
      this.trails.push({ mesh: blob, life: 0 });
    });
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      if (this.animate) t.life += dt * 60;
      t.mesh.visibility = Math.max(0, 0.7 * (1 - t.life / 9));
      t.mesh.scaling.setAll(Math.max(0.05, 1 - t.life / 12));
      if (t.life >= 9) { t.mesh.isVisible = false; this.trails.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (this.animate) r.life += dt * 60;
      const k = r.life / r.max;
      r.mesh.scaling.set(1 + k * r.size, 1, 1 + k * r.size);
      r.mesh.visibility = Math.max(0, 1 - k);
      if (k >= 1) { r.mesh.isVisible = false; this.rings.splice(i, 1); }
    }
    this.zoom = Math.max(0, this.zoom - dt * 0.9);

    // Camera follows the midpoint and backs off as fighters separate.
    const [a, b] = game.fighters;
    const mid = (a.x + b.x) / 2;
    const gap = Math.abs(a.x - b.x);
    // The field of view is vertical, so narrow (portrait) screens need the camera further back to keep both fighters in frame.
    const aspect = this.engine.getAspectRatio(this.cam);
    const dist = (6.3 + gap * 0.5) * Math.max(1, 1.75 / aspect) * (1 - 0.16 * this.zoom);
    const k = Math.min(1, dt * 6);
    this.camPos.x = lerp(this.camPos.x, mid, k);
    this.camPos.y = lerp(this.camPos.y, 1.9 + gap * 0.05, k);
    this.camPos.z = lerp(this.camPos.z, -dist, k);
    this.camTarget.x = lerp(this.camTarget.x, mid, k);
    this.camTarget.y = lerp(this.camTarget.y, 1.15, k);
    this.shake *= Math.pow(0.001, dt); // decays in about a third of a second
    const sx = (Math.sin(this.time * 90) * this.shake), sy = (Math.cos(this.time * 77) * this.shake);
    this.cam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.cam.setTarget(new Vector3(this.camTarget.x, this.camTarget.y, 0));

    this.flash = Math.max(0, this.flash - dt * 3);
    const base = this.stage?.clear ?? new Color4(0.03, 0.03, 0.06, 1);
    this.scene.clearColor = new Color4(Math.min(1, base.r + this.flash * 0.25), Math.min(1, base.g + this.flash * 0.12), Math.min(1, base.b + this.flash * 0.05), 1);
    this.stage?.update(this.time);
  }
}
