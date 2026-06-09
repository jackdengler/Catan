import { BASE_COLORS, TEAM_COLORS, TEAM_LABELS, type PlayerColor } from "@catan/shared";
import { PLAYER_FILL } from "../game/theme.js";

// Pick a classic piece color or a team theme.
export function ColorPicker({
  value,
  onChange,
}: {
  value: PlayerColor;
  onChange: (c: PlayerColor) => void;
}) {
  return (
    <div className="color-pick">
      Color
      <div className="swatches">
        {BASE_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${value === c ? "selected" : ""}`}
            style={{ background: PLAYER_FILL[c] }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </div>
      <div className="team-label">or pick a team</div>
      <div className="team-swatches">
        {TEAM_COLORS.map((c) => (
          <button
            key={c}
            className={`team-swatch ${value === c ? "selected" : ""}`}
            style={{
              background: PLAYER_FILL[c],
              color: c === "steelers" ? "#0c0f14" : "#fff",
            }}
            onClick={() => onChange(c)}
          >
            {TEAM_LABELS[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
