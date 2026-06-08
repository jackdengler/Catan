import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@catan/shared";

// Briefly flashes the latest "major" log event so nobody misses a build,
// robber move, steal, dev-card play, award, or win.
export function EventBanner({ log }: { log: LogEntry[] }) {
  const lastId = useRef(0);
  const initialized = useRef(false);
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);

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
      setMsg({ id, text: latest.text });
      const t = setTimeout(() => setMsg((m) => (m && m.id === id ? null : m)), 2800);
      return () => clearTimeout(t);
    }
  }, [log]);

  if (!msg) return null;
  return (
    <div className="event-banner" key={msg.id}>
      {msg.text}
    </div>
  );
}
