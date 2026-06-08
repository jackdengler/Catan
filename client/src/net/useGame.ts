import { useEffect, useState } from "react";
import type { GameStatePublic, LobbyState, PrivateState } from "@catan/shared";
import { socket } from "./socket.js";

export interface GameHook {
  connected: boolean;
  lobby: LobbyState | null;
  game: GameStatePublic | null;
  me: PrivateState | null;
  error: string | null;
  clearError: () => void;
}

export function useGame(): GameHook {
  const [connected, setConnected] = useState(socket.connected);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [game, setGame] = useState<GameStatePublic | null>(null);
  const [me, setMe] = useState<PrivateState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onLobby = (l: LobbyState) => setLobby(l);
    const onState = (payload: { public: GameStatePublic; private: PrivateState | null }) => {
      setGame(payload.public);
      if (payload.private) setMe(payload.private);
    };
    const onError = (e: { message: string }) => {
      setError(e.message);
      window.setTimeout(() => setError(null), 3000);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:lobby", onLobby);
    socket.on("state", onState);
    socket.on("error", onError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:lobby", onLobby);
      socket.off("state", onState);
      socket.off("error", onError);
    };
  }, []);

  return { connected, lobby, game, me, error, clearError: () => setError(null) };
}
