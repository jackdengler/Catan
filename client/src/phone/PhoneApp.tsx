import { useEffect, useRef, useState } from "react";
import { type GameStatePublic, type PlayerColor, type PrivateState, type Resource } from "@catan/shared";
import { socket, sendAction, isHostPlayRole, hasResumableHostGame, clearHostSave } from "../net/socket.js";
import { importHostState } from "../net/hostSave.js";
import { useGame } from "../net/useGame.js";
import { JoinScreen } from "./JoinScreen.js";
import { PhoneGame } from "./PhoneGame.js";
import { BoardPreview } from "../game/Board.js";
import { ColorPicker } from "./ColorPicker.js";
import { TeamBadge } from "../game/TeamBadge.js";
import { ColorblindToggle } from "../game/a11y.js";
import { soundEnabled, setSoundEnabled } from "../game/feedback.js";
import { HouseRules } from "../game/HouseRules.js";
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

  // When this phone is hosting (play-on-this-phone), keep the screen awake so
  // the browser doesn't throttle its timers / sleep — which would stall the
  // heartbeat and freeze the game for everyone.
  useEffect(() => {
    if (!hostMode) return;
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* unsupported — ignore */
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, [hostMode]);

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
      {!connected && !hostMode && <ReconnectBanner />}
      <div className="phone-topbar">
        <span className="room-tag">Room {joined.roomCode}</span>
        <SoundToggle />
        {hostMode && game && game.phase !== "lobby" && <SaveButton />}
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

// Mute/unmute the sound cues (vibration always stays on where supported).
function SoundToggle() {
  const [on, setOn] = useState(soundEnabled());
  return (
    <button
      className="sound-btn"
      title={on ? "Mute sounds" : "Unmute sounds"}
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
      }}
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}

// Save the running host game to a file (host phone can migrate to another device).
function SaveButton() {
  const [saved, setSaved] = useState(false);
  const save = () => {
    const data = socket.exportState();
    if (!data) return;
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catan-game-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <button className="save-btn" onClick={save} title="Save game to a file">
      {saved ? "✓" : "💾"}
    </button>
  );
}

// Setup screen for "play on this phone": pick a name + colour, then host a game.
function HostSetup({ onCreated }: { onCreated: (roomCode: string, playerId: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<PlayerColor>("steelers");
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
      <ColorPicker value={color} onChange={setColor} />
      <button className="primary big" disabled={busy} onClick={create}>
        {busy ? "Creating…" : "Create game"}
      </button>
      <p className="muted">Next: add computer players and/or share the room code, then start.</p>
      <ColorblindToggle />
      <ResumeFromFile />
    </div>
  );
}

// Resume a game exported from another device (host migration).
function ResumeFromFile() {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState(false);
  return (
    <>
      <button className="link" onClick={() => ref.current?.click()}>
        📂 Resume a saved game
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          f.text().then((text) => {
            if (importHostState(text)) window.location.reload();
            else {
              setErr(true);
              setTimeout(() => setErr(false), 3000);
            }
          });
        }}
      />
      {err && <p className="muted small">Couldn't read that save file.</p>}
    </>
  );
}

// Shown while a phone has lost its link to the host. Escalates the message if
// the host stays gone, so players know the host must reopen the game.
function ReconnectBanner() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="reconnect-banner">
      {secs < 12
        ? "Reconnecting to host…"
        : "Host hasn't returned — they can reopen the game on their device to continue."}
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
  const myColor = players.find((p) => p.id === myId)?.color;
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
            <TeamBadge color={p.color} size={18} />
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

      {myColor && (
        <ColorPicker value={myColor} onChange={(c) => sendAction({ type: "setColor", color: c })} />
      )}

      {hostControls && lobby?.boardPreview && lobby.robberPreview && (
        <div className="board-preview">
          <div className="board-preview-board">
            <BoardPreview board={lobby.boardPreview} robberHex={lobby.robberPreview} />
          </div>
          <button className="ghost" onClick={() => socket.regenerateBoard()}>
            🔄 Regenerate board
          </button>
        </div>
      )}

      {hostControls && <HouseRules />}
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
