// ---------------------------------------------------------------------------
// Core resource / terrain types
// ---------------------------------------------------------------------------

export type Resource = "wood" | "brick" | "sheep" | "wheat" | "ore";
export type Terrain = Resource | "desert";

export type ResourceCount = Record<Resource, number>;

export const RESOURCES: Resource[] = ["wood", "brick", "sheep", "wheat", "ore"];

// The four classic piece colors, plus optional team themes a player can pick.
export type PlayerColor =
  | "red"
  | "blue"
  | "white"
  | "orange"
  | "steelers"
  | "ravens"
  | "orioles"
  | "yankees";

export const BASE_COLORS: PlayerColor[] = ["red", "blue", "white", "orange"];
export const TEAM_COLORS: PlayerColor[] = ["steelers", "ravens", "orioles", "yankees"];
// Auto-assignment (bots / board) prefers the classic colors first.
export const PLAYER_COLORS: PlayerColor[] = [...BASE_COLORS, ...TEAM_COLORS];

export const TEAM_LABELS: Record<string, string> = {
  steelers: "Steelers",
  ravens: "Ravens",
  orioles: "Orioles",
  yankees: "Yankees",
};

// ---------------------------------------------------------------------------
// Board geometry. Generated once on the server and shared with all clients so
// both the TV and the phones render an identical board and reference identical
// vertex / edge ids.
// ---------------------------------------------------------------------------

export interface Hex {
  id: string; // `${q},${r}`
  q: number;
  r: number;
  x: number; // pixel center (logic units)
  y: number;
  terrain: Terrain;
  numberToken: number | null;
  corners: string[]; // 6 vertex ids
  edges: string[]; // 6 edge ids
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexes: string[]; // adjacent hex ids (1-3)
  edges: string[]; // incident edge ids
  adjacent: string[]; // neighbouring vertex ids
}

export interface Edge {
  id: string;
  v1: string;
  v2: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hexes: string[]; // adjacent hex ids (1-2)
}

export type PortType = "any" | Resource; // "any" === 3:1, resource === 2:1

export interface Port {
  id: string;
  edgeId: string;
  vertices: string[]; // the 2 vertices that grant access to this port
  type: PortType;
  x: number;
  y: number;
  angle: number; // for label orientation / icon placement
}

