import Peer, { type DataConnection } from "peerjs";
import type { LobbyPlayer, PlayerColor } from "@catan/shared";
import { Transport, type OutEvent } from "./transport.js";
import { peerIdForRoom, type HostMessage } from "./messages.js";
import { peerOptions } from "./peerConfig.js";

interface JoinInfo {
  roomCode: string;
  name: string;
  color: PlayerColor;
  playerId?: string;
}

// A player's phone. Connects to the board tab over WebRTC and, if the
// connection drops mid-game, keeps trying to reconnect and rejoin with the
// same player id so the player gets their hand back.
export class ClientTransport extends Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private join: JoinInfo | null = null;
  private joinCb?: (res: {
    ok: boolean;
    playerId?: string;
    message?: string;
    roster?: LobbyPlayer[];
  }) => void;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeen = Date.now();
  private joinedOnce = false;

  constructor() {
    super();
    this.connected = true;
    queueMicrotask(() => this.dispatch("connect"));
    // If we stop hearing from the host (no state or heartbeat), treat it as a
    // drop and start trying to reconnect — covers a host tab that was killed.
    setInterval(() => {
      if (this.joinedOnce && this.connected && Date.now() - this.lastSeen > 7000) {
        this.handleDrop();
      }
    }, 2500);
  }

  emit(event: OutEvent, ...args: any[]): void {
    if (event === "room:join") {
      this.join = { ...(args[0] as JoinInfo) };
      this.joinCb = args[1];
      this.connect();
    } else if (event === "action") {
      const action = args[0];
      const cb = args[1] as ((res: { ok: boolean }) => void) | undefined;
      if (this.conn?.open) this.conn.send({ kind: "action", action });
      cb?.({ ok: true });
    }
  }

  private connect(): void {
    if (!this.join) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }

    const peer = new Peer(peerOptions());
    this.peer = peer;

    peer.on("open", () => {
      const conn = peer.connect(peerIdForRoom(this.join!.roomCode), { reliable: true });
      this.conn = conn;
      conn.on("open", () => {
        conn.send({
          kind: "join",
          name: this.join!.name,
          color: this.join!.color,
          playerId: this.join!.playerId,
        });
      });
      conn.on("data", (raw) => this.onData(raw as HostMessage));
      conn.on("close", () => this.handleDrop());
    });

    peer.on("error", (err: any) => {
      // Wrong room code on the very first attempt -> tell the join screen.
      if (this.joinCb && err?.type === "peer-unavailable") {
        this.joinCb({ ok: false, message: "Room not found" });
        this.joinCb = undefined;
        return;
      }
      // Otherwise it's a transient/host-down error: keep retrying.
      this.handleDrop();
    });
  }

  // Connection lost: surface it and schedule a retry. Reconnection keeps the
  // stored player id, so the host restores the player's hand.
  private handleDrop(): void {
    if (this.connected) {
      this.connected = false;
      this.dispatch("disconnect");
    }
    if (this.reconnectTimer || !this.join) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  private onData(msg: HostMessage): void {
    this.lastSeen = Date.now(); // any message means the host is alive
    switch (msg.kind) {
      case "ping":
        break;
      case "joined": {
        this.joinedOnce = true;
        if (this.join) this.join.playerId = msg.playerId; // remember for reconnects
        if (this.joinCb) {
          this.joinCb({ ok: true, playerId: msg.playerId });
          this.joinCb = undefined;
        }
        if (!this.connected) {
          this.connected = true;
          this.dispatch("connect");
        }
        this.dispatch("room:joined", { playerId: msg.playerId });
        break;
      }
      case "rejected": {
        if (this.joinCb) {
          this.joinCb({ ok: false, message: msg.message });
          this.joinCb = undefined;
        }
        break;
      }
      case "roster": {
        // Game in progress — offer the open seats to the join screen.
        if (this.joinCb) {
          this.joinCb({ ok: false, roster: msg.players });
          this.joinCb = undefined;
        }
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
