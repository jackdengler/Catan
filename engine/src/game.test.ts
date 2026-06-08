import { describe, expect, it } from "vitest";
import { generateBoard } from "./board.js";
import { buildGeometry } from "./coords.js";
import { createGame } from "./state.js";
import {
  bestTradeRatio,
  canPlaceSettlement,
  longestRoadLength,
  produceResources,
  recomputeLongestRoad,
} from "./rules.js";
import { applyAction } from "./actions.js";

function newGame() {
  return createGame("TEST", [
    { id: "p1", name: "Alice", color: "red", isHost: true, connected: true },
    { id: "p2", name: "Bob", color: "blue", isHost: false, connected: true },
  ]);
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

describe("win detection", () => {
  it("ends the game when a player reaches 10 victory points", () => {
    const game = newGame();
    game.phase = "main";
    game.hasRolled = true;
    game.currentPlayerIndex = 0;
    const p1 = game.players[0];
    // Give p1 four cities (8 VP) by hand, plus resources for one more settlement.
    let placed = 0;
    for (const v of game.board.vertices) {
      if (placed >= 4) break;
      if (canPlaceSettlement(game, "p1", v.id, false)) {
        game.buildings[v.id] = { type: "city", owner: "p1" };
        placed++;
      }
    }
    // 4 cities = 8 VP. Add a settlement worth 1 and another -> reach 10 via cities? 8 + need 2 more.
    // Simplest: add two settlements (2 VP) for a total of 10.
    let s = 0;
    for (const v of game.board.vertices) {
      if (s >= 2) break;
      if (!game.buildings[v.id] && canPlaceSettlement(game, "p1", v.id, false)) {
        game.buildings[v.id] = { type: "settlement", owner: "p1" };
        s++;
      }
    }
    // Trigger a recompute by ending and re-entering — use buyDevCard guard path:
    // directly call checkWin via a no-op action that recomputes (endTurn requires main).
    // Instead assert via totalVictoryPoints helper indirectly through a city build.
    expect(placed).toBe(4);
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
