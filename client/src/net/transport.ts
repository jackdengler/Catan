// A minimal event-emitter that mimics the slice of the Socket.IO client API the
// app uses (.on/.once/.off/.emit/.connected). Two implementations back it: a
// PeerJS host (the TV/board tab) and a PeerJS client (a player's phone). This
// lets the React UI stay transport-agnostic.

export type Handler = (...args: any[]) => void;

// Wire message names. Outgoing (UI -> transport) vs incoming (transport -> UI).
export type OutEvent = "room:create" | "tv:join" | "host:create" | "room:join" | "action";
export type InEvent = "connect" | "disconnect" | "room:lobby" | "state" | "error" | "room:joined";

export abstract class Transport {
  private handlers = new Map<string, Set<Handler>>();
  connected = false;

  on(event: InEvent, h: Handler): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(h);
  }

  once(event: InEvent, h: Handler): void {
    const wrapper: Handler = (...args) => {
      this.off(event, wrapper);
      h(...args);
    };
    this.on(event, wrapper);
  }

  off(event: InEvent, h: Handler): void {
    this.handlers.get(event)?.delete(h);
  }

  protected dispatch(event: InEvent, ...args: any[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }

  // Outgoing commands. The last argument may be an ack callback (Socket.IO style).
  abstract emit(event: OutEvent, ...args: any[]): void;

  // Board-only lobby controls (no-ops on a phone client).
  addBot(): void {}
  removeBot(_id: string): void {}
  startHostGame(): void {}
  setOptions(_options: Partial<import("@catan/shared").GameOptions>): void {}
  regenerateBoard(): void {}
  // Serialize the running game (host only) so it can be moved to another device.
  exportState(): string | null {
    return null;
  }
}
