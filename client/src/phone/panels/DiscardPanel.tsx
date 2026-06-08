import { useState } from "react";
import { RESOURCES, type Resource, type ResourceCount } from "@catan/shared";
import { sendAction } from "../../net/socket.js";
import { RESOURCE_EMOJI } from "../../game/theme.js";

export function DiscardPanel({ need, resources }: { need: number; resources: ResourceCount }) {
  const [pick, setPick] = useState<Record<Resource, number>>({
    wood: 0,
    brick: 0,
    sheep: 0,
    wheat: 0,
    ore: 0,
  });

  const total = RESOURCES.reduce((s, r) => s + pick[r], 0);
  const adjust = (r: Resource, d: number) => {
    const next = Math.max(0, Math.min(resources[r], pick[r] + d));
    setPick({ ...pick, [r]: next });
  };

  return (
    <div className="action-screen">
      <h3>Discard {need} cards</h3>
      <p className="muted">You have too many cards (rolled a 7).</p>
      <div className="res-steppers big">
        {RESOURCES.map((r) => (
          <div key={r} className="stepper">
            <span className="res-emoji">{RESOURCE_EMOJI[r]}</span>
            <span className="have">have {resources[r]}</span>
            <button onClick={() => adjust(r, -1)}>−</button>
            <span className="stepper-val">{pick[r]}</span>
            <button onClick={() => adjust(r, +1)}>+</button>
          </div>
        ))}
      </div>
      <div className="discard-status">
        {total} / {need} selected
      </div>
      <button
        className="primary big"
        disabled={total !== need}
        onClick={() => sendAction({ type: "discard", resources: pick })}
      >
        Discard
      </button>
    </div>
  );
}
