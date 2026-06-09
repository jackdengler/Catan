import {
  COSTS,
  EMPTY_RESOURCES,
  RESOURCES,
  VICTORY_POINTS_TO_WIN,
  type Action,
  type DevCard,
  type PendingTrade,
  type Resource,
  type ResourceCount,
} from "@catan/shared";
import { rollDice } from "./dice.js";
import {
  addLog,
  armTurnTimer,
  currentPlayer,
  playerById,
  totalResources,
  totalVictoryPoints,
  type InternalGame,
  type InternalPlayer,
} from "./state.js";
import {
  bestTradeRatio,
  canAfford,
  canPlaceRoad,
  canPlaceSettlement,
  give,
  pay,
  produceResources,
  recomputeLargestArmy,
  recomputeLongestRoad,
} from "./rules.js";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

// A domestic trade offer auto-cancels if nobody resolves it within this window,
// so a forgotten offer never lingers on everyone's screen.
const TRADE_TTL_MS = 60_000;

const ok: ActionResult = { ok: true };
const err = (message: string): ActionResult => ({ ok: false, message });

export function applyAction(
  game: InternalGame,
  playerId: string,
  action: Action
): ActionResult {
  const actor = playerById(game, playerId);
  if (!actor) return err("Unknown player");
  if (game.phase === "ended") return err("The game is over");

  // Drop a stale trade offer before handling anything else.
  if (game.pendingTrade && Date.now() >= game.pendingTrade.expiresAt) {
    game.pendingTrade = null;
  }

  switch (action.type) {
    case "rollDice":
      return handleRoll(game, actor);
    case "placeSettlement":
      return handleSetupSettlement(game, actor, action.vertexId);
    case "placeRoad":
      return handlePlaceRoad(game, actor, action.edgeId);
    case "undoSetup":
      return handleUndoSetup(game, actor);
    case "buildSettlement":
      return handleBuildSettlement(game, actor, action.vertexId);
    case "buildCity":
      return handleBuildCity(game, actor, action.vertexId);
    case "buildRoad":
      return handleBuildRoad(game, actor, action.edgeId);
    case "buyDevCard":
      return handleBuyDev(game, actor);
    case "playKnight":
      return handlePlayKnight(game, actor);
    case "playRoadBuilding":
      return handlePlayRoadBuilding(game, actor);
    case "playYearOfPlenty":
      return handleYearOfPlenty(game, actor, action.resources);
    case "playMonopoly":
      return handleMonopoly(game, actor, action.resource);
    case "moveRobber":
      return handleMoveRobber(game, actor, action.hexId, action.stealFrom);
    case "discard":
      return handleDiscard(game, actor, action.resources);
    case "bankTrade":
      return handleBankTrade(game, actor, action.give, action.receive);
    case "proposeTrade":
      return handleProposeTrade(game, actor, action.give, action.receive);
    case "respondTrade":
      return handleRespondTrade(game, actor, action.accept);
    case "counterTrade":
      return handleCounterTrade(game, actor, action.give, action.receive);
    case "acceptTradeWith":
      return handleAcceptTradeWith(game, actor, action.playerId);
    case "cancelTrade":
      return handleCancelTrade(game, actor);
    case "setEmbargo":
      return handleSetEmbargo(game, actor, action.playerId, action.on);
    case "endTurn":
      return handleEndTurn(game, actor);
    default:
      return err("Unknown action");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCurrent(game: InternalGame, actor: InternalPlayer): boolean {
  return currentPlayer(game).id === actor.id;
}

function checkWin(game: InternalGame): void {
  const p = currentPlayer(game);
  if (totalVictoryPoints(game, p) >= game.options.targetVictoryPoints) {
    game.winner = p.id;
    game.phase = "ended";
    game.turnEndsAt = null;
    addLog(game, `${p.name} wins the game!`, p.id, true);
  }
}

function playableDevCards(game: InternalGame, actor: InternalPlayer, type: DevCard["type"]) {
  return actor.devCards.filter((c) => c.type === type && c.boughtTurn < game.turnNumber);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function handleSetupSettlement(
  game: InternalGame,
  actor: InternalPlayer,
  vertexId: string
): ActionResult {
  if (game.phase !== "setup" || !game.setup) return err("Not in setup");
  if (game.setup.order[game.setup.pointer] !== actor.id) return err("Not your turn");
  if (game.setup.needs !== "settlement") return err("Place a road first");
  if (!canPlaceSettlement(game, actor.id, vertexId, false)) return err("Illegal settlement spot");

  game.buildings[vertexId] = { type: "settlement", owner: actor.id };
  actor.settlementsLeft -= 1;
  addLog(game, `${actor.name} placed a settlement.`, actor.id);

  // Second-round settlement yields starting resources.
  if (game.setup.round === 2) {
    const vertex = game.vertexById.get(vertexId)!;
    const gain: ResourceCount = EMPTY_RESOURCES();
    for (const hexId of vertex.hexes) {
      const hex = game.hexById.get(hexId)!;
      if (hex.terrain !== "desert") gain[hex.terrain as Resource] += 1;
    }
    give(game, actor, gain);
  }

  game.setup.needs = "road";
  game.setup.lastSettlement = vertexId;
  return ok;
}

// Take back the settlement just placed during setup (before its road is laid),
// in case the player misclicked. Refunds the piece and any starting resources.
function handleUndoSetup(game: InternalGame, actor: InternalPlayer): ActionResult {
  if (game.phase !== "setup" || !game.setup) return err("Not in setup");
  if (game.setup.order[game.setup.pointer] !== actor.id) return err("Not your turn");
  if (game.setup.needs !== "road" || !game.setup.lastSettlement) {
    return err("Nothing to undo");
  }

  const vertexId = game.setup.lastSettlement;
  delete game.buildings[vertexId];
  actor.settlementsLeft += 1;

  // Round-2 settlements grant starting resources — claw those back to the bank.
  if (game.setup.round === 2) {
    const vertex = game.vertexById.get(vertexId)!;
    const refund: ResourceCount = EMPTY_RESOURCES();
    for (const hexId of vertex.hexes) {
      const hex = game.hexById.get(hexId)!;
      if (hex.terrain !== "desert") refund[hex.terrain as Resource] += 1;
    }
    pay(game, actor, refund);
  }

  game.setup.needs = "settlement";
  game.setup.lastSettlement = null;
  addLog(game, `${actor.name} took back their settlement.`, actor.id);
  return ok;
}

function advanceSetup(game: InternalGame): void {
  const setup = game.setup!;
  setup.needs = "settlement";
  setup.lastSettlement = null;

  if (setup.round === 1) {
    if (setup.pointer < setup.order.length - 1) {
      setup.pointer += 1;
    } else {
      // flip to round 2 in reverse order
      setup.round = 2;
      setup.order = [...setup.order].reverse();
      setup.pointer = 0;
    }
  } else {
    if (setup.pointer < setup.order.length - 1) {
      setup.pointer += 1;
    } else {
      // setup complete
      game.setup = null;
      game.phase = "roll";
      game.currentPlayerIndex = 0;
      game.turnNumber = 1;
      armTurnTimer(game);
      addLog(game, `${currentPlayer(game).name} to roll.`);
      return;
    }
  }
  // Keep currentPlayerIndex pointed at whoever must place next, so the board
  // and phones (which read currentPlayerIndex) show the right active player
  // during the setup snake-draft.
  game.currentPlayerIndex = game.players.findIndex((p) => p.id === setup.order[setup.pointer]);
  const next = game.players[game.currentPlayerIndex];
  if (next) addLog(game, `${next.name} to place a settlement.`);
}

// ---------------------------------------------------------------------------
// Roads (setup + road-building card + paid)
// ---------------------------------------------------------------------------

function handlePlaceRoad(game: InternalGame, actor: InternalPlayer, edgeId: string): ActionResult {
  // Setup road.
  if (game.phase === "setup" && game.setup) {
    if (game.setup.order[game.setup.pointer] !== actor.id) return err("Not your turn");
    if (game.setup.needs !== "road") return err("Place a settlement first");
    if (!canPlaceRoad(game, actor.id, edgeId, game.setup.lastSettlement)) {
      return err("Road must connect to your settlement");
    }
    game.roads[edgeId] = actor.id;
    actor.roadsLeft -= 1;
    addLog(game, `${actor.name} placed a road.`, actor.id);
    advanceSetup(game);
    return ok;
  }

  // Free road from road-building card.
  if (game.freeRoads > 0 && isCurrent(game, actor)) {
    if (!canPlaceRoad(game, actor.id, edgeId)) return err("Illegal road");
    if (actor.roadsLeft <= 0) return err("No roads left");
    game.roads[edgeId] = actor.id;
    actor.roadsLeft -= 1;
    game.freeRoads -= 1;
    addLog(game, `${actor.name} built a road.`, actor.id);
    recomputeLongestRoad(game);
    checkWin(game);
    return ok;
  }

  return err("Cannot place a road now");
}

function handleBuildRoad(game: InternalGame, actor: InternalPlayer, edgeId: string): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Not your turn");
  if (actor.roadsLeft <= 0) return err("No roads left");
  if (!canAfford(actor, COSTS.road)) return err("Can't afford a road");
  if (!canPlaceRoad(game, actor.id, edgeId)) return err("Illegal road placement");

  pay(game, actor, COSTS.road);
  game.roads[edgeId] = actor.id;
  actor.roadsLeft -= 1;
  addLog(game, `${actor.name} built a road.`, actor.id);
  recomputeLongestRoad(game);
  checkWin(game);
  return ok;
}

// ---------------------------------------------------------------------------
// Settlements / cities
// ---------------------------------------------------------------------------

function handleBuildSettlement(
  game: InternalGame,
  actor: InternalPlayer,
  vertexId: string
): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Not your turn");
  if (actor.settlementsLeft <= 0) return err("No settlements left");
  if (!canAfford(actor, COSTS.settlement)) return err("Can't afford a settlement");
  if (!canPlaceSettlement(game, actor.id, vertexId, true)) return err("Illegal settlement spot");

  pay(game, actor, COSTS.settlement);
  game.buildings[vertexId] = { type: "settlement", owner: actor.id };
  actor.settlementsLeft -= 1;
  addLog(game, `${actor.name} built a settlement.`, actor.id, true);
  recomputeLongestRoad(game); // may cut an opponent's road
  checkWin(game);
  return ok;
}

function handleBuildCity(
  game: InternalGame,
  actor: InternalPlayer,
  vertexId: string
): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Not your turn");
  const building = game.buildings[vertexId];
  if (!building || building.owner !== actor.id || building.type !== "settlement") {
    return err("You need a settlement here first");
  }
  if (actor.citiesLeft <= 0) return err("No cities left");
  if (!canAfford(actor, COSTS.city)) return err("Can't afford a city");

  pay(game, actor, COSTS.city);
  building.type = "city";
  actor.citiesLeft -= 1;
  actor.settlementsLeft += 1; // settlement piece returns to supply
  addLog(game, `${actor.name} upgraded to a city.`, actor.id, true);
  checkWin(game);
  return ok;
}

