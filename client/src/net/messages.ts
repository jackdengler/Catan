import type { Action, LobbyPlayer, LobbyState, PlayerColor, StatePayload } from "@catan/shared";

// Messages exchanged over the WebRTC data channel between a phone (client) and
// the board tab (host).

export type ClientMessage =
  | { kind: "join"; name: string; color: PlayerColor; playerId?: string }
  | { kind: "action"; action: Action };

export type HostMessage =
  | { kind: "joined"; playerId: string }
  | { kind: "rejected"; message: string }
  // Sent when someone tries to join a game already in progress: the phone can
  // offer to rejoin as one of the disconnected seats.
  | { kind: "roster"; players: LobbyPlayer[] }
  | { kind: "lobby"; lobby: LobbyState }
  | { kind: "state"; payload: StatePayload }
  | { kind: "error"; message: string };

// PeerJS ids must be globally unique on the shared broker, so namespace them.
export function peerIdForRoom(code: string): string {
  return `catantv-${code.toUpperCase()}`;
}
