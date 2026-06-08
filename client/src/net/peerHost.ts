import Peer, { type DataConnection } from "peerjs";
import { GameHost, generateRoomCode } from "@catan/engine";
import { Transport, type OutEvent } from "./transport.js";
import { peerIdForRoom, type ClientMessage } from "./messages.js";
import { peerOptions } from "./peerConfig.js";
import { HostRelay, type RelayConn } from "./hostRelay.js";

// The board/TV tab. Runs the authoritative game engine in-browser and relays
// state to every connected phone over WebRTC. Also feeds the local board view.
export class HostTransport extends Transport {
  private peer: Peer | null = null;
  private relay: HostRelay | null = null;

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
    this.relay = new HostRelay(new GameHost(code), (lobby, payload) => {
      this.dispatch("room:lobby", lobby);
      if (payload) this.dispatch("state", payload);
    });

    const peer = new Peer(peerIdForRoom(code), peerOptions());
    this.peer = peer;

    peer.on("open", () => {
      cb?.({ roomCode: code });
      this.relay?.broadcast();
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

  addBot(): void {
    this.relay?.addBot();
  }

  removeBot(id: string): void {
    this.relay?.removeBot(id);
  }

  startHostGame(): void {
    this.relay?.start();
  }

  private attach(conn: DataConnection): void {
    const relayConn: RelayConn = {
      get open() {
        return conn.open;
      },
      send: (msg) => conn.send(msg),
    };
    conn.on("data", (raw) => this.relay?.handle(relayConn, raw as ClientMessage));
    conn.on("close", () => this.relay?.disconnect(relayConn));
  }
}
