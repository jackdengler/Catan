import { randomUUID } from "node:crypto";
import { PLAYER_COLORS, type LobbyState, type PlayerColor } from "@catan/shared";
import { createGame, type InternalGame } from "@catan/engine";

export interface RoomPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
}

export interface Room {
  code: string;
  players: RoomPlayer[];
  game: InternalGame | null;
  createdAt: number;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars

export class RoomManager {
  private rooms = new Map<string, Room>();

  private genCode(): string {
    let code = "";
    do {
      code = "";
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(): Room {
    const code = this.genCode();
    const room: Room = { code, players: [], game: null, createdAt: Date.now() };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  private nextColor(room: Room, preferred?: PlayerColor): PlayerColor {
    const taken = new Set(room.players.map((p) => p.color));
    if (preferred && !taken.has(preferred)) return preferred;
    return PLAYER_COLORS.find((c) => !taken.has(c)) ?? "red";
  }

  // Join or reconnect. Returns the player id, or an error message.
  join(
    code: string,
    name: string,
    color: PlayerColor,
    existingPlayerId?: string
  ): { ok: boolean; playerId?: string; message?: string } {
    const room = this.getRoom(code);
    if (!room) return { ok: false, message: "Room not found" };

    // Reconnect path.
    if (existingPlayerId) {
      const existing = room.players.find((p) => p.id === existingPlayerId);
      if (existing) {
        existing.connected = true;
        if (room.game) {
          const gp = room.game.players.find((p) => p.id === existingPlayerId);
          if (gp) gp.connected = true;
        }
        return { ok: true, playerId: existing.id };
      }
    }

    if (room.game) return { ok: false, message: "Game already started" };
    if (room.players.length >= 4) return { ok: false, message: "Room is full" };

    const cleanName = name.trim().slice(0, 16) || `Player ${room.players.length + 1}`;
    const player: RoomPlayer = {
      id: randomUUID(),
      name: cleanName,
      color: this.nextColor(room, color),
      connected: true,
      isHost: room.players.length === 0,
    };
    room.players.push(player);
    return { ok: true, playerId: player.id };
  }

  startGame(code: string, playerId: string): { ok: boolean; message?: string } {
    const room = this.getRoom(code);
    if (!room) return { ok: false, message: "Room not found" };
    if (room.game) return { ok: false, message: "Already started" };
    const host = room.players.find((p) => p.id === playerId);
    if (!host || !host.isHost) return { ok: false, message: "Only the host can start" };
    if (room.players.length < 2) return { ok: false, message: "Need at least 2 players" };

    room.game = createGame(room.code, room.players);
    return { ok: true };
  }

  setConnected(code: string, playerId: string, connected: boolean): void {
    const room = this.getRoom(code);
    if (!room) return;
    const p = room.players.find((x) => x.id === playerId);
    if (p) p.connected = connected;
    if (room.game) {
      const gp = room.game.players.find((x) => x.id === playerId);
      if (gp) gp.connected = connected;
    }
  }

  lobbyState(code: string): LobbyState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    return {
      roomCode: room.code,
      started: !!room.game,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        isHost: p.isHost,
      })),
    };
  }

  // Periodic cleanup of stale empty rooms could go here; omitted for v1.
}
