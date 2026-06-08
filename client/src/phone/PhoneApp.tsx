import { useEffect, useState } from "react";
import type { GameStatePublic, PrivateState, Resource } from "@catan/shared";
import { socket, sendAction } from "../net/socket.js";
import { useGame } from "../net/useGame.js";
import { JoinScreen } from "./JoinScreen.js";
import { PhoneGame } from "./PhoneGame.js";
import { PLAYER_FILL } from "../game/theme.js";

interface Joined {
  roomCode: string;
  playerId: string;
}

export function PhoneApp() {
  const { lobby, game, me, error } = useGame();
  const [joined, setJoined] = useState<Joined | null>(null);

  const initialCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";

  // Attempt automatic reconnect using a stored player id for this room.
  useEffect(() => {
    if (joined || !initialCode) return;
    const stored = localStorage.getItem(`catan_pid_${initialCode}`);
    if (!stored) return;
    const tryRejoin = () => {
      socket.emit(
        "room:join",
        { roomCode: initialCode, name: "", color: "red", playerId: stored },
        (res: { ok: boolean; playerId?: string; message?: string }) => {
          if (res.ok && res.playerId) setJoined({ roomCode: initialCode, playerId: res.playerId });
        }
      );
    };
    if (socket.connected) tryRejoin();
    else socket.once("connect", tryRejoin);
  }, [initialCode, joined]);

  // Leave the current game: forget this device's player id for the room and
  // reload, which drops back to the enter-room-code screen with a fresh
  // connection (no auto-rejoin).
  const leave = () => {
    if (!window.confirm("Leave this game?")) return;
    if (joined) localStorage.removeItem(`catan_pid_${joined.roomCode}`);
    window.location.reload();
  };

  if (!joined) {
    return <JoinScreen initialCode={initialCode} onJoined={(rc, pid) => setJoined({ roomCode: rc, playerId: pid })} />;
  }

  return (
    <div className="phone">
      {error && <div className="toast">{error}</div>}
      <div className="phone-topbar">
        <span className="room-tag">Room {joined.roomCode}</span>
        <button className="leave-btn" onClick={leave}>
          Leave
        </button>
      </div>
      {!game || game.phase === "lobby" ? (
        <PhoneLobby lobby={lobby} myId={joined.playerId} />
      ) : (
        <PhoneGame game={game} me={me} myId={joined.playerId} />
      )}
    </div>
  );
}

function PhoneLobby({
  lobby,
  myId,
}: {
  lobby: ReturnType<typeof useGame>["lobby"];
  myId: string;
}) {
  const players = lobby?.players ?? [];
  const isHost = players.find((p) => p.id === myId)?.isHost ?? false;
  const canStart = players.length >= 2;

  return (
    <div className="phone-lobby">
      <h2>Room {lobby?.roomCode}</h2>
      <p className="muted">Players</p>
      <div className="roster">
        {players.map((p) => (
          <div key={p.id} className="roster-item" style={{ borderColor: PLAYER_FILL[p.color] }}>
            <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
            {p.name}
            {p.id === myId && <span className="host-tag">you</span>}
            {p.isHost && <span className="host-tag">host</span>}
          </div>
        ))}
      </div>
      {isHost ? (
        <button
          className="primary big"
          disabled={!canStart}
          onClick={() => sendAction({ type: "startGame" })}
        >
          {canStart ? "Start game" : "Need 2+ players"}
        </button>
      ) : (
        <p className="muted">Waiting for the host to start…</p>
      )}
    </div>
  );
}

export type { GameStatePublic, PrivateState, Resource };
