import type { Action } from "@catan/shared";
import { Transport } from "./transport.js";
import { HostTransport } from "./peerHost.js";
import { ClientTransport } from "./peerClient.js";
import { clearHostState, loadHostState } from "./hostSave.js";

// Is there an in-progress host-and-play game saved on this device to resume?
export function hasResumableHostGame(): boolean {
  const s = loadHostState();
  return !!(s && s.mode === "host" && s.host.game && !s.host.game.winner);
}

export function clearHostSave(): void {
  clearHostState();
}

export function isTvRole(): boolean {
  return new URLSearchParams(window.location.search).has("tv");
}

// "Play on this phone": this device both hosts the game and seats a local player.
export function isHostPlayRole(): boolean {
  return new URLSearchParams(window.location.search).has("host");
}

// One transport per tab. Both the TV board and the host-and-play phone run the
// engine locally (HostTransport); a regular phone is a client.
export const socket: Transport =
  isTvRole() || isHostPlayRole() ? new HostTransport() : new ClientTransport();

export function sendAction(action: Action): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    socket.emit("action", action, (res: { ok: boolean; message?: string }) => resolve(res ?? { ok: true }));
  });
}
