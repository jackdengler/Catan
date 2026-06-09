import {
  BANK_PER_RESOURCE,
  DEFAULT_OPTIONS,
  DEV_DECK,
  EMPTY_RESOURCES,
  PIECES,
  type GameOptions,
  type BoardLayout,
  type Building,
  type DevCard,
  type DevCardType,
  type Edge,
  type GameStatePublic,
  type Hex,
  type LogEntry,
  type Phase,
  type PendingTrade,
  type PlayerColor,
  type PrivateState,
  type PublicPlayer,
  type ResourceCount,
  type SetupProgress,
  type StatePayload,
  type Vertex,
} from "@catan/shared";
import { generateBoard, type GeneratedBoard } from "./board.js";

export interface InternalPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  resources: ResourceCount;
  devCards: DevCard[];
  playedKnights: number;
  hasPlayedDevThisTurn: boolean;
  settlementsLeft: number;
  citiesLeft: number;
  roadsLeft: number;
  roadLength: number;
}

export interface InternalGame {
  roomCode: string;
  phase: Phase;
  board: BoardLayout;
  hexById: Map<string, Hex>;
  vertexById: Map<string, Vertex>;
  edgeById: Map<string, Edge>;
  players: InternalPlayer[];
  currentPlayerIndex: number;
  setup: SetupProgress | null;
  dice: [number, number] | null;
  robberHex: string;
  buildings: Record<string, Building>;
  roads: Record<string, string>;
  bank: ResourceCount;
  devDeck: DevCardType[];
  pendingTrade: PendingTrade | null;
  pendingDiscards: Record<string, number>;
  longestRoadHolder: string | null;
  largestArmyHolder: string | null;
  winner: string | null;
  hasRolled: boolean;
  turnNumber: number;
  freeRoads: number; // free roads remaining (road-building card)
  robberReturnPhase: Phase; // phase to resume after moving the robber
  options: GameOptions;
  turnEndsAt: number | null;
  log: LogEntry[];
  logCounter: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(
  roomCode: string,
  lobbyPlayers: {
    id: string;
    name: string;
    color: PlayerColor;
    isHost: boolean;
    connected: boolean;
    isBot?: boolean;
  }[],
  optionsInput?: Partial<GameOptions>,
  board?: GeneratedBoard
): InternalGame {
  const options: GameOptions = { ...DEFAULT_OPTIONS, ...optionsInput };
  if (options.randomizeOrder) lobbyPlayers = shuffle(lobbyPlayers);
  const { layout, robberHex } = board ?? generateBoard();

  const hexById = new Map(layout.hexes.map((h) => [h.id, h]));
  const vertexById = new Map(layout.vertices.map((v) => [v.id, v]));
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));

  const players: InternalPlayer[] = lobbyPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.connected,
    isHost: p.isHost,
    isBot: p.isBot ?? false,
    resources: EMPTY_RESOURCES(),
    devCards: [],
    playedKnights: 0,
    hasPlayedDevThisTurn: false,
    settlementsLeft: PIECES.settlements,
    citiesLeft: PIECES.cities,
    roadsLeft: PIECES.roads,
    roadLength: 0,
  }));

  const bank: ResourceCount = {
    wood: BANK_PER_RESOURCE,
    brick: BANK_PER_RESOURCE,
    sheep: BANK_PER_RESOURCE,
    wheat: BANK_PER_RESOURCE,
    ore: BANK_PER_RESOURCE,
  };

  // Setup order: forward for round 1, the reverse is computed when round flips.
  const order = players.map((p) => p.id);

  const game: InternalGame = {
    roomCode,
    phase: "setup",
    board: layout,
    hexById,
    vertexById,
    edgeById,
    players,
    currentPlayerIndex: 0,
    setup: {
      round: 1,
      order,
      pointer: 0,
      needs: "settlement",
      lastSettlement: null,
    },
    dice: null,
    robberHex,
    buildings: {},
    roads: {},
    bank,
    devDeck: shuffle(DEV_DECK),
    pendingTrade: null,
    pendingDiscards: {},
    longestRoadHolder: null,
    largestArmyHolder: null,
    winner: null,
    hasRolled: false,
    turnNumber: 1,
    freeRoads: 0,
    robberReturnPhase: "main",
    options,
    turnEndsAt: null,
    log: [],
    logCounter: 0,
  };

  addLog(game, "Game started — place your first settlement.");
  return game;
}