// ---------------------------------------------------------------------------
// Dice / robber
// ---------------------------------------------------------------------------

function handleRoll(game: InternalGame, actor: InternalPlayer): ActionResult {
  if (game.phase !== "roll" || !isCurrent(game, actor)) return err("Not time to roll");
  const dice = rollDice();
  game.dice = dice;
  game.hasRolled = true;
  const sum = dice[0] + dice[1];
  addLog(game, `${actor.name} rolled ${sum}.`, actor.id);

  if (sum === 7) {
    // Discards for anyone over the discard limit.
    const limit = game.options.discardLimit;
    game.pendingDiscards = {};
    for (const p of game.players) {
      const total = totalResources(p);
      if (total > limit) game.pendingDiscards[p.id] = Math.floor(total / 2);
    }
    game.robberReturnPhase = "main";
    game.turnEndsAt = null; // pause the turn timer during robber resolution
    if (Object.keys(game.pendingDiscards).length > 0) {
      game.phase = "discard";
      addLog(game, `Players over ${limit} cards must discard.`, undefined, true);
    } else {
      game.phase = "moveRobber";
      addLog(game, `${actor.name} must move the robber.`, actor.id, true);
    }
    return ok;
  }

  produceResources(game, sum);
  game.phase = "main";
  armTurnTimer(game);
  return ok;
}

