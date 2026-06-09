import { useState } from "react";
import type { GameStatePublic, PrivateState, Resource } from "@catan/shared";
import { RESOURCES } from "@catan/shared";
import { sendAction } from "../../net/socket.js";
import { RESOURCE_EMOJI } from "../../game/theme.js";
import { playableCount } from "../PhoneGame.js";

export function DevMenu({
  game,
  me,
  onClose,
}: {
  game: GameStatePublic;
  me: PrivateState;
  onClose: () => void;
}) {
  const [yop, setYop] = useState<Resource[]>([]);
  const [showYop, setShowYop] = useState(false);
  const [showMono, setShowMono] = useState(false);

  const play = (fn: () => void) => {
    fn();
    onClose();
  };

  const knights = playableCount(me, "knight");
  const roads = playableCount(me, "roadBuilding");
  const yopCount = playableCount(me, "yearOfPlenty");
  const mono = playableCount(me, "monopoly");
  const vp = me.devCards.filter((c) => c.type === "victory").length;

  return (
    <div className="modal">
      <div className="modal-card">
        <h3>Development cards</h3>
        {game.hasPlayedDevCard && <p className="muted small">You already played a card this turn.</p>}

        {showYop ? (
          <div>
            <p className="muted small">Pick 2 resources</p>
            <div className="res-pick">
              {RESOURCES.map((r) => (
                <button
                  key={r}
                  className={`res-pick-btn ${yop.includes(r) ? "on" : ""}`}
                  onClick={() => {
                    if (yop.includes(r)) setYop(yop.filter((x) => x !== r));
                    else if (yop.length < 2) setYop([...yop, r]);
                  }}
                >
                  {RESOURCE_EMOJI[r]}
                </button>
              ))}
            </div>
            <button
              className="primary"
              disabled={yop.length !== 2}
              onClick={() =>
                play(() => sendAction({ type: "playYearOfPlenty", resources: [yop[0], yop[1]] }))
              }
            >
              Take {yop.map((r) => RESOURCE_EMOJI[r]).join(" ")}
            </button>
          </div>
        ) : showMono ? (
          <div>
            <p className="muted small">Monopolize which resource?</p>
            <div className="res-pick">
              {RESOURCES.map((r) => (
                <button
                  key={r}
                  className="res-pick-btn"
                  onClick={() => play(() => sendAction({ type: "playMonopoly", resource: r }))}
                >
                  {RESOURCE_EMOJI[r]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="dev-list">
            <DevButton
              label="⚔️ Knight"
              count={knights}
              disabled={game.hasPlayedDevCard}
              onClick={() => play(() => sendAction({ type: "playKnight" }))}
            />
            <DevButton
              label="🛣️ Road Building"
              count={roads}
              disabled={game.hasPlayedDevCard || (game.phase !== "main" && game.phase !== "roll")}
              onClick={() => play(() => sendAction({ type: "playRoadBuilding" }))}
            />
            <DevButton
              label="🎁 Year of Plenty"
              count={yopCount}
              disabled={game.hasPlayedDevCard || (game.phase !== "main" && game.phase !== "roll")}
              onClick={() => setShowYop(true)}
            />
            <DevButton
              label="💰 Monopoly"
              count={mono}
              disabled={game.hasPlayedDevCard || (game.phase !== "main" && game.phase !== "roll")}
              onClick={() => setShowMono(true)}
            />
            {vp > 0 && <div className="dev-vp">⭐ {vp} hidden victory point{vp > 1 ? "s" : ""}</div>}
          </div>
        )}

        <button className="link" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function DevButton({
  label,
  count,
  disabled,
  onClick,
}: {
  label: string;
  count: number;
  disabled: boolean;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button className="dev-play" disabled={disabled} onClick={onClick}>
      {label} <span className="dev-count">×{count}</span>
    </button>
  );
}
