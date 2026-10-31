import type { CharacterData } from "./types";
import { validateCharacter } from "./validate";

/**
 * Loads extra characters from `characters/index.json` (a list of file names) next to the game.
 * Invalid files are skipped with a console warning, so a typo never breaks the game.
 */
export async function loadCustomCharacters(base: string, existingIds: Set<string>): Promise<CharacterData[]> {
  const out: CharacterData[] = [];
  try {
    const res = await fetch(`${base}characters/index.json`, { cache: "no-cache" });
    if (!res.ok) return out;
    const files: unknown = await res.json();
    if (!Array.isArray(files)) return out;
    for (const file of files) {
      if (typeof file !== "string" || !/^[\w.-]+\.json$/.test(file)) continue;
      try {
        const r = await fetch(`${base}characters/${file}`, { cache: "no-cache" });
        const c: unknown = await r.json();
        const errs = validateCharacter(c);
        if (errs.length) { console.warn(`Skipping characters/${file}:\n - ${errs.join("\n - ")}`); continue; }
        const ch = c as CharacterData;
        if (existingIds.has(ch.id)) { console.warn(`Skipping characters/${file}: id "${ch.id}" is already taken`); continue; }
        existingIds.add(ch.id);
        out.push(ch);
      } catch (e) {
        console.warn(`Skipping characters/${file}:`, e);
      }
    }
  } catch { /* no custom characters: fine */ }
  return out;
}
