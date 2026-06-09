import type { GameStatePublic } from "@catan/shared";
import { TeamBadge } from "./TeamBadge.js";

// Final standings, sorted by (now-revealed) victory points, with a breakdown of
// where each player's points came from.
export function FinalStandings({ game }: { game: GameStatePublic }) {
  const ranked = [...game.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  return (
    <div className="standings">
      {ranked.map((p, i) => {
        let settlements = 0;
        let cities = 0;
        for (const b of Object.values(game.buildings)) {
          if (b.owner !== p.id) continue;
          if (b.type === "city") cities++;
          else settlements++;
        }
        const lr = p.longestRoad ? 2 : 0;
        const la = p.largestArmy ? 2 : 0;
        // Whatever isn't explained by buildings/awards is hidden VP dev cards.
        const devVp = Math.max(0, p.victoryPoints - (settlements + cities * 2 + lr + la));
        const parts: string[] = [];
        if (settlements) parts.push(`🏠×${settlements}`);
        if (cities) parts.push(`🏙️×${cities}`);
        if (lr) parts.push("🛣️ +2");
        if (la) parts.push("⚔️ +2");
        if (devVp) parts.push(`⭐×${devVp}`);
        if (p.playedKnights) parts.push(`${p.playedKnights} knights played`);

        return (
          <div key={p.id} className={`standing ${p.id === game.winner ? "is-winner" : ""}`}>
            <div className="standing-main">
              <span className="rank">{i + 1}</span>
              <TeamBadge color={p.color} size={22} />
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
            <div className="st-breakdown">{parts.join(" · ")}</div>
          </div>
        );
      })}
    </div>
  );
}