export interface BoardLayout {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  ports: Port[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Buildings / development cards
// ---------------------------------------------------------------------------

export type BuildingType = "settlement" | "city";

export interface Building {
  type: BuildingType;
  owner: string; // player id
}

export type DevCardType =
  | "knight"
  | "victory"
  | "roadBuilding"
  | "yearOfPlenty"
  | "monopoly";

export interface DevCard {
  type: DevCardType;
  // turn number the card was bought; a card cannot be played the same turn it
  // is bought (except victory points which are never "played").
  boughtTurn: number;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PublicPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  resourceTotal: number; // number of resource cards (hidden which)
  devCardTotal: number; // number of dev cards (hidden which)
  playedKnights: number;
  victoryPoints: number; // PUBLIC vp only (no hidden victory-point cards)
  longestRoad: boolean;
  largestArmy: boolean;
  roadLength: number;
  settlementsLeft: number;
  citiesLeft: number;
  roadsLeft: number;
  embargoes: string[]; // player ids this player refuses to trade with
}

// Private payload delivered only to the owning player.
export interface PrivateState {
  playerId: string;
  resources: ResourceCount;
  devCards: DevCard[];
  // dev cards bought this turn (not yet playable)
  newDevCards: DevCardType[];
  hiddenVictoryPoints: number;
}

// ---------------------------------------------------------------------------
// Game phase + trade
// ---------------------------------------------------------------------------

export type Phase =
  | "lobby"
  | "setup"
  | "roll"
  | "main"
  | "discard"
  | "moveRobber"
  | "ended";

export interface SetupProgress {
  round: 1 | 2;
  // index into the (round-1 forward / round-2 reverse) placement order
  order: string[]; // player ids in current placement order
  pointer: number; // whose turn within order
  needs: "settlement" | "road";
  lastSettlement: string | null; // vertex just placed, road must connect
}

// A responder's answer to an offer: accept the original terms, reject, or
// counter with their own terms (stored from the proposer's perspective).
export interface TradeResponse {
  status: "pending" | "accept" | "reject" | "counter";
  give?: ResourceCount; // counter: what the proposer would give
  receive?: ResourceCount; // counter: what the proposer would get
}

export interface PendingTrade {
  id: string;
  proposer: string;
  give: ResourceCount; // proposer gives
  receive: ResourceCount; // proposer wants
  // playerId -> response
  responses: Record<string, TradeResponse>;
  expiresAt: number; // epoch ms: a stale offer auto-cancels after this
}

export interface LogEntry {
  id: number;
  text: string;
  playerId?: string;
  major?: boolean; // notable events get an on-screen banner
}

// Configurable house rules, chosen in the lobby.
export interface GameOptions {
  targetVictoryPoints: number; // default 10
  discardLimit: number; // discard half above this on a 7 (default 7)
  turnTimerSeconds: number; // 0 = off
  randomizeOrder: boolean; // shuffle seating/turn order at start
}

export interface GameStatePublic {
  roomCode: string;
  phase: Phase;
  board: BoardLayout;
  players: PublicPlayer[];
  currentPlayerIndex: number;
  setup: SetupProgress | null;
  dice: [number, number] | null;
  robberHex: string;
  buildings: Record<string, Building>; // vertexId -> building
  roads: Record<string, string>; // edgeId -> owner playerId
  bank: ResourceCount;
  devDeckCount: number;
  pendingTrade: PendingTrade | null;
  pendingDiscards: Record<string, number>; // playerId -> cards still to discard
  longestRoadHolder: string | null;
  largestArmyHolder: string | null;
  winner: string | null;
  hasRolled: boolean;
  hasPlayedDevCard: boolean; // current player played a dev card this turn
  freeRoads: number; // free roads remaining from a road-building card
  options: GameOptions;
  turnEndsAt: number | null; // epoch ms deadline for the current turn (if timer on)
  log: LogEntry[];
}

// What the server emits to each socket.
export interface StatePayload {
  public: GameStatePublic;
  private: PrivateState | null;
}

// ---------------------------------------------------------------------------
// Actions: phone -> server intents. Server validates + applies authoritatively.
// ---------------------------------------------------------------------------

export type Action =
  | { type: "startGame" }
  | { type: "rollDice" }
  | { type: "placeSettlement"; vertexId: string } // setup
  | { type: "placeRoad"; edgeId: string } // setup & road-building card
  | { type: "undoSetup" } // take back the settlement just placed during setup
  | { type: "buildSettlement"; vertexId: string }
  | { type: "buildCity"; vertexId: string }
  | { type: "buildRoad"; edgeId: string }
  | { type: "buyDevCard" }
  | { type: "playKnight" }
  | { type: "playRoadBuilding" }
  | { type: "playYearOfPlenty"; resources: [Resource, Resource] }
  | { type: "playMonopoly"; resource: Resource }
  | { type: "moveRobber"; hexId: string; stealFrom: string | null }
  | { type: "discard"; resources: Partial<ResourceCount> }
  | { type: "bankTrade"; give: Resource; receive: Resource }
  | {
      type: "proposeTrade";
      give: Partial<ResourceCount>;
      receive: Partial<ResourceCount>;
    }
  | { type: "respondTrade"; accept: boolean }
  // A non-active player counters the active player's offer with their own terms
  // (give/receive from the responder's own perspective).
  | { type: "counterTrade"; give: Partial<ResourceCount>; receive: Partial<ResourceCount> }
  | { type: "acceptTradeWith"; playerId: string }
  | { type: "cancelTrade" }
  // Refuse (or stop refusing) to trade with a player — their offers to you, and
  // yours to them, are then auto-rejected.
  | { type: "setEmbargo"; playerId: string; on: boolean }
  | { type: "endTurn" };

// ---------------------------------------------------------------------------
// Socket.IO event contract
// ---------------------------------------------------------------------------

export interface LobbyPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface LobbyState {
  roomCode: string;
  players: LobbyPlayer[];
  started: boolean;
  // A preview of the board to be played, so the host can regenerate it in the
  // lobby if they don't like the layout. Absent on the optional Node server.
  boardPreview?: BoardLayout;
  robberPreview?: string;
}

export interface ServerToClientEvents {
  "room:joined": (data: { roomCode: string; playerId: string }) => void;
  "room:lobby": (data: LobbyState) => void;
  state: (data: StatePayload) => void;
  error: (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  "room:create": (
    cb: (res: { roomCode: string }) => void
  ) => void;
  "room:join": (
    data: { roomCode: string; name: string; color: PlayerColor; playerId?: string },
    cb: (res: { ok: boolean; playerId?: string; message?: string }) => void
  ) => void;
  "tv:join": (
    data: { roomCode: string },
    cb: (res: { ok: boolean; message?: string }) => void
  ) => void;
  action: (data: Action, cb?: (res: { ok: boolean; message?: string }) => void) => void;
}
