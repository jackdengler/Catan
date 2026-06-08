import type { Action } from "@catan/shared";
import { Transport } from "./transport.js";
import { HostTransport } from "./peerHost.js";
import { ClientTransport } from "./peerClient.js";

export function isTvRole(): boolean {
  return new URLSearchParams(window.location.search).has("tv");
}

// One transport per tab: the board tab hosts; a phone is a client.
export const socket: Transport = isTvRole() ? new HostTransport() : new ClientTransport();

export function sendAction(action: Action): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    socket.emit("action", action, (res: { ok: boolean; message?: string }) => resolve(res ?? { ok: true }));
  });
}
