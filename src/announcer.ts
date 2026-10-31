import { isMuted } from "./audio";
import { settings } from "./settings";

/** Speaks the big moments with the browser's built-in voice (free, offline on most devices). Silent if unavailable. */
export function say(text: string, urgent = false): void {
  if (!settings.announcer || isMuted() || typeof speechSynthesis === "undefined") return;
  try {
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 0.55;
    u.volume = Math.min(1, settings.sfx + 0.2);
    speechSynthesis.speak(u);
  } catch { /* some browsers throw before a user gesture: ignore */ }
}
