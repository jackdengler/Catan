import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { socket } from "../net/socket.js";
import { useGame } from "../net/useGame.js";
import { Board } from "../game/Board.js";
import { HouseRules } from "../game/HouseRules.js";
import { EventBanner } from "../game/EventBanner.js";
import { FinalStandings } from "../game/FinalStandings.js";
import { TurnTimer } from "../game/TurnTimer.js";
import { PLAYER_FILL, PLAYER_STROKE, RESOURCE_EMOJI } from "../game/theme.js";
import type { Resource } from "@catan/shared";

const RES: Resource[] = ["wood", "brick", "sheep", "wheat", "ore"];

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
      <FullscreenButton />
      {!game || game.phase === "lobby" ? <Lobby code={code} lobby={lobby} /> : <TvGame code={code} game={game} />}
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
    </div>
  );
}

function TvGame({ game }: { code: string | null; game: NonNullable<ReturnType<typeof useGame>["game"]> }) {
  const current = game.players[game.currentPlayerIndex];
  const winner = game.winner ? game.players.find((p) => p.id === game.winner) : null;

  return (
    <div className="tv-game">
      <div className="tv-board-wrap">
        <Board state={game} animate />
        <EventBanner log={game.log} />
        {game.dice && (
          <div className="dice">
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
