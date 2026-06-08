import Peer, { type DataConnection } from "peerjs";
import { GameHost, generateRoomCode } from "@catan/engine";
import { Transport, type OutEvent } from "./transport.js";
import { peerIdForRoom, type ClientMessage } from "./messages.js";

// The board/TV tab. Runs the authoritative game engine in-browser and relays
// state to every connected phone over WebRTC. Also feeds the local board view.
export class HostTransport extends Transport {
  private peer: Peer | null = null;
  private host: GameHost | null = null;
  // connection id -> player id
  private conns = new Map<DataConnection, string>();

  constructor() {
    super();
    this.connected = true;
    queueMicrotask(() => this.dispatch("connect"));
  }

  emit(event: OutEvent, ...args: any[]): void {
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    // The board always creates a room and hosts it. "tv:join" is treated the same.
    if (event === "room:create" || event === "tv:join") {
      this.createRoom(cb);
    }
    // The host tab is not a player, so it sends no "room:join"/"action".
  }

  private createRoom(cb?: (res: { roomCode: string }) => void, attempt = 0): void {
    const code = generateRoomCode();
    this.host = new GameHost(code);
    const peer = new Peer(peerIdForRoom(code), { debug: 1 });
    this.peer = peer;

    peer.on("open", () => {
      cb?.({ roomCode: code });
      this.pushLocal();
    });

    peer.on("connection", (conn) => this.attach(conn));

    peer.on("error", (err: any) => {
      // If the chosen code collides on the broker, pick another and retry.
      if (err?.type === "unavailable-id" && attempt < 5) {
        peer.destroy();
        this.createRoom(cb, attempt + 1);
      } else {
        this.dispatch("error", { message: `Connection error: ${err?.type ?? err}` });
      }
    });
  }

  private attach(conn: DataConnection): void {
    conn.on("data", (raw) => this.onData(conn, raw as ClientMessage));
    conn.on("close", () => {
      const pid = this.conns.get(conn);
      if (pid && this.host) {
        this.host.setConnected(pid, false);
        this.conns.delete(conn);
        this.broadcast();
      }
    });
  }

  private onData(conn: DataConnection, msg: ClientMessage): void {
    if (!this.host) return;
    if (msg.kind === "join") {
      const res = this.host.join(msg.name, msg.color, msg.playerId);
      if (!res.ok || !res.playerId) {
        conn.send({ kind: "rejected", message: res.message ?? "Could not join" });
        return;
      }
      this.conns.set(conn, res.playerId);
      conn.send({ kind: "joined", playerId: res.playerId });
      this.broadcast();
      return;
    }
    if (msg.kind === "action") {
      const pid = this.conns.get(conn);
      if (!pid) return;
      const res = this.host.action(pid, msg.action);
      if (!res.ok) conn.send({ kind: "error", message: res.message ?? "Invalid move" });
      this.broadcast();
    }
  }

  // Send every phone its projected state, and refresh the local board view.
  private broadcast(): void {
    if (!this.host) return;
    const lobby = this.host.lobby();
    for (const [conn, pid] of this.conns) {
      if (!conn.open) continue;
      conn.send({ kind: "lobby", lobby });
      const payload = this.host.payloadFor(pid);
      if (payload) conn.send({ kind: "state", payload });
    }
    this.pushLocal();
  }

  // The board tab renders public state with no private hand.
  private pushLocal(): void {
    if (!this.host) return;
    this.dispatch("room:lobby", this.host.lobby());
    const payload = this.host.payloadFor(null);
    if (payload) this.dispatch("state", payload);
  }
}
