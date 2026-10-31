import type { NetMsg } from "./rollback";

/**
 * Peer-to-peer link over WebRTC with copy-paste signalling: no server, nothing to pay for.
 * Host creates an "offer code", the guest pastes it and gets an "answer code" back.
 * Uses a public STUN server only to discover addresses; game data goes directly between browsers.
 */

export type LobbyMsg = { t: "hello"; char: string };
export type WireMsg = NetMsg | LobbyMsg;

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const encode = (d: RTCSessionDescriptionInit) => btoa(JSON.stringify({ type: d.type, sdp: d.sdp }));
const decode = (code: string): RTCSessionDescriptionInit => {
  try {
    const o = JSON.parse(atob(code.trim().replace(/\s+/g, "")));
    if ((o.type !== "offer" && o.type !== "answer") || typeof o.sdp !== "string") throw new Error("bad");
    return o;
  } catch {
    throw new Error("That code is not valid. Copy the whole code, without extra spaces.");
  }
};

function gathered(pc: RTCPeerConnection, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => { pc.removeEventListener("icegatheringstatechange", check); resolve(); };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs); // ship whatever candidates we have
  });
}

export class Peer {
  private dc: RTCDataChannel | null = null;
  private handler: ((m: WireMsg) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  open = false;

  private constructor(private pc: RTCPeerConnection) {
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") this.onClose?.();
    });
  }

  private bind(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.addEventListener("open", () => { this.open = true; this.onOpen?.(); });
    dc.addEventListener("close", () => { this.open = false; this.onClose?.(); });
    dc.addEventListener("message", (e) => {
      try { this.handler?.(JSON.parse(e.data as string) as WireMsg); } catch { /* ignore malformed packets */ }
    });
  }

  send(m: WireMsg): void {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(m));
  }
  onMessage(cb: (m: WireMsg) => void): void { this.handler = cb; }

  /** Host: returns the peer and the offer code to give to the guest. */
  static async host(): Promise<{ peer: Peer; code: string }> {
    const pc = new RTCPeerConnection(ICE);
    const peer = new Peer(pc);
    peer.bind(pc.createDataChannel("game", { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    return { peer, code: encode(pc.localDescription as RTCSessionDescription) };
  }

  /** Host: finish with the guest's answer code. */
  async acceptAnswer(code: string): Promise<void> {
    await this.pc.setRemoteDescription(decode(code));
  }

  /** Guest: accept the host's offer, returns the peer and the answer code to send back. */
  static async join(offerCode: string): Promise<{ peer: Peer; code: string }> {
    const offer = decode(offerCode);
    if (offer.type !== "offer") throw new Error("That is an answer code. Paste the host's first code here.");
    const pc = new RTCPeerConnection(ICE);
    const peer = new Peer(pc);
    pc.addEventListener("datachannel", (e) => peer.bind(e.channel));
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    return { peer, code: encode(pc.localDescription as RTCSessionDescription) };
  }

  close(): void {
    this.handler = null;
    this.dc?.close();
    this.pc.close();
  }
}
