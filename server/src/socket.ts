import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@catan/shared";
import { applyAction } from "./game/actions.js";
import { buildPayload } from "./game/state.js";
import { RoomManager } from "./rooms.js";

interface SocketData {
  roomCode?: string;
  playerId?: string; // undefined for TV sockets
  isTv?: boolean;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function registerSocketHandlers(io: IO, rooms: RoomManager): void {
  // Send each socket in the room its individualised state payload.
  async function broadcastGame(code: string): Promise<void> {
    const room = rooms.getRoom(code);
    if (!room || !room.game) return;
    const sockets = await io.in(code).fetchSockets();
    for (const s of sockets) {
      const pid = s.data.isTv ? null : s.data.playerId ?? null;
      s.emit("state", buildPayload(room.game, pid));
    }
  }

  function broadcastLobby(code: string): void {
    const lobby = rooms.lobbyState(code);
    if (lobby) io.in(code).emit("room:lobby", lobby);
  }

  io.on("connection", (socket: AppSocket) => {
    socket.on("room:create", (cb) => {
      const room = rooms.createRoom();
      socket.data.roomCode = room.code;
      socket.data.isTv = true;
      socket.join(room.code);
      cb({ roomCode: room.code });
      broadcastLobby(room.code);
    });

    socket.on("tv:join", ({ roomCode }, cb) => {
      const room = rooms.getRoom(roomCode);
      if (!room) return cb({ ok: false, message: "Room not found" });
      socket.data.roomCode = room.code;
      socket.data.isTv = true;
      socket.join(room.code);
      cb({ ok: true });
      broadcastLobby(room.code);
      if (room.game) socket.emit("state", buildPayload(room.game, null));
    });

    socket.on("room:join", ({ roomCode, name, color, playerId }, cb) => {
      const res = rooms.join(roomCode, name, color, playerId);
      if (!res.ok || !res.playerId) return cb({ ok: false, message: res.message });

      const room = rooms.getRoom(roomCode)!;
      socket.data.roomCode = room.code;
      socket.data.playerId = res.playerId;
      socket.data.isTv = false;
      socket.join(room.code);

      cb({ ok: true, playerId: res.playerId });
      socket.emit("room:joined", { roomCode: room.code, playerId: res.playerId });
      broadcastLobby(room.code);
      if (room.game) {
        // reconnect mid-game: send current state immediately
        socket.emit("state", buildPayload(room.game, res.playerId));
        broadcastGame(room.code);
      }
    });

    socket.on("action", (action, cb) => {
      const code = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (!code) return cb?.({ ok: false, message: "Not in a room" });
      const room = rooms.getRoom(code);
      if (!room) return cb?.({ ok: false, message: "Room not found" });

      // startGame is special: it creates the game from the lobby.
      if (action.type === "startGame") {
        if (!playerId) return cb?.({ ok: false, message: "Only players can start" });
        const res = rooms.startGame(code, playerId);
        if (!res.ok) return cb?.({ ok: false, message: res.message });
        cb?.({ ok: true });
        broadcastLobby(code);
        broadcastGame(code);
        return;
      }

      if (!room.game) return cb?.({ ok: false, message: "Game not started" });
      if (!playerId) return cb?.({ ok: false, message: "TV cannot take actions" });

      const result = applyAction(room.game, playerId, action);
      if (!result.ok) {
        cb?.({ ok: false, message: result.message });
      } else {
        cb?.({ ok: true });
      }
      // Always re-broadcast so UI reflects any partial state (and errors don't
      // desync a client that optimistically updated).
      broadcastGame(code);
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (code && playerId) {
        rooms.setConnected(code, playerId, false);
        broadcastLobby(code);
        broadcastGame(code).catch(() => {});
      }
    });
  });
}
