import {
  DEFAULT_OPTIONS,
  PLAYER_COLORS,
  type Action,
  type GameOptions,
  type LobbyState,
  type PlayerColor,
  type StatePayload,
} from "@catan/shared";
import { applyAction } from "./actions.js";
import { buildPayload, createGame, type InternalGame } from "./state.js";
import { generateBoard, type GeneratedBoard } from "./board.js";
import { computeBotStep } from "./bot.js";

export interface HostPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

// A serializable snapshot of a host's room, for persisting across a refresh.
export interface HostSnapshot {
  roomCode: string;
  players: HostPlayer[];
  game: InternalGame | null;
}

function uid(): string {
  // Available in modern browsers and Node 18+.
  return globalThis.crypto.randomUUID();
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoids confusable chars

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// Authoritative state for a single game room, with no transport dependency.
// The same class backs the in-browser TV host and the optional Node server.
export class GameHost {
  readonly roomCode: string;
  private players: HostPlayer[] = [];
  private game: InternalGame | null = null;
  private pendingOptions: Partial<GameOptions> = {};
  private preview: GeneratedBoard | null = null;

  constructor(roomCode?: string) {
    this.roomCode = roomCode ?? generateRoomCode();
  }

  // House rules chosen in the lobby, applied when the game starts.
  setOptions(options: Partial<GameOptions>): void {
    if (!this.game) this.pendingOptions = { ...this.pendingOptions, ...options };
  }

  get options(): Partial<GameOptions> {
    return this.pendingOptions;
  }

  // The board the next game will use, generated lazily so the lobby can show it.
  private getPreview(): GeneratedBoard {
    if (!this.preview) this.preview = generateBoard();
    return this.preview;
  }

  // Reroll the board layout in the lobby (no effect once the game has started).
  regenerateBoard(): void {
    if (!this.game) this.preview = generateBoard();
  }

  get started(): boolean {
    return this.game !== null;
  }

  get inProgress(): boolean {
    return !!this.game && !this.game.winner;
  }

  // ---- Persistence (so a host can survive a page refresh) ----------------

  serialize(): HostSnapshot {
    return { roomCode: this.roomCode, players: this.players, game: this.game };
  }

  static restore(snap: HostSnapshot): GameHost {
    const host = new GameHost(snap.roomCode);
    host.players = snap.players;
    if (snap.game) {
      const game = snap.game;
      // Maps don't survive JSON; rebuild them from the (serializable) board.
      game.hexById = new Map(game.board.hexes.map((h) => [h.id, h]));
      game.vertexById = new Map(game.board.vertices.map((v) => [v.id, v]));
      game.edgeById = new Map(game.board.edges.map((e) => [e.id, e]));
      // Backfill fields that may be missing from an older saved format, and
      // drop any stale turn deadline (it re-arms on the next turn).
      game.options = { ...DEFAULT_OPTIONS, ...(game.options ?? {}) };
      game.turnEndsAt = null;
      // Backfill fields added in newer versions.
      for (const pl of game.players) {
        pl.embargoes ??= [];
        pl.botTradedThisTurn ??= false;
      }
      host.game = game;
    }
    return host;
  }

  // After a restore, only the local player (and bots) are actually connected;
  // remote phones must re-establish their WebRTC links.
  markConnections(localId: string | null): void {
    for (const p of this.players) {
      const connected = p.isBot || p.id === localId;
      p.connected = connected;
      const gp = this.game?.players.find((x) => x.id === p.id);
      if (gp) gp.connected = connected;
    }
  }

  private nextColor(preferred?: PlayerColor): PlayerColor {
    const taken = new Set(this.players.map((p) => p.color));
    if (preferred && !taken.has(preferred)) return preferred;
    return PLAYER_COLORS.find((c) => !taken.has(c)) ?? "red";
  }

  // Join a new player, or reconnect an existing one by id.
  join(
    name: string,
    color: PlayerColor,
    existingPlayerId?: string
  ): { ok: boolean; playerId?: string; message?: string } {
    if (existingPlayerId) {
      const existing = this.players.find((p) => p.id === existingPlayerId);
      if (existing) {
        existing.connected = true;
        const gp = this.game?.players.find((p) => p.id === existingPlayerId);
        if (gp) gp.connected = true;
        return { ok: true, playerId: existing.id };
      }
    }

    if (this.game) return { ok: false, message: "Game already started" };
    if (this.players.length >= 4) return { ok: false, message: "Room is full" };

    const cleanName = name.trim().slice(0, 16) || `Player ${this.players.length + 1}`;
    const player: HostPlayer = {
      id: uid(),
      name: cleanName,
      color: this.nextColor(color),
      connected: true,
      isHost: !this.players.some((p) => !p.isBot), // first human is the host
      isBot: false,
    };
    this.players.push(player);
    return { ok: true, playerId: player.id };
  }

  // Add a computer player to the lobby.
  addBot(): { ok: boolean; message?: string } {
    if (this.game) return { ok: false, message: "Game already started" };
    if (this.players.length >= 4) return { ok: false, message: "Room is full" };
    const n = this.players.filter((p) => p.isBot).length + 1;
    this.players.push({
      id: uid(),
      name: `Bot ${n}`,
      color: this.nextColor(),
      connected: true,
      isHost: false,
      isBot: true,
    });
    return { ok: true };
  }

  removeBot(id: string): void {
    if (this.game) return;
    const i = this.players.findIndex((p) => p.id === id && p.isBot);
    if (i >= 0) this.players.splice(i, 1);
  }

  // Start without requiring a specific host (used by the board's own button).
  forceStart(): { ok: boolean; message?: string } {
    if (this.game) return { ok: false, message: "Already started" };
    if (this.players.length < 2) return { ok: false, message: "Need at least 2 players" };
    this.game = createGame(this.roomCode, this.players, this.pendingOptions, this.getPreview());
    return { ok: true };
  }

  // Whether any bot currently owes an action (used to decide whether to schedule).
  hasPendingBotStep(): boolean {
    return !!this.game && computeBotStep(this.game) !== null;
  }

  // Compute and apply one pending bot action. Returns whether a bot acted (and
  // whether it succeeded) so the host can pace and recover from a bad move.
  botStep(): { acted: boolean; ok: boolean; playerId?: string } {
    if (!this.game) return { acted: false, ok: true };
    const step = computeBotStep(this.game);
    if (!step) return { acted: false, ok: true };
    const res = applyAction(this.game, step.playerId, step.action);
    return { acted: true, ok: res.ok, playerId: step.playerId };
  }

  get turnDeadline(): number | null {
    return this.game?.turnEndsAt ?? null;
  }

  // Called when the turn timer expires: auto-roll or auto-end for the current
  // (human) player so a slow/AFK player can't stall the game.
  autoAdvanceTurn(): boolean {
    if (!this.game) return false;
    const cur = this.game.players[this.game.currentPlayerIndex];
    if (!cur || cur.isBot) return false;
    if (this.game.phase === "roll") return applyAction(this.game, cur.id, { type: "rollDice" }).ok;
    if (this.game.phase === "main") return applyAction(this.game, cur.id, { type: "endTurn" }).ok;
    return false;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.find((x) => x.id === playerId);
    if (p) p.connected = connected;
    const gp = this.game?.players.find((x) => x.id === playerId);
    if (gp) gp.connected = connected;
  }

  start(playerId: string): { ok: boolean; message?: string } {
    if (this.game) return { ok: false, message: "Already started" };
    const host = this.players.find((p) => p.id === playerId);
    if (!host || !host.isHost) return { ok: false, message: "Only the host can start" };
    if (this.players.length < 2) return { ok: false, message: "Need at least 2 players" };
    this.game = createGame(this.roomCode, this.players, this.pendingOptions, this.getPreview());
    return { ok: true };
  }

  // Clear a pending trade once it has gone stale. Returns whether it did.
  expireTradeIfDue(): boolean {
    const t = this.game?.pendingTrade;
    if (t && Date.now() >= t.expiresAt) {
      this.game!.pendingTrade = null;
      return true;
    }
    return false;
  }

  // When the current pending trade expires (epoch ms), or null if none.
  get tradeDeadline(): number | null {
    return this.game?.pendingTrade?.expiresAt ?? null;
  }

  action(playerId: string, action: Action): { ok: boolean; message?: string } {
    if (action.type === "startGame") return this.start(playerId);
    if (!this.game) return { ok: false, message: "Game not started" };
    return applyAction(this.game, playerId, action);
  }

  lobby(): LobbyState {
    // Show the upcoming board only before the game starts.
    const preview = this.game ? null : this.getPreview();
    return {
      roomCode: this.roomCode,
      started: this.started,
      boardPreview: preview?.layout,
      robberPreview: preview?.robberHex,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        isHost: p.isHost,
        isBot: p.isBot,
      })),
    };
  }

  // Per-recipient payload: public state plus that player's private hand. Pass
  // null for a spectator / the TV (no private cards).
  payloadFor(playerId: string | null): StatePayload | null {
    if (!this.game) return null;
    return buildPayload(this.game, playerId);
  }
}