function handleDiscard(
  game: InternalGame,
  actor: InternalPlayer,
  resources: Partial<ResourceCount>
): ActionResult {
  if (game.phase !== "discard") return err("Nothing to discard");
  const required = game.pendingDiscards[actor.id] ?? 0;
  if (required <= 0) return err("You don't need to discard");

  let sum = 0;
  for (const r of RESOURCES) {
    const amt = resources[r] ?? 0;
    if (amt < 0) return err("Invalid discard");
    if (amt > actor.resources[r]) return err("You don't have those cards");
    sum += amt;
  }
  if (sum !== required) return err(`You must discard exactly ${required} cards`);

  pay(game, actor, resources);
  delete game.pendingDiscards[actor.id];
  addLog(game, `${actor.name} discarded ${required} cards.`, actor.id);

  if (Object.keys(game.pendingDiscards).length === 0) {
    game.phase = "moveRobber";
    addLog(game, `${currentPlayer(game).name} must move the robber.`);
  }
  return ok;
}

function handleMoveRobber(
  game: InternalGame,
  actor: InternalPlayer,
  hexId: string,
  stealFrom: string | null
): ActionResult {
  if (game.phase !== "moveRobber" || !isCurrent(game, actor)) return err("Can't move the robber now");
  const hex = game.hexById.get(hexId);
  if (!hex) return err("Unknown hex");
  if (hexId === game.robberHex) return err("Robber must move to a new hex");

  game.robberHex = hexId;
  addLog(game, `${actor.name} moved the robber.`, actor.id, true);

  // Determine valid steal targets: opponents with a building on this hex.
  const victims = new Set<string>();
  for (const vId of hex.corners) {
    const b = game.buildings[vId];
    if (b && b.owner !== actor.id) victims.add(b.owner);
  }

  if (stealFrom) {
    if (!victims.has(stealFrom)) return err("Invalid steal target");
    const victim = playerById(game, stealFrom)!;
    const pool: Resource[] = [];
    for (const r of RESOURCES) for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
    if (pool.length > 0) {
      const stolen = pool[Math.floor(Math.random() * pool.length)];
      victim.resources[stolen] -= 1;
      actor.resources[stolen] += 1;
      addLog(game, `${actor.name} stole a card from ${victim.name}.`, actor.id, true);
    }
  } else if (victims.size > 0) {
    // A steal target exists but none chosen; only allowed if every victim has 0 cards.
    const anyHasCards = [...victims].some((id) => totalResources(playerById(game, id)!) > 0);
    if (anyHasCards) return err("Choose a player to steal from");
  }

  game.phase = game.robberReturnPhase;
  armTurnTimer(game);
  recomputeLargestArmy(game);
  checkWin(game);
  return ok;
}

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

