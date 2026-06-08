import { useState } from "react";
import { PLAYER_COLORS, type PlayerColor } from "@catan/shared";
import { socket } from "../net/socket.js";
import { PLAYER_FILL } from "../game/theme.js";

interface Props {
  initialCode: string;
  onJoined: (roomCode: string, playerId: string) => void;
}

export function JoinScreen({ initialCode, onJoined }: Props) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColor>("red");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = () => {
    if (!code.trim() || !name.trim()) {
      setError("Enter a room code and your name");
      return;
    }
    setBusy(true);
    setError(null);
    const roomCode = code.trim().toUpperCase();
    socket.emit("room:join", { roomCode, name: name.trim(), color }, (res) => {
      setBusy(false);
      if (res.ok && res.playerId) {
        localStorage.setItem(`catan_pid_${roomCode}`, res.playerId);
        onJoined(roomCode, res.playerId);
      } else {
        setError(res.message ?? "Could not join");
      }
    });
  };

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
