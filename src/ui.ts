import type { CharacterData, MoveData } from "./data/types";
import {
  ACTIONS, captureNextKey, getKeymaps, isReserved, keyLabel, pollSelect, resetKeys, resetSelectEdges, setKey,
  type Action, type Nav,
} from "./input";
import { uiMove, uiSelect } from "./audio";

const root = () => document.getElementById("screen") as HTMLElement;

export function clearScreen(): void {
  root().replaceChildren();
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Every screen has the same shape so main.ts can drive them with one loop. */
export interface Screen {
  /** Called every frame with edge-detected navigation input. */
  update(nav: Nav): void;
  destroy(): void;
}

export interface MenuItem {
  label: () => string;
  hint?: () => string;
  action: (dir?: -1 | 1) => void;
  disabled?: () => boolean;
}

export interface MenuOptions {
  title: string;
  titleAccent?: string;
  subtitle?: string;
  items: MenuItem[];
  onBack?: () => void;
  footer?: string;
  wide?: boolean;
}

export function showMenu(o: MenuOptions): Screen & { refresh(): void } {
  const host = root();
  host.replaceChildren();
  const dim = el("div", "dim");
  const panel = el("div", `panel${o.wide ? " wide" : ""}`);
  const h = el("h1");
  h.append(o.title);
  if (o.titleAccent) h.append(el("span", "", ` ${o.titleAccent}`));
  panel.append(h);
  if (o.subtitle) panel.append(el("p", "sub", o.subtitle));
  const ul = el("ul", "menu");
  ul.setAttribute("role", "menu");
  panel.append(ul);
  if (o.footer) panel.append(el("div", "foot", o.footer));
  host.append(dim, panel);

  let index = o.items.findIndex((i) => !i.disabled?.());
  if (index < 0) index = 0;

  const render = () => {
    ul.replaceChildren();
    o.items.forEach((it, i) => {
      const li = el("li", `${i === index ? "sel" : ""}${it.disabled?.() ? " off" : ""}`);
      li.setAttribute("role", "menuitem");
      li.append(el("span", "", it.label()));
      if (it.hint) li.append(el("small", "", it.hint()));
      li.addEventListener("click", () => { index = i; activate(); });
      li.addEventListener("mousemove", () => { if (index !== i) { index = i; render(); } });
      ul.append(li);
    });
  };
  const move = (d: 1 | -1) => {
    for (let n = 0; n < o.items.length; n++) {
      index = (index + d + o.items.length) % o.items.length;
      if (!o.items[index].disabled?.()) break;
    }
    uiMove();
    render();
  };
  const activate = (dir?: -1 | 1) => {
    const it = o.items[index];
    if (it.disabled?.()) return;
    uiSelect();
    it.action(dir);
    render();
  };
  render();

  return {
    refresh: render,
    update(nav) {
      if (nav.up) move(-1);
      else if (nav.down) move(1);
      else if (nav.left) activate(-1);
      else if (nav.right) activate(1);
      else if (nav.confirm) activate();
      else if (nav.back && o.onBack) o.onBack();
    },
    destroy() { host.replaceChildren(); },
  };
}

// ---- Character select ----

export interface SelectOptions {
  characters: CharacterData[];
  /** "cpu": player 2 is picked automatically after player 1. */
  mode: "local" | "cpu";
  onDone: (p0: CharacterData, p1: CharacterData) => void;
  onBack: () => void;
}

export function showSelect(o: SelectOptions): Screen {
  const host = root();
  host.replaceChildren();
  resetSelectEdges();
  const dim = el("div", "dim");
  const panel = el("div", "panel wide");
  panel.append(el("h1", "", "CHOOSE YOUR FIGHTER"));
  const sub = el("p", "sub");
  panel.append(sub);
  const grid = el("div", "grid");
  panel.append(grid);
  const picked = el("div", "picked");
  panel.append(picked);
  panel.append(el("div", "foot", "Move: direction keys / D-pad. Pick: button 1 or 3 (□ / ✕). Back: button 4 (○). Mouse works too."));
  host.append(dim, panel);

  const n = o.characters.length;
  const cursor: [number, number] = [0, Math.min(1, n - 1)];
  const locked: [number | null, number | null] = [null, null];
  let cpuTimer = 0;
  let finished = false;

  const render = () => {
    sub.textContent = o.mode === "cpu"
      ? (locked[0] === null ? "Player 1: pick a fighter. The CPU chooses after you." : "CPU is choosing...")
      : "Player 1 (blue) and Player 2 (red): pick a fighter each.";
    grid.replaceChildren();
    o.characters.forEach((c, i) => {
      const card = el("div", `card${cursor[0] === i ? " p0" : ""}${cursor[1] === i ? " p1" : ""}`);
      const sw = el("div", "swatch");
      sw.style.background = `linear-gradient(135deg, ${c.look.color}, ${c.look.accent})`;
      card.append(sw, el("div", "nm", c.name), el("div", "st", `HP ${c.maxHp}`));
      if (cursor[0] === i) card.append(Object.assign(el("span", "badge b0", locked[0] === i ? "P1 ✓" : "P1")));
      if (cursor[1] === i) card.append(Object.assign(el("span", "badge b1", o.mode === "cpu" ? "CPU" : locked[1] === i ? "P2 ✓" : "P2")));
      card.addEventListener("click", () => {
        if (locked[0] === null) { cursor[0] = i; confirm(0); }
        else if (o.mode === "local" && locked[1] === null) { cursor[1] = i; confirm(1); }
        render();
      });
      grid.append(card);
    });
    picked.textContent = "";
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    uiSelect();
    o.onDone(o.characters[locked[0] as number], o.characters[locked[1] as number]);
  };
  const confirm = (p: 0 | 1) => {
    if (locked[p] !== null) return;
    locked[p] = cursor[p];
    uiSelect();
    if (o.mode === "cpu" && p === 0) {
      cursor[1] = Math.floor(Math.random() * n); // UI only; never used by the sim
      cpuTimer = 70;
    }
    if (locked[0] !== null && locked[1] !== null) finish();
  };
  render();

  const step = (p: 0 | 1, s: ReturnType<typeof pollSelect>) => {
    if (locked[p] !== null) {
      if (s.back) { locked[p] = null; uiMove(); }
      return;
    }
    if (s.left) { cursor[p] = (cursor[p] + n - 1) % n; uiMove(); }
    if (s.right) { cursor[p] = (cursor[p] + 1) % n; uiMove(); }
    if (s.confirm) confirm(p);
    else if (s.back && p === 0) o.onBack();
  };

  return {
    update(nav) {
      const s0 = pollSelect(0);
      const s1 = pollSelect(1);
      if (nav.start && locked[0] === null && locked[1] === null) { o.onBack(); return; }
      // Menu-level pad nav also works for player 1's pad before the select edges kick in.
      step(0, s0);
      if (o.mode === "local") step(1, s1);
      else if (locked[0] !== null && locked[1] === null && cpuTimer > 0 && --cpuTimer === 0) { locked[1] = cursor[1]; finish(); }
      render();
    },
    destroy() { host.replaceChildren(); },
  };
}

// ---- Move list ----

const fmtMove = (label: string, m: MoveData) => {
  const tr = el("tr");
  tr.append(el("td", "", label), el("td", "", m.name), el("td", `h-${m.height}`, m.throw ? "throw" : m.unblockable ? "unblockable" : m.height));
  tr.append(el("td", "", `i${m.startup}`), el("td", "", String(m.damage)), el("td", "", m.launch ? "launcher" : ""));
  return tr;
};

export function showMoveList(chars: CharacterData[], start: number, onBack: () => void): Screen {
  const host = root();
  host.replaceChildren();
  const dim = el("div", "dim");
  const panel = el("div", "panel wide");
  host.append(dim, panel);
  let idx = start;

  const render = () => {
    const c = chars[idx];
    panel.replaceChildren();
    panel.append(el("h2", "", `MOVE LIST - ${c.name}`));
    panel.append(el("p", "sub", "Left/Right: change fighter. Back: close. Numbers are the 4 attack buttons (1 □, 2 △, 3 ✕, 4 ○). f = toward opponent, b = back, d = down."));
    const table = el("table", "moves");
    const head = el("tr");
    ["Input", "Move", "Height", "Startup", "Damage", ""].forEach((t) => head.append(el("th", "", t)));
    table.append(head);
    (["lp", "rp", "lk", "rk"] as const).forEach((b, i) => {
      const m = c.moves[b];
      table.append(fmtMove(String(i + 1), m));
      const walk = (mm: MoveData, prefix: string) => mm.next?.forEach((n) => {
        const key = String(["lp", "rp", "lk", "rk"].indexOf(n.button) + 1);
        table.append(fmtMove(`${prefix},${key}`, n.move));
        walk(n.move, `${prefix},${key}`);
      });
      walk(m, String(i + 1));
    });
    c.specials.forEach((s) => {
      table.append(fmtMove(s.notation, s.move));
      s.move.next?.forEach((n) => table.append(fmtMove(`${s.notation},${["lp", "rp", "lk", "rk"].indexOf(n.button) + 1}`, n.move)));
    });
    table.append(fmtMove("1+3", c.throws[0]), fmtMove("2+4", c.throws[1]));
    table.append(fmtMove("1+2 (Rage)", c.rageArt), fmtMove("3+4 (Heat)", c.heatEngage));
    panel.append(table);
    panel.append(el("div", "foot", "Throws: break with 1 (1+3 throws) or 2 (2+4 throws) quickly. Highs miss crouching opponents; lows need a crouch-block (hold back + down); mids need a standing block. Rage (below 25% health) boosts damage and unlocks the Rage Art once per round. Heat can be engaged once per round."));
  };
  render();

  return {
    update(nav) {
      if (nav.left) { idx = (idx + chars.length - 1) % chars.length; uiMove(); render(); }
      else if (nav.right) { idx = (idx + 1) % chars.length; uiMove(); render(); }
      else if (nav.back || nav.confirm) onBack();
    },
    destroy() { host.replaceChildren(); },
  };
}

// ---- Controls / remapping ----

export function showControls(onBack: () => void, padCount: () => number): Screen {
  let waiting = "";
  let screen: ReturnType<typeof showMenu>;
  const names: Record<Action, string> = { left: "Left", right: "Right", up: "Up / Jump", down: "Down / Crouch", lp: "1 (□)", rp: "2 (△)", lk: "3 (✕)", rk: "4 (○)" };
  const items: MenuItem[] = [];
  ([0, 1] as const).forEach((p) => {
    ACTIONS.forEach((a) => {
      items.push({
        label: () => `P${p + 1}  ${names[a]}`,
        hint: () => (waiting === `${p}${a}` ? "press a key... (Esc = clear)" : keyLabel(getKeymaps()[p][a])),
        action: () => {
          waiting = `${p}${a}`;
          screen.refresh();
          captureNextKey((code) => {
            waiting = "";
            if (code && isReserved(code)) { /* keep menu keys usable */ } else setKey(p, a, code);
            screen.refresh();
          });
        },
      });
    });
  });
  items.push({
    label: () => "Reset keys to defaults",
    action: () => { resetKeys(); screen.refresh(); },
  });
  items.push({ label: () => "Back", action: onBack });
  screen = showMenu({
    title: "CONTROLS",
    subtitle: "Select an action and press the new key. Defaults: P1 WASD + F G V B, P2 arrows + U I J K.",
    items,
    onBack,
    footer: `PS5 / PlayStation pads: D-pad or left stick to move, □ △ ✕ ○ = 1 2 3 4, Options = pause. Pad 1 controls P1, pad 2 controls P2. Connected pads: ${padCount()}.`,
    wide: true,
  });
  return screen;
}
