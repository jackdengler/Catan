import Peer, { type DataConnection } from "peerjs";
import type { PlayerColor } from "@catan/shared";
import { Transport, type OutEvent } from "./transport.js";
import { peerIdForRoom, type HostMessage } from "./messages.js";
import { peerOptions } from "./peerConfig.js";

// A player's phone. Connects to the board tab over WebRTC and exchanges
// join/action/state messages.
export class ClientTransport extends Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private pendingJoin:
    | { cb?: (res: { ok: boolean; playerId?: string; message?: string }) => void; name: string; color: PlayerColor; playerId?: string }
    | null = null;

  constructor() {
    super();
    this.connected = true;
    queueMicrotask(() => this.dispatch("connect"));
  }

  emit(event: OutEvent, ...args: any[]): void {
    if (event === "room:join") {
      const data = args[0] as { roomCode: string; name: string; color: PlayerColor; playerId?: string };
      const cb = args[1] as ((res: { ok: boolean; playerId?: string; message?: string }) => void) | undefined;
      this.connectToRoom(data, cb);
    } else if (event === "action") {
      const action = args[0];
      const cb = args[1] as ((res: { ok: boolean }) => void) | undefined;
      if (this.conn?.open) this.conn.send({ kind: "action", action });
      cb?.({ ok: true });
    }
  }

  private connectToRoom(
    data: { roomCode: string; name: string; color: PlayerColor; playerId?: string },
    cb?: (res: { ok: boolean; playerId?: string; message?: string }) => void
  ): void {
    // Reuse an existing connection (e.g. a retry) if already open.
    if (this.conn?.open) {
      this.pendingJoin = { cb, name: data.name, color: data.color, playerId: data.playerId };
      this.conn.send({ kind: "join", name: data.name, color: data.color, playerId: data.playerId });
      return;
    }

    const peer = new Peer(peerOptions());
    this.peer = peer;
    this.pendingJoin = { cb, name: data.name, color: data.color, playerId: data.playerId };

    peer.on("open", () => {
      const conn = peer.connect(peerIdForRoom(data.roomCode), { reliable: true });
      this.conn = conn;
      conn.on("open", () => {
        conn.send({ kind: "join", name: data.name, color: data.color, playerId: data.playerId });
      });
      conn.on("data", (raw) => this.onData(raw as HostMessage));
      conn.on("close", () => {
        this.connected = false;
        this.dispatch("disconnect");
      });
    });

    peer.on("error", (err: any) => {
      const message =
        err?.type === "peer-unavailable" ? "Room not found" : `Connection error: ${err?.type ?? err}`;
      if (this.pendingJoin?.cb) {
        this.pendingJoin.cb({ ok: false, message });
        this.pendingJoin = null;
      } else {
        this.dispatch("error", { message });
      }
    });
  }

  private onData(msg: HostMessage): void {
    switch (msg.kind) {
      case "joined": {
        const join = this.pendingJoin;
        this.pendingJoin = null;
        join?.cb?.({ ok: true, playerId: msg.playerId });
        this.dispatch("room:joined", { playerId: msg.playerId });
        break;
      }
      case "rejected": {
        const join = this.pendingJoin;
        this.pendingJoin = null;
        join?.cb?.({ ok: false, message: msg.message });
        break;
      }
      case "lobby":
        this.dispatch("room:lobby", msg.lobby);
        break;
      case "state":
        this.dispatch("state", msg.payload);
        break;
      case "error":
        this.dispatch("error", { message: msg.message });
        break;
    }
  }
}
