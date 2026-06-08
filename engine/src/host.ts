import {
  PLAYER_COLORS,
  type Action,
  type LobbyState,
  type PlayerColor,
  type StatePayload,
} from "@catan/shared";
import { applyAction } from "./actions.js";
import { buildPayload, createGame, type InternalGame } from "./state.js";

export interface HostPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
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

  constructor(roomCode?: string) {
    this.roomCode = roomCode ?? generateRoomCode();
  }

  get started(): boolean {
    return this.game !== null;
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
      isHost: this.players.length === 0,
    };
    this.players.push(player);
    return { ok: true, playerId: player.id };
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
    this.game = createGame(this.roomCode, this.players);
    return { ok: true };
  }

  action(playerId: string, action: Action): { ok: boolean; message?: string } {
    if (action.type === "startGame") return this.start(playerId);
    if (!this.game) return { ok: false, message: "Game not started" };
    return applyAction(this.game, playerId, action);
  }

  lobby(): LobbyState {
    return {
      roomCode: this.roomCode,
      started: this.started,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        isHost: p.isHost,
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
