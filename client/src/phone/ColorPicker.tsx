import { TEAM_COLORS, TEAM_LABELS, type PlayerColor } from "@catan/shared";
import { PLAYER_STROKE } from "../game/theme.js";
import { TeamBadge } from "../game/TeamBadge.js";

// Pick a team. Each option shows the team's crest/logo and name.
export function ColorPicker({
  value,
  onChange,
}: {
  value: PlayerColor;
  onChange: (c: PlayerColor) => void;
}) {
  return (
    <div className="color-pick">
      Team
      <div className="team-grid">
        {TEAM_COLORS.map((c) => (
          <button
            key={c}
            className={`team-pick ${value === c ? "selected" : ""}`}
            style={{ borderColor: value === c ? "var(--accent)" : PLAYER_STROKE[c] }}
            onClick={() => onChange(c)}
          >
            <TeamBadge color={c} size={34} />
            <span className="team-pick-name">{TEAM_LABELS[c]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
