import { useState, type ReactNode } from "react";
import { DEFAULT_OPTIONS, type GameOptions } from "@catan/shared";
import { socket } from "../net/socket.js";

// Lobby house-rule controls, shown on the host device (TV board or
// host-and-play phone). Pushes changes to the host engine.
export function HouseRules() {
  const [opts, setOpts] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const set = (patch: Partial<GameOptions>) => {
    setOpts((o) => ({ ...o, ...patch }));
    socket.setOptions(patch);
  };

  return (
    <div className="house-rules">
      <Row label="Win at">
        {[8, 10, 12].map((v) => (
          <Seg key={v} on={opts.targetVictoryPoints === v} onClick={() => set({ targetVictoryPoints: v })}>
            {v}
          </Seg>
        ))}
      </Row>
      <Row label="Discard over">
        {[7, 10, 99].map((v) => (
          <Seg key={v} on={opts.discardLimit === v} onClick={() => set({ discardLimit: v })}>
            {v === 99 ? "∞" : v}
          </Seg>
        ))}
      </Row>
      <Row label="Turn timer">
        {[0, 60, 120].map((v) => (
          <Seg key={v} on={opts.turnTimerSeconds === v} onClick={() => set({ turnTimerSeconds: v })}>
            {v === 0 ? "Off" : `${v}s`}
          </Seg>
        ))}
      </Row>
      <Row label="Random order">
        <Seg on={opts.randomizeOrder} onClick={() => set({ randomizeOrder: true })}>
          On
        </Seg>
        <Seg on={!opts.randomizeOrder} onClick={() => set({ randomizeOrder: false })}>
          Off
        </Seg>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hr-row">
      <span className="hr-label">{label}</span>
      <div className="hr-segs">{children}</div>
    </div>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`hr-seg ${on ? "on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}
