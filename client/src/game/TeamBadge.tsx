import { useState } from "react";
import { TEAM_LABELS, type PlayerColor } from "@catan/shared";
import { PLAYER_FILL, PLAYER_STROKE } from "./theme.js";

// Original team monograms (shown until/unless a logo image is supplied).
const MONOGRAM: Record<string, string> = {
  steelers: "PIT",
  ravens: "RAV",
  orioles: "ORI",
  yankees: "NYY",
};

// Optional logo images. Drop files at client/public/teams/<name>.png and they
// are used automatically; otherwise the monogram crest is shown.
const LOGO: Record<string, string> = {
  steelers: "teams/steelers.png",
  ravens: "teams/ravens.png",
  orioles: "teams/orioles.png",
  yankees: "teams/yankees.png",
};

function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

// A small round crest: a logo (if provided) or a monogram disc for team themes,
// or a plain colored dot for the classic colors (so it can stand in for `.dot`).
export function TeamBadge({ color, size = 22 }: { color: PlayerColor; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const mono = MONOGRAM[color];
  const fill = PLAYER_FILL[color];

  if (!mono) {
    return <span className="dot" style={{ background: fill, width: size, height: size }} />;
  }

  const logo = LOGO[color];
  if (logo && !imgFailed) {
    return (
      <img
        className="team-logo"
        src={asset(logo)}
        alt={TEAM_LABELS[color]}
        title={TEAM_LABELS[color]}
        style={{ height: size, width: "auto", maxWidth: size * 2.2 }}
        onError={() => setImgFailed(true)}
      />
    );
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
