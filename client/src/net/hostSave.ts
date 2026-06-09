import type { HostSnapshot } from "@catan/engine";

// Persists the host's game to localStorage so the board / host-and-play phone
// can survive a page refresh (the room code is reused, so remote phones
// auto-reconnect).

const KEY = "catan_host_save";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface HostSave {
  ts: number;
  mode: "tv" | "host";
  localPlayerId: string | null;
  host: HostSnapshot;
}

export function saveHostState(s: Omit<HostSave, "ts">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, ts: Date.now() }));
  } catch {
    /* storage full or unavailable — ignore */
  }
}

export function loadHostState(): HostSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as HostSave;
    if (Date.now() - data.ts > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearHostState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Import a snapshot exported from another device. Writes it to localStorage so
// the next host load resumes it (reusing the room code, so phones reconnect).
// Returns the mode to open ("tv" or "host") or null if the data is invalid.
export function importHostState(json: string): "tv" | "host" | null {
  try {
    const data = JSON.parse(json) as Partial<HostSave>;
    if (!data || (data.mode !== "tv" && data.mode !== "host")) return null;
    if (!data.host || !data.host.roomCode || !data.host.game) return null;
    localStorage.setItem(KEY, JSON.stringify({ ...data, ts: Date.now() }));
    return data.mode;
  } catch {
    return null;
  }
}