function handleBuyDev(game: InternalGame, actor: InternalPlayer): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Not your turn");
  if (game.devDeck.length === 0) return err("No development cards left");
  if (!canAfford(actor, COSTS.devCard)) return err("Can't afford a dev card");

  pay(game, actor, COSTS.devCard);
  const type = game.devDeck.pop()!;
  actor.devCards.push({ type, boughtTurn: game.turnNumber });
  addLog(game, `${actor.name} bought a development card.`, actor.id);
  checkWin(game); // a victory-point card may be the winning point
  return ok;
}

function consumeDevCard(actor: InternalPlayer, type: DevCard["type"], turnNumber: number): boolean {
  const idx = actor.devCards.findIndex((c) => c.type === type && c.boughtTurn < turnNumber);
  if (idx === -1) return false;
  actor.devCards.splice(idx, 1);
  return true;
}

function handlePlayKnight(game: InternalGame, actor: InternalPlayer): ActionResult {
  if (game.phase !== "roll" && game.phase !== "main") return err("Can't play that now");
  if (!isCurrent(game, actor)) return err("Not your turn");
  if (actor.hasPlayedDevThisTurn) return err("Already played a dev card this turn");
  if (playableDevCards(game, actor, "knight").length === 0) return err("No playable knight");

  consumeDevCard(actor, "knight", game.turnNumber);
  actor.playedKnights += 1;
  actor.hasPlayedDevThisTurn = true;
  addLog(game, `${actor.name} played a Knight.`, actor.id, true);
  recomputeLargestArmy(game);
  game.robberReturnPhase = game.phase;
  game.phase = "moveRobber";
  return ok;
}

