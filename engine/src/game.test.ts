import { describe, expect, it } from "vitest";
import { generateBoard } from "./board.js";
import { buildGeometry } from "./coords.js";
import { createGame, toPublicState } from "./state.js";
import {
  bestTradeRatio,
  canPlaceSettlement,
  longestRoadLength,
  produceResources,
  recomputeLongestRoad,
} from "./rules.js";
import { applyAction } from "./actions.js";

function newGame() {
  return createGame(
    "TEST",
    [
      { id: "p1", name: "Alice", color: "red", isHost: true, connected: true },
      { id: "p2", name: "Bob", color: "blue", isHost: false, connected: true },
    ],
    { randomizeOrder: false } // deterministic seating for assertions
  );
}

describe("geometry", () => {
  it("produces 19 hexes, 54 vertices and 72 edges", () => {
    const geo = buildGeometry();
    expect(geo.hexes.length).toBe(19);
    expect(geo.vertices.size).toBe(54);
    expect(geo.edges.size).toBe(72);
  });

  it("every interior vertex touches up to 3 hexes", () => {
    const geo = buildGeometry();
    for (const v of geo.vertices.values()) {
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect(v.adjacent.length).toBeGreaterThanOrEqual(2);
      expect(v.adjacent.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("board generation", () => {
  it("has the standard terrain counts and one desert with the robber", () => {
    const { layout, robberHex } = generateBoard();
    const counts: Record<string, number> = {};
    for (const h of layout.hexes) counts[h.terrain] = (counts[h.terrain] ?? 0) + 1;
    expect(counts.wood).toBe(4);
    expect(counts.sheep).toBe(4);
    expect(counts.wheat).toBe(4);
    expect(counts.brick).toBe(3);
    expect(counts.ore).toBe(3);
    expect(counts.desert).toBe(1);
    const desert = layout.hexes.find((h) => h.terrain === "desert")!;
    expect(desert.numberToken).toBeNull();
    expect(robberHex).toBe(desert.id);
    expect(layout.ports.length).toBe(9);
  });
});

describe("settlement placement", () => {
  it("enforces the distance rule", () => {
    const game = newGame();
    const v = game.board.vertices[0];
    game.buildings[v.id] = { type: "settlement", owner: "p1" };
    // any adjacent vertex must now be illegal
    for (const adj of v.adjacent) {
      expect(canPlaceSettlement(game, "p2", adj, false)).toBe(false);
    }
  });
});

describe("longest road", () => {
  it("counts a simple chain of roads", () => {
    const game = newGame();
    // Build a path of edges sharing vertices for p1.
    const start = game.board.vertices.find((v) => v.edges.length >= 2)!;
    // Walk a deterministic path of 5 connected edges.
    const visitedV = new Set<string>([start.id]);
    let current = start.id;
    let placed = 0;
    while (placed < 5) {
      const vtx = game.vertexById.get(current)!;
      const edge = vtx.edges
        .map((e) => game.edgeById.get(e)!)
        .find((e) => !game.roads[e.id] && !visitedV.has(e.v1 === current ? e.v2 : e.v1));
      if (!edge) break;
      game.roads[edge.id] = "p1";
      const next = edge.v1 === current ? edge.v2 : edge.v1;
      visitedV.add(next);
      current = next;
      placed++;
    }
    expect(placed).toBe(5);
    expect(longestRoadLength(game, "p1")).toBe(5);
  });

  it("awards the longest road card at length 5", () => {
    const game = newGame();
    const start = game.board.vertices.find((v) => v.edges.length >= 2)!;
    const visitedV = new Set<string>([start.id]);
    let current = start.id;
    let placed = 0;
    while (placed < 5) {
      const vtx = game.vertexById.get(current)!;
      const edge = vtx.edges
        .map((e) => game.edgeById.get(e)!)
        .find((e) => !game.roads[e.id] && !visitedV.has(e.v1 === current ? e.v2 : e.v1));
      if (!edge) break;
      game.roads[edge.id] = "p1";
      const next = edge.v1 === current ? edge.v2 : edge.v1;
      visitedV.add(next);
      current = next;
      placed++;
    }
    recomputeLongestRoad(game);
    expect(game.longestRoadHolder).toBe("p1");
  });
});

describe("port trade ratios", () => {
  it("defaults to 4:1 with no ports", () => {
    const game = newGame();
    expect(bestTradeRatio(game, "p1", "wood")).toBe(4);
  });

  it("uses 2:1 on a matching resource port", () => {
    const game = newGame();
    const woodPort = game.board.ports.find((p) => p.type === "wood")!;
    // Keep only the wood port so a vertex shared with another (randomly placed)
    // port can't change the expected ratios.
    game.board.ports = [woodPort];
    game.buildings[woodPort.vertices[0]] = { type: "settlement", owner: "p1" };
    expect(bestTradeRatio(game, "p1", "wood")).toBe(2);
    expect(bestTradeRatio(game, "p1", "brick")).toBe(4);
  });
});

describe("resource production", () => {
  it("gives a settlement 1 and a city 2 of the hex resource", () => {
    const game = newGame();
    const hex = game.board.hexes.find((h) => h.terrain !== "desert" && h.numberToken !== null)!;
    // Isolate this hex so other (randomly placed) hexes with the same token
    // can't contribute — the board is random, so make the scenario explicit.
    for (const h of game.board.hexes) if (h.id !== hex.id) h.numberToken = null;
    game.robberHex = "999,999"; // move robber away
    game.buildings[hex.corners[0]] = { type: "settlement", owner: "p1" };
    game.buildings[hex.corners[2]] = { type: "city", owner: "p2" };
    produceResources(game, hex.numberToken!);
    const res = hex.terrain as "wood";
    const p1 = game.players.find((p) => p.id === "p1")!;
    const p2 = game.players.find((p) => p.id === "p2")!;
    expect(p1.resources[res]).toBe(1);
    expect(p2.resources[res]).toBe(2);
  });

  it("does not produce from the robber-occupied hex", () => {
    const game = newGame();
    const hex = game.board.hexes.find((h) => h.terrain !== "desert" && h.numberToken !== null)!;
    for (const h of game.board.hexes) if (h.id !== hex.id) h.numberToken = null;
    game.robberHex = hex.id;
    game.buildings[hex.corners[0]] = { type: "settlement", owner: "p1" };
    produceResources(game, hex.numberToken!);
    const res = hex.terrain as "wood";
    expect(game.players.find((p) => p.id === "p1")!.resources[res]).toBe(0);
  });
});

describe("setup turn order", () => {
  const firstLegalVertex = (game: ReturnType<typeof newGame>) =>
    game.board.vertices.find(
      (v) => !game.buildings[v.id] && !v.adjacent.some((a) => game.buildings[a])
    )!;

  it("advances the active player after a settlement + road", () => {
    const game = newGame();
    expect(game.phase).toBe("setup");
    expect(game.currentPlayerIndex).toBe(0);

    const v = firstLegalVertex(game);
    expect(applyAction(game, "p1", { type: "placeSettlement", vertexId: v.id }).ok).toBe(true);
    // Still p1 — they owe a road before the turn passes.
    expect(game.currentPlayerIndex).toBe(0);

    const e = game.vertexById.get(v.id)!.edges.find((eid) => !game.roads[eid])!;
    expect(applyAction(game, "p1", { type: "placeRoad", edgeId: e }).ok).toBe(true);
    // Now it is p2's turn to place.
    expect(game.currentPlayerIndex).toBe(1);

    // p1 can no longer place; p2 can.
    const v2 = firstLegalVertex(game);
    expect(applyAction(game, "p1", { type: "placeSettlement", vertexId: v2.id }).ok).toBe(false);
    expect(applyAction(game, "p2", { type: "placeSettlement", vertexId: v2.id }).ok).toBe(true);
  });
});

describe("canonical board", () => {
  it("never places two red (6/8) hexes next to each other", () => {
    const isRed = (n: number | null) => n === 6 || n === 8;
    for (let t = 0; t < 25; t++) {
      const { layout } = generateBoard();
      const byId = new Map(layout.hexes.map((h) => [h.id, h]));
      for (const e of layout.edges) {
        if (e.hexes.length !== 2) continue;
        const [a, b] = e.hexes;
        expect(isRed(byId.get(a)!.numberToken) && isRed(byId.get(b)!.numberToken)).toBe(false);
      }
    }
  });

  it("has one 2:1 port of each resource and four 3:1 ports", () => {
    const { layout } = generateBoard();
    const counts: Record<string, number> = {};
    for (const p of layout.ports) counts[p.type] = (counts[p.type] ?? 0) + 1;
    expect(counts.any).toBe(4);
    for (const r of ["wood", "brick", "sheep", "wheat", "ore"]) expect(counts[r]).toBe(1);
  });
});

describe("house rules", () => {
  it("wins at the configured target victory points", () => {
    const game = createGame(
      "T",
      [
        { id: "p1", name: "A", color: "red", isHost: true, connected: true },
        { id: "p2", name: "B", color: "blue", isHost: false, connected: true },
      ],
      { targetVictoryPoints: 2, randomizeOrder: false }
    );
    game.phase = "main";
    game.hasRolled = true;
    game.currentPlayerIndex = 0;
    let placed = 0;
    for (const v of game.board.vertices) {
      if (placed >= 2) break;
      if (!game.buildings[v.id] && canPlaceSettlement(game, "p1", v.id, false)) {
        game.buildings[v.id] = { type: "settlement", owner: "p1" };
        placed++;
      }
    }
    const p1 = game.players.find((p) => p.id === "p1")!;
    p1.resources.wood = 1;
    p1.resources.brick = 1;
    const owned = Object.keys(game.buildings).find((vid) => game.buildings[vid].owner === "p1")!;
    const edge = game.vertexById.get(owned)!.edges.find((e) => !game.roads[e])!;
    applyAction(game, "p1", { type: "buildRoad", edgeId: edge });
    expect(game.winner).toBe("p1");
  });

  it("reveals hidden victory-point cards only once the game ends", () => {
    const game = newGame();
    const p1 = game.players[0];
    p1.devCards.push({ type: "victory", boughtTurn: 1 });
    const before = toPublicState(game).players.find((p) => p.id === p1.id)!.victoryPoints;
    game.winner = p1.id;
    game.phase = "ended";
    const after = toPublicState(game).players.find((p) => p.id === p1.id)!.victoryPoints;
    expect(after - before).toBe(1);
  });
});

describe("longest road ties (official rule)", () => {
  // Build a fresh disjoint road chain of `len` for a player, avoiding `forbidden`.
  function chain(game: ReturnType<typeof newGame>, pid: string, len: number, forbidden: Set<string>) {
    const start = game.board.vertices.find(
      (v) => !forbidden.has(v.id) && v.adjacent.every((a) => !forbidden.has(a)) && v.edges.some((e) => !game.roads[e])
    );
    if (!start) return 0;
    const used = new Set<string>([start.id]);
    forbidden.add(start.id);
    let cur = start.id;
    let placed = 0;
    while (placed < len) {
      const vtx = game.vertexById.get(cur)!;
      const edge = vtx.edges
        .map((e) => game.edgeById.get(e)!)
        .find((e) => {
          const other = e.v1 === cur ? e.v2 : e.v1;
          return !game.roads[e.id] && !used.has(other) && !forbidden.has(other);
        });
      if (!edge) break;
      game.roads[edge.id] = pid;
      const next = edge.v1 === cur ? edge.v2 : edge.v1;
      used.add(next);
      forbidden.add(next);
      cur = next;
      placed++;
    }
    return placed;
  }

  it("the holder keeps the card when another player only ties", () => {
    const game = newGame();
    const forbidden = new Set<string>();
    expect(chain(game, "p1", 5, forbidden)).toBe(5);
    recomputeLongestRoad(game);
    expect(game.longestRoadHolder).toBe("p1");

    expect(chain(game, "p2", 5, forbidden)).toBe(5); // disjoint, equal length
    recomputeLongestRoad(game);
    expect(game.longestRoadHolder).toBe("p1"); // tie -> holder keeps it
  });

  it("sets the card aside when challengers tie with no holder", () => {
    const game = newGame();
    const forbidden = new Set<string>();
    expect(chain(game, "p1", 5, forbidden)).toBe(5);
    expect(chain(game, "p2", 5, forbidden)).toBe(5);
    recomputeLongestRoad(game);
    expect(game.longestRoadHolder).toBeNull(); // tie among challengers -> unclaimed
  });
});

describe("trade counteroffers", () => {
  it("lets a responder counter and the proposer accept the counter", () => {
    const game = newGame();
    game.phase = "main";
    game.hasRolled = true;
    game.currentPlayerIndex = 0;
    const p1 = game.players[0];
    const p2 = game.players[1];
    p1.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    p2.resources = { wood: 0, brick: 0, sheep: 2, wheat: 0, ore: 0 };

    expect(applyAction(game, "p1", { type: "proposeTrade", give: { wood: 1 }, receive: { sheep: 1 } }).ok).toBe(true);
    // p2 counters: gives 2 sheep, wants 2 wood
    expect(applyAction(game, "p2", { type: "counterTrade", give: { sheep: 2 }, receive: { wood: 2 } }).ok).toBe(true);
    expect(game.pendingTrade!.responses["p2"].status).toBe("counter");
    // p1 accepts the counter
    expect(applyAction(game, "p1", { type: "acceptTradeWith", playerId: "p2" }).ok).toBe(true);
    expect(game.pendingTrade).toBeNull();
    expect(p1.resources.wood).toBe(0);
    expect(p1.resources.sheep).toBe(2);
    expect(p2.resources.sheep).toBe(0);
    expect(p2.resources.wood).toBe(2);
  });
});

describe("setup undo", () => {
  it("takes back the just-placed settlement and refunds round-2 resources", () => {
    const game = newGame();
    // Fast-forward to round 2 so a settlement grants starting resources.
    const place = (pid: string) => {
      const v = game.board.vertices.find(
        (x) => !game.buildings[x.id] && !x.adjacent.some((a) => game.buildings[a])
      )!;
      applyAction(game, pid, { type: "placeSettlement", vertexId: v.id });
      const e = game.vertexById.get(v.id)!.edges.find((eid) => !game.roads[eid])!;
      applyAction(game, pid, { type: "placeRoad", edgeId: e });
    };
    place("p1");
    place("p2");
    // Round 2 now, reverse order -> p2 first.
    expect(game.setup!.round).toBe(2);
    const p2 = game.players.find((p) => p.id === "p2")!;
    const before = { ...p2.resources };
    const v = game.board.vertices.find(
      (x) => !game.buildings[x.id] && !x.adjacent.some((a) => game.buildings[a])
    )!;
    expect(applyAction(game, "p2", { type: "placeSettlement", vertexId: v.id }).ok).toBe(true);
    expect(game.setup!.needs).toBe("road");
    expect(applyAction(game, "p2", { type: "undoSetup" }).ok).toBe(true);
    // Settlement removed, piece returned, resources clawed back.
    expect(game.buildings[v.id]).toBeUndefined();
    expect(game.setup!.needs).toBe("settlement");
    expect(p2.settlementsLeft).toBe(4); // one already placed in round 1
    for (const r of ["wood", "brick", "sheep", "wheat", "ore"] as const) {
      expect(p2.resources[r]).toBe(before[r]);
    }
  });

  it("refuses to undo once the road is placed", () => {
    const game = newGame();
    const v = game.board.vertices.find(
      (x) => !game.buildings[x.id] && !x.adjacent.some((a) => game.buildings[a])
    )!;
    applyAction(game, "p1", { type: "placeSettlement", vertexId: v.id });
    const e = game.vertexById.get(v.id)!.edges.find((eid) => !game.roads[eid])!;
    applyAction(game, "p1", { type: "placeRoad", edgeId: e });
    // It's p2's turn now; p1 cannot undo a finished placement.
    expect(applyAction(game, "p1", { type: "undoSetup" }).ok).toBe(false);
  });
});

describe("trade expiry", () => {
  it("auto-cancels a stale offer on the next action", () => {
    const game = newGame();
    game.phase = "main";
    game.hasRolled = true;
    game.currentPlayerIndex = 0;
    const p1 = game.players[0];
    p1.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    applyAction(game, "p1", { type: "proposeTrade", give: { wood: 1 }, receive: { sheep: 1 } });
    expect(game.pendingTrade).not.toBeNull();
    // Make the offer stale, then take any action -> it should be cleared.
    game.pendingTrade!.expiresAt = Date.now() - 1;
    applyAction(game, "p2", { type: "respondTrade", accept: false });
    expect(game.pendingTrade).toBeNull();
  });
});

describe("embargo", () => {
  it("auto-rejects trades between embargoed players, both ways", () => {
    const game = newGame();
    game.phase = "main";
    game.hasRolled = true;
    game.currentPlayerIndex = 0;
    const p1 = game.players[0];
    const p2 = game.players[1];
    p1.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    p2.resources = { wood: 0, brick: 0, sheep: 2, wheat: 0, ore: 0 };

    // p2 embargoes p1.
    expect(applyAction(game, "p2", { type: "setEmbargo", playerId: "p1", on: true }).ok).toBe(true);

    // p1's offer auto-rejects p2 up front.
    applyAction(game, "p1", { type: "proposeTrade", give: { wood: 1 }, receive: { sheep: 1 } });
    expect(game.pendingTrade!.responses["p2"].status).toBe("reject");
    // p2 cannot accept, and the proposer cannot force a trade with p2.
    expect(applyAction(game, "p2", { type: "respondTrade", accept: true }).ok).toBe(false);
    expect(applyAction(game, "p1", { type: "acceptTradeWith", playerId: "p2" }).ok).toBe(false);
    expect(game.pendingTrade).not.toBeNull();

    // Lift it, and a new offer is pending again.
    applyAction(game, "p1", { type: "cancelTrade" });
    expect(applyAction(game, "p2", { type: "setEmbargo", playerId: "p1", on: false }).ok).toBe(true);
    applyAction(game, "p1", { type: "proposeTrade", give: { wood: 1 }, receive: { sheep: 1 } });
    expect(game.pendingTrade!.responses["p2"].status).toBe("pending");
  });
});

describe("win detection", () => {
  it("ends the game when a player reaches 10 victory points", () => {
    const game = newGame();
    game.phase = "main";
    game.hasRolled = true;
    game.currentPlayerIndex = 0;
    const p1 = game.players[0];
    // Give p1 five cities by hand (5 x 2 = 10 VP).
    let placed = 0;
    for (const v of game.board.vertices) {
      if (placed >= 5) break;
      if (canPlaceSettlement(game, "p1", v.id, false)) {
        game.buildings[v.id] = { type: "city", owner: "p1" };
        placed++;
      }
    }
    expect(placed).toBe(5);
    // Force a win check through an action: give resources and build a road (calls checkWin).
    p1.resources.wood = 1;
    p1.resources.brick = 1;
    // find a legal road for p1 next to a building
    const owned = Object.keys(game.buildings).find((vid) => game.buildings[vid].owner === "p1")!;
    const edge = game.vertexById.get(owned)!.edges.find((e) => !game.roads[e]);
    if (edge) {
      applyAction(game, "p1", { type: "buildRoad", edgeId: edge });
    }
    expect(game.winner).toBe("p1");
    expect(game.phase).toBe("ended");
  });
});
