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

  it("adds bots, force-starts, and steps a bot", () => {
    const host = new GameHost("BT");
    host.addBot();
    host.addBot();
    const lobby = host.lobby();
    expect(lobby.players.length).toBe(2);
    expect(lobby.players.every((p) => p.isBot)).toBe(true);

    expect(host.forceStart().ok).toBe(true);
    expect(host.started).toBe(true);
    // First setup placement is owed by a bot.
    expect(host.hasPendingBotStep()).toBe(true);
    const r = host.botStep();
    expect(r.acted).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("serializes and restores an in-progress game with working maps", () => {
    const host = new GameHost("SAVE");
    host.addBot();
    host.addBot();
    host.forceStart();
    for (let i = 0; i < 6; i++) host.botStep(); // place some setup pieces

    // Round-trip through JSON like localStorage would.
    const snap = JSON.parse(JSON.stringify(host.serialize()));
    const restored = GameHost.restore(snap);

    const before = host.payloadFor(null)!.public;
    const after = restored.payloadFor(null)!.public;
    expect(Object.keys(after.buildings).length).toBe(Object.keys(before.buildings).length);
    expect(after.phase).toBe(before.phase);

    // The engine still runs on the restored host (the Maps were rebuilt).
    expect(restored.botStep().acted).toBe(true);
  });

  it("restores an older save that predates house-rule options", () => {
    const host = new GameHost("OLD");
    host.addBot();
    host.addBot();
    host.forceStart();
    const snap = JSON.parse(JSON.stringify(host.serialize()));
    // Simulate a save written before options/turnEndsAt existed.
    delete snap.game.options;
    delete snap.game.turnEndsAt;
    const restored = GameHost.restore(snap);
    // Doesn't crash — options are backfilled — and the engine still runs.
    expect(restored.botStep().acted).toBe(true);
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