function handlePlayRoadBuilding(game: InternalGame, actor: InternalPlayer): ActionResult {
  // A development card may be played any time during your turn (incl. before rolling).
  if ((game.phase !== "main" && game.phase !== "roll") || !isCurrent(game, actor)) return err("Not your turn");
  if (actor.hasPlayedDevThisTurn) return err("Already played a dev card this turn");
  if (playableDevCards(game, actor, "roadBuilding").length === 0) return err("No playable card");

  consumeDevCard(actor, "roadBuilding", game.turnNumber);
  actor.hasPlayedDevThisTurn = true;
  game.freeRoads = Math.min(2, actor.roadsLeft);
  addLog(game, `${actor.name} played Road Building.`, actor.id, true);
  return ok;
}

function handleYearOfPlenty(
  game: InternalGame,
  actor: InternalPlayer,
  resources: [Resource, Resource]
): ActionResult {
  if ((game.phase !== "main" && game.phase !== "roll") || !isCurrent(game, actor)) return err("Not your turn");
  if (actor.hasPlayedDevThisTurn) return err("Already played a dev card this turn");
  if (playableDevCards(game, actor, "yearOfPlenty").length === 0) return err("No playable card");

  const want: ResourceCount = EMPTY_RESOURCES();
  for (const r of resources) want[r] += 1;
  for (const r of RESOURCES) if (want[r] > game.bank[r]) return err("Bank can't supply that");

  consumeDevCard(actor, "yearOfPlenty", game.turnNumber);
  actor.hasPlayedDevThisTurn = true;
  give(game, actor, want);
  addLog(game, `${actor.name} played Year of Plenty.`, actor.id, true);
  return ok;
}

function handleMonopoly(game: InternalGame, actor: InternalPlayer, resource: Resource): ActionResult {
  if ((game.phase !== "main" && game.phase !== "roll") || !isCurrent(game, actor)) return err("Not your turn");
  if (actor.hasPlayedDevThisTurn) return err("Already played a dev card this turn");
  if (playableDevCards(game, actor, "monopoly").length === 0) return err("No playable card");

  consumeDevCard(actor, "monopoly", game.turnNumber);
  actor.hasPlayedDevThisTurn = true;
  let taken = 0;
  for (const p of game.players) {
    if (p.id === actor.id) continue;
    taken += p.resources[resource];
    p.resources[resource] = 0;
  }
  actor.resources[resource] += taken;
  addLog(game, `${actor.name} played Monopoly on ${resource} (+${taken}).`, actor.id, true);
  return ok;
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

function handleBankTrade(
  game: InternalGame,
  actor: InternalPlayer,
  giveRes: Resource,
  receiveRes: Resource
): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Not your turn");
  if (giveRes === receiveRes) return err("Pick different resources");
  const ratio = bestTradeRatio(game, actor.id, giveRes);
  if (actor.resources[giveRes] < ratio) return err(`Need ${ratio} ${giveRes}`);
  if (game.bank[receiveRes] < 1) return err("Bank is out of that resource");

  pay(game, actor, { [giveRes]: ratio } as Partial<ResourceCount>);
  give(game, actor, { [receiveRes]: 1 } as Partial<ResourceCount>);
  addLog(game, `${actor.name} traded ${ratio} ${giveRes} for 1 ${receiveRes}.`, actor.id);
  return ok;
}

