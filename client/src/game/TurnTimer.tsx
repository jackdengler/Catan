import { useEffect, useState } from "react";

// Live countdown for the optional turn timer.
export function TurnTimer({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [endsAt]);
  if (endsAt == null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return <span className={`turn-timer ${left <= 10 ? "low" : ""}`}>⏱ {left}s</span>;
}
