import type { PeerOptions } from "peerjs";

// PeerJS connection options. By default we use PeerJS's free public broker (no
// account needed) for the initial handshake. Set VITE_PEER_HOST (+ optional
// PORT/PATH/SECURE) to point at a self-hosted broker for zero third-party
// reliance, or for local end-to-end testing.
export function peerOptions(): PeerOptions {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  if (!host) return { debug: 1 };
  return {
    host,
    port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
    path: (import.meta.env.VITE_PEER_PATH as string) ?? "/",
    secure: (import.meta.env.VITE_PEER_SECURE ?? "true") === "true",
    debug: 1,
  };
}