function cleanCount(input: Partial<ResourceCount>): ResourceCount {
  const out = EMPTY_RESOURCES();
  for (const r of RESOURCES) out[r] = Math.max(0, Math.floor(input[r] ?? 0));
  return out;
}

function nonEmpty(c: ResourceCount): boolean {
  return RESOURCES.some((r) => c[r] > 0);
}

// Two players can't trade if either has embargoed the other.
function embargoedBetween(a: InternalPlayer, b: InternalPlayer): boolean {
  return a.embargoes.includes(b.id) || b.embargoes.includes(a.id);
}

function handleProposeTrade(
  game: InternalGame,
  actor: InternalPlayer,
  giveInput: Partial<ResourceCount>,
  receiveInput: Partial<ResourceCount>
): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Not your turn");
  const giveC = cleanCount(giveInput);
  const receiveC = cleanCount(receiveInput);
  if (!nonEmpty(giveC) || !nonEmpty(receiveC)) return err("Offer must give and receive something");
  if (!canAfford(actor, giveC)) return err("You don't have those cards");

  // Players under an embargo (either direction) auto-reject up front, so the
  // offer never bothers them and the proposer sees them as declined.
  const responses: PendingTrade["responses"] = {};
  for (const p of game.players) {
    if (p.id === actor.id) continue;
    responses[p.id] = embargoedBetween(actor, p) ? { status: "reject" } : { status: "pending" };
  }

  actor.botTradedThisTurn = true; // (harmless for humans; gates bot re-proposing)
  game.pendingTrade = {
    id: `trade-${Date.now()}`,
    proposer: actor.id,
    give: giveC,
    receive: receiveC,
    responses,
    expiresAt: Date.now() + TRADE_TTL_MS,
  };
  addLog(game, `${actor.name} proposed a trade.`, actor.id);
  return ok;
}

function handleRespondTrade(
  game: InternalGame,
  actor: InternalPlayer,
  accept: boolean
): ActionResult {
  const trade = game.pendingTrade;
  if (!trade) return err("No active trade");
  if (!(actor.id in trade.responses)) return err("You can't respond to this trade");
  const proposerP = playerById(game, trade.proposer);
  if (accept && proposerP && embargoedBetween(actor, proposerP)) return err("Embargo in place");
  // To accept, the responder must actually hold what the proposer wants.
  if (accept && !canAfford(actor, trade.receive)) return err("You don't have those cards");
  trade.responses[actor.id] = { status: accept ? "accept" : "reject" };
  return ok;
}

// A non-active player counters: give/receive are from THEIR perspective (what
// they give / want). We store the equivalent terms from the proposer's side.
function handleCounterTrade(
  game: InternalGame,
  actor: InternalPlayer,
  giveInput: Partial<ResourceCount>,
  receiveInput: Partial<ResourceCount>
): ActionResult {
  const trade = game.pendingTrade;
  if (!trade) return err("No active trade");
  if (actor.id === trade.proposer) return err("You proposed this trade");
  if (!(actor.id in trade.responses)) return err("You can't respond to this trade");
  const proposerP = playerById(game, trade.proposer);
  if (proposerP && embargoedBetween(actor, proposerP)) return err("Embargo in place");

  const myGive = cleanCount(giveInput); // what the counter-offerer gives
  const myReceive = cleanCount(receiveInput); // what they want
  if (!nonEmpty(myGive) || !nonEmpty(myReceive)) return err("Counter must give and receive something");
  if (!canAfford(actor, myGive)) return err("You don't have those cards");

  trade.responses[actor.id] = {
    status: "counter",
    give: myReceive, // proposer would give what the counter-offerer wants
    receive: myGive, // proposer would get what the counter-offerer gives
  };
  addLog(game, `${actor.name} countered the trade.`, actor.id);
  return ok;
}

