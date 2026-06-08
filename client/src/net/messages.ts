import type { Action, LobbyState, PlayerColor, StatePayload } from "@catan/shared";

// Messages exchanged over the WebRTC data channel between a phone (client) and
// the board tab (host).

export type ClientMessage =
  | { kind: "join"; name: string; color: PlayerColor; playerId?: string }
  | { kind: "action"; action: Action };

export type HostMessage =
  | { kind: "joined"; playerId: string }
  | { kind: "rejected"; message: string }
  | { kind: "lobby"; lobby: LobbyState }
  | { kind: "state"; payload: StatePayload }
  | { kind: "error"; message: string };

// PeerJS ids must be globally unique on the shared broker, so namespace them.
export function peerIdForRoom(code: string): string {
  return `catantv-${code.toUpperCase()}`;
}
