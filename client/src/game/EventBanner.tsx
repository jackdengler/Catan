import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@catan/shared";

// Pick an icon for a major event from its (engine-controlled) text.
function iconFor(text: string): string {
  if (/wins the game/.test(text)) return "🏆";
  if (/Longest Road/.test(text)) return "🛣️";
  if (/Largest Army/.test(text)) return "⚔️";
  if (/built a settlement/.test(text)) return "🏠";
  if (/upgraded to a city/.test(text)) return "🏙️";
  if (/moved the robber/.test(text)) return "🥷";
  if (/stole a card/.test(text)) return "🃏";
  if (/Knight/.test(text)) return "⚔️";
  if (/Year of Plenty|Monopoly|Road Building/.test(text)) return "🎴";
  if (/discard/.test(text)) return "💸";
  return "📣";
}

// Flashes the latest "major" log event so nobody misses a build, robber move,
// steal, dev-card play, award, or win.
export function EventBanner({ log }: { log: LogEntry[] }) {
  const lastId = useRef(0);
  const initialized = useRef(false);
  const [msg, setMsg] = useState<{ id: number; text: string; icon: string; win: boolean } | null>(null);

  useEffect(() => {
    let latest: LogEntry | undefined;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].major) {
        latest = log[i];
        break;
      }
    }
    if (!latest) return;
    if (!initialized.current) {
      initialized.current = true;
      lastId.current = latest.id;
      return; // don't flash pre-existing events on mount/reconnect
    }
    if (latest.id > lastId.current) {
      lastId.current = latest.id;
      const id = latest.id;
      const win = /wins the game/.test(latest.text);
      setMsg({ id, text: latest.text, icon: iconFor(latest.text), win });
      const t = setTimeout(() => setMsg((m) => (m && m.id === id ? null : m)), win ? 6000 : 3000);
      return () => clearTimeout(t);
    }
  }, [log]);

  if (!msg) return null;
  return (
    <div className={`event-banner ${msg.win ? "win" : ""}`} key={msg.id}>
      <span className="eb-icon">{msg.icon}</span>
      <span className="eb-text">{msg.text}</span>
    </div>
  );
}
