import { COSTS, RESOURCES, type Action, type Resource } from "@catan/shared";
import {
  playerById,
  totalResources,
  type InternalGame,
  type InternalPlayer,
} from "./state.js";
import {
  bestTradeRatio,
  canAfford,
  canPlaceRoad,
  canPlaceSettlement,
} from "./rules.js";

// ---------------------------------------------------------------------------
// A simple greedy Catan bot. It runs on the host with full game state and
// returns one action at a time; the host applies it and asks again until the
// bot's obligations are done. Heuristics favour expansion (cities, then
// settlements), use the robber against the strongest opponent, and bank-trade
// toward the next build. It does not (yet) play development cards or initiate
// player trades.
// ---------------------------------------------------------------------------

const PIPS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

function tokenPips(token: number | null): number {
  return token == null ? 0 : PIPS[token] ?? 0;
}

// Sum of production "pips" of the hexes touching a vertex — a decent proxy for
// how good a settlement/city spot is.
function vertexValue(game: InternalGame, vertexId: string): number {
  const v = game.vertexById.get(vertexId);
  if (!v) return 0;
  let total = 0;
  for (const hexId of v.hexes) {
    const hex = game.hexById.get(hexId);
    if (hex && hex.terrain !== "desert") total += tokenPips(hex.numberToken);
  }
  return total;
}

// A richer settlement-spot score: production, resource diversity, and ports.
function settlementScore(game: InternalGame, vertexId: string): number {
  const v = game.vertexById.get(vertexId);
  if (!v) return 0;
  let pips = 0;
  const resources = new Set<string>();
  for (const hexId of v.hexes) {
    const hex = game.hexById.get(hexId);
    if (hex && hex.terrain !== "desert") {
      pips += tokenPips(hex.numberToken);
      resources.add(hex.terrain);
    }
  }
  let score = pips + resources.size * 0.5;
  if (game.board.ports.some((port) => port.vertices.includes(vertexId))) score += 1;
  return score;
}

// Rough public victory-point total, used to target the leader with the robber.
function vpOf(game: InternalGame, id: string): number {
  let v = 0;
  for (const b of Object.values(game.buildings)) if (b.owner === id) v += b.type === "city" ? 2 : 1;
  if (game.longestRoadHolder === id) v += 2;
  if (game.largestArmyHolder === id) v += 2;
  return v;
}

function playable(game: InternalGame, p: InternalPlayer, type: "knight" | "roadBuilding" | "yearOfPlenty" | "monopoly"): boolean {
  return p.devCards.some((c) => c.type === type && c.boughtTurn < game.turnNumber);
}

function missingFor(p: InternalPlayer, cost: Partial<Record<Resource, number>>): Record<Resource, number> {
  const m: Record<Resource, number> = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const r of RESOURCES) m[r] = Math.max(0, (cost[r] ?? 0) - p.resources[r]);
  return m;
}

function firstLegalRoad(game: InternalGame, p: InternalPlayer): string | null {
  const e = game.board.edges.find((edge) => canPlaceRoad(game, p.id, edge.id));
  return e ? e.id : null;
}

function missingSum(res: Record<Resource, number>, cost: Partial<Record<Resource, number>>): number {
  let s = 0;
  for (const r of RESOURCES) s += Math.max(0, (cost[r] ?? 0) - res[r]);
  return s;
}

// Accept a proposed trade only if it brings us strictly closer to our next
// build (the bot receives `give` and hands over `receive`).
function botEvaluatesTrade(
  game: InternalGame,
  p: InternalPlayer,
  give: Record<Resource, number>,
  receive: Record<Resource, number>
): boolean {
  if (!canAfford(p, receive)) return false;
  const cost = chooseBuildTarget(game, p) ?? COSTS.devCard;
  const after: Record<Resource, number> = { ...p.resources };
  for (const r of RESOURCES) {
    after[r] += (give[r] ?? 0) - (receive[r] ?? 0);
    if (after[r] < 0) return false;
  }
  return missingSum(after, cost) < missingSum(p.resources, cost);
}

