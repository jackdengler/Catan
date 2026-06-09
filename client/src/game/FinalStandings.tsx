import type { GameStatePublic } from "@catan/shared";
import { PLAYER_FILL } from "./theme.js";

// Final standings, sorted by (now-revealed) victory points.
export function FinalStandings({ game }: { game: GameStatePublic }) {
  const ranked = [...game.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  return (
    <div className="standings">
      {ranked.map((p, i) => (
        <div key={p.id} className={`standing ${p.id === game.winner ? "is-winner" : ""}`}>
          <span className="rank">{i + 1}</span>
          <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
          <span className="st-name">
            {p.name}
            {p.isBot && " 🤖"}
          </span>
          <span className="st-badges">
            {p.longestRoad && <span title="Longest Road">🛣️</span>}
            {p.largestArmy && <span title="Largest Army">⚔️</span>}
            {p.id === game.winner && <span title="Winner">👑</span>}
          </span>
          <span className="st-vp">{p.victoryPoints}</span>
        </div>
      ))}
    </div>
  );
}
