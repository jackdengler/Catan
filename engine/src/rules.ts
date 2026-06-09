import {
  COSTS,
  RESOURCES,
  type Resource,
  type ResourceCount,
  type Port,
} from "@catan/shared";
import {
  addLog,
  currentPlayer,
  playerById,
  type InternalGame,
  type InternalPlayer,
} from "./state.js";

// ---------------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------------

export function canAfford(p: InternalPlayer, cost: Partial<ResourceCount>): boolean {
  return RESOURCES.every((r) => p.resources[r] >= (cost[r] ?? 0));
}

export function pay(game: InternalGame, p: InternalPlayer, cost: Partial<ResourceCount>): void {
  for (const r of RESOURCES) {
    const amt = cost[r] ?? 0;
    p.resources[r] -= amt;
    game.bank[r] += amt;
  }
}

export function give(game: InternalGame, p: InternalPlayer, gain: Partial<ResourceCount>): void {
  for (const r of RESOURCES) {
    const amt = gain[r] ?? 0;
    p.resources[r] += amt;
    game.bank[r] -= amt;
  }
}

// ---------------------------------------------------------------------------
// Placement legality
// ---------------------------------------------------------------------------

// A settlement may be placed on an empty vertex whose direct neighbours are all
// empty (distance rule). `requireRoad` enforces road-connectivity (false during
// initial setup placement).
export function canPlaceSettlement(
  game: InternalGame,
  playerId: string,
  vertexId: string,
  requireRoad: boolean
): boolean {
  const vertex = game.vertexById.get(vertexId);
  if (!vertex) return false;
  if (game.buildings[vertexId]) return false;

  // Distance rule: no adjacent vertex may have a building.
  for (const adj of vertex.adjacent) {
    if (game.buildings[adj]) return false;
  }

  if (requireRoad) {
    const connected = vertex.edges.some((e) => game.roads[e] === playerId);
    if (!connected) return false;
  }
  return true;
}