// Worth playing a knight now if the robber sits on one of our hexes, or if it
// would win/keep Largest Army.
function shouldPlayKnight(game: InternalGame, p: InternalPlayer): boolean {
  const robberHex = game.hexById.get(game.robberHex);
  if (robberHex && robberHex.corners.some((v) => game.buildings[v]?.owner === p.id)) return true;
  const holder = game.largestArmyHolder;
  const holderKnights = holder ? game.players.find((x) => x.id === holder)?.playedKnights ?? 0 : 0;
  return holder !== p.id && p.playedKnights + 1 >= 3 && p.playedKnights + 1 > holderKnights;
}

// Determine the next thing any bot should do, or null if no bot needs to act.
export function computeBotStep(
  game: InternalGame
): { playerId: string; action: Action } | null {
  if (game.phase === "ended") return null;

  // 1. Respond to a pending player-trade: accept only if it helps.
  if (game.pendingTrade) {
    const trade = game.pendingTrade;
    for (const p of game.players) {
      if (p.isBot && trade.responses[p.id] === "pending") {
        const accept = botEvaluatesTrade(game, p, trade.give, trade.receive);
        return { playerId: p.id, action: { type: "respondTrade", accept } };
      }
    }
  }

  // 2. Discards owed on a 7.
  if (game.phase === "discard") {
    for (const p of game.players) {
      if (p.isBot && (game.pendingDiscards[p.id] ?? 0) > 0) {
        return { playerId: p.id, action: botDiscard(game, p) };
      }
    }
    return null; // still waiting on human discards
  }

  // 3. The current player's own turn.
  const cur = game.players[game.currentPlayerIndex];
  if (!cur || !cur.isBot) return null;

  switch (game.phase) {
    case "setup":
      return { playerId: cur.id, action: botSetup(game, cur) };
    case "roll":
      // Play a knight before rolling if it frees our hex or wins largest army.
      if (!cur.hasPlayedDevThisTurn && playable(game, cur, "knight") && shouldPlayKnight(game, cur)) {
        return { playerId: cur.id, action: { type: "playKnight" } };
      }
      return { playerId: cur.id, action: { type: "rollDice" } };
    case "moveRobber":
      return { playerId: cur.id, action: botRobber(game, cur) };
    case "main":
      return { playerId: cur.id, action: botMain(game, cur) };
    default:
      return null;
  }
}

function botDiscard(game: InternalGame, p: InternalPlayer): Action {
  const need = game.pendingDiscards[p.id] ?? 0;
  const picked: Record<Resource, number> = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  for (let i = 0; i < need; i++) {
    // Drop from whatever the bot has most of.
    let best: Resource = "wood";
    let bestRemaining = -1;
    for (const r of RESOURCES) {
      const remaining = p.resources[r] - picked[r];
      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        best = r;
      }
    }
    picked[best] += 1;
  }
  return { type: "discard", resources: picked };
}

function botSetup(game: InternalGame, p: InternalPlayer): Action {
  const setup = game.setup!;
  if (setup.needs === "settlement") {
    const spots = game.board.vertices
      .filter((v) => canPlaceSettlement(game, p.id, v.id, false))
      .sort((a, b) => settlementScore(game, b.id) - settlementScore(game, a.id));
    const target = spots[0] ?? game.board.vertices.find((v) => !game.buildings[v.id])!;
    return { type: "placeSettlement", vertexId: target.id };
  }
  // Road out of the just-placed settlement, toward the best neighbouring vertex.
  const anchor = setup.lastSettlement!;
  const vertex = game.vertexById.get(anchor)!;
  const edges = vertex.edges.filter((e) => !game.roads[e]);
  edges.sort((e1, e2) => farVertexValue(game, e2, anchor) - farVertexValue(game, e1, anchor));
  return { type: "placeRoad", edgeId: edges[0] };
}

function farVertexValue(game: InternalGame, edgeId: string, fromVertex: string): number {
  const e = game.edgeById.get(edgeId)!;
  const other = e.v1 === fromVertex ? e.v2 : e.v1;
  return vertexValue(game, other);
}

