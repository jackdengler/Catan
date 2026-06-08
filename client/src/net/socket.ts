import { io, type Socket } from "socket.io-client";
import type {
  Action,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@catan/shared";

// In dev the client is served by Vite (5173) and the server runs on 3001.
// In production the same origin serves both.
const URL = import.meta.env.DEV ? `http://${window.location.hostname}:3001` : "/";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
  autoConnect: true,
  transports: ["websocket"],
});

export function sendAction(action: Action): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    socket.emit("action", action, (res) => resolve(res ?? { ok: true }));
  });
}