// A road may be placed on an empty edge connected to the player's existing road
// network or to one of their settlements/cities. During setup, it must connect
// to the just-placed settlement.
export function canPlaceRoad(
  game: InternalGame,
  playerId: string,
  edgeId: string,
  setupAnchorVertex?: string | null
): boolean {
  const edge = game.edgeById.get(edgeId);
  if (!edge) return false;
  if (game.roads[edgeId]) return false;

  if (setupAnchorVertex) {
    return edge.v1 === setupAnchorVertex || edge.v2 === setupAnchorVertex;
  }

  // Connected if either endpoint has the player's building, OR an incident edge
  // is the player's road AND that shared vertex is not blocked by an opponent.
  for (const v of [edge.v1, edge.v2]) {
    const vertex = game.vertexById.get(v)!;
    const building = game.buildings[v];
    if (building && building.owner === playerId) return true;
    // Cannot route a road *through* an opponent's building.
    if (building && building.owner !== playerId) continue;
    for (const inc of vertex.edges) {
      if (inc !== edgeId && game.roads[inc] === playerId) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Ports / trade ratios
// ---------------------------------------------------------------------------

// Best trade ratio the player can use for a given resource (4, 3 or 2).
export function bestTradeRatio(game: InternalGame, playerId: string, give: Resource): number {
  let ratio = 4;
  for (const port of game.board.ports) {
    const owns = port.vertices.some((v) => game.buildings[v]?.owner === playerId);
    if (!owns) continue;
    if (port.type === "any") ratio = Math.min(ratio, 3);
    else if (port.type === give) ratio = Math.min(ratio, 2);
  }
  return ratio;
}

export function playerPorts(game: InternalGame, playerId: string): Port[] {
  return game.board.ports.filter((port) =>
    port.vertices.some((v) => game.buildings[v]?.owner === playerId)
  );
}

// ---------------------------------------------------------------------------
// Longest road
// ---------------------------------------------------------------------------

// Longest continuous road (trail) for a player. Broken where an opponent's
// settlement/city sits on a vertex.
export function longestRoadLength(game: InternalGame, playerId: string): number {
  const playerEdges = Object.entries(game.roads)
    .filter(([, owner]) => owner === playerId)
    .map(([edgeId]) => edgeId);
  if (playerEdges.length === 0) return 0;
  const edgeSet = new Set(playerEdges);

  const blocked = (vertexId: string): boolean => {
    const b = game.buildings[vertexId];
    return !!b && b.owner !== playerId;
  };

  const otherEnd = (edgeId: string, vertexId: string): string => {
    const e = game.edgeById.get(edgeId)!;
    return e.v1 === vertexId ? e.v2 : e.v1;
  };

  let best = 0;

  const dfs = (vertexId: string, used: Set<string>): number => {
    const vertex = game.vertexById.get(vertexId)!;
    let max = 0;
    for (const e of vertex.edges) {
      if (!edgeSet.has(e) || used.has(e)) continue;
      const next = otherEnd(e, vertexId);
      used.add(e);
      let len = 1;
      if (!blocked(next)) {
        len += dfs(next, used);
      }
      used.delete(e);
      if (len > max) max = len;
    }
    return max;
  };

  // Start a trail from every vertex that touches one of this player's roads.
  const startVertices = new Set<string>();
  for (const edgeId of playerEdges) {
    const e = game.edgeById.get(edgeId)!;
    startVertices.add(e.v1);
    startVertices.add(e.v2);
  }
  for (const v of startVertices) {
    best = Math.max(best, dfs(v, new Set()));
  }
  return best;
}

// ---------------------------------------------------------------------------
// Award recomputation (longest road / largest army) + road lengths
// ---------------------------------------------------------------------------

export function recomputeRoadLengths(game: InternalGame): void {
  for (const p of game.players) {
    p.roadLength = longestRoadLength(game, p.id);
  }
}

// Recompute the Longest Road holder per the official rules:
//  - A road of >= 5 segments qualifies.
//  - The current holder keeps the card as long as they still (co-)hold the
//    longest road — another player must build a STRICTLY longer road to take it.
//  - If the holder no longer has the longest and a single other player is
//    clearly longest, that player takes it.
//  - If two or more players tie for the new longest (holder not among them), or
//    no one has a 5+ road, the card is set aside until someone leads again.
export function recomputeLongestRoad(game: InternalGame): void {
  recomputeRoadLengths(game);
  const holder = game.longestRoadHolder;
  const maxLen = Math.max(0, ...game.players.map((p) => p.roadLength));

  let next: string | null;
  if (maxLen < 5) {
    next = null;
  } else {
    const leaders = game.players.filter((p) => p.roadLength === maxLen);
    if (holder && leaders.some((p) => p.id === holder)) {
      next = holder; // still (tied for) longest -> keeps it
    } else if (leaders.length === 1) {
      next = leaders[0].id; // a single clear leader takes/earns it
    } else {
      next = null; // tie among challengers -> set aside until someone leads
    }
  }

  if (next !== holder) {
    game.longestRoadHolder = next;
    if (next) addLog(game, `${nameOf(game, next)} takes Longest Road.`, undefined, true);
    else addLog(game, `Longest Road is up for grabs.`, undefined, true);
  }
}

export function recomputeLargestArmy(game: InternalGame): void {
  const holder = game.largestArmyHolder;
  const holderKnights = holder ? game.players.find((p) => p.id === holder)?.playedKnights ?? 0 : 0;

  let challenger: string | null = null;
  let challengerKnights = Math.max(2, holderKnights); // must exceed current holder & be >= 3
  for (const p of game.players) {
    if (p.id === holder) continue;
    if (p.playedKnights >= 3 && p.playedKnights > challengerKnights) {
      challengerKnights = p.playedKnights;
      challenger = p.id;
    }
  }
  if (challenger) {
    game.largestArmyHolder = challenger;
    addLog(game, `${nameOf(game, challenger)} takes Largest Army.`, undefined, true);
  } else if (!holder) {
    // First to 3 knights.
    const candidate = game.players.find((p) => p.playedKnights >= 3);
    if (candidate) {
      game.largestArmyHolder = candidate.id;
      addLog(game, `${nameOf(game, candidate.id)} earns Largest Army.`, undefined, true);
    }
  }
}

function nameOf(game: InternalGame, id: string): string {
  return game.players.find((p) => p.id === id)?.name ?? "Someone";
}

// ---------------------------------------------------------------------------
// Resource production on a dice roll
// ---------------------------------------------------------------------------

export function produceResources(game: InternalGame, roll: number): void {
  // Tally what each player is owed per resource.
  const owed: Record<string, ResourceCount> = {};
  const ensure = (id: string) => (owed[id] ??= { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

  for (const hex of game.board.hexes) {
    if (hex.numberToken !== roll) continue;
    if (hex.id === game.robberHex) continue;
    if (hex.terrain === "desert") continue;
    const resource = hex.terrain as Resource;
    for (const vId of hex.corners) {
      const building = game.buildings[vId];
      if (!building) continue;
      ensure(building.owner)[resource] += building.type === "city" ? 2 : 1;
    }
  }

  // Apply respecting bank supply. Official rule: if the bank can't satisfy all
  // players for a resource and more than one player wants it, no one gets that
  // resource; if exactly one player wants it, give as much as remains.
  for (const resource of RESOURCES) {
    const claimants = Object.entries(owed).filter(([, c]) => c[resource] > 0);
    const totalWanted = claimants.reduce((s, [, c]) => s + c[resource], 0);
    if (totalWanted === 0) continue;

    if (totalWanted <= game.bank[resource]) {
      for (const [pid, c] of claimants) {
        give(game, playerById(game, pid)!, { [resource]: c[resource] } as Partial<ResourceCount>);
      }
    } else if (claimants.length === 1) {
      const [pid] = claimants[0];
      const amt = game.bank[resource];
      if (amt > 0) give(game, playerById(game, pid)!, { [resource]: amt } as Partial<ResourceCount>);
    }
    // else: bank shortage with multiple claimants -> nobody gets this resource.
  }
}

export { COSTS };