function botRobber(game: InternalGame, p: InternalPlayer): Action {
  let bestHex: string | null = null;
  let bestScore = -Infinity;
  for (const hex of game.board.hexes) {
    if (hex.id === game.robberHex) continue;
    let score = 0;
    for (const vId of hex.corners) {
      const b = game.buildings[vId];
      if (!b) continue;
      const weight = b.type === "city" ? 2 : 1;
      if (b.owner === p.id) score -= weight * 3; // avoid blocking ourselves
      else score += weight * tokenPips(hex.numberToken) * (1 + 0.4 * vpOf(game, b.owner));
    }
    if (score > bestScore) {
      bestScore = score;
      bestHex = hex.id;
    }
  }
  if (!bestHex) bestHex = game.board.hexes.find((h) => h.id !== game.robberHex)!.id;

  const hex = game.hexById.get(bestHex)!;
  const victims = new Set<string>();
  for (const vId of hex.corners) {
    const b = game.buildings[vId];
    if (b && b.owner !== p.id) victims.add(b.owner);
  }
  const targets = [...victims].filter((id) => totalResources(playerById(game, id)!) > 0);
  const stealFrom = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
  return { type: "moveRobber", hexId: bestHex, stealFrom };
}

function botMain(game: InternalGame, p: InternalPlayer): Action {
  // 0. Place any free roads from a road-building card first.
  if (game.freeRoads > 0) {
    const edge = roadTowardOpenSpot(game, p) ?? firstLegalRoad(game, p);
    if (edge) return { type: "placeRoad", edgeId: edge };
  }

  // 1. Year of Plenty to complete a build we're 1-2 resources short of.
  if (!p.hasPlayedDevThisTurn && playable(game, p, "yearOfPlenty")) {
    const cost = chooseBuildTarget(game, p);
    if (cost) {
      const missing = missingFor(p, cost);
      const need = RESOURCES.reduce((s, r) => s + missing[r], 0);
      if (need >= 1 && need <= 2) {
        const want: Resource[] = [];
        for (const r of RESOURCES) for (let i = 0; i < missing[r]; i++) want.push(r);
        while (want.length < 2) want.push(want[0] ?? "wheat");
        if (game.bank[want[0]] >= 1 && game.bank[want[1]] >= (want[0] === want[1] ? 2 : 1)) {
          return { type: "playYearOfPlenty", resources: [want[0], want[1]] };
        }
      }
    }
  }

  // 2. Upgrade the best settlement to a city.
  if (canAfford(p, COSTS.city) && p.citiesLeft > 0) {
    const settlements = Object.entries(game.buildings)
      .filter(([, b]) => b.owner === p.id && b.type === "settlement")
      .map(([vid]) => vid)
      .sort((a, b) => settlementScore(game, b) - settlementScore(game, a));
    if (settlements.length) return { type: "buildCity", vertexId: settlements[0] };
  }

  // 3. Build a settlement on the best legal spot.
  if (canAfford(p, COSTS.settlement) && p.settlementsLeft > 0) {
    const spots = game.board.vertices
      .filter((v) => canPlaceSettlement(game, p.id, v.id, true))
      .sort((a, b) => settlementScore(game, b.id) - settlementScore(game, a.id));
    if (spots.length) return { type: "buildSettlement", vertexId: spots[0].id };
  }

  // 4. Extend a road toward the nearest open, buildable vertex (multi-hop).
  if (canAfford(p, COSTS.road) && p.roadsLeft > 0) {
    const edge = roadTowardOpenSpot(game, p);
    if (edge) return { type: "buildRoad", edgeId: edge };
  }

  // 5. Monopoly when opponents are sitting on a lot of one resource.
  if (!p.hasPlayedDevThisTurn && playable(game, p, "monopoly")) {
    let best: Resource | null = null;
    let bestAmt = 0;
    for (const r of RESOURCES) {
      let amt = 0;
      for (const op of game.players) if (op.id !== p.id) amt += op.resources[r];
      if (amt > bestAmt) {
        bestAmt = amt;
        best = r;
      }
    }
    if (best && bestAmt >= 4) return { type: "playMonopoly", resource: best };
  }

  // 6. Road Building to expand for free when there's somewhere worth going.
  if (
    !p.hasPlayedDevThisTurn &&
    playable(game, p, "roadBuilding") &&
    p.roadsLeft > 0 &&
    roadTowardOpenSpot(game, p)
  ) {
    return { type: "playRoadBuilding" };
  }

  // 7. Bank-trade surplus toward the next city/settlement.
  const buildCost = chooseBuildTarget(game, p);
  if (buildCost) {
    const trade = bankTradeToward(game, p, buildCost);
    if (trade) return trade;
  }

  // 8. Buy a development card (knights -> largest army, plus victory points).
  if (canAfford(p, COSTS.devCard) && game.devDeck.length > 0) {
    return { type: "buyDevCard" };
  }

  // 9. If boxed in, convert surplus toward a dev card so resources keep turning
  //    into progress (and games don't stall).
  if (game.devDeck.length > 0) {
    const trade = bankTradeToward(game, p, COSTS.devCard);
    if (trade) return trade;
  }

  // 10. Nothing useful — end the turn.
  return { type: "endTurn" };
}

