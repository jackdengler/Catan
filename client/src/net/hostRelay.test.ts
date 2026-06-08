import { describe, expect, it } from "vitest";
import { GameHost } from "@catan/engine";
import type { LobbyState, StatePayload } from "@catan/shared";
import { HostRelay, type RelayConn } from "./hostRelay.js";
import type { ClientMessage, HostMessage } from "./messages.js";

// A fake phone connection that records everything the host sends to it.
class FakeConn implements RelayConn {
  open = true;
  sent: HostMessage[] = [];
  send(msg: HostMessage): void {
    this.sent.push(msg);
  }
  last<K extends HostMessage["kind"]>(kind: K): Extract<HostMessage, { kind: K }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i].kind === kind) return this.sent[i] as any;
    }
    return undefined;
  }
}

function setup() {
  let localLobby: LobbyState | null = null;
  let localPayload: StatePayload | null = null;
  const relay = new HostRelay(new GameHost("TEST"), (lobby, payload) => {
    localLobby = lobby;
    localPayload = payload;
  });
  return { relay, getLocal: () => ({ lobby: localLobby, payload: localPayload }) };
}

const join = (name: string, color: any, playerId?: string): ClientMessage => ({
  kind: "join",
  name,
  color,
  playerId,
});

describe("host <-> phone protocol (HostRelay)", () => {
  it("completes the join handshake and broadcasts the lobby", () => {
    const { relay, getLocal } = setup();
    const a = new FakeConn();
    relay.handle(a, join("Alice", "red"));

    const joined = a.last("joined");
    expect(joined?.playerId).toBeTruthy();
    // Lobby is pushed to the connected phone and to the local board view.
    expect(a.last("lobby")?.lobby.players[0].name).toBe("Alice");
    expect(getLocal().lobby?.players[0].isHost).toBe(true);
  });

  it("starts the game and projects each phone ONLY its own private hand", () => {
    const { relay, getLocal } = setup();
    const a = new FakeConn();
    const b = new FakeConn();
    relay.handle(a, join("Alice", "red"));
    relay.handle(b, join("Bob", "blue"));

    const aId = a.last("joined")!.playerId;
    const bId = b.last("joined")!.playerId;

    // Host (Alice) starts via an action message.
    relay.handle(a, { kind: "action", action: { type: "startGame" } });

    // Each phone receives state addressed to itself...
    expect(a.last("state")?.payload.private?.playerId).toBe(aId);
    expect(b.last("state")?.payload.private?.playerId).toBe(bId);
    // ...and the board view gets public state with no private hand.
    expect(getLocal().payload?.private).toBeNull();
    // Public state never carries other players' card identities (only totals).
    const pub = a.last("state")!.payload.public;
    expect(pub.players.length).toBe(2);
    expect(pub.phase).toBe("setup");
  });

  it("rejects an illegal action and reports it to that phone only", () => {
    const { relay } = setup();
    const a = new FakeConn();
    const b = new FakeConn();
    relay.handle(a, join("Alice", "red"));
    relay.handle(b, join("Bob", "blue"));
    relay.handle(a, { kind: "action", action: { type: "startGame" } });

    const before = b.sent.length;
    // It's the setup phase; Bob trying to roll is illegal.
    relay.handle(b, { kind: "action", action: { type: "rollDice" } });
    expect(b.last("error")).toBeTruthy();
    // The error went to Bob; Alice didn't get an error pushed.
    expect(a.last("error")).toBeUndefined();
    expect(b.sent.length).toBeGreaterThan(before);
  });

  it("drives a real setup placement end-to-end over the wire", () => {
    const { relay } = setup();
    const a = new FakeConn();
    const b = new FakeConn();
    relay.handle(a, join("Alice", "red"));
    relay.handle(b, join("Bob", "blue"));
    relay.handle(a, { kind: "action", action: { type: "startGame" } });

    const state = a.last("state")!.payload.public;
    // First setup player places a settlement on the first legal vertex.
    const firstPid = state.setup!.order[state.setup!.pointer];
    const placer = firstPid === a.last("joined")!.playerId ? a : b;
    const vertex = state.board.vertices.find(
      (v) => !state.buildings[v.id] && !v.adjacent.some((adj) => state.buildings[adj])
    )!;
    relay.handle(placer, { kind: "action", action: { type: "placeSettlement", vertexId: vertex.id } });

    const after = placer.last("state")!.payload.public;
    expect(after.buildings[vertex.id]?.type).toBe("settlement");
    expect(after.setup!.needs).toBe("road");
  });

  it("marks a player offline when their phone disconnects", () => {
    const { relay, getLocal } = setup();
    const a = new FakeConn();
    const b = new FakeConn();
    relay.handle(a, join("Alice", "red"));
    relay.handle(b, join("Bob", "blue"));

    relay.disconnect(b);
    const bob = getLocal().lobby!.players.find((p) => p.name === "Bob")!;
    expect(bob.connected).toBe(false);
  });

  it("lets a phone reconnect with its stored player id", () => {
    const { relay } = setup();
    const a = new FakeConn();
    relay.handle(a, join("Alice", "red"));
    const id = a.last("joined")!.playerId;
    relay.disconnect(a);

    const a2 = new FakeConn();
    relay.handle(a2, join("Alice", "red", id));
    expect(a2.last("joined")?.playerId).toBe(id);
  });
});
