import { audioContext } from "./audio";
import { onSettingsChange, settings } from "./settings";

/**
 * Procedural music: a small step sequencer that plays a looping track per stage using only oscillators and
 * noise, so there are no audio files and nothing to license. Three styles match the three stages.
 */

interface Style {
  bpm: number;
  root: number; // MIDI note of the key centre
  scale: number[]; // semitone offsets
  bass: number[]; // 16 steps: scale degree index or -1 for rest
  lead: number[]; // 16 steps: scale degree index (can exceed scale length: next octave) or -1
  kick: number[];
  hat: number[];
  wave: { bass: OscillatorType; lead: OscillatorType };
  swing: number;
}

const STYLES: Style[] = [
  { // Neon arena: driving synthwave in A minor
    bpm: 132, root: 45, scale: [0, 2, 3, 5, 7, 8, 10],
    bass: [0, -1, 0, 0, -1, 0, 0, -1, 5, -1, 5, 5, -1, 3, 4, -1],
    lead: [7, -1, 9, -1, 11, -1, 9, 7, -1, 8, -1, 7, 4, -1, 6, -1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
    wave: { bass: "sawtooth", lead: "square" }, swing: 0,
  },
  { // Rooftop dusk: laid-back groove in D dorian
    bpm: 98, root: 38, scale: [0, 2, 3, 5, 7, 9, 10],
    bass: [0, -1, -1, 0, -1, 2, -1, -1, 3, -1, -1, 3, -1, 4, -1, 2],
    lead: [-1, 7, -1, -1, 9, -1, 8, -1, -1, 6, -1, 7, -1, -1, 4, -1],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
    wave: { bass: "triangle", lead: "triangle" }, swing: 0.18,
  },
  { // Moonlit temple: taiko drums with a pentatonic flute line in E minor pentatonic
    bpm: 108, root: 40, scale: [0, 3, 5, 7, 10],
    bass: [0, -1, -1, -1, 0, -1, -1, 0, -1, -1, 2, -1, -1, -1, 3, -1],
    lead: [-1, -1, 9, -1, 8, -1, 6, -1, -1, -1, 5, 6, -1, -1, 8, -1],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1],
    hat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    wave: { bass: "sine", lead: "sine" }, swing: 0,
  },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const degree = (st: Style, d: number) => st.root + st.scale[d % st.scale.length] + 12 * Math.floor(d / st.scale.length);

let bus: GainNode | null = null;
let timer: number | null = null;
let current = -1;
let step = 0;
let nextTime = 0;
let level = 1; // pause/duck multiplier
let noise: AudioBuffer | null = null;

function ensureBus(): { ctx: AudioContext; bus: GainNode } | null {
  const a = audioContext();
  if (!a) return null;
  if (!bus) {
    bus = a.ctx.createGain();
    bus.connect(a.master);
    const apply = () => { if (bus) bus.gain.value = settings.music * 0.55 * level; };
    apply();
    onSettingsChange(apply);
  }
  if (!noise) {
    noise = a.ctx.createBuffer(1, a.ctx.sampleRate, a.ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return { ctx: a.ctx, bus };
}

function note(ctx: AudioContext, dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType, gain: number): void {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function drum(ctx: AudioContext, dest: AudioNode, t: number, kind: "kick" | "hat", style: number): void {
  if (kind === "kick") {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(style === 2 ? 110 : 150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(style === 2 ? 1 : 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (style === 2 ? 0.3 : 0.18));
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.35);
  } else if (noise) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(dest);
    s.start(t); s.stop(t + 0.08);
  }
}

function schedule(): void {
  const a = ensureBus();
  if (!a || current < 0) return;
  const st = STYLES[current];
  const stepDur = 60 / st.bpm / 4;
  while (nextTime < a.ctx.currentTime + 0.25) {
    const i = step % 16;
    const t = nextTime + (i % 2 === 1 ? st.swing * stepDur : 0);
    if (st.kick[i]) drum(a.ctx, a.bus, t, "kick", current);
    if (st.hat[i]) drum(a.ctx, a.bus, t, "hat", current);
    if (st.bass[i] >= 0) note(a.ctx, a.bus, t, midi(degree(st, st.bass[i])), stepDur * 1.8, st.wave.bass, 0.32);
    if (st.lead[i] >= 0) note(a.ctx, a.bus, t, midi(degree(st, st.lead[i]) + 12), stepDur * (current === 2 ? 2.4 : 1.4), st.wave.lead, current === 2 ? 0.22 : 0.12);
    nextTime += stepDur;
    step += 1;
  }
}

/** Start (or switch to) the music for a style index. Safe to call before the audio context exists. */
export function playMusic(style: number): void {
  if (current === style && timer !== null) return;
  stopMusic();
  const a = ensureBus();
  if (!a) { current = style; return; } // will start after the first user gesture via resumeMusic()
  current = style;
  step = 0;
  nextTime = a.ctx.currentTime + 0.1;
  timer = window.setInterval(schedule, 40);
}

/** Call after the audio context has been unlocked by a user gesture. */
export function resumeMusic(): void {
  if (current >= 0 && timer === null) {
    const s = current;
    current = -1;
    playMusic(s);
  }
}

export function stopMusic(): void {
  if (timer !== null) { clearInterval(timer); timer = null; }
}

/** Lower the music (e.g. while paused) or restore it. */
export function setMusicLevel(l: number): void {
  level = l;
  if (bus) bus.gain.value = settings.music * 0.55 * level;
}

/** Briefly dip the music on a big hit so the impact cuts through. */
export function duckMusic(): void {
  const a = audioContext();
  if (!a || !bus) return;
  const now = a.ctx.currentTime;
  const base = settings.music * 0.55 * level;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(base * 0.35, now);
  bus.gain.linearRampToValueAtTime(base, now + 0.45);
}
