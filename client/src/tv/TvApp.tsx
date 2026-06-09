import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { socket } from "../net/socket.js";
import { importHostState } from "../net/hostSave.js";
import { useGame } from "../net/useGame.js";
import { Board, BoardPreview } from "../game/Board.js";
import { HouseRules } from "../game/HouseRules.js";
import { EventBanner } from "../game/EventBanner.js";
import { FinalStandings } from "../game/FinalStandings.js";
import { TurnTimer } from "../game/TurnTimer.js";
import { PLAYER_FILL, PLAYER_STROKE, RESOURCE_EMOJI } from "../game/theme.js";
import { ColorblindToggle } from "../game/a11y.js";
import { playDice, playForLog, setTvSound, tvSoundEnabled } from "../game/tvSounds.js";
import type { GameStatePublic, LogEntry, Resource } from "@catan/shared";

const RES: Resource[] = ["wood", "brick", "sheep", "wheat", "ore"];

// What each player collects on a given roll, derived from the public board +
// buildings (no private info needed). Mirrors the engine's production rule,
// ignoring bank-shortage edge cases (this is a display-only summary).
interface Production {
  id: number;
  roll: number;
  byPlayer: { id: string; name: string; color: string; gains: [Resource, number][] }[];
}

function computeProduction(game: GameStatePublic, roll: number): Production["byPlayer"] {
  const owed = new Map<string, Record<Resource, number>>();
  const ensure = (id: string) =>
    owed.get(id) ?? owed.set(id, { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }).get(id)!;
  for (const hex of game.board.hexes) {
    if (hex.numberToken !== roll) continue;
    if (hex.id === game.robberHex) continue;
    if (hex.terrain === "desert") continue;
    const res = hex.terrain as Resource;
    for (const vId of hex.corners) {
      const b = game.buildings[vId];
      if (!b) continue;
      ensure(b.owner)[res] += b.type === "city" ? 2 : 1;
    }
  }
  const out: Production["byPlayer"] = [];
  for (const [id, gains] of owed) {
    const p = game.players.find((x) => x.id === id);
    if (!p) continue;
    const list = RES.map((r) => [r, gains[r]] as [Resource, number]).filter(([, n]) => n > 0);
    if (list.length) out.push({ id, name: p.name, color: PLAYER_FILL[p.color], gains: list });
  }
  return out;
}

// Detects each new dice roll to drive the tumble animation + production banner.
function useDiceRoll(game: GameStatePublic) {
  const prev = useRef<string | null>(null);
  const initialized = useRef(false);
  const [rolling, setRolling] = useState(false);
  const [prod, setProd] = useState<Production | null>(null);

  useEffect(() => {
    const key = game.dice ? `${game.dice[0]}-${game.dice[1]}:${game.currentPlayerIndex}` : null;
    // First run (mount / reconnect): record the current dice without flashing,
    // so an already-rolled value doesn't replay on a fresh page load.
    if (!initialized.current) {
      initialized.current = true;
      prev.current = key;
      return;
    }
    if (!key || key === prev.current || !game.dice) return;
    prev.current = key;

    const roll = game.dice[0] + game.dice[1];
    setRolling(true);
    playDice();
    const t1 = setTimeout(() => setRolling(false), 650);
    if (roll === 7) return () => clearTimeout(t1);

    const id = Date.now();
    setProd({ id, roll, byPlayer: computeProduction(game, roll) });
    const t2 = setTimeout(() => setProd((p) => (p && p.id === id ? null : p)), 4500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [game.dice, game.currentPlayerIndex]);

  return { rolling, prod };
}

// Play a sound for each new major log event (builds, robber, awards, win).
function useTvSounds(log: LogEntry[]) {
  const lastId = useRef<number | null>(null);
  useEffect(() => {
    let latest: LogEntry | undefined;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].major) {
        latest = log[i];
        break;
      }
    }
    if (!latest) return;
    if (lastId.current === null) {
      lastId.current = latest.id; // don't replay history on mount/reconnect
      return;
    }
    if (latest.id > lastId.current) {
      lastId.current = latest.id;
      playForLog(latest.text);
    }
  }, [log]);
}

