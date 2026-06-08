import { useState } from "react";
import { PLAYER_COLORS, type LobbyPlayer, type PlayerColor } from "@catan/shared";
import { socket } from "../net/socket.js";
import { PLAYER_FILL } from "../game/theme.js";

interface Props {
  initialCode: string;
  onJoined: (roomCode: string, playerId: string) => void;
}

interface JoinResult {
  ok: boolean;
  playerId?: string;
  message?: string;
  roster?: LobbyPlayer[];
}

export function JoinScreen({ initialCode, onJoined }: Props) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColor>("red");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When the game is already running, the host returns the roster so we can
  // rejoin as one of the disconnected seats.
  const [claim, setClaim] = useState<{ roomCode: string; players: LobbyPlayer[] } | null>(null);

  const finish = (roomCode: string, playerId: string) => {
    localStorage.setItem(`catan_pid_${roomCode}`, playerId);
    onJoined(roomCode, playerId);
  };

  const join = () => {
    if (!code.trim() || !name.trim()) {
      setError("Enter a room code and your name");
      return;
    }
    setBusy(true);
    setError(null);
    const roomCode = code.trim().toUpperCase();
    socket.emit("room:join", { roomCode, name: name.trim(), color }, (res: JoinResult) => {
      setBusy(false);
      if (res.ok && res.playerId) finish(roomCode, res.playerId);
      else if (res.roster) setClaim({ roomCode, players: res.roster });
      else setError(res.message ?? "Could not join");
    });
  };

  const rejoinAs = (p: LobbyPlayer) => {
    if (!claim) return;
    setBusy(true);
    socket.emit(
      "room:join",
      { roomCode: claim.roomCode, name: p.name, color: p.color, playerId: p.id },
      (res: JoinResult) => {
        setBusy(false);
        if (res.ok && res.playerId) finish(claim.roomCode, res.playerId);
        else setError(res.message ?? "Could not rejoin");
      }
    );
  };

  // --- Rejoin screen --------------------------------------------------------
  if (claim) {
    const open = claim.players.filter((p) => !p.isBot && !p.connected);
    return (
      <div className="join-screen">
        <h1>Rejoin {claim.roomCode}</h1>
        <p className="muted">This game is in progress. Which player are you?</p>
        <div className="claim-list">
          {open.map((p) => (
            <button
              key={p.id}
              className="claim-seat"
              style={{ borderColor: PLAYER_FILL[p.color] }}
              disabled={busy}
              onClick={() => rejoinAs(p)}
            >
              <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
              {p.name}
            </button>
          ))}
          {open.length === 0 && (
            <p className="muted">No open seats — everyone is currently connected.</p>
          )}
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="link" onClick={() => { setClaim(null); setError(null); }}>
          ← back
        </button>
      </div>
    );
  }

  // --- Join screen ----------------------------------------------------------
  return (
    <div className="join-screen">
      <h1>Catan</h1>
      <label>
        Room code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD"
          maxLength={4}
          autoCapitalize="characters"
          className="code-input"
        />
      </label>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={16} />
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
      {error && <div className="error-msg">{error}</div>}
      <button className="primary big" disabled={busy} onClick={join}>
        {busy ? "Joining…" : "Join game"}
      </button>
    </div>
  );
}