function handleAcceptTradeWith(
  game: InternalGame,
  actor: InternalPlayer,
  partnerId: string
): ActionResult {
  const trade = game.pendingTrade;
  if (!trade) return err("No active trade");
  if (trade.proposer !== actor.id) return err("Only the proposer can confirm");
  const response = trade.responses[partnerId];
  if (!response || (response.status !== "accept" && response.status !== "counter")) {
    return err("That player hasn't offered a trade");
  }

  // Effective terms (proposer's perspective): original offer, or the counter.
  const give = response.status === "counter" ? response.give! : trade.give;
  const receive = response.status === "counter" ? response.receive! : trade.receive;

  const partner = playerById(game, partnerId);
  if (!partner) return err("Unknown player");
  if (embargoedBetween(actor, partner)) return err("Embargo in place");
  if (!canAfford(actor, give)) return err("You no longer have those cards");
  if (!canAfford(partner, receive)) return err("They no longer have those cards");

  // proposer gives `give`, receives `receive`; partner does the inverse.
  for (const r of RESOURCES) {
    actor.resources[r] -= give[r];
    partner.resources[r] += give[r];
    partner.resources[r] -= receive[r];
    actor.resources[r] += receive[r];
  }
  addLog(game, `${actor.name} traded with ${partner.name}.`, actor.id);
  game.pendingTrade = null;
  return ok;
}

function handleCancelTrade(game: InternalGame, actor: InternalPlayer): ActionResult {
  const trade = game.pendingTrade;
  if (!trade) return err("No active trade");
  if (trade.proposer !== actor.id) return err("Only the proposer can cancel");
  game.pendingTrade = null;
  return ok;
}

// Place or lift an embargo against another player. Can be toggled at any time.
function handleSetEmbargo(
  game: InternalGame,
  actor: InternalPlayer,
  targetId: string,
  on: boolean
): ActionResult {
  if (targetId === actor.id) return err("You can't embargo yourself");
  const target = playerById(game, targetId);
  if (!target) return err("Unknown player");
  const has = actor.embargoes.includes(targetId);
  if (on && !has) {
    actor.embargoes.push(targetId);
    addLog(game, `${actor.name} embargoed ${target.name}.`, actor.id, true);
    // An open offer between the two is immediately void.
    const t = game.pendingTrade;
    if (t && (t.proposer === actor.id || t.proposer === targetId)) {
      const other = t.proposer === actor.id ? targetId : actor.id;
      if (t.responses[other]) t.responses[other] = { status: "reject" };
    }
  } else if (!on && has) {
    actor.embargoes = actor.embargoes.filter((id) => id !== targetId);
    addLog(game, `${actor.name} lifted the embargo on ${target.name}.`, actor.id);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// End turn
// ---------------------------------------------------------------------------

function handleEndTurn(game: InternalGame, actor: InternalPlayer): ActionResult {
  if (game.phase !== "main" || !isCurrent(game, actor)) return err("Can't end turn now");
  if (!game.hasRolled) return err("You must roll first");

  game.pendingTrade = null;
  game.freeRoads = 0;
  actor.hasPlayedDevThisTurn = false;
  actor.botTradedThisTurn = false;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.turnNumber += 1;
  game.hasRolled = false;
  game.dice = null;
  game.phase = "roll";
  const next = currentPlayer(game);
  next.hasPlayedDevThisTurn = false;
  next.botTradedThisTurn = false;
  armTurnTimer(game);
  addLog(game, `${next.name}'s turn.`, next.id);
  return ok;
}