export function TvApp() {
  const { lobby, game } = useGame();
  const [code, setCode] = useState<string | null>(null);
  const created = useRef(false);

  // The board tab is always the host: create a room and advertise its code.
  useEffect(() => {
    if (created.current) return;
    created.current = true;
    const setup = () => {
      socket.emit("room:create", (res: { roomCode: string }) => setCode(res.roomCode));
    };
    if (socket.connected) setup();
    else socket.once("connect", setup);
  }, []);

  // Keep the screen awake — this tab is usually a phone being mirrored to a TV.
  useKeepAwake();

  // The board view fills the screen with no page scrolling (everything is sized
  // to fit), so it mirrors cleanly to a TV.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <>
      <div className="tv-corner-controls">
        <TvSoundButton />
        <FullscreenButton />
      </div>
      {!game || game.phase === "lobby" ? <Lobby code={code} lobby={lobby} /> : <TvGame code={code} game={game} />}
    </>
  );
}

// Mute/unmute the TV sound effects.
function TvSoundButton() {
  const [on, setOn] = useState(tvSoundEnabled());
  return (
    <button
      className="fullscreen-btn"
      title={on ? "Mute sounds" : "Unmute sounds"}
      onClick={() => {
        const next = !on;
        setTvSound(next);
        setOn(next);
      }}
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}

// Trigger a browser download of text content (used to save the game snapshot).
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Save the running game to a file so the host can be moved to another device.
function ExportButton() {
  const [saved, setSaved] = useState(false);
  const save = () => {
    const data = socket.exportState();
    if (!data) return;
    downloadText(`catan-game-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`, data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <button className="ghost small" onClick={save} title="Save the game to a file">
      {saved ? "✓ Saved" : "💾 Save game"}
    </button>
  );
}

// Load a snapshot exported from another device, then reload to resume it.
function ImportControl() {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState(false);
  const onFile = (file: File) => {
    file.text().then((text) => {
      const mode = importHostState(text);
      if (mode) window.location.reload();
      else {
        setErr(true);
        setTimeout(() => setErr(false), 3000);
      }
    });
  };
  return (
    <>
      <button className="ghost small" onClick={() => ref.current?.click()} title="Resume a saved game">
        📂 Resume saved game
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {err && <span className="muted small">Couldn't read that file.</span>}
    </>
  );
}

// Toggle the browser into/out of fullscreen for distraction-free mirroring.
function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };
  return (
    <button className="fullscreen-btn" onClick={toggle} title="Fullscreen">
      {fs ? "🗗 Exit fullscreen" : "⛶ Fullscreen"}
    </button>
  );
}

// Hold a screen wake lock (re-acquired when the tab becomes visible again).
function useKeepAwake() {
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* unsupported or denied — ignore */
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
  }, []);
}

function Lobby({ code, lobby }: { code: string | null; lobby: ReturnType<typeof useGame>["lobby"] }) {
  const [qr, setQr] = useState<string>("");
  // Phones join at the app's own URL (preserving any Pages subpath) with ?room.
  const joinUrl = code ? `${window.location.origin}${window.location.pathname}?room=${code}` : "";

  useEffect(() => {
    if (joinUrl) QRCode.toDataURL(joinUrl, { width: 260, margin: 1 }).then(setQr);
  }, [joinUrl]);

  const playerCount = lobby?.players.length ?? 0;

  return (
    <div className="tv-lobby">
      <h1>Catan</h1>
      <p className="subtitle">Join from your phone</p>
      <div className="lobby-join">
        <div className="code-box">
          <span className="code-label">Room code</span>
          <span className="code">{code ?? "····"}</span>
          <span className="join-url">{joinUrl}</span>
        </div>
        {qr && <img className="qr" src={qr} alt="Join QR code" />}
      </div>
      {lobby?.boardPreview && lobby.robberPreview && (
        <div className="board-preview">
          <div className="board-preview-board">
            <BoardPreview board={lobby.boardPreview} robberHex={lobby.robberPreview} />
          </div>
          <button className="ghost" onClick={() => socket.regenerateBoard()}>
            🔄 Regenerate board
          </button>
        </div>
      )}
      <div className="roster">
        {(lobby?.players ?? []).map((p) => (
          <div key={p.id} className="roster-item" style={{ borderColor: PLAYER_FILL[p.color] }}>
            <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
            {p.name}
            {p.isHost && <span className="host-tag">host</span>}
            {p.isBot && <span className="bot-tag">bot</span>}
            {!p.connected && !p.isBot && <span className="offline">offline</span>}
            {p.isBot && (
              <button className="remove-bot" onClick={() => socket.removeBot(p.id)} title="Remove bot">
                ✕
              </button>
            )}
          </div>
        ))}
        {(!lobby || lobby.players.length === 0) && <div className="muted">Waiting for players…</div>}
      </div>
      <HouseRules />
      <div className="lobby-controls">
        <button className="ghost" disabled={playerCount >= 4} onClick={() => socket.addBot()}>
          + Add computer player
        </button>
        <button className="primary" disabled={playerCount < 2} onClick={() => socket.startHostGame()}>
          Start game
        </button>
      </div>
      <p className="muted">A human host can also start from their phone.</p>
      <div className="migration-row">
        <ColorblindToggle />
        <ImportControl />
      </div>
    </div>
  );
}