// City if we own a settlement to upgrade, else a settlement if a spot exists.
function chooseBuildTarget(
  game: InternalGame,
  p: InternalPlayer
): Partial<Record<Resource, number>> | null {
  const ownsSettlement = Object.values(game.buildings).some(
    (b) => b.owner === p.id && b.type === "settlement"
  );
  if (ownsSettlement && p.citiesLeft > 0) return COSTS.city;
  if (
    p.settlementsLeft > 0 &&
    game.board.vertices.some((v) => canPlaceSettlement(game, p.id, v.id, true))
  ) {
    return COSTS.settlement;
  }
  return null;
}

// BFS out from the player's road/building network over empty edges to the
// nearest open buildable vertex; return the first road to lay along that path.
function roadTowardOpenSpot(game: InternalGame, p: InternalPlayer): string | null {
  const isTarget = (vid: string): boolean => {
    if (game.buildings[vid]) return false;
    const v = game.vertexById.get(vid)!;
    return !v.adjacent.some((a) => game.buildings[a]);
  };
  const blocked = (vid: string): boolean => {
    const b = game.buildings[vid];
    return !!b && b.owner !== p.id;
  };

  const frontier = new Set<string>();
  for (const [vid, b] of Object.entries(game.buildings)) if (b.owner === p.id) frontier.add(vid);
  for (const [eid, owner] of Object.entries(game.roads)) {
    if (owner !== p.id) continue;
    const e = game.edgeById.get(eid)!;
    frontier.add(e.v1);
    frontier.add(e.v2);
  }
  if (frontier.size === 0) return null;

  const visited = new Set<string>(frontier);
  const queue: { vid: string; firstEdge: string | null }[] = [...frontier].map((v) => ({
    vid: v,
    firstEdge: null,
  }));
  for (let i = 0; i < queue.length; i++) {
    const { vid, firstEdge } = queue[i];
    if (firstEdge && isTarget(vid)) {
      // Nearest reachable open spot (BFS order); lay the first road on the way.
      if (canPlaceRoad(game, p.id, firstEdge)) return firstEdge;
    }
    if (blocked(vid)) continue; // can't route through an opponent's building
    const v = game.vertexById.get(vid)!;
    for (const eid of v.edges) {
      const e = game.edgeById.get(eid)!;
      const other = e.v1 === vid ? e.v2 : e.v1;
      if (visited.has(other)) continue;
      const owner = game.roads[eid];
      if (owner && owner !== p.id) continue; // opponent road blocks
      visited.add(other);
      // First empty edge leaving the network is the candidate road to build.
      const fe = owner === p.id ? firstEdge : firstEdge ?? eid;
      queue.push({ vid: other, firstEdge: fe });
    }
  }
  return null;
}

function bankTradeToward(
  game: InternalGame,
  p: InternalPlayer,
  cost: Partial<Record<Resource, number>>
): Action | null {
  const missing: Record<Resource, number> = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  let totalMissing = 0;
  for (const r of RESOURCES) {
    const m = Math.max(0, (cost[r] ?? 0) - p.resources[r]);
    missing[r] = m;
    totalMissing += m;
  }
  if (totalMissing === 0) return null;

  for (const want of RESOURCES) {
    if (missing[want] <= 0) continue;
    for (const give of RESOURCES) {
      if (give === want) continue;
      const ratio = bestTradeRatio(game, p.id, give);
      const surplus = p.resources[give] - (cost[give] ?? 0);
      if (surplus >= ratio) return { type: "bankTrade", give, receive: want };
    }
  }
  return null;
}
