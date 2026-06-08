import Peer, { type DataConnection } from "peerjs";
import { GameHost, generateRoomCode } from "@catan/engine";
import type { PlayerColor } from "@catan/shared";
import { Transport, type OutEvent } from "./transport.js";
import { peerIdForRoom, type ClientMessage } from "./messages.js";
import { peerOptions } from "./peerConfig.js";
import { HostRelay, type RelayConn } from "./hostRelay.js";

// The host tab. Runs the authoritative game engine in-browser and relays state
// to every connected phone over WebRTC. Used two ways:
//  - TV/board (?tv): a spectator host, no local player.
//  - Play-on-this-phone (?host): the host is ALSO a local player whose actions
//    apply directly to the engine (no network hop), so one phone can host and
//    play (vs bots, or with others joining by code).
export class HostTransport extends Transport {
  private peer: Peer | null = null;
  private relay: HostRelay | null = null;
  protected localPlayerId: string | null = null;

  constructor() {
    super();
    this.connected = true;
    queueMicrotask(() => this.dispatch("connect"));
  }

  emit(event: OutEvent, ...args: any[]): void {
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    if (event === "room:create" || event === "tv:join") {
      this.createRoom(cb);
    } else if (event === "host:create") {
      // Host + play on one device: create the room and seat a local player.
      this.createRoom(cb, 0, args[0] as { name: string; color: PlayerColor });
    } else if (event === "action") {
      const action = args[0];
      if (this.localPlayerId && this.relay) {
        this.relay.host.action(this.localPlayerId, action);
        this.relay.broadcast();
      }
      cb?.({ ok: true });
    }
  }

  private createRoom(
    cb?: (res: { roomCode: string; playerId?: string }) => void,
    attempt = 0,
    local?: { name: string; color: PlayerColor }
  ): void {
    const code = generateRoomCode();
    const host = new GameHost(code);
    this.relay = new HostRelay(host, (lobby) => {
      this.dispatch("room:lobby", lobby);
      // Local view = the seated player's hand (?host), or spectator (?tv).
      const payload = host.payloadFor(this.localPlayerId);
      if (payload) this.dispatch("state", payload);
    });

    // Seat the local player immediately (doesn't need the network).
    if (local) {
      const res = host.join(local.name, local.color);
      if (res.ok && res.playerId) this.localPlayerId = res.playerId;
    }

    const peer = new Peer(peerIdForRoom(code), peerOptions());
    this.peer = peer;

    peer.on("open", () => {
      cb?.({ roomCode: code, playerId: this.localPlayerId ?? undefined });
      this.relay?.broadcast();
    });

    peer.on("connection", (conn) => this.attach(conn));

    peer.on("error", (err: any) => {
      // If the chosen code collides on the broker, pick another and retry.
      if (err?.type === "unavailable-id" && attempt < 5) {
        peer.destroy();
        this.createRoom(cb, attempt + 1, local);
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
