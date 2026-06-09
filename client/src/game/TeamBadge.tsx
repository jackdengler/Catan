import { TEAM_LABELS, type PlayerColor } from "@catan/shared";
import { PLAYER_FILL, PLAYER_STROKE } from "./theme.js";

// Original team monograms (not the trademarked logos) so a themed player has a
// recognizable crest in their brand colors.
const MONOGRAM: Record<string, string> = {
  steelers: "PIT",
  ravens: "RAV",
  orioles: "ORI",
  yankees: "NYY",
};

// A small round crest: a monogram disc for team themes, or a plain colored dot
// for the classic colors (so it can stand in for the old `.dot`).
export function TeamBadge({ color, size = 22 }: { color: PlayerColor; size?: number }) {
  const mono = MONOGRAM[color];
  const fill = PLAYER_FILL[color];
  if (!mono) {
    return <span className="dot" style={{ background: fill, width: size, height: size }} />;
  }
  return (
    <span
      className="team-badge"
      title={TEAM_LABELS[color]}
      style={{
        width: size,
        height: size,
        background: fill,
        color: color === "steelers" ? "#0c0f14" : "#fff",
        borderColor: PLAYER_STROKE[color],
        fontSize: size * 0.36,
      }}
    >
      {mono}
    </span>
  );
}
