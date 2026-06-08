import Peer, { type DataConnection } from "peerjs";
import { GameHost, generateRoomCode } from "@catan/engine";
import type { PlayerColor } from "@catan/shared";
import { Transport, type OutEvent } from "./transport.js";
import { peerIdForRoom, type ClientMessage } from "./messages.js";
import { peerOptions } from "./peerConfig.js";
import { HostRelay, type RelayConn } from "./hostRelay.js";
import { clearHostState, loadHostState, saveHostState } from "./hostSave.js";

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
  private mode: "tv" | "host" = "tv";
  private restored = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.connected = true;
    queueMicrotask(() => this.dispatch("connect"));
  }

  emit(event: OutEvent, ...args: any[]): void {
    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
    if (event === "room:create" || event === "tv:join") {
      this.createRoom(cb, "tv");
    } else if (event === "host:create") {
      // Host + play on one device: create the room and seat a local player.
      this.createRoom(cb, "host", args[0] as { name: string; color: PlayerColor });
    } else if (event === "action") {
      const action = args[0];
      if (this.localPlayerId && this.relay) {
        this.relay.host.action(this.localPlayerId, action);
        this.relay.broadcast();
      }
      cb?.({ ok: true });
    }
  }

  private setupRelay(host: GameHost): void {
    this.relay = new HostRelay(host, (lobby) => {
      this.dispatch("room:lobby", lobby);
      // Local view = the seated player's hand (?host), or spectator (?tv).
      const payload = host.payloadFor(this.localPlayerId);
      if (payload) this.dispatch("state", payload);
      this.queueSave(host);
    });
  }

  // Persist so a refresh can resume, but at most ~once/700ms — serializing the
  // whole game on every bot micro-step would jank a phone host.
  private queueSave(host: GameHost): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      saveHostState({ mode: this.mode, localPlayerId: this.localPlayerId, host: host.serialize() });
    }, 700);
  }

  private createRoom(
    cb?: (res: { roomCode: string; playerId?: string }) => void,
    mode: "tv" | "host" = "tv",
    local?: { name: string; color: PlayerColor }
  ): void {
    this.mode = mode;

    // Resume an in-progress game for this mode if one was saved.
    const saved = loadHostState();
    if (saved && saved.mode === mode && saved.host.game && !saved.host.game.winner) {
      const host = GameHost.restore(saved.host);
      this.localPlayerId = saved.localPlayerId;
      host.markConnections(this.localPlayerId);
      this.restored = true;
      this.setupRelay(host);
    } else {
      if (saved) clearHostState();
      const host = new GameHost(generateRoomCode());
      if (local) {
        const res = host.join(local.name, local.color);
        if (res.ok && res.playerId) this.localPlayerId = res.playerId;
      }
      this.restored = false;
      this.setupRelay(host);
    }

    this.openPeer(cb);
  }

  private openPeer(cb?: (res: { roomCode: string; playerId?: string }) => void, attempt = 0): void {
    const host = this.relay!.host;
    const code = host.roomCode;
    const peer = new Peer(peerIdForRoom(code), peerOptions());
    this.peer = peer;

    peer.on("open", () => {
      cb?.({ roomCode: code, playerId: this.localPlayerId ?? undefined });
      this.relay?.broadcast();
    });

    peer.on("connection", (conn) => this.attach(conn));

    peer.on("error", (err: any) => {
      if (err?.type === "unavailable-id" && attempt < 8) {
        peer.destroy();
        if (this.restored) {
          // Reuse the same code so phones can reconnect; the old peer frees up
          // on the broker shortly after a refresh.
          setTimeout(() => this.openPeer(cb, attempt + 1), 1200);
        } else {
          // Fresh game: a new code is fine.
          (host as any).roomCode = generateRoomCode();
          this.openPeer(cb, attempt + 1);
        }
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

  setOptions(options: Partial<import("@catan/shared").GameOptions>): void {
    this.relay?.host.setOptions(options);
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
