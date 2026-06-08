import { describe, expect, it } from "vitest";
import { GameHost } from "./host.js";

describe("GameHost", () => {
  it("assigns unique colours and a host, and starts a game", () => {
    const host = new GameHost("ABCD");
    const a = host.join("Alice", "red");
    const b = host.join("Bob", "red"); // requests red again -> gets a different colour
    expect(a.ok && b.ok).toBe(true);
    const lobby = host.lobby();
    expect(lobby.players[0].isHost).toBe(true);
    expect(lobby.players[1].isHost).toBe(false);
    expect(lobby.players[0].color).not.toBe(lobby.players[1].color);

    // Non-host cannot start.
    expect(host.start(b.playerId!).ok).toBe(false);
    expect(host.start(a.playerId!).ok).toBe(true);
    expect(host.started).toBe(true);
  });

  it("projects private hands only to their owner", () => {
    const host = new GameHost("WXYZ");
    const a = host.join("Alice", "red");
    const b = host.join("Bob", "blue");
    host.start(a.playerId!);

    const forA = host.payloadFor(a.playerId!);
    const forTv = host.payloadFor(null);
    expect(forA?.private?.playerId).toBe(a.playerId);
    expect(forTv?.private).toBeNull();
    // Public state lists both players without exposing card identities.
    expect(forA?.public.players.length).toBe(2);
    void b;
  });

  it("rejects joining once the game has started", () => {
    const host = new GameHost("JOIN");
    const a = host.join("Alice", "red");
    host.join("Bob", "blue");
    host.start(a.playerId!);
    expect(host.join("Carol", "white").ok).toBe(false);
  });

  it("lets a player reconnect by id after the game starts", () => {
    const host = new GameHost("RECO");
    const a = host.join("Alice", "red");
    host.join("Bob", "blue");
    host.start(a.playerId!);
    host.setConnected(a.playerId!, false);
    const again = host.join("Alice", "red", a.playerId);
    expect(again.ok).toBe(true);
    expect(again.playerId).toBe(a.playerId);
  });
});
