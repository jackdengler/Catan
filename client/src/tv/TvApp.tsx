import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { socket } from "../net/socket.js";
import { useGame } from "../net/useGame.js";
import { Board } from "../game/Board.js";
import { PLAYER_FILL, PLAYER_STROKE, RESOURCE_EMOJI } from "../game/theme.js";
import type { Resource } from "@catan/shared";

const RES: Resource[] = ["wood", "brick", "sheep", "wheat", "ore"];

export function TvApp() {
  const { lobby, game } = useGame();
  const [code, setCode] = useState<string | null>(null);
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    const urlCode = new URLSearchParams(window.location.search).get("room");
    const setup = () => {
      if (urlCode) {
        socket.emit("tv:join", { roomCode: urlCode }, (res) => {
          if (res.ok) setCode(urlCode.toUpperCase());
        });
      } else {
        socket.emit("room:create", (res) => {
          setCode(res.roomCode);
          const url = new URL(window.location.href);
          url.searchParams.set("room", res.roomCode);
          window.history.replaceState({}, "", url.toString());
        });
      }
    };
    if (socket.connected) setup();
    else socket.once("connect", setup);
  }, []);

  if (!game || game.phase === "lobby") {
    return <Lobby code={code} lobby={lobby} />;
  }
  return <TvGame code={code} game={game} />;
}

function Lobby({ code, lobby }: { code: string | null; lobby: ReturnType<typeof useGame>["lobby"] }) {
  const [qr, setQr] = useState<string>("");
  const joinUrl = code ? `${window.location.origin}/?room=${code}` : "";

  useEffect(() => {
    if (joinUrl) QRCode.toDataURL(joinUrl, { width: 260, margin: 1 }).then(setQr);
  }, [joinUrl]);

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
            {!p.connected && <span className="offline">offline</span>}
          </div>
        ))}
        {(!lobby || lobby.players.length === 0) && <div className="muted">Waiting for players…</div>}
      </div>
      <p className="muted">The host starts the game from their phone once everyone has joined.</p>
    </div>
  );
}

function TvGame({ game }: { code: string | null; game: NonNullable<ReturnType<typeof useGame>["game"]> }) {
  const current = game.players[game.currentPlayerIndex];
  const winner = game.winner ? game.players.find((p) => p.id === game.winner) : null;

  return (
    <div className="tv-game">
      <div className="tv-board-wrap">
        <Board state={game} />
        {game.dice && (
          <div className="dice">
            <Die n={game.dice[0]} />
            <Die n={game.dice[1]} />
            <span className="dice-sum">{game.dice[0] + game.dice[1]}</span>
          </div>
        )}
        {winner && (
          <div className="winner-banner">
            🏆 {winner.name} wins!
          </div>
        )}
      </div>

      <aside className="tv-side">
        <div className="turn-banner" style={{ background: PLAYER_FILL[current.color] }}>
          <strong>{current.name}</strong>
          <span>
            {game.phase === "setup" && "is setting up"}
            {game.phase === "roll" && "to roll"}
            {game.phase === "main" && "is playing"}
            {game.phase === "discard" && "— players discarding"}
            {game.phase === "moveRobber" && "moving the robber"}
          </span>
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
