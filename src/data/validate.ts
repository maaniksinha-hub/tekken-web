import { parseNotation } from "../sim/inputs";
import { BUTTONS, type MoveData } from "./types";

/**
 * Checks a character definition (built-in or loaded from JSON) and returns human-readable problems.
 * An empty list means the character is safe to load. Used by the game at startup and by
 * `npm run validate-characters`.
 */

const HEIGHTS = ["high", "mid", "low"];
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function checkMove(m: unknown, where: string, errs: string[], depth = 0): void {
  if (typeof m !== "object" || m === null) { errs.push(`${where}: missing move`); return; }
  const mv = m as Partial<MoveData>;
  if (typeof mv.name !== "string" || !mv.name) errs.push(`${where}: needs a name`);
  if (!HEIGHTS.includes(mv.height as string)) errs.push(`${where}: height must be high, mid or low`);
  const ranges: [keyof MoveData, number, number][] = [
    ["startup", 1, 60], ["active", 1, 20], ["recovery", 1, 120], ["damage", 0, 150],
    ["reach", 0.3, 4], ["hitstun", 0, 90], ["blockstun", 0, 90], ["pushback", 0, 3],
  ];
  for (const [k, lo, hi] of ranges) {
    const v = mv[k];
    if (!num(v) || v < lo || v > hi) errs.push(`${where}.${k}: must be a number from ${lo} to ${hi}`);
  }
  if (mv.next !== undefined) {
    if (!Array.isArray(mv.next)) errs.push(`${where}.next: must be a list`);
    else if (depth > 4) errs.push(`${where}.next: strings are too long (max 5 hits)`);
    else mv.next.forEach((n, i) => {
      if (!BUTTONS.includes(n?.button)) errs.push(`${where}.next[${i}].button: must be lp, rp, lk or rk`);
      checkMove(n?.move, `${where}.next[${i}]`, errs, depth + 1);
    });
  }
}

export function validateCharacter(c: unknown): string[] {
  const errs: string[] = [];
  if (typeof c !== "object" || c === null) return ["not an object"];
  const ch = c as Record<string, unknown>;
  if (typeof ch.id !== "string" || !/^[a-z0-9_-]{1,24}$/.test(ch.id)) errs.push("id: lowercase letters, digits, - or _ (max 24)");
  if (typeof ch.name !== "string" || !ch.name || ch.name.length > 14) errs.push("name: 1-14 characters");
  const stats: [string, number, number][] = [["maxHp", 60, 400], ["walkSpeed", 0.01, 0.1], ["backSpeed", 0.01, 0.08], ["sidestepSpeed", 0.01, 0.08]];
  for (const [k, lo, hi] of stats) if (!num(ch[k]) || (ch[k] as number) < lo || (ch[k] as number) > hi) errs.push(`${k}: must be a number from ${lo} to ${hi}`);

  const moves = ch.moves as Record<string, unknown> | undefined;
  for (const b of BUTTONS) checkMove(moves?.[b], `moves.${b}`, errs);

  if (!Array.isArray(ch.specials)) errs.push("specials: must be a list");
  else (ch.specials as { notation?: string; move?: unknown }[]).forEach((s, i) => {
    try { parseNotation(String(s?.notation)); } catch (e) { errs.push(`specials[${i}].notation: ${(e as Error).message}`); }
    checkMove(s?.move, `specials[${i}]`, errs);
  });

  if (!Array.isArray(ch.throws) || ch.throws.length !== 2) errs.push("throws: needs exactly 2 throws");
  else (ch.throws as MoveData[]).forEach((t, i) => {
    checkMove(t, `throws[${i}]`, errs);
    if (t && t.throw !== true) errs.push(`throws[${i}]: must have "throw": true`);
  });
  checkMove(ch.rageArt, "rageArt", errs);
  checkMove(ch.heatEngage, "heatEngage", errs);

  const look = ch.look as Record<string, unknown> | undefined;
  if (!look || typeof look.model !== "string") errs.push('look.model: "procedural" or a .glb path');
  for (const k of ["color", "accent"]) {
    if (typeof look?.[k] !== "string" || !/^#[0-9a-fA-F]{6}$/.test(look[k] as string)) errs.push(`look.${k}: a #rrggbb colour`);
  }
  if (typeof look?.model === "string" && look.model !== "procedural" && !/^[\w./-]+\.glb$/i.test(look.model)) {
    errs.push("look.model: a relative path ending in .glb");
  }
  return errs;
}
