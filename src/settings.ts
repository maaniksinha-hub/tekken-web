/** Player settings, saved in the browser. */
export interface Settings {
  sfx: number; // 0..1
  music: number; // 0..1
  shake: boolean;
  quality: "low" | "medium" | "high";
  announcer: boolean;
  seenHowTo: boolean;
}

const KEY = "tekken-web.settings.v1";
const DEFAULTS: Settings = { sfx: 0.8, music: 0.5, shake: true, quality: "high", announcer: true, seenHowTo: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* corrupt or unavailable storage: use defaults */ }
  return { ...DEFAULTS };
}

export const settings: Settings = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function onSettingsChange(cb: () => void): void {
  listeners.add(cb);
}