function TvGame({ game }: { code: string | null; game: NonNullable<ReturnType<typeof useGame>["game"]> }) {
  const current = game.players[game.currentPlayerIndex];
  const winner = game.winner ? game.players.find((p) => p.id === game.winner) : null;
  const { rolling, prod } = useDiceRoll(game);
  useTvSounds(game.log);

  return (
    <div className="tv-game">
      <div className="tv-board-wrap">
        <Board state={game} animate />
        <EventBanner log={game.log} />
        {prod && <ProductionBanner prod={prod} />}
        {game.dice && (
          <div className={`dice ${rolling ? "rolling" : ""}`}>
            <Die n={game.dice[0]} />
            <Die n={game.dice[1]} />
            <span className="dice-sum">{game.dice[0] + game.dice[1]}</span>
          </div>
        )}
        {winner && (
          <div className="winner-banner">
            <div className="wb-title">🏆 {winner.name} wins!</div>
            <FinalStandings game={game} />
          </div>
        )}
      </div>

      <aside className="tv-side">
        <div className="tv-roomcode">
          Room <strong>{game.roomCode}</strong> · join at {window.location.host}
          {window.location.pathname}
          <ExportButton />
        </div>
        <div className="turn-banner" style={{ background: PLAYER_FILL[current.color] }}>
          <strong>{current.name}</strong>
          <span>
            {game.phase === "setup" && "is setting up"}
            {game.phase === "roll" && "to roll"}
            {game.phase === "main" && "is playing"}
            {game.phase === "discard" && "— players discarding"}
            {game.phase === "moveRobber" && "moving the robber"}
          </span>
          <TurnTimer endsAt={game.turnEndsAt} />
        </div>

        <div className="scoreboard">
          {game.players.map((p) => (
            <div key={p.id} className="score-row" style={{ borderLeftColor: PLAYER_FILL[p.color] }}>
              <span className="score-name" style={{ color: PLAYER_STROKE[p.color] }}>
                {p.name}
                {!p.connected && <span className="offline"> offline</span>}
              </span>
              <span className="score-badges">
                {p.longestRoad && <span title="Longest Road">🛣️</span>}
                {p.largestArmy && <span title="Largest Army">⚔️</span>}
              </span>
              <span className="score-vp">{p.victoryPoints} VP</span>
              <span className="score-cards">
                🂠 {p.resourceTotal} · ✦ {p.devCardTotal} · ⚔️ {p.playedKnights}
              </span>
            </div>
          ))}
        </div>

        <div className="bank">
          <span className="muted">Bank</span>
          {RES.map((r) => (
            <span key={r} className="bank-item">
              {RESOURCE_EMOJI[r]} {game.bank[r]}
            </span>
          ))}
        </div>

        <div className="log">
          {[...game.log].slice(-12).reverse().map((l) => (
            <div key={l.id} className="log-line">
              {l.text}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Die({ n }: { n: number }) {
  return <span className="die">{["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n]}</span>;
}

// Banner summarising who collected what on the latest roll.
function ProductionBanner({ prod }: { prod: Production }) {
  return (
    <div className="production-banner" key={prod.id}>
      <span className="pb-roll">🎲 {prod.roll}</span>
      {prod.byPlayer.length === 0 ? (
        <span className="pb-none">No production</span>
      ) : (
        <div className="pb-players">
          {prod.byPlayer.map((p) => (
            <span key={p.id} className="pb-player" style={{ borderColor: p.color }}>
              <span className="pb-name" style={{ color: p.color }}>
                {p.name}
              </span>
              {p.gains.map(([r, n]) => (
                <span key={r} className="pb-gain">
                  +{n}
                  {RESOURCE_EMOJI[r]}
                </span>
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