export function addLog(game: InternalGame, text: string, playerId?: string, major = false): void {
  game.logCounter += 1;
  game.log.push({ id: game.logCounter, text, playerId, major });
  if (game.log.length > 80) game.log.shift();
}

// Start (or clear) the current turn's countdown based on the timer house rule.
// Only humans get a deadline; bots act quickly on their own.
export function armTurnTimer(game: InternalGame): void {
  const secs = game.options.turnTimerSeconds;
  const current = game.players[game.currentPlayerIndex];
  game.turnEndsAt = secs > 0 && current && !current.isBot ? Date.now() + secs * 1000 : null;
}

export function currentPlayer(game: InternalGame): InternalPlayer {
  return game.players[game.currentPlayerIndex];
}

export function playerById(game: InternalGame, id: string): InternalPlayer | undefined {
  return game.players.find((p) => p.id === id);
}

export function totalResources(p: InternalPlayer): number {
  return p.resources.wood + p.resources.brick + p.resources.sheep + p.resources.wheat + p.resources.ore;
}

// Public victory points: buildings + longest road + largest army. Hidden
// victory-point dev cards are NOT included (revealed only to the owner / on win).
export function publicVictoryPoints(game: InternalGame, p: InternalPlayer): number {
  let vp = 0;
  for (const b of Object.values(game.buildings)) {
    if (b.owner === p.id) vp += b.type === "city" ? 2 : 1;
  }
  if (game.longestRoadHolder === p.id) vp += 2;
  if (game.largestArmyHolder === p.id) vp += 2;
  return vp;
}

export function hiddenVictoryPoints(p: InternalPlayer): number {
  return p.devCards.filter((c) => c.type === "victory").length;
}

export function totalVictoryPoints(game: InternalGame, p: InternalPlayer): number {
  return publicVictoryPoints(game, p) + hiddenVictoryPoints(p);
}

function toPublicPlayer(game: InternalGame, p: InternalPlayer): PublicPlayer {
  // Hidden victory-point cards are revealed once the game is over.
  const vp = publicVictoryPoints(game, p) + (game.winner ? hiddenVictoryPoints(p) : 0);
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.connected,
    isHost: p.isHost,
    isBot: p.isBot,
    resourceTotal: totalResources(p),
    devCardTotal: p.devCards.length,
    playedKnights: p.playedKnights,
    victoryPoints: vp,
    longestRoad: game.longestRoadHolder === p.id,
    largestArmy: game.largestArmyHolder === p.id,
    roadLength: p.roadLength,
    settlementsLeft: p.settlementsLeft,
    citiesLeft: p.citiesLeft,
    roadsLeft: p.roadsLeft,
  };
}

export function toPublicState(game: InternalGame): GameStatePublic {
  return {
    roomCode: game.roomCode,
    phase: game.phase,
    board: game.board,
    players: game.players.map((p) => toPublicPlayer(game, p)),
    currentPlayerIndex: game.currentPlayerIndex,
    setup: game.setup,
    dice: game.dice,
    robberHex: game.robberHex,
    buildings: game.buildings,
    roads: game.roads,
    bank: game.bank,
    devDeckCount: game.devDeck.length,
    pendingTrade: game.pendingTrade,
    pendingDiscards: game.pendingDiscards,
    longestRoadHolder: game.longestRoadHolder,
    largestArmyHolder: game.largestArmyHolder,
    winner: game.winner,
    hasRolled: game.hasRolled,
    hasPlayedDevCard: currentPlayer(game).hasPlayedDevThisTurn,
    freeRoads: game.freeRoads,
    options: game.options,
    turnEndsAt: game.turnEndsAt,
    log: game.log,
  };
}

export function toPrivateState(game: InternalGame, playerId: string): PrivateState | null {
  const p = playerById(game, playerId);
  if (!p) return null;
  const newDevCards: DevCardType[] = p.devCards
    .filter((c) => c.boughtTurn >= game.turnNumber)
    .map((c) => c.type);
  return {
    playerId,
    resources: { ...p.resources },
    devCards: p.devCards.map((c) => ({ ...c })),
    newDevCards,
    hiddenVictoryPoints: hiddenVictoryPoints(p),
  };
}

export function buildPayload(game: InternalGame, playerId: string | null): StatePayload {
  return {
    public: toPublicState(game),
    private: playerId ? toPrivateState(game, playerId) : null,
  };
}
