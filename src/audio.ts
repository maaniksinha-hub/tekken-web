import type { GameEvent } from "./sim/game";
import { onSettingsChange, settings } from "./settings";

/**
 * Sound effects synthesised with the Web Audio API: no files, no licences, no downloads.
 * Browsers only allow audio after a user gesture, so call `unlock()` from a key/click/pad press.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

export function unlock(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sfx;
  sfxBus.connect(master);
  onSettingsChange(() => { if (sfxBus) sfxBus.gain.value = settings.sfx; });
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // audio only; never used by the sim
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export const isMuted = () => muted;

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus ?? master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, q = 1, delay = 0): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus ?? master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

export function playEvent(e: GameEvent): void {
  if (!ctx) return;
  const p = 0.5 + e.power * 0.5;
  switch (e.type) {
    case "hit": noise(0.12, 0.6 * p, 900, 0.8); tone(150 * (1.2 - e.power * 0.4), 0.14, "sine", 0.7 * p, 50); break;
    case "block": noise(0.06, 0.35, 2500, 2); tone(320, 0.05, "square", 0.12); break;
    case "launch": noise(0.25, 0.5, 600, 0.6); tone(220, 0.3, "sawtooth", 0.25, 80); break;
    case "splat": noise(0.18, 0.7, 400, 0.5); tone(90, 0.25, "sine", 0.8, 40); break;
    case "throw": tone(120, 0.3, "sine", 0.8, 40); noise(0.2, 0.5, 500, 0.6); break;
    case "break": tone(880, 0.08, "square", 0.25); tone(1320, 0.1, "square", 0.2, undefined, 0.06); break;
    case "heat": tone(200, 0.6, "sawtooth", 0.3, 800); noise(0.5, 0.25, 3000, 1); break;
    case "rage": tone(110, 0.8, "sawtooth", 0.35, 55); tone(165, 0.8, "square", 0.15, 82); break;
    case "ko": noise(0.5, 0.8, 300, 0.4); tone(70, 0.8, "sine", 1, 30); break;
    case "whiff": noise(0.08, 0.15, 3000, 1); break;
  }
}

export function whoosh(): void { noise(0.1, 0.12, 2200, 1.2); }
export function uiMove(): void { tone(660, 0.04, "square", 0.08); }
export function uiSelect(): void { tone(440, 0.06, "square", 0.12); tone(880, 0.1, "square", 0.12, undefined, 0.05); }
export function bell(): void { tone(880, 0.9, "sine", 0.3); tone(1320, 0.7, "sine", 0.15); }

/** The master node, so music and speech can share the mute switch. */
export function audioContext(): { ctx: AudioContext; master: GainNode } | null {
  return ctx && master ? { ctx, master } : null;
}
