import type { LobbyState, StatePayload } from "@catan/shared";
import { GameHost } from "@catan/engine";
import type { ClientMessage, HostMessage } from "./messages.js";

// An abstract data connection to one phone. The real implementation wraps a
// PeerJS DataConnection; tests pass a fake. This keeps the protocol logic free
// of any WebRTC dependency so it can be exercised in Node.
export interface RelayConn {
  readonly open: boolean;
  send(msg: HostMessage): void;
}

// Translates phone messages into authoritative GameHost calls and fans state
// back out to every connected phone, plus the local board view.
export class HostRelay {
  private conns = new Map<RelayConn, string>(); // conn -> playerId

  constructor(
    public readonly host: GameHost,
    private onLocal: (lobby: LobbyState, payload: StatePayload | null) => void
  ) {}

  handle(conn: RelayConn, msg: ClientMessage): void {
    if (msg.kind === "join") {
      const res = this.host.join(msg.name, msg.color, msg.playerId);
      if (!res.ok || !res.playerId) {
        conn.send({ kind: "rejected", message: res.message ?? "Could not join" });
        return;
      }
      // Drop any stale connection for this same player (a reconnect arrives on
      // a new conn; the old one's later close must not mark them offline).
      for (const [c, id] of this.conns) {
        if (id === res.playerId && c !== conn) this.conns.delete(c);
      }
      this.conns.set(conn, res.playerId);
      conn.send({ kind: "joined", playerId: res.playerId });
      this.broadcast();
    } else if (msg.kind === "action") {
      const pid = this.conns.get(conn);
      if (!pid) return;
      const res = this.host.action(pid, msg.action);
      if (!res.ok) conn.send({ kind: "error", message: res.message ?? "Invalid move" });
      this.broadcast();
    }
  }

  disconnect(conn: RelayConn): void {
    const pid = this.conns.get(conn);
    if (!pid) return;
    this.host.setConnected(pid, false);
    this.conns.delete(conn);
    this.broadcast();
  }

  broadcast(): void {
    const lobby = this.host.lobby();
    for (const [conn, pid] of this.conns) {
      if (!conn.open) continue;
      conn.send({ kind: "lobby", lobby });
      const payload = this.host.payloadFor(pid);
      if (payload) conn.send({ kind: "state", payload });
    }
    this.onLocal(lobby, this.host.payloadFor(null));
  }
}
