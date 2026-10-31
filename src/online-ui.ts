import type { CharacterData } from "./data/types";
import type { Driver } from "./driver";
import { readInput } from "./input";
import { RollbackSession, type NetMsg } from "./net/rollback";
import { Peer, type WireMsg } from "./net/rtc";
import type { Screen } from "./ui";

interface Options {
  characters: CharacterData[];
  onBack: () => void;
  onStart: (driver: Driver, chars: [CharacterData, CharacterData]) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export function onlineDriver(peer: Peer, chars: [CharacterData, CharacterData], local: 0 | 1): Driver {
  const driver: Driver = {
    get game() { return session.game; },
    step() { session.tick(); },
    destroy() { peer.close(); },
    closed: false,
    status: "",
  };
  const session = new RollbackSession(
    chars, local,
    { send: (m: NetMsg) => peer.send(m), onMessage: (cb) => peer.onMessage((m: WireMsg) => { if (m.t === "in" || m.t === "hash") cb(m); }) },
    () => readInput(0),
    () => { driver.status = "Desync detected - the two games diverged. Please restart."; },
  );
  peer.onClose = () => { driver.closed = true; };
  return driver;
}

export function showOnline(o: Options): Screen {
  const host = document.getElementById("screen") as HTMLElement;
  host.replaceChildren();
  const dim = el("div", "dim");
  const panel = el("div", "panel wide");
  host.append(dim, panel);

  let peer: Peer | null = null;
  let role: 0 | 1 = 0;
  let myChar = 0;
  let theirChar: string | null = null;
  let ready = false;
  let started = false;

  const status = el("div", "status");
  const setStatus = (t: string, err = false) => { status.textContent = t; status.className = `status${err ? " err" : ""}`; };

  const button = (label: string, fn: () => void) => {
    const b = el("button", "btn", label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  };

  const tryStart = () => {
    if (started || !peer || !ready || theirChar === null) return;
    started = true;
    const mine = o.characters[myChar];
    const theirs = o.characters.find((c) => c.id === theirChar) ?? o.characters[0];
    const chars: [CharacterData, CharacterData] = role === 0 ? [mine, theirs] : [theirs, mine];
    o.onStart(onlineDriver(peer, chars, role), chars);
  };

  const wire = (p: Peer) => {
    peer = p;
    p.onMessage((m: WireMsg) => { if (m.t === "hello") { theirChar = m.char; tryStart(); renderLobby(); } });
    p.onClose = () => { if (!started) setStatus("Connection closed.", true); };
    p.onOpen = () => renderLobby();
    if (p.open) renderLobby();
  };

  const renderMain = () => {
    panel.replaceChildren(
      el("h1", "", "ONLINE VERSUS"),
      el("p", "sub", "Play a friend on another device. No account or server needed: you swap two short codes (by chat or text message)."),
    );
    const list = el("ul", "menu");
    const item = (label: string, hint: string, fn: () => void) => {
      const li = el("li", "", label);
      li.append(el("small", "", hint));
      li.addEventListener("click", fn);
      list.append(li);
    };
    item("Host a game", "you create the first code", () => { role = 0; void renderHost(); });
    item("Join a game", "paste your friend's code", () => { role = 1; renderJoin(); });
    item("Back", "", () => { peer?.close(); o.onBack(); });
    panel.append(list, el("div", "foot", "Tip: both players need a modern browser (Chrome, Edge, Firefox). Strict networks or VPNs can block direct connections."));
  };

  const codeBox = (label: string, value: string, readonly: boolean) => {
    const wrap = el("div");
    wrap.append(el("div", "sub", label));
    const ta = el("textarea");
    ta.value = value;
    ta.readOnly = readonly;
    ta.spellcheck = false;
    wrap.append(ta);
    return { wrap, ta };
  };

  const renderHost = async () => {
    panel.replaceChildren(el("h2", "", "HOST A GAME"), status);
    setStatus("Creating your code...");
    try {
      const { peer: p, code } = await Peer.host();
      wire(p);
      const mine = codeBox("1. Send this code to your friend:", code, true);
      const copy = button("Copy code", () => { void navigator.clipboard?.writeText(code); setStatus("Code copied. Send it to your friend."); });
      const theirs = codeBox("2. Paste your friend's reply code here:", "", false);
      const go = button("Connect", async () => {
        try { setStatus("Connecting..."); await p.acceptAnswer(theirs.ta.value); setStatus("Waiting for the connection to open..."); }
        catch (e) { setStatus((e as Error).message, true); }
      });
      panel.append(mine.wrap, el("div", "row"), theirs.wrap, el("div", "row"), button("Back", () => { p.close(); renderMain(); }));
      (panel.children[3] as HTMLElement).append(copy);
      (panel.children[5] as HTMLElement).append(go);
      setStatus("Waiting for your friend...");
    } catch (e) {
      setStatus(`Could not start: ${(e as Error).message}`, true);
      panel.append(button("Back", renderMain));
    }
  };

  const renderJoin = () => {
    panel.replaceChildren(el("h2", "", "JOIN A GAME"), status);
    setStatus("");
    const theirs = codeBox("1. Paste the host's code here:", "", false);
    const out = el("div");
    const go = button("Create reply code", async () => {
      try {
        setStatus("Creating your reply code...");
        const { peer: p, code } = await Peer.join(theirs.ta.value);
        wire(p);
        out.replaceChildren();
        const mine = codeBox("2. Send this reply code back to the host:", code, true);
        out.append(mine.wrap, button("Copy code", () => { void navigator.clipboard?.writeText(code); setStatus("Copied."); }));
        setStatus("Waiting for the host to connect...");
      } catch (e) { setStatus((e as Error).message, true); }
    });
    panel.append(theirs.wrap, el("div", "row"), out, el("div", "row"));
    (panel.children[3] as HTMLElement).append(go);
    (panel.children[5] as HTMLElement).append(button("Back", () => { peer?.close(); renderMain(); }));
  };

  const renderLobby = () => {
    if (!peer?.open || started) return;
    panel.replaceChildren(el("h2", "", "CONNECTED"), el("p", "sub", `You are Player ${role + 1}. Pick your fighter, then press Ready.`), status);
    setStatus(ready ? (theirChar ? "Starting..." : "Waiting for your friend to be ready...") : "");
    const row = el("div", "row");
    o.characters.forEach((c, i) => {
      const b = button(c.name, () => { if (!ready) { myChar = i; renderLobby(); } });
      b.style.borderColor = i === myChar ? "#f5c542" : "";
      row.append(b);
    });
    panel.append(row);
    const go = button(ready ? "Ready!" : "Ready", () => {
      if (ready) return;
      ready = true;
      peer?.send({ t: "hello", char: o.characters[myChar].id });
      renderLobby();
      tryStart();
    });
    panel.append(go);
    go.focus();
  };

  renderMain();

  return {
    update(nav) {
      // The panel is mouse/keyboard driven (it has text boxes); only Escape leaves it.
      if (nav.start && !started) { peer?.close(); o.onBack(); }
    },
    destroy() { host.replaceChildren(); },
  };
}
