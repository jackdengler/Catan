import { useEffect, useState } from "react";
import { PLAYER_COLORS, type GameStatePublic, type PlayerColor, type PrivateState, type Resource } from "@catan/shared";
import { socket, sendAction, isHostPlayRole, hasResumableHostGame, clearHostSave } from "../net/socket.js";
import { useGame } from "../net/useGame.js";
import { JoinScreen } from "./JoinScreen.js";
import { PhoneGame } from "./PhoneGame.js";
import { PLAYER_FILL } from "../game/theme.js";

interface Joined {
  roomCode: string;
  playerId: string;
}

export function PhoneApp() {
  const { lobby, game, me, error, connected } = useGame();
  const [joined, setJoined] = useState<Joined | null>(null);
  const hostMode = isHostPlayRole();

  const initialCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";

  // Attempt automatic reconnect using a stored player id for this room.
  useEffect(() => {
    if (hostMode || joined || !initialCode) return;
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

  // Host-and-play: if a game was saved on this device, resume it automatically
  // after a refresh (skips the setup screen).
  useEffect(() => {
    if (!hostMode || joined || !hasResumableHostGame()) return;
    const resume = () =>
      socket.emit("host:create", { name: "", color: "red" }, (res: { roomCode: string; playerId?: string }) => {
        if (res.playerId) setJoined({ roomCode: res.roomCode, playerId: res.playerId });
      });
    if (socket.connected) resume();
    else socket.once("connect", resume);
  }, [hostMode, joined]);

  // Once joined, make sure ?room=CODE is in the URL so a later refresh always
  // auto-reconnects — even if the player typed the code instead of scanning the
  // QR (which already carries it).
  useEffect(() => {
    if (!joined || hostMode) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("room") !== joined.roomCode) {
      url.searchParams.set("room", joined.roomCode);
      window.history.replaceState({}, "", url.toString());
    }
  }, [joined]);

  // Leave the current game: forget this device's player id for the room and
  // reload, which drops back to the enter-room-code screen with a fresh
  // connection (no auto-rejoin).
  const leave = () => {
    if (!window.confirm("Leave this game?")) return;
    if (joined) localStorage.removeItem(`catan_pid_${joined.roomCode}`);
    if (hostMode) clearHostSave(); // end the hosted game rather than resuming it
    window.location.reload();
  };

  if (!joined) {
    if (hostMode) {
      return (
        <HostSetup
          onCreated={(rc, pid) => setJoined({ roomCode: rc, playerId: pid })}
        />
      );
    }
    return <JoinScreen initialCode={initialCode} onJoined={(rc, pid) => setJoined({ roomCode: rc, playerId: pid })} />;
  }

  return (
    <div className="phone">
      {error && <div className="toast">{error}</div>}
      {!connected && !hostMode && <div className="reconnect-banner">Reconnecting…</div>}
      <div className="phone-topbar">
        <span className="room-tag">Room {joined.roomCode}</span>
        <button className="leave-btn" onClick={leave}>
          Leave
        </button>
      </div>
      {!game || game.phase === "lobby" ? (
        <PhoneLobby lobby={lobby} myId={joined.playerId} hostControls={hostMode} />
      ) : (
        <PhoneGame game={game} me={me} myId={joined.playerId} />
      )}
    </div>
  );
}

// Setup screen for "play on this phone": pick a name + colour, then host a game.
function HostSetup({ onCreated }: { onCreated: (roomCode: string, playerId: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColor>("red");
  const [busy, setBusy] = useState(false);

  const create = () => {
    setBusy(true);
    const start = () =>
      socket.emit(
        "host:create",
        { name: name.trim() || "You", color },
        (res: { roomCode: string; playerId?: string }) => {
          if (res.playerId) {
            localStorage.setItem(`catan_pid_${res.roomCode}`, res.playerId);
            onCreated(res.roomCode, res.playerId);
          } else setBusy(false);
        }
      );
    if (socket.connected) start();
    else socket.once("connect", start);
  };

  return (
    <div className="join-screen">
      <h1>Catan</h1>
      <p className="subtitle">Play on this phone</p>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="You" maxLength={16} />
      </label>
      <div className="color-pick">
        Color
        <div className="swatches">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? "selected" : ""}`}
              style={{ background: PLAYER_FILL[c] }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <button className="primary big" disabled={busy} onClick={create}>
        {busy ? "Creating…" : "Create game"}
      </button>
      <p className="muted">Next: add computer players and/or share the room code, then start.</p>
    </div>
  );
}

function PhoneLobby({
  lobby,
  myId,
  hostControls,
}: {
  lobby: ReturnType<typeof useGame>["lobby"];
  myId: string;
  hostControls: boolean;
}) {
  const players = lobby?.players ?? [];
  const isHost = players.find((p) => p.id === myId)?.isHost ?? false;
  const canStart = players.length >= 2;
  const full = players.length >= 4;
  const joinUrl = lobby
    ? `${window.location.origin}${window.location.pathname}?room=${lobby.roomCode}`
    : "";

  return (
    <div className="phone-lobby">
      <h2>Room {lobby?.roomCode}</h2>
      {hostControls && (
        <p className="muted small">Others can join at {joinUrl}</p>
      )}
      <p className="muted">Players</p>
      <div className="roster">
        {players.map((p) => (
          <div key={p.id} className="roster-item" style={{ borderColor: PLAYER_FILL[p.color] }}>
            <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
            {p.name}
            {p.id === myId && <span className="host-tag">you</span>}
            {p.isHost && <span className="host-tag">host</span>}
            {p.isBot && <span className="bot-tag">bot</span>}
            {hostControls && p.isBot && (
              <button className="remove-bot" onClick={() => socket.removeBot(p.id)} title="Remove bot">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {hostControls && (
        <button className="ghost" disabled={full} onClick={() => socket.addBot()}>
          + Add computer player
        </button>
      )}

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
